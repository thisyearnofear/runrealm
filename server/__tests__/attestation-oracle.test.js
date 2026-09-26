/**
 * Tests for the attestation oracle signer (node:test, no extra deps).
 * Run: node --test server/__tests__/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { ethers } = require('ethers');
const { createAttestationOracleHandler, validateTypedData } = require('../attestation-oracle');

// Well-known Hardhat account #0 — a test key, never real funds.
const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const wallet = new ethers.Wallet(TEST_KEY);

const summary = {
  runId: 'r1',
  accountId: 'a1',
  distanceMeters: 5000,
  durationMs: 1500000,
  paceBand: 1,
  h3Cells: ['892a1072b4bffff'],
  endedAt: Date.now(),
};

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
    message: { ...summary, h3Cells: [...summary.h3Cells] },
    ...overrides,
  };
}

/** Minimal express-like req/res doubles. */
async function run(handler, body) {
  return await new Promise((resolve) => {
    const res = {
      statusCode: 200,
      payload: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.payload = payload;
        resolve(res);
      },
    };
    Promise.resolve(handler({ body }, res)).catch((err) =>
      resolve({ statusCode: 500, payload: { error: String(err) } })
    );
  });
}

describe('validateTypedData', () => {
  test('accepts a well-formed RunSummary', () => {
    assert.equal(validateTypedData(typedData()), null);
  });

  test('rejects unknown domains', () => {
    const td = typedData();
    td.domain.name = 'Evil App';
    assert.match(validateTypedData(td), /unknown domain/);
  });

  test('rejects unknown primary types', () => {
    assert.match(validateTypedData(typedData({ primaryType: 'Pwned' })), /unknown primaryType/);
  });

  test('rejects missing message fields', () => {
    const td = typedData();
    delete td.message.paceBand;
    assert.match(validateTypedData(td), /paceBand/);
  });

  test('rejects out-of-bounds values', () => {
    const td = typedData();
    td.message.distanceMeters = 10_000_000; // 10,000 km
    assert.match(validateTypedData(td), /out of bounds/);
  });

  test('rejects future-dated summaries', () => {
    const td = typedData();
    td.message.endedAt = Date.now() + 60 * 60 * 1000;
    assert.match(validateTypedData(td), /out of bounds/);
  });
});

describe('createAttestationOracleHandler', () => {
  test('signs valid typed data; signature recovers to the oracle address', async () => {
    const handler = createAttestationOracleHandler({ privateKey: TEST_KEY });
    const res = await run(handler, typedData());
    assert.equal(res.statusCode, 200);
    assert.equal(res.payload.signer, wallet.address);
    const recovered = ethers.verifyTypedData(
      typedData().domain,
      typedData().types,
      summary,
      res.payload.signature
    );
    assert.equal(recovered, wallet.address);
  });

  test('400s on invalid typed data', async () => {
    const handler = createAttestationOracleHandler({ privateKey: TEST_KEY });
    const res = await run(handler, { nope: true });
    assert.equal(res.statusCode, 400);
  });

  test('422s when corroboration rejects the summary', async () => {
    const handler = createAttestationOracleHandler({
      privateKey: TEST_KEY,
      corroborate: () => false,
    });
    const res = await run(handler, typedData());
    assert.equal(res.statusCode, 422);
    assert.match(res.payload.error, /corroboration failed/);
  });

  test('passes the summary to the corroborator', async () => {
    let seen = null;
    const handler = createAttestationOracleHandler({
      privateKey: TEST_KEY,
      corroborate: (message) => {
        seen = message;
        return true;
      },
    });
    await run(handler, typedData());
    assert.equal(seen.runId, 'r1');
  });

  test('requires a private key', () => {
    assert.throws(() => createAttestationOracleHandler({}), /privateKey required/);
  });
});
