import type { WorldSnapshot } from '@runrealm/shared-core/types/world-state';

/**
 * Reactor token resolution and small helpers for the Orbis challenge route.
 *
 * The browser never sees REACTOR_API_KEY. It asks a server-side broker for a
 * session-scoped JWT, memoizes that JWT for its real lifetime, and coalesces
 * the parallel token calls the SDK makes while negotiating WebRTC.
 */

export const REACTOR_MODEL_NAME = 'reactor/visko-orbis-dynamic';
export const DEFAULT_TOKEN_PATH = '/api/reactor/token';
export const NETLIFY_TOKEN_PATH = '/.netlify/functions/reactor-token';

export interface ReactorTokenResponse {
  jwt: string;
  /** Unix epoch seconds, decided by Reactor rather than the client. */
  expires_at: number;
}

export interface ReactorTokenResolverOptions {
  endpoints?: string[];
  fetchImpl?: typeof fetch;
  now?: () => number;
  refreshSkewMs?: number;
}

const DEFAULT_REFRESH_SKEW_MS = 60_000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getReactorTokenEndpoints(): string[] {
  const endpoints: string[] = [];
  const explicit = process.env.NEXT_PUBLIC_REACTOR_TOKEN_URL;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (explicit) endpoints.push(explicit);
  if (apiBase) endpoints.push(`${trimTrailingSlash(apiBase)}${DEFAULT_TOKEN_PATH}`);

  // Static Next exports cannot serve App Router API routes. Try same-origin
  // first for dynamic deployments, then Netlify Functions, then local Express.
  endpoints.push(DEFAULT_TOKEN_PATH, NETLIFY_TOKEN_PATH);

  if (typeof window !== 'undefined') {
    const { origin, port, hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      if (port !== '3001') endpoints.push(`http://${hostname}:3001${DEFAULT_TOKEN_PATH}`);
      if (port !== '3000') endpoints.push(`http://${hostname}:3000${DEFAULT_TOKEN_PATH}`);
    }
    endpoints.push(`${origin}${DEFAULT_TOKEN_PATH}`);
  }

  return Array.from(new Set(endpoints.filter(Boolean)));
}

async function readTokenResponse(
  response: Response,
  endpoint: string
): Promise<ReactorTokenResponse> {
  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? ((await response.json()) as Partial<ReactorTokenResponse> & { error?: string })
    : {};

  if (!response.ok) {
    throw new Error(body.error ?? `${endpoint} returned HTTP ${response.status}`);
  }
  if (typeof body.jwt !== 'string' || typeof body.expires_at !== 'number') {
    throw new Error(`${endpoint} did not return { jwt, expires_at }`);
  }
  return { jwt: body.jwt, expires_at: body.expires_at };
}

export function createReactorTokenResolver(
  options: ReactorTokenResolverOptions = {}
): () => Promise<string> {
  const endpoints = options.endpoints ?? getReactorTokenEndpoints();
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => Date.now());
  const refreshSkewMs = options.refreshSkewMs ?? DEFAULT_REFRESH_SKEW_MS;

  let cachedToken: { jwt: string; expiresAtMs: number } | null = null;
  let inflightToken: Promise<string> | null = null;

  return async () => {
    if (cachedToken && now() < cachedToken.expiresAtMs - refreshSkewMs) {
      return cachedToken.jwt;
    }
    if (inflightToken) return inflightToken;

    inflightToken = (async () => {
      const errors: string[] = [];

      for (const endpoint of endpoints) {
        try {
          const response = await fetchImpl(endpoint, { cache: 'no-store' });
          const token = await readTokenResponse(response, endpoint);
          cachedToken = { jwt: token.jwt, expiresAtMs: token.expires_at * 1000 };
          return token.jwt;
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      throw new Error(
        `No Reactor token endpoint is available. ${errors[errors.length - 1] ?? 'Configure REACTOR_API_KEY on the server.'}`
      );
    })();

    try {
      return await inflightToken;
    } finally {
      inflightToken = null;
    }
  };
}

export function formatWorldLabel(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Compose a single human-readable status sentence from the world snapshot so
 * visitors parse one line instead of four machine labels. Deliberately pure —
 * the canvas stays the visual, this stays the caption.
 */
export function describeWorld(
  snapshot: Pick<
    WorldSnapshot,
    'runStatus' | 'paceBand' | 'territoryStatus' | 'ghostPresence' | 'threatLevel' | 'currentCell'
  >,
  chunk: string | number | null = null
): string {
  const phase: Record<typeof snapshot.runStatus, string> = {
    idle: 'the atlas holds its breath',
    recording: 'recording the run',
    paused: 'the run catches its breath',
    completed: 'the realm settles',
    cancelled: 'the frame goes dark',
  };
  const ghosts: Record<typeof snapshot.ghostPresence, string | null> = {
    none: null,
    nearby: 'a ghost waits nearby',
    racing: 'the ghost pulls ahead',
    defending: 'a ghost defends the block',
  };
  const threat =
    snapshot.threatLevel >= 0.85
      ? 'overexposure burning'
      : snapshot.threatLevel >= 0.6
        ? 'threat critical'
        : snapshot.threatLevel >= 0.25
          ? 'threat rising'
          : 'threat calm';

  const parts = [phase[snapshot.runStatus]];
  if (snapshot.currentCell) parts.push(`sector ${snapshot.currentCell.slice(0, 7)}`);
  if (
    snapshot.runStatus !== 'idle' &&
    snapshot.runStatus !== 'cancelled' &&
    snapshot.paceBand !== 'unknown'
  ) {
    parts.push(`${formatWorldLabel(snapshot.paceBand)} pace`);
  }
  const ghost = ghosts[snapshot.ghostPresence];
  if (ghost) parts.push(ghost);
  parts.push(threat);
  if (chunk !== null) parts.push(`chunk ${chunk}`);

  const sentence = parts.join(' · ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// ── First-run intro flag ─────────────────────────────────────────────────────

export const INTRO_STORAGE_KEY = 'orbis-live:intro-done';

// Tiny external store so the first-run flag hydrates via useSyncExternalStore
// (server snapshot: not done) instead of setState-in-effect.
const introListeners = new Set<() => void>();

export function getIntroDone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(INTRO_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function subscribeIntroDone(listener: () => void): () => void {
  introListeners.add(listener);
  if (typeof window === 'undefined') {
    return () => {
      introListeners.delete(listener);
    };
  }
  const onStorage = () => listener();
  window.addEventListener('storage', onStorage);
  return () => {
    introListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function markIntroDone(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(INTRO_STORAGE_KEY, '1');
    } catch {
      // Private browsing — the intro simply replays next visit.
    }
  }
  introListeners.forEach((listener) => {
    listener();
  });
}

// ── Stalled-stream watchdog ──────────────────────────────────────────────────

/** A ready live session that has been silent for longer than this is stalled. */
export const STALL_THRESHOLD_MS = 12_000;

export interface StreamWatchdogInput {
  mode: 'live' | 'offline';
  sessionStatus: string;
  /** Epoch ms of the last chunk/run activity, or 0 before any activity. */
  lastActivityAt: number;
  now: number;
}

/**
 * Pure stall predicate behind the recovery chip: only a live, ready session
 * that has actually started producing activity can be considered stalled.
 */
export function isStreamStalled({
  mode,
  sessionStatus,
  lastActivityAt,
  now,
}: StreamWatchdogInput): boolean {
  return (
    mode === 'live' &&
    sessionStatus === 'ready' &&
    lastActivityAt > 0 &&
    now - lastActivityAt > STALL_THRESHOLD_MS
  );
}
