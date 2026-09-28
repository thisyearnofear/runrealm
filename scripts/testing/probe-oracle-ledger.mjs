#!/usr/bin/env node
/**
 * Ephemeral local verification probe — NOT part of the app.
 *
 * Boots the real `server.js` with a throwaway oracle key, then exercises
 * the attestation ledger the way a client does: POST EIP-712 run summaries
 * to /attestations/sign (built here by hand, so this is an independent
 * client rather than the app checking itself), then read
 * GET /attestations/leaderboard and assert what landed.
 *
 * Asserts:
 *   - a signed summary round-trips (signer + signature come back)
 *   - only completed performances make the board (a failed ghost run does not)
 *   - ranking is band first, then distance
 *   - rows are pseudonymous and band-only — no h3Cells, no full accountId
 *   - a structurally invalid summary is rejected and never reaches the board
 *   - the board is persisted: a restarted server serves the same rows
 *
 * Usage: node scripts/testing/probe-oracle-ledger.mjs [port]
 * Prints PROBE_* lines and exits non-zero on failure.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.argv[2] ?? process.env.PROBE_ORACLE_PORT ?? 3210);
const BASE = `http://127.0.0.1:${PORT}`;
// Throwaway key — never a real oracle. Deterministic so re-runs are stable.
const ORACLE_KEY = `0x${'11'.repeat(32)}`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Hermetic ledger file: the probe must never touch the repo's runtime data.
const LEDGER_PATH = join(mkdtempSync(join(tmpdir(), 'rr-probe-ledger-')), 'ledger.json');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failures = [];
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function typedData(message) {
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
    message,
  };
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  return { status: res.status, body: await res.json().catch(() => null) };
}

const SERVER_ENV = {
  ...process.env,
  PORT: String(PORT),
  NODE_ENV: 'development',
  RUNREALM_ORACLE_PRIVATE_KEY: ORACLE_KEY,
  RUNREALM_LEDGER_PATH: LEDGER_PATH,
  // Keep the dev boot quiet — no remote services needed for this probe.
  STRAVA_CLIENT_ID: '',
  STRAVA_CLIENT_SECRET: '',
};

const servers = [];

/** Boot server.js and wait until its board endpoint answers. */
async function startServer() {
  const server = spawn(process.execPath, [join(ROOT, 'server.js')], {
    cwd: ROOT,
    env: SERVER_ENV,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servers.push(server);
  const log = [];
  server.stdout.on('data', (d) => log.push(String(d)));
  server.stderr.on('data', (d) => log.push(String(d)));

  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/attestations/leaderboard`);
      if (res.ok) return server;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`server never became ready on ${BASE}\n${log.join('')}`);
}

async function stopServer(server) {
  server.kill('SIGKILL');
  // Give the kernel a moment to release the port before rebinding it.
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`${BASE}/attestations/leaderboard`);
      await sleep(100);
    } catch {
      return;
    }
  }
}

async function main() {
  let server = await startServer();
  console.log(`PROBE_ORACLE ${BASE}`);

  const started = Date.now() - 5 * 60_000;
  const runnerA = {
    runId: 'probe_run_a',
    accountId: '0xabcdef1234567890abcdef1234567890abcdef12',
    distanceMeters: 5200,
    durationMs: 26 * 60_000,
    paceBand: 3,
    h3Cells: ['892a1072b4bffff', '892a1072b4bfffe'],
    endedAt: started,
  };
  const runnerB = {
    ...runnerA,
    runId: 'probe_run_b',
    accountId: '0x9999999999999999999999999999999999999999',
    distanceMeters: 12_000,
    paceBand: 1,
    h3Cells: ['892a1072b4bfff1'],
    endedAt: started + 1000,
  };

  console.log('SIGN');
  const signedA = await post('/attestations/sign', typedData(runnerA));
  const signedB = await post('/attestations/sign', typedData(runnerB));
  check(
    'oracle returns an EIP-712 signature',
    signedA.status === 200 && /^0x[0-9a-f]{130}$/i.test(signedA.body?.signature ?? ''),
    JSON.stringify(signedA.body)
  );
  check(
    'oracle returns its signer address',
    typeof signedA.body?.signer === 'string' && signedB.body?.signer === signedA.body?.signer
  );

  // Rejected: paceBand as a string, and a future-dated endedAt.
  const malformed = await post('/attestations/sign', {
    ...typedData(runnerA),
    message: { ...runnerA, runId: 'probe_run_bad', paceBand: '3' },
  });
  const futureDated = await post('/attestations/sign', {
    ...typedData(runnerA),
    message: { ...runnerA, runId: 'probe_run_future', endedAt: Date.now() + 3_600_000 },
  });
  check(
    'structurally invalid summary rejected',
    malformed.status === 400,
    String(malformed.status)
  );
  check('future-dated summary rejected', futureDated.status === 400, String(futureDated.status));

  console.log('LEDGER');
  const board = await get('/attestations/leaderboard');
  const entries = board.body?.entries ?? [];
  const ids = entries.map((e) => e.id);
  check('board endpoint is mounted', board.status === 200);
  check(
    'both signed runs are listed',
    ids.includes('att_probe_run_a') && ids.includes('att_probe_run_b')
  );
  check(
    'rejected summaries never reached the board',
    ids.every((id) => !id.includes('bad') && !id.includes('future'))
  );

  // Ranking: band asc, then distance desc → B (band 1) before A (band 3).
  check(
    'ranked by pace band, then distance',
    ids.indexOf('att_probe_run_b') < ids.indexOf('att_probe_run_a'),
    ids.join(', ')
  );

  const rowA = entries.find((e) => e.id === 'att_probe_run_a');
  check(
    'row is pseudonymous (first 6 of the account id only)',
    rowA?.label === 'runner · 0xabcd',
    String(rowA?.label)
  );
  check('row carries the band and distance', rowA?.paceBand === 3 && rowA?.distanceMeters === 5200);
  check(
    'row carries the account id… never a score or route',
    rowA?.kind === 'run' &&
      Object.keys(rowA).sort().join(',') === 'distanceMeters,endedAt,id,kind,label,paceBand'
  );

  const raw = JSON.stringify(entries);
  check(
    'route shape (h3Cells) never leaves the ledger',
    !raw.includes('h3Cells') && !raw.includes('892a1072')
  );
  check(
    'the full account id never leaves the ledger',
    !raw.includes(runnerA.accountId) && !raw.includes(runnerA.accountId.slice(7))
  );

  console.log('CACHE');
  const boardAgain = await get('/attestations/leaderboard?limit=1');
  check('limit is honoured', (boardAgain.body?.entries ?? []).length === 1);
  check(
    'cache header keeps the board fresh',
    /max-age=\d+/.test(
      String((await fetch(`${BASE}/attestations/leaderboard`)).headers.get('cache-control'))
    )
  );

  console.log('PROBE_LEDGER', JSON.stringify({ count: board.body?.count, ids }));

  console.log('RESTART');
  await stopServer(server);
  server = await startServer();
  const resumed = await get('/attestations/leaderboard');
  const resumedIds = (resumed.body?.entries ?? []).map((e) => e.id);
  check(
    'the restarted server serves the same board',
    resumed.body?.count === 2,
    String(resumed.body?.count)
  );
  check(
    'persisted rows keep their ids and order',
    resumedIds.join(',') === ids.join(','),
    resumedIds.join(',')
  );
  console.log(
    'PROBE_LEDGER_RESUMED',
    JSON.stringify({ count: resumed.body?.count, ids: resumedIds })
  );
}

main()
  .catch((err) => {
    console.error('probe failed:', err?.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const server of servers) server.kill('SIGKILL');
    if (failures.length > 0) {
      console.error(`FAILURES: ${failures.length}`);
      process.exitCode = 1;
    }
  });
