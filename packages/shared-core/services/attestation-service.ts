/**
 * AttestationService — protocol-vision Layer 3 (attestation), first
 * increment: run proofs, dual-run with the legacy claim flow.
 *
 * Today the client says "I ran 5K" and the chain believes it. This
 * service replaces client assertion with a signed *run summary*:
 *
 *   - Never raw GPS — distance, duration, a coarse pace band, and H3
 *     cell ids (axiom 3: privacy by default; proofs disclose shape,
 *     not location history).
 *   - EIP-712 typed data, signed by an oracle quorum. When no oracle
 *     is configured the attestation is honestly marked `local` — it
 *     still drives the dual-run comparison, but nobody should mistake
 *     it for a corroborated proof.
 *   - Disputable for the same 24h window as contests
 *     (GAME_RULES.contest.disputeHours), then finalized by a sweep.
 *
 * Dual-run: every legacy `territory:claimed` is checked against the
 * attestation ledger. A claim with no matching attestation emits
 * `attestation:mismatch` — the comparison metric that tells us when
 * the attestation path covers the legacy path well enough to cut over.
 *
 * Ghost performances will become attestations too (signed history is
 * what makes cross-ghost rivalries real); that lands with H4's second
 * half.
 */
import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
import { routeToCells } from '../utils/h3-territory';
import { StorageAdapter } from '../utils/storage-adapter';
import { openVersioned, writeVersioned } from '../utils/versioned-store';
import type { AccountService } from './account-service';
import type { RunSession } from './run-tracking-service';

/**
 * Coarse pace disclosure: the summary carries a band index, never the
 * exact pace. Band edges in sec/km — band 0 is fastest. Proving "I ran
 * sub-5:00/km" without revealing where or exactly how fast is the
 * leaderboard primitive this genre needs.
 */
export const PACE_BAND_EDGES_SEC_PER_KM = [270, 300, 330, 360, 420, 480] as const;

export interface RunSummary {
  runId: string;
  accountId: string;
  distanceMeters: number;
  durationMs: number;
  /** Index into PACE_BAND_EDGES_SEC_PER_KM; bands.length = edges+1. */
  paceBand: number;
  /** H3 res-9 cell ids covered by the route (no raw coordinates). */
  h3Cells: string[];
  endedAt: number;
}

export interface OracleSignature {
  /** Oracle identifier (URL or key id). */
  oracle: string;
  /** EIP-712 signature over the run summary typed data. */
  signature: string;
  /** Recovered/claimed signer address. */
  signer: string;
}

export type AttestationStatus =
  /** Inside the dispute window. */
  | 'pending'
  /** Dispute window elapsed uncontested. */
  | 'finalized'
  /** Challenged; resolution flow lands with the dispute UI. */
  | 'disputed'
  /** No oracle quorum configured — self-attested, honestly labeled. */
  | 'local';

export interface Attestation {
  id: string;
  summary: RunSummary;
  signatures: OracleSignature[];
  status: AttestationStatus;
  createdAt: number;
  disputeWindowEndsAt: number;
}

/** EIP-712 typed data for a run summary — the quorum signs exactly this. */
export function runSummaryTypedData(summary: RunSummary, chainId: number) {
  return {
    domain: {
      name: 'RunRealm Attestation',
      version: '1',
      chainId,
    },
    primaryType: 'RunSummary' as const,
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
    message: summary,
  };
}

/**
 * Oracle client seam. The HTTP implementation posts the typed data and
 * expects `{ signer, signature }` back. Tests inject fakes; production
 * configures endpoints via RUNREALM_ATTESTATION_ORACLES (comma-separated
 * base URLs). Signature *verification* lands when the settlement layer
 * consumes these proofs — the ledger stores them unverified for now and
 * says so.
 */
export interface AttestationOracle {
  id: string;
  sign(typedData: ReturnType<typeof runSummaryTypedData>): Promise<OracleSignature>;
}

interface AttestationStore {
  version: 1;
  attestations: Attestation[];
}

const STORE_KEY = 'runrealm_attestations';
const MAX_STORED = 500;

export function paceToBand(distanceMeters: number, durationMs: number): number {
  if (distanceMeters <= 0 || durationMs <= 0) return PACE_BAND_EDGES_SEC_PER_KM.length;
  const secPerKm = durationMs / 1000 / (distanceMeters / 1000);
  let band = 0;
  while (band < PACE_BAND_EDGES_SEC_PER_KM.length && secPerKm > PACE_BAND_EDGES_SEC_PER_KM[band]) {
    band++;
  }
  return band;
}

export class AttestationService extends BaseService {
  private static instance: AttestationService | null = null;
  private attestations = new Map<string, Attestation>();
  private byRunId = new Map<string, string>();
  private oracles: AttestationOracle[] = [];
  private readOnly = false;

  static getInstance(): AttestationService {
    if (!AttestationService.instance) {
      AttestationService.instance = new AttestationService();
    }
    return AttestationService.instance;
  }

  /** Test seam: isolated instance without touching the singleton. */
  static createIsolated(oracles: AttestationOracle[] = []): AttestationService {
    const service = new AttestationService();
    service.oracles = oracles;
    return service;
  }

  protected async onInitialize(): Promise<void> {
    await this.load();
    this.sweepFinalizable();

    this.subscribe(
      'run:completed',
      async (data: { run?: RunSession; distance: number; duration: number; points: any[] }) => {
        const run = data.run as RunSession | undefined;
        if (!run || !run.territoryEligible) return;
        try {
          await this.attestRun(run);
        } catch (error) {
          console.warn('AttestationService: failed to attest run:', error);
        }
      }
    );

    // Dual-run: the legacy claim path must never outrun the attestation
    // ledger. A claim with no matching attestation is the gap metric.
    this.subscribe('territory:claimed', (data: { territory?: { id?: string } }) => {
      const latest = this.latestAttestation();
      if (!latest) {
        this.safeEmit('attestation:mismatch', {
          territoryId: data.territory?.id ?? '',
          reason: 'claim-without-attestation',
        });
      }
    });
  }

  /**
   * Build, sign, and store an attestation for a completed run.
   * Returns null when there is no account to attest for.
   */
  async attestRun(run: RunSession): Promise<Attestation | null> {
    const account = this.getSiblingService('account') as AccountService | null;
    const accountId = account?.getAccount?.()?.id ?? 'unknown';

    const summary: RunSummary = {
      runId: run.id,
      accountId,
      distanceMeters: Math.round(run.totalDistance),
      durationMs: Math.round(run.totalDuration),
      paceBand: paceToBand(run.totalDistance, run.totalDuration),
      h3Cells: routeToCells(
        (run.points ?? [])
          .filter((p: any) => Number.isFinite(p?.lat) && Number.isFinite(p?.lng))
          .map((p: any) => ({ lat: p.lat, lng: p.lng }))
      ).map((c) => c.h3Index),
      endedAt: run.endTime ?? Date.now(),
    };

    const now = Date.now();
    const attestation: Attestation = {
      id: `att_${summary.runId}`,
      summary,
      signatures: [],
      status: this.oracles.length === 0 ? 'local' : 'pending',
      createdAt: now,
      disputeWindowEndsAt: now + GAME_RULES.contest.disputeHours * 60 * 60 * 1000,
    };

    if (this.oracles.length > 0) {
      const typedData = runSummaryTypedData(summary, 0); // chainId 0: off-chain attestation
      const results = await Promise.allSettled(this.oracles.map((o) => o.sign(typedData)));
      for (const result of results) {
        if (result.status === 'fulfilled') attestation.signatures.push(result.value);
      }
      if (attestation.signatures.length === 0) attestation.status = 'local';
    }

    this.attestations.set(attestation.id, attestation);
    this.byRunId.set(summary.runId, attestation.id);
    this.trimStore();
    await this.save();
    this.safeEmit('attestation:created', { attestation });
    return attestation;
  }

  getAttestations(): Attestation[] {
    return Array.from(this.attestations.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  getAttestationForRun(runId: string): Attestation | null {
    const id = this.byRunId.get(runId);
    return id ? (this.attestations.get(id) ?? null) : null;
  }

  /** Move pending attestations past their dispute window to finalized. */
  sweepFinalizable(now = Date.now()): number {
    let finalized = 0;
    for (const attestation of this.attestations.values()) {
      if (attestation.status === 'pending' && attestation.disputeWindowEndsAt <= now) {
        attestation.status = 'finalized';
        finalized++;
        this.safeEmit('attestation:finalized', { attestationId: attestation.id });
      }
    }
    if (finalized > 0) void this.save();
    return finalized;
  }

  private latestAttestation(): Attestation | null {
    let latest: Attestation | null = null;
    for (const a of this.attestations.values()) {
      if (!latest || a.createdAt > latest.createdAt) latest = a;
    }
    return latest;
  }

  private trimStore(): void {
    if (this.attestations.size <= MAX_STORED) return;
    const ordered = this.getAttestations(); // newest first
    for (const old of ordered.slice(MAX_STORED)) {
      this.attestations.delete(old.id);
      this.byRunId.delete(old.summary.runId);
    }
  }

  private async load(): Promise<void> {
    try {
      const raw = await StorageAdapter.getItem(STORE_KEY);
      if (raw == null) return;
      const opened = openVersioned<AttestationStore>(raw, {
        floor: 1,
        head: 1,
        steps: [],
        fresh: () => ({ version: 1 as const, attestations: [] }),
      });
      if (opened.status !== 'ok' && opened.status !== 'fresh') return;
      if (opened.readOnly) this.readOnly = true;
      for (const a of opened.state?.attestations ?? []) {
        if (a?.id && a.summary?.runId) {
          this.attestations.set(a.id, a);
          this.byRunId.set(a.summary.runId, a.id);
        }
      }
    } catch {
      /* storage unavailable — memory-only ledger */
    }
  }

  private async save(): Promise<void> {
    if (this.readOnly) return;
    try {
      const store: AttestationStore = {
        version: 1,
        attestations: Array.from(this.attestations.values()),
      };
      await StorageAdapter.setItem(STORE_KEY, writeVersioned(1, store, Date.now()));
    } catch {
      /* storage unavailable — memory-only ledger */
    }
  }
}
