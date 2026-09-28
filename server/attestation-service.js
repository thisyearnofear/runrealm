/**
 * Attestation oracle service — the only place a quorum key may be loaded.
 *
 * This module is deliberately free of any transport of its own beyond an
 * Express router. It is mounted by two entrypoints:
 *
 * - `server/oracle.js`   — the production shape. Its own process, its own
 *   container, its own environment. Nothing else runs in it.
 * - `server.js`          — the dev convenience, behind an explicit opt-in.
 *
 * The split exists because of what Phase 3 found: the signing key for a
 * quorum member was living in the environment of the process that serves
 * unauthenticated `POST /api/runs`, with `Access-Control-Allow-Origin: *`.
 * A key that is one process-wide env read away from a public write endpoint
 * is not a key that can be rotated independently, and it is not a key whose
 * blast radius is one service.
 *
 * What this service does NOT do, by design:
 * - Serve any route other than the two attestation ones plus `/healthz`.
 * - Accept a key from a request. The key comes from the environment of the
 *   process, never from the wire.
 * - Refuse to start if no key is present, when mounted as the standalone
 *   entrypoint. A signer with no key is not a degraded signer, it is a
 *   500 on every quorum attempt, so it fails loudly at boot instead.
 */

const express = require('express');
const { createAttestationOracleHandler } = require('./attestation-oracle');
const { createAttestationLedger, createLeaderboardHandler, MAX_ENTRIES } = require('./leaderboard');
const { createFileStore, createMemoryStore, createQueuedStore } = require('./ledger-store');

/** Where `server.js` keeps the board unless RUNREALM_LEDGER_PATH says otherwise. */
const path = require('node:path');
const DEFAULT_LEDGER_PATH = path.join(__dirname, '..', '.data', 'attestation-ledger.json');

/**
 * Resolve the ledger store from the environment.
 *
 * `RUNREALM_LEDGER_PATH=off` (or empty-with-no-default) means memory only.
 * Anything else is a file path. The `||` rather than `??` is deliberate and
 * pre-existing: the shipped env examples leave the key blank, and blank
 * means "unset" — it must not silently stop persisting.
 */
function ledgerStoreFromEnv(env = process.env) {
  const configured = env.RUNREALM_LEDGER_PATH || DEFAULT_LEDGER_PATH;
  if (configured === 'off') return createQueuedStore(createMemoryStore());
  return createQueuedStore(createFileStore(configured));
}

function describeLedgerTarget(env = process.env) {
  const configured = env.RUNREALM_LEDGER_PATH || DEFAULT_LEDGER_PATH;
  return configured === 'off' ? 'memory only' : configured;
}

/**
 * Build the attestation router.
 *
 * @param {object} opts
 * @param {string|null} opts.privateKey  the quorum key; null means no signer
 * @param {object} [opts.store]          ledger store; defaults from env
 * @param {number} [opts.maxEntries]     ledger bound
 * @param {(message: object, req: any) => boolean|Promise<boolean>} [opts.corroborate]
 * @returns {{ router: import('express').Router, ledger: object, signer: string|null }}
 */
function createAttestationService({
  privateKey,
  store = ledgerStoreFromEnv(),
  maxEntries = MAX_ENTRIES,
  corroborate,
} = {}) {
  const ledger = createAttestationLedger({ maxEntries, store });
  const router = express.Router();

  // The sign endpoint takes an EIP-712 payload: small by construction. The
  // public API's 5 MB limit is for GPS traces and does not belong here.
  router.use(express.json({ limit: '256kb' }));

  let signer = null;
  if (privateKey) {
    const handler = createAttestationOracleHandler({
      privateKey,
      corroborate,
      onSigned: (primaryType, message) => ledger.record(primaryType, message),
    });
    router.post('/attestations/sign', handler);
    // Assigned after construction: `createAttestationOracleHandler` throws
    // on a malformed key, and we want that to surface at boot, not on the
    // first request from a runner mid-run.
    signer = handlerWalletAddress(privateKey);
  }

  router.get('/attestations/leaderboard', createLeaderboardHandler(ledger));

  return { router, ledger, signer };
}

/** Resolve the signer's address for `/healthz` without signing anything. */
function handlerWalletAddress(privateKey) {
  // eslint-disable-next-line global-require
  const { ethers } = require('ethers');
  return new ethers.Wallet(privateKey).address;
}

/**
 * The CORS block the attestation service uses.
 *
 * Identical to the public API's, and that is the point: a split deployment
 * needs no client change. The oracle is public by design — the whole point
 * is that any runner's client can ask any quorum member for a signature — so
 * it is CORS-open like everything else here, and what protects the key is
 * that this process holds nothing else.
 */
function attestationCors(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  next();
}

module.exports = {
  DEFAULT_LEDGER_PATH,
  attestationCors,
  createAttestationService,
  describeLedgerTarget,
  ledgerStoreFromEnv,
};
