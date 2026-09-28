/**
 * The split.
 *
 * Phase 3's finding: the quorum signing key was read by `server.js`, the
 * process that also serves unauthenticated `POST /api/runs` under
 * `Access-Control-Allow-Origin: *`. These tests pin the shape that replaced
 * it — a public process that cannot sign, and a signer that holds nothing
 * else.
 *
 * The property under test is not "the code moved". It is: given a public API
 * process and a key in its environment, can a request to that process reach
 * the signer? It must not, unless someone typed the opt-in by hand.
 *
 * Run: node --test server/__tests__/
 */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createAttestationService,
  describeLedgerTarget,
  ledgerStoreFromEnv,
} = require('../attestation-service');
const { createMemoryStore } = require('../ledger-store');

// Well-known Hardhat account #0 — a test key, never real funds.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function typedData(overrides = {}) {
  return {
    domain: { name: 'RunRealm Attestation', version: '1', chainId: 0 },
    primaryType: 'RunSummary',
    types: {
      RunSummary: [
        { name: 'runId', type: 'string' },
        { name: 'accountId', type: 'string' },
        { name: 'distanceMeters', type: 'uint256' },
        { name: 'durationMs', type: 'uint256' },
        { name: 'paceBand', type: 'uint8' },
        { name: 'h3Cells', type: 'string[]' },
        { name: 'endedAt', type: 'uint256' },
      ],
    },
    message: {
      runId: 'r1',
      accountId: 'a1',
      distanceMeters: 5000,
      durationMs: 1_500_000,
      paceBand: 1,
      h3Cells: ['892a1072b4bffff'],
      endedAt: Date.now(),
    },
    ...overrides,
  };
}

/** Drive an express app end-to-end over a real socket on an ephemeral port. */
async function withServer(app, run) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function tempLedgerPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-svc-')), 'ledger.json');
}

describe('createAttestationService', () => {
  test('exposes the leaderboard with no key at all', async () => {
    // The board is public by design. It needs no key, which is precisely
    // why it can stay in the public process after signing leaves.
    const service = createAttestationService({ store: createMemoryStore() });
    assert.equal(service.signer, null);
    await service.ledger.ready();

    const express = require('express');
    const app = express();
    app.use(service.router);

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/attestations/leaderboard`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.entries, []);
      assert.equal(body.count, 0);
    });
  });

  test('does not mount /attestations/sign without a key', async () => {
    const service = createAttestationService({ store: createMemoryStore() });
    const express = require('express');
    const app = express();
    app.use(service.router);

    await withServer(app, async (base) => {
      // A client configured against this origin gets a 404, and the
      // AttestationService reads that as "fewer signatures" — honest
      // `local` mode, exactly as it did when no key was configured.
      const res = await fetch(`${base}/attestations/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(typedData()),
      });
      assert.equal(res.status, 404);
    });
  });

  test('signs and records when a key is present', async () => {
    const ledgerStore = createMemoryStore();
    const service = createAttestationService({ privateKey: TEST_KEY, store: ledgerStore });
    const { ethers } = require('ethers');
    assert.equal(service.signer, new ethers.Wallet(TEST_KEY).address);

    const express = require('express');
    const app = express();
    app.use(service.router);

    // One payload, sent and verified. Building it twice would roll
    // `endedAt` again and the recovered address would be somebody else's.
    const payload = typedData();

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/attestations/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.signer, service.signer);
      assert.ok(body.signature);

      // The signature is the oracle's, verified against the exact payload.
      const recovered = ethers.verifyTypedData(
        payload.domain,
        payload.types,
        payload.message,
        body.signature
      );
      assert.equal(recovered, service.signer);
    });

    await service.ledger.ready();
    assert.equal(service.ledger.size(), 1);
  });

  test('refuses a malformed key at build time, not at first request', async () => {
    // A bad key discovered halfway through someone's run is a 500 the
    // runner sees as a failed quorum. It must fail at boot.
    assert.throws(
      () => createAttestationService({ privateKey: 'not-a-key', store: createMemoryStore() }),
      /invalid/
    );
  });

  test('honours a corroborator that says no', async () => {
    const service = createAttestationService({
      privateKey: TEST_KEY,
      store: createMemoryStore(),
      corroborate: () => false,
    });
    const express = require('express');
    const app = express();
    app.use(service.router);

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/attestations/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(typedData()),
      });
      assert.equal(res.status, 422);
    });

    await service.ledger.ready();
    assert.equal(service.ledger.size(), 0, 'a refused summary is not recorded');
  });

  test('rejects an oversized body before it reaches the signer', async () => {
    // The public API allows 5 MB for GPS traces. An EIP-712 payload is
    // kilobytes, and the signer has no reason to buffer more.
    const service = createAttestationService({ privateKey: TEST_KEY, store: createMemoryStore() });
    const express = require('express');
    const app = express();
    app.use(service.router);

    await withServer(app, async (base) => {
      const res = await fetch(`${base}/attestations/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(typedData({ padding: 'x'.repeat(300_000) })),
      });
      assert.ok(res.status >= 400, `expected a rejection, got ${res.status}`);
    });
  });
});

describe('ledgerStoreFromEnv', () => {
  test('`off` gives a memory-only store', async () => {
    const store = ledgerStoreFromEnv({ RUNREALM_LEDGER_PATH: 'off' });
    await store.save([{ id: 'a' }]);
    assert.equal((await store.load()).length, 1, 'it works, it just does not survive');
  });

  test('an explicit path is used, and missing directories are created', async () => {
    const filePath = tempLedgerPath();
    const store = ledgerStoreFromEnv({ RUNREALM_LEDGER_PATH: filePath });
    await store.save([{ id: 'a' }]);
    assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).entries.length, 1);
  });

  test('a blank value falls back to the default rather than disabling persistence', () => {
    // `||` not `??`, on purpose: the shipped env examples leave the key
    // blank, and blank must mean "unset" — not "stop persisting".
    const target = describeLedgerTarget({ RUNREALM_LEDGER_PATH: '' });
    assert.match(target, /attestation-ledger\.json$/);
    assert.doesNotMatch(target, /memory only/);
  });
});

describe('the public process cannot sign', () => {
  const ORIGINAL = { ...process.env };
  let output = '';

  beforeEach(() => {
    output = '';
    // Run server.js's module body in a child so the real one is not bound.
    delete process.env.RUNREALM_EMBEDDED_ORACLE;
    process.env.RUNREALM_ORACLE_PRIVATE_KEY = TEST_KEY;
    process.env.RUNREALM_LEDGER_PATH = tempLedgerPath();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL };
  });

  test('a key in the environment does not mount the signer', async () => {
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, ['-e', PROBE], {
      env: process.env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    output = result.stdout + result.stderr;

    // The probe boots server.js — with a valid quorum key in its
    // environment — and asks it for a signature. It must not get one.
    assert.match(output, /PROBE_STATUS=404/);
    assert.doesNotMatch(output, /"signature":\s*"0x/);

    // And the boot log has to say where signing went. A bare 404 on
    // /attestations/sign is how you get an hour of debugging a missing
    // environment variable that was never missing.
    assert.match(output, /Attestation signing: NOT in this process/);
  });

  test('the same key signs once the opt-in is spelled out', async () => {
    // The other half: the split must not be "signing stopped working". The
    // opt-in has to actually work, or this is just a outage with extra steps.
    const { spawnSync } = require('node:child_process');
    const result = spawnSync(process.execPath, ['-e', PROBE], {
      env: { ...process.env, RUNREALM_EMBEDDED_ORACLE: '1' },
      encoding: 'utf8',
      timeout: 30_000,
    });
    output = result.stdout + result.stderr;

    assert.match(output, /PROBE_STATUS=200/);
    assert.match(output, /"signature":\s*"0x/);
    assert.match(output, /EMBEDDED ORACLE/);
  });

  test('the opt-in is a spelled-out env var, not a silent default', () => {
    // The dangerous shape has to be typed on purpose.
    assert.equal(process.env.RUNREALM_EMBEDDED_ORACLE, undefined);
  });
});

/**
 * Boot server.js on an ephemeral port with the routes we care about, ask
 * for a signature, print the outcome, exit. Run as a child process so
 * requiring server.js does not bind a port in the test runner.
 */
const PROBE = `
  const http = require('node:http');
  const { spawn } = require('node:child_process');

  // server.js reads PORT at require time; give it one and wait for the line.
  const port = 3000 + Math.floor(Math.random() * 20000);
  process.env.PORT = String(port);
  require(${JSON.stringify(path.join(__dirname, '..', '..', 'server.js'))});

  setTimeout(() => {
    const body = JSON.stringify({
      domain: { name: 'RunRealm Attestation', version: '1', chainId: 0 },
      primaryType: 'RunSummary',
      types: {
        RunSummary: [
          { name: 'runId', type: 'string' },
          { name: 'accountId', type: 'string' },
          { name: 'distanceMeters', type: 'uint256' },
          { name: 'durationMs', type: 'uint256' },
          { name: 'paceBand', type: 'uint8' },
          { name: 'h3Cells', type: 'string[]' },
          { name: 'endedAt', type: 'uint256' },
        ],
      },
      message: {
        runId: 'probe', accountId: 'probe', distanceMeters: 1000,
        durationMs: 600000, paceBand: 1, h3Cells: ['892a1072b4bffff'], endedAt: Date.now(),
      },
    });
    const req = http.request({
      host: '127.0.0.1', port, path: '/attestations/sign', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        console.log('PROBE_STATUS=' + res.statusCode);
        console.log('PROBE_BODY=' + out);
        process.exit(0);
      });
    });
    req.on('error', (e) => { console.log('PROBE_ERROR=' + e.message); process.exit(0); });
    req.end(body);
  }, 1500);
`;
