/**
 * Attestation oracle — standalone entrypoint.
 *
 * This process does one thing: sign EIP-712 run summaries for the
 * attestation quorum, and serve the board of what it has signed. It serves
 * nothing else. There is no run upload, no Strava webhook, no token broker,
 * no static file — so a compromise of this process, or of anything
 * reachable from it, cannot reach the signing key.
 *
 * The alternative (what Phase 3 replaced) was the key sitting in the
 * environment of the public API process, alongside `POST /api/runs` with a
 * 5 MB body limit and `Access-Control-Allow-Origin: *`. One env read away
 * from a public write endpoint is not a key you can rotate on its own.
 *
 * Boot contract: no key means no process. A signer with no key is not a
 * degraded signer, it is a 500 on every quorum attempt, and it fails far
 * more clearly at boot than it does halfway through someone's run.
 *
 * Env:
 *   RUNREALM_ORACLE_PRIVATE_KEY  required — the quorum key
 *   PORT                         default 3001
 *   RUNREALM_LEDGER_PATH         default .data/attestation-ledger.json, or `off`
 */

require('dotenv').config();
const express = require('express');

const {
  attestationCors,
  createAttestationService,
  describeLedgerTarget,
} = require('./attestation-service');

const privateKey = process.env.RUNREALM_ORACLE_PRIVATE_KEY;
const port = Number(process.env.PORT) || 3001;

if (!privateKey) {
  console.error(
    'oracle: RUNREALM_ORACLE_PRIVATE_KEY is not set. Refusing to start.\n' +
      '         This process exists to hold a signing key; without one it holds nothing.\n' +
      '         The public API (server.js) serves the leaderboard unauthenticated —\n' +
      '         that is intentional, and it needs no key to do it.'
  );
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
app.use(attestationCors);

let service;
try {
  service = createAttestationService({ privateKey });
} catch (error) {
  console.error('oracle: could not build the attestation service:', error?.message);
  process.exit(1);
}

app.use(service.router);

// Liveness that proves which key is loaded, without exposing it. The
// address is public information — it is in every signature this oracle
// produces — and it is the single most useful thing to check when a quorum
// is misbehaving.
app.get('/healthz', (_req, res) => {
  res.json({
    service: 'runrealm-attestation-oracle',
    signer: service.signer,
    ledger: describeLedgerTarget(),
  });
});

const server = app.listen(port, () => {
  console.log(`Attestation oracle listening on http://localhost:${port}`);
  console.log(`  signer: ${service.signer}`);
  console.log(`  ledger: ${describeLedgerTarget()}`);
  console.log('  routes: POST /attestations/sign · GET /attestations/leaderboard');
});

process.on('SIGINT', () => {
  console.log('oracle: shutting down');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('oracle: shutting down');
  server.close(() => process.exit(0));
});
