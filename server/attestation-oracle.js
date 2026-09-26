/**
 * Attestation oracle signer — protocol-vision Layer 3, server side.
 *
 * The client (HttpAttestationOracle) POSTs EIP-712 typed data here;
 * this handler validates the summary shape, optionally corroborates it
 * against an independent signal (Strava webhook etc.), and returns the
 * oracle's typed-data signature. The key never leaves the server.
 *
 * Mounted by server.js only when RUNREALM_ORACLE_PRIVATE_KEY is set —
 * without a key there is no oracle, and the client honestly reports
 * `local` attestation status instead of a fake quorum.
 *
 * Corroboration seam: pass `corroborate(summary, req)` returning a
 * boolean (or Promise<boolean>). Default: accept structurally valid
 * summaries. A rejecting corroborator yields HTTP 422, which the
 * client's allSettled turns into "fewer signatures", never a stuck run.
 */
const { ethers } = require('ethers');

const DOMAIN_NAME = 'RunRealm Attestation';
const DOMAIN_VERSION = '1';

/** Per-primaryType required fields and their expected JS types. */
const PRIMARY_TYPES = {
  RunSummary: {
    runId: 'string',
    accountId: 'string',
    distanceMeters: 'number',
    durationMs: 'number',
    paceBand: 'number',
    h3Cells: 'array',
    endedAt: 'number',
  },
  GhostPerformance: {
    ghostId: 'string',
    territoryId: 'string',
    distanceMeters: 'number',
    durationMs: 'number',
    paceBand: 'number',
    activityPointsEarned: 'number',
    result: 'string',
    endedAt: 'number',
  },
  RaceOutcome: {
    ghostId: 'string',
    ghostName: 'string',
    territoryId: 'string',
    ghostScore: 'number',
    userScore: 'number',
    winner: 'string',
    endedAt: 'number',
  },
};

/** Sanity bounds — reject nonsense before it becomes a signed fact. */
const BOUNDS = {
  distanceMeters: { min: 0, max: 500_000 }, // 500 km
  durationMs: { min: 0, max: 24 * 60 * 60 * 1000 }, // 24 h
  paceBand: { min: 0, max: 12 },
  endedAt: { min: 1_600_000_000_000, max: Date.now() + 60_000 }, // not future-dated
};

function validateTypedData(body) {
  if (!body || typeof body !== 'object') return 'not an object';
  const { domain, primaryType, types, message } = body;
  if (domain?.name !== DOMAIN_NAME || domain?.version !== DOMAIN_VERSION) {
    return 'unknown domain';
  }
  const fields = PRIMARY_TYPES[primaryType];
  if (!fields) return `unknown primaryType: ${primaryType}`;
  if (!types?.[primaryType]) return 'missing type definition';
  if (!message || typeof message !== 'object') return 'missing message';
  for (const [field, kind] of Object.entries(fields)) {
    const value = message[field];
    if (kind === 'array') {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
        return `field ${field}: expected string[]`;
      }
    } else if (typeof value !== kind) {
      return `field ${field}: expected ${kind}`;
    }
    const bound = BOUNDS[field];
    if (bound && (value < bound.min || value > bound.max)) {
      return `field ${field}: out of bounds`;
    }
  }
  return null;
}

/**
 * Build the signing handler.
 * @param {{ privateKey: string, corroborate?: (message: object, req: any) => boolean | Promise<boolean> }} opts
 */
function createAttestationOracleHandler(opts) {
  if (!opts?.privateKey) throw new Error('attestation-oracle: privateKey required');
  const wallet = new ethers.Wallet(opts.privateKey);
  const corroborate = opts.corroborate ?? (() => true);

  return async function attestationSignHandler(req, res) {
    const error = validateTypedData(req.body);
    if (error) {
      res.status(400).json({ error: `invalid typed data: ${error}` });
      return;
    }
    const { domain, primaryType, types, message } = req.body;
    try {
      const ok = await corroborate(message, req);
      if (!ok) {
        res.status(422).json({ error: 'corroboration failed' });
        return;
      }
    } catch (err) {
      res.status(422).json({ error: `corroboration error: ${err?.message ?? 'unknown'}` });
      return;
    }
    try {
      // EIP-712: sign exactly what the client sent, minus the EIP712Domain
      // key ethers supplies from the domain object itself.
      const { EIP712Domain: _drop, ...signTypes } = types;
      const signature = await wallet.signTypedData(domain, signTypes, message);
      res.json({ signer: wallet.address, signature });
    } catch (err) {
      res.status(500).json({ error: `signing failed: ${err?.message ?? 'unknown'}` });
    }
  };
}

module.exports = { createAttestationOracleHandler, validateTypedData };
