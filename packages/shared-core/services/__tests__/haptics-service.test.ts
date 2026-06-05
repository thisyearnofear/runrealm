/**
 * Tests for HapticsService.
 *
 * Verifies the trigger() method does the right thing on each backend
 * and is a no-op when haptics are disabled or unavailable.
 *
 * @jest-environment jsdom
 */
import { HapticsService } from '../haptics-service';

describe('HapticsService', () => {
  let service: HapticsService;
  let originalVibrate: typeof navigator.vibrate | undefined;
  // biome-ignore lint/suspicious/noExplicitAny: stub
  let originalExpoHaptics: any;
  // biome-ignore lint/suspicious/noExplicitAny: stub
  let originalHapticFeedback: any;

  beforeEach(() => {
    service = HapticsService.getInstance();
    originalVibrate = navigator.vibrate;
    // biome-ignore lint/suspicious/noExplicitAny: stub
    originalExpoHaptics = (window as any).expoHaptics;
    // biome-ignore lint/suspicious/noExplicitAny: stub
    originalHapticFeedback = (window as any).hapticFeedback;
    // biome-ignore lint/suspicious/noExplicitAny: stub
    delete (window as any).expoHaptics;
    // biome-ignore lint/suspicious/noExplicitAny: stub
    delete (window as any).hapticFeedback;
  });

  afterEach(() => {
    // biome-ignore lint/suspicious/noExplicitAny: stub restore
    (navigator as any).vibrate = originalVibrate;
    if (originalExpoHaptics) {
      // biome-ignore lint/suspicious/noExplicitAny: stub restore
      (window as any).expoHaptics = originalExpoHaptics;
    }
    if (originalHapticFeedback) {
      // biome-ignore lint/suspicious/noExplicitAny: stub restore
      (window as any).hapticFeedback = originalHapticFeedback;
    }
  });

  it('triggers Vibration API on web (mocked)', () => {
    const calls: (number | number[])[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: stub
    (navigator as any).vibrate = (p: number | number[]) => {
      calls.push(p);
      return true;
    };
    service.setEnabled(true);
    service.trigger('light');
    expect(calls).toEqual([[10]]);
    service.trigger('heavy');
    expect(calls[1]).toEqual([30]);
    service.trigger('success');
    expect(calls[2]).toEqual([10, 50, 20]);
  });

  it('does nothing when disabled', () => {
    const calls: (number | number[])[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: stub
    (navigator as any).vibrate = (p: number | number[]) => {
      calls.push(p);
      return true;
    };
    service.setEnabled(false);
    service.trigger('light');
    expect(calls).toEqual([]);
  });

  it('does nothing when navigator.vibrate is missing', () => {
    // biome-ignore lint/suspicious/noExplicitAny: stub
    delete (navigator as any).vibrate;
    expect(() => service.trigger('light')).not.toThrow();
  });

  it('prefers window.expoHaptics when available (mobile bridge)', async () => {
    service.setEnabled(true);
    const impactCalls: string[] = [];
    const notifCalls: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: stub
    (window as any).expoHaptics = {
      impactAsync: async (style: string) => {
        impactCalls.push(style);
      },
      notificationAsync: async (type: string) => {
        notifCalls.push(type);
      },
    };
    service.trigger('light');
    service.trigger('heavy');
    service.trigger('success');
    service.trigger('error');
    await new Promise((r) => setTimeout(r, 0));
    expect(impactCalls).toEqual(['light', 'heavy']);
    expect(notifCalls).toEqual(['success', 'error']);
  });

  it('falls back to window.hapticFeedback when no expo bridge', () => {
    service.setEnabled(true);
    const calls: string[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: stub
    (window as any).hapticFeedback = (type: string) => {
      calls.push(type);
    };
    service.trigger('medium');
    expect(calls).toEqual(['medium']);
  });

  it('cancel() calls vibrate(0)', () => {
    const calls: (number | number[])[] = [];
    // biome-ignore lint/suspicious/noExplicitAny: stub
    (navigator as any).vibrate = (p: number | number[]) => {
      calls.push(p);
      return true;
    };
    service.cancel();
    expect(calls).toEqual([0]);
  });
});
