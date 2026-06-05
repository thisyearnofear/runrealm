/**
 * HapticsService — cross-platform haptic feedback.
 *
 * Consolidates the haptic logic that was scattered across
 * ui-effects-manager.ts (web-app), mobile-widget-service.ts, and
 * the inline `navigator.vibrate` calls in enhanced-run-controls.ts.
 *
 * Web:     Vibration API (`navigator.vibrate`) + window.hapticFeedback
 *          (Safari iOS extension). Both are no-ops on unsupported devices.
 * Mobile:  expo-haptics bridge via global `window.expoHaptics`
 *          (set up by the mobile-app entry). When expo-haptics is
 *          unavailable, falls back to Vibration API.
 *
 * Singleton. Registered as a service in the composer; consumed by
 * the new immersion features (cell-capture, contested-border pulse,
 * run completion) and by EnhancedRunControls for territory eligibility.
 */
import { BaseService } from '../core/base-service';

export type HapticPattern = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

interface MobileHapticsBridge {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic bridge
  impactAsync?: (style: string) => Promise<void>;
  // biome-ignore lint/suspicious/noExplicitAny: dynamic bridge
  notificationAsync?: (type: string) => Promise<void>;
}

interface VibrationNavigator {
  vibrate(pattern: number | number[]): boolean;
}

const PATTERNS: Record<HapticPattern, number[]> = {
  light: [10],
  medium: [20],
  heavy: [30],
  success: [10, 50, 20],
  warning: [20, 30, 20],
  error: [40, 40, 40, 40, 40],
};

const EXPO_IMPACT: Record<'light' | 'medium' | 'heavy', string> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
};

const EXPO_NOTIFICATION: Record<'success' | 'warning' | 'error', string> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
};

export class HapticsService extends BaseService {
  private static instance: HapticsService;
  private enabled: boolean = true;

  static getInstance(): HapticsService {
    if (!HapticsService.instance) {
      HapticsService.instance = new HapticsService();
    }
    return HapticsService.instance;
  }

  protected async onInitialize(): Promise<void> {
    const cfg = this.config.getConfig();
    this.enabled = cfg.ui?.enableHaptics ?? true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Trigger a haptic pattern. No-op if haptics are disabled or the
   * device doesn't support any of the backends. Never throws.
   */
  trigger(pattern: HapticPattern = 'light'): void {
    if (!this.enabled) return;
    if (typeof window === 'undefined' && typeof navigator === 'undefined') return;

    try {
      // 1. expo-haptics bridge (mobile native — sharper, lower latency
      //    than Vibration API on Android).
      // biome-ignore lint/suspicious/noExplicitAny: dynamic bridge
      const bridge = (window as any)?.expoHaptics as MobileHapticsBridge | undefined;
      if (bridge) {
        if (pattern in EXPO_IMPACT) {
          bridge.impactAsync?.(EXPO_IMPACT[pattern as 'light' | 'medium' | 'heavy']);
          return;
        }
        if (pattern in EXPO_NOTIFICATION) {
          bridge.notificationAsync?.(EXPO_NOTIFICATION[pattern as 'success' | 'warning' | 'error']);
          return;
        }
      }

      // 2. iOS Safari extension (older iPads/iPhones with Taptic engine
      //    before the WebKit haptics API shipped).
      // biome-ignore lint/suspicious/noExplicitAny: vendor extension
      const w = window as any;
      if (typeof w.hapticFeedback === 'function') {
        w.hapticFeedback(pattern);
        return;
      }

      // 3. Web Vibration API (Android Chrome, Edge, etc.).
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        const n = navigator as unknown as { vibrate: VibrationNavigator['vibrate'] };
        n.vibrate(PATTERNS[pattern]);
      }
    } catch {
      // Haptics are best-effort. Silently swallow any device error.
    }
  }

  /**
   * Cancel any in-flight vibration. Useful when stopping a long
   * pattern (e.g. user disabled haptics mid-warning).
   */
  cancel(): void {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
    try {
      const n = navigator as unknown as { vibrate: VibrationNavigator['vibrate'] };
      n.vibrate(0);
    } catch {
      // ignore
    }
  }
}
