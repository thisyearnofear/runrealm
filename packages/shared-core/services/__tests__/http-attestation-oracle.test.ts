/**
 * Tests for HttpAttestationOracle — the production quorum member.
 *
 * Contract: POST the EIP-712 typed data to /attestations/sign, accept
 * only well-formed { signer, signature } responses, fail loudly on
 * transport/HTTP/malformed errors (the service's allSettled turns a
 * down oracle into fewer signatures, never a stuck run flow).
 *
 * @jest-environment jsdom
 */

import { type RunSummary, runSummaryTypedData } from '../attestation-service';
import { HttpAttestationOracle } from '../http-attestation-oracle';

const summary: RunSummary = {
  runId: 'r1',
  accountId: 'a1',
  distanceMeters: 5000,
  durationMs: 1500000,
  paceBand: 1,
  h3Cells: ['892a1072b4bffff'],
  endedAt: 123,
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('HttpAttestationOracle', () => {
  it('POSTs the typed data to /attestations/sign and returns the signature', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const oracle = new HttpAttestationOracle('https://oracle.example', async (url, init) => {
      calls.push({ url, init });
      return jsonResponse(200, { signer: '0xabc', signature: '0xsig' });
    });

    const result = await oracle.sign(runSummaryTypedData(summary, 0));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://oracle.example/attestations/sign');
    expect(calls[0].init?.method).toBe('POST');
    expect(JSON.parse(calls[0].init?.body as string).primaryType).toBe('RunSummary');
    expect(result).toEqual({
      oracle: 'https://oracle.example',
      signer: '0xabc',
      signature: '0xsig',
    });
  });

  it('rejects on non-2xx responses', async () => {
    const oracle = new HttpAttestationOracle('https://o.example', async () =>
      jsonResponse(503, {})
    );
    await expect(oracle.sign(runSummaryTypedData(summary, 0))).rejects.toThrow(/HTTP 503/);
  });

  it('rejects malformed responses (missing signer/signature)', async () => {
    const oracle = new HttpAttestationOracle('https://o.example', async () =>
      jsonResponse(200, { nope: true })
    );
    await expect(oracle.sign(runSummaryTypedData(summary, 0))).rejects.toThrow(/malformed/);
  });

  it('rejects when no fetch implementation exists', async () => {
    const oracle = new HttpAttestationOracle('https://o.example', undefined);
    const originalFetch = globalThis.fetch;
    // @ts-expect-error simulate an environment without fetch
    globalThis.fetch = undefined;
    try {
      await expect(oracle.sign(runSummaryTypedData(summary, 0))).rejects.toThrow(
        /no fetch implementation/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('uses the base URL as its oracle id', () => {
    expect(new HttpAttestationOracle('https://o.example').id).toBe('https://o.example');
  });
});
