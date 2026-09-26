/**
 * HttpAttestationOracle — production AttestationOracle implementation.
 *
 * Posts the EIP-712 typed data to the oracle's signing endpoint and
 * expects `{ signer, signature }` back. Each oracle is independent:
 * the attestation service calls the whole quorum with allSettled, so
 * one down oracle degrades the signature count, not the run flow.
 *
 * Config: RUNREALM_ATTESTATION_ORACLES (comma-separated base URLs).
 * Signature verification lands when the settlement layer consumes
 * these proofs; transport here is plain HTTPS JSON.
 */
import type {
  AttestationOracle,
  OracleSignature,
  runSummaryTypedData,
} from './attestation-service';

type TypedData = ReturnType<typeof runSummaryTypedData>;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 10_000;

export class HttpAttestationOracle implements AttestationOracle {
  constructor(
    public readonly baseUrl: string,
    private readonly fetchFn?: FetchLike,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  get id(): string {
    return this.baseUrl;
  }

  async sign(typedData: TypedData): Promise<OracleSignature> {
    const fetchImpl =
      this.fetchFn ?? (typeof fetch === 'function' ? (fetch as FetchLike) : undefined);
    if (!fetchImpl) throw new Error('oracle: no fetch implementation available');

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), this.timeoutMs) : null;
    try {
      const res = await fetchImpl(`${this.baseUrl}/attestations/sign`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(typedData),
        signal: controller?.signal,
      });
      if (!res.ok) {
        throw new Error(`oracle ${this.baseUrl}: HTTP ${res.status}`);
      }
      const body = (await res.json()) as Partial<OracleSignature>;
      if (typeof body?.signature !== 'string' || typeof body?.signer !== 'string') {
        throw new Error(`oracle ${this.baseUrl}: malformed response`);
      }
      return { oracle: this.baseUrl, signature: body.signature, signer: body.signer };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
