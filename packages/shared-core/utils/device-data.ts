/**
 * Device data inventory and erasure.
 *
 * The app keeps a runner's history, their neighbourhood atlas, preferences and
 * the local interaction buffer on their device, and until now there was no way
 * for them to see that list or clear it. Two reasons that matters: an erasure
 * right is only real if it is actionable, and an inventory is the honest way to
 * answer "what does this app have on me?" without a privacy policy.
 *
 * Deletion is deliberately conservative. It removes keys this app owns and
 * nothing else — no `localStorage.clear()`, no session wipe. A shared or
 * third-party origin is not ours to empty, and doing so would destroy state a
 * user did not ask us to touch.
 */

/** Keys this app owns. Anything not listed here is left alone on erase. */
export const DEVICE_DATA_KEYS = [
  // Runs and the local ledger
  'runrealm-run-history-v1',
  'runrealm_run_history',
  'runrealm_run_upload_queue',
  'runrealm_player_stats',
  'runrealm_neighbourhood_ledger_v1',
  'user-runs',
  // Derived, rebuildable from a fresh run
  'user-analytics',
  // Integrations — deleting these signs the runner out rather than hiding it
  'runrealm_strava_access_token',
  'runrealm_wallet_address',
  'runrealm_wallet_connected',
  // Onboarding and UI state
  'runrealm_onboarding_complete',
  'runrealm_onboarding_in_progress',
  'runrealm_welcomed',
  'runrealm-here-when-you-were-away',
  'runrealm-notification-last',
  // Map preferences
  'runrealm_mapbox_access_token',
  'map-camera-position',
] as const;

export interface DeviceDataEntry {
  key: string;
  /** Approximate size on disk, or null when the browser will not say. */
  bytes: number | null;
  /** What this is, in words meant for a runner rather than a developer. */
  description: string;
}

const DESCRIPTIONS: Record<string, string> = {
  'runrealm-run-history-v1': 'Your runs — distance, time and pace. Not the routes themselves.',
  runrealm_run_history: 'Your runs — distance, time and pace. Not the routes themselves.',
  runrealm_run_upload_queue: 'Runs waiting to be checked for a claim.',
  runrealm_player_stats: 'Your progress and level.',
  runrealm_neighbourhood_ledger_v1: 'The blocks you have collected on your map.',
  'user-runs': 'Your run history, used to suggest distances.',
  'user-analytics': 'Which buttons you pressed. Never sent anywhere.',
  runrealm_strava_access_token: 'Your Strava connection.',
  runrealm_wallet_address: 'Your wallet address.',
  runrealm_wallet_connected: 'Whether a wallet is connected.',
  runrealm_onboarding_complete: 'That you have seen the tour.',
  runrealm_onboarding_in_progress: 'That you were part-way through the tour.',
  runrealm_welcomed: 'That you have been here before.',
  'runrealm-here-when-you-were-away': 'When you last ran, used for the greeting.',
  'runrealm-notification-last': 'When you were last prompted.',
  // Only here as a fallback: geocoding normally goes through our own
  // server, which holds the token. Tiles never needed Mapbox at all.
  runrealm_mapbox_access_token: 'A fallback key for street labels. Not needed normally.',
  'map-camera-position': 'Where the map was last looking.',
};

/** What this app currently holds on this device. */
export function listDeviceData(): DeviceDataEntry[] {
  const out: DeviceDataEntry[] = [];
  for (const key of DEVICE_DATA_KEYS) {
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      // Private mode or a blocked origin: nothing to report for this key.
      continue;
    }
    if (raw === null) continue;
    out.push({ key, bytes: raw.length, description: DESCRIPTIONS[key] ?? 'App data.' });
  }
  return out;
}

/** Bytes currently held across every key this app owns. */
export function deviceDataBytes(): number {
  return listDeviceData().reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
}

/**
 * Erase everything listed above. Returns the keys actually removed, so the
 * caller can tell the runner what went rather than asserting success.
 */
export function eraseDeviceData(): string[] {
  const removed: string[] = [];
  for (const key of DEVICE_DATA_KEYS) {
    try {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        removed.push(key);
      }
    } catch {
      // A key we cannot read is a key we cannot remove; skipping is correct.
    }
  }
  return removed;
}
