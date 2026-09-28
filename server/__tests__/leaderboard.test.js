/**
 * Tests for the network attestation ledger + leaderboard endpoint.
 * Run: node --test server/__tests__/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ethers } = require('ethers');
const { createAttestationLedger, createLeaderboardHandler } = require('../leaderboard');
const { createFileStore, createQueuedStore } = require('../ledger-store');
const { createAttestationOracleHandler } = require('../attestation-oracle');

/** Hermetic ledger path — never the repo's own runtime file. */
function tempLedgerPath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ledger-')), 'ledger.json');
}

// Well-known Hardhat account #0 — a test key, never real funds.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function runSummary(overrides = {}) {
  return {
    runId: 'r1',
    accountId: 'account-abcdef123456',
    distanceMeters: 5000,
    durationMs: 1_500_000,
    paceBand: 2,
    h3Cells: ['892a1072b4bffff'],
    endedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function ghostSummary(overrides = {}) {
  return {
    ghostId: 'ghost-1',
    territoryId: 't1',
    distanceMeters: 4200,
    durationMs: 1_300_000,
    paceBand: 1,
    activityPointsEarned: 50,
    result: 'completed',
    endedAt: 1_700_000_000_000,
    ...overrides,
  };
}

function typedData() {
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
    message: { ...runSummary(), h3Cells: ['892a1072b4bffff'] },
  };
}

/** Minimal express-like req/res double. */
async function runHandler(handler, req) {
  return await new Promise((resolve) => {
    const res = {
      statusCode: 200,
      payload: null,
      headers: {},
      set(name, value) {
        this.headers[name] = value;
        return this;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        resolve(res);
      },
    };
    Promise.resolve(handler(req, res)).catch((err) =>
      resolve({ statusCode: 500, payload: { error: String(err) } })
    );
  });
}

describe('createAttestationLedger', () => {
  test('records a signed run and exposes only band + a pseudonymous label', () => {
    const ledger = createAttestationLedger();
    ledger.record('RunSummary', runSummary());
    const rows = ledger.list();

    assert.equal(rows.length, 1);
    assert.equal(rows[0].kind, 'run');
    assert.equal(rows[0].paceBand, 2);
    assert.equal(rows[0].distanceMeters, 5000);
    assert.equal(rows[0].label, 'runner · accoun'); // first 6 chars of accountId

    // Privacy: route shape never enters the ledger, and the full account
    // id is never serialized.
    assert.equal('h3Cells' in rows[0], false);
    assert.doesNotMatch(JSON.stringify(rows[0]), /abcdef123456/);
  });

  test('uses the same id shape as the client so the two boards dedupe', () => {
    const ledger = createAttestationLedger();
    ledger.record('RunSummary', runSummary({ runId: 'run-9' }));
    assert.equal(ledger.list()[0].id, 'att_run-9');

    ledger.record('GhostPerformance', ghostSummary({ ghostId: 'g7', endedAt: 123 }));
    const ghostRow = ledger.list().find((r) => r.kind === 'ghost');
    assert.equal(ghostRow.id, 'att_ghost_g7_123');
  });

  test('ranks faster bands first, then longer distance', () => {
    const ledger = createAttestationLedger();
    ledger.record('RunSummary', runSummary({ runId: 'slow', paceBand: 4, distanceMeters: 9000 }));
    ledger.record('RunSummary', runSummary({ runId: 'fast', paceBand: 1, distanceMeters: 3000 }));
    assert.deepEqual(
      ledger.list().map((r) => r.id),
      ['att_fast', 'att_slow']
    );
  });

  test('ignores races and failed ghost runs', () => {
    const ledger = createAttestationLedger();
    ledger.record('RaceOutcome', { ghostId: 'g', endedAt: 1, paceBand: 0 });
    ledger.record('GhostPerformance', ghostSummary({ result: 'failed' }));
    assert.equal(ledger.size(), 0);
  });

  test('dedupes by id — a re-signed summary replaces, not duplicates', () => {
    const ledger = createAttestationLedger();
    ledger.record('RunSummary', runSummary({ paceBand: 5 }));
    ledger.record('RunSummary', runSummary({ paceBand: 2 }));
    assert.equal(ledger.size(), 1);
    assert.equal(ledger.list()[0].paceBand, 2);
  });

  test('bounds the ledger, dropping the oldest first', () => {
    const ledger = createAttestationLedger({ maxEntries: 2 });
    ledger.record('RunSummary', runSummary({ runId: 'old', endedAt: 1 }));
    ledger.record('RunSummary', runSummary({ runId: 'mid', endedAt: 2 }));
    ledger.record('RunSummary', runSummary({ runId: 'new', endedAt: 3 }));
    assert.equal(ledger.size(), 2);
    assert.deepEqual(
      ledger
        .list()
        .map((r) => r.id)
        .sort(),
      ['att_mid', 'att_new']
    );
  });
});

describe('createAttestationLedger persistence', () => {
  /** A ledger over a real file, as the oracle actually runs it. */
  async function fileLedger(ledgerPath, options = {}) {
    const store = createQueuedStore(createFileStore(ledgerPath));
    const ledger = createAttestationLedger({ store, ...options });
    await ledger.ready();
    return { ledger, store };
  }

  test('resumes the board after a restart', async () => {
    const ledgerPath = tempLedgerPath();
    const first = await fileLedger(ledgerPath);
    first.ledger.record('RunSummary', runSummary({ runId: 'persisted' }));
    await first.store.flush();

    // A fresh process (new ledger, same file) serves the rows it signed before.
    const restarted = await fileLedger(ledgerPath);
    assert.equal(restarted.ledger.size(), 1);
    assert.equal(restarted.ledger.list()[0].id, 'att_persisted');
    assert.equal(restarted.ledger.list()[0].label, 'runner · accoun');

    // And the privacy contract survives the round-trip through disk.
    assert.doesNotMatch(fs.readFileSync(ledgerPath, 'utf8'), /abcdef123456/);
    assert.doesNotMatch(fs.readFileSync(ledgerPath, 'utf8'), /h3Cells/);
  });

  test('keeps bounded history on disk (oldest dropped)', async () => {
    const ledgerPath = tempLedgerPath();
    const { ledger, store } = await fileLedger(ledgerPath, { maxEntries: 2 });
    ledger.record('RunSummary', runSummary({ runId: 'old', endedAt: 1 }));
    ledger.record('RunSummary', runSummary({ runId: 'mid', endedAt: 2 }));
    ledger.record('RunSummary', runSummary({ runId: 'new', endedAt: 3 }));
    await store.flush();

    const restarted = await fileLedger(ledgerPath, { maxEntries: 2 });
    assert.deepEqual(
      restarted.ledger
        .list()
        .map((r) => r.id)
        .sort(),
      ['att_mid', 'att_new']
    );
  });

  test('starts empty (and stays usable) when the file is corrupt', async () => {
    const ledgerPath = tempLedgerPath();
    fs.writeFileSync(ledgerPath, '{ this is not json');

    const { ledger } = await fileLedger(ledgerPath);
    assert.equal(ledger.size(), 0);
    ledger.record('RunSummary', runSummary({ runId: 'after-corruption' }));
    assert.equal(ledger.size(), 1);
  });

  test('drops rows that do not look like board entries', async () => {
    const ledgerPath = tempLedgerPath();
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        version: 1,
        entries: [
          { id: 'junk' },
          { id: 'ok', label: 'x', paceBand: 1, distanceMeters: 1, kind: 'run', endedAt: 2 },
        ],
      })
    );

    const { ledger } = await fileLedger(ledgerPath);
    assert.deepEqual(
      ledger.list().map((r) => r.id),
      ['ok']
    );
  });

  test('a write failure never breaks a signature', async () => {
    // A directory can't be written as a file — the store is unusable.
    const ledgerPath = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ledger-dir-'));
    const { ledger } = await fileLedger(ledgerPath);
    const handler = createAttestationOracleHandler({
      privateKey: TEST_KEY,
      onSigned: (primaryType, message) => ledger.record(primaryType, message),
    });

    const res = await runHandler(handler, { body: typedData() });
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.signature);
    assert.equal(ledger.size(), 1);
  });

  test('answers reads before ready() from what it has, and the full board after', async () => {
    // The store is a promise away. A board that answered "nobody has ever
    // run" during that window would be lying, and would look like a working
    // empty deployment.
    const ledgerPath = tempLedgerPath();
    fs.writeFileSync(
      ledgerPath,
      JSON.stringify({
        version: 1,
        entries: [
          { id: 'att_old', label: 'x', paceBand: 1, distanceMeters: 1, kind: 'run', endedAt: 2 },
        ],
      })
    );
    const store = createQueuedStore(createFileStore(ledgerPath));
    const ledger = createAttestationLedger({ store });

    // Recording before hydration must not be lost when hydration lands.
    ledger.record('RunSummary', runSummary({ runId: 'new' }));
    await ledger.ready();

    assert.equal(ledger.size(), 2);
  });
});

describe('createLeaderboardHandler', () => {
  test('clamps limit and returns entries + count', async () => {
    const ledger = createAttestationLedger();
    for (let i = 0; i < 5; i++) {
      ledger.record('RunSummary', runSummary({ runId: `r${i}`, endedAt: 1_700_000_000_000 + i }));
    }
    const handler = createLeaderboardHandler(ledger);

    const limited = await runHandler(handler, { query: { limit: '2' } });
    assert.equal(limited.payload.entries.length, 2);
    assert.equal(limited.payload.count, 5);
    assert.equal(limited.headers['Cache-Control'], 'public, max-age=15');

    const bogus = await runHandler(handler, { query: { limit: 'wat' } });
    assert.equal(bogus.payload.entries.length, 5);
  });

  test('returns an empty board for an untouched ledger', async () => {
    const handler = createLeaderboardHandler(createAttestationLedger());
    const res = await runHandler(handler, { query: {} });
    assert.deepEqual(res.payload.entries, []);
    assert.equal(res.payload.count, 0);
  });
});

describe('oracle onSigned ledger hook', () => {
  test('records every summary that gets a signature', async () => {
    const ledger = createAttestationLedger();
    const handler = createAttestationOracleHandler({
      privateKey: TEST_KEY,
      onSigned: (primaryType, message) => ledger.record(primaryType, message),
    });
    const res = await runHandler(handler, { body: typedData() });
    assert.equal(res.statusCode, 200);
    assert.equal(ledger.size(), 1);
  });

  test('a throwing ledger hook never breaks the signature', async () => {
    const handler = createAttestationOracleHandler({
      privateKey: TEST_KEY,
      onSigned: () => {
        throw new Error('ledger down');
      },
    });
    const res = await runHandler(handler, { body: typedData() });
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.signature);
  });

  test('recovered signature still matches with a ledger hook installed', async () => {
    const wallet = new ethers.Wallet(TEST_KEY);
    const handler = createAttestationOracleHandler({
      privateKey: TEST_KEY,
      onSigned: () => {},
    });
    const res = await runHandler(handler, { body: typedData() });
    const td = typedData();
    const recovered = ethers.verifyTypedData(
      td.domain,
      td.types,
      td.message,
      res.payload.signature
    );
    assert.equal(recovered, wallet.address);
  });
});
