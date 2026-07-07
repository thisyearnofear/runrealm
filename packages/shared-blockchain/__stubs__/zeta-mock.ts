/**
 * ZetaChain mock message listener — DEV/TEST ONLY.
 *
 * `CrossChainService` historically started a `setInterval` timer in
 * production-shape code that fired fake inbound messages every 30s.
 * That was a footgun: real users with real wallets were getting
 * sandbox-shaped events in their UI. The simulator has been quarantined
 * here.
 *
 * Importing this module outside `NODE_ENV !== 'production'` is a
 * silent development-only path; production code should call
 * `attachRelayer(realClient)` with a real ZetaChain client and never
 * touch this file.
 */
import type { CrossChainEvent } from '../services/cross-chain-service';

let currentReceiver: ((event: CrossChainEvent) => void) | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const MOCK_CHAINS = [1, 56, 137, 43114, 8453, 42161];

/**
 * Start emitting mock inbound cross-chain messages. Only call from
 * dev/test paths. Pass `receiver` to handle each emitted event.
 * Idempotent — calling twice is a no-op.
 */
export function startZetaMockInbound(
  receiver: (event: CrossChainEvent) => void,
  contractAddress: () => string
): void {
  if (typeof window === 'undefined') return;
  if (intervalHandle) return; // idempotent
  currentReceiver = receiver;

  intervalHandle = setInterval(() => {
    if (Math.random() >= 0.2) return;
    if (!currentReceiver) return;
    const event: CrossChainEvent = {
      messageId: `mock_msg_${Date.now()}`,
      sourceChainId: MOCK_CHAINS[Math.floor(Math.random() * MOCK_CHAINS.length)],
      targetChainId: 7001,
      sender: `0x${Math.random().toString(16).slice(2, 12)}`,
      receiver: contractAddress(),
      data: JSON.stringify({
        type: 'territoryUpdate',
        territoryId: Math.floor(Math.random() * 1000),
        action: 'claimed',
      }),
      timestamp: Date.now(),
    };
    currentReceiver(event);
  }, 30_000);
}

/** Stop emitting mock events. Safe to call when not started. */
export function stopZetaMockInbound(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  currentReceiver = null;
}

/**
 * Convenience helper: wire the simulator only when not in production.
 * Production path throws — forcing callers to wire a real client.
 */
export function attachMockOrFail(
  receiver: (event: CrossChainEvent) => void,
  contractAddress: () => string
): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'attachMockOrFail: refusing to attach ZetaChain mock listener in production. Use attachRelayer(realClient).'
    );
  }
  startZetaMockInbound(receiver, contractAddress);
}
