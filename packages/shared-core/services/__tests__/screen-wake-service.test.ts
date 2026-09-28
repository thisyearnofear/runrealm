/**
 * The pocket, from the lock's side.
 *
 * A wake lock is a promise the browser makes and then quietly takes back: it
 * drops the lock the moment the page hides, and Chrome can revoke it outright
 * for battery or policy. A service that acquires once and never re-checks is a
 * service that worked in the lab and failed at the first lock-screen. These
 * tests pin the re-acquire, the unsupported-browser no-op, and the teardown.
 *
 * @jest-environment jsdom
 */

import { ScreenWakeService } from '../screen-wake-service';

interface FakeSentinel {
  released: boolean;
  release: jest.Mock<Promise<void>, []>;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  /** Simulate the browser revoking the lock. */
  fire(): void;
  listeners: Set<() => void>;
}

function makeSentinel(): FakeSentinel {
  const listeners = new Set<() => void>();
  const sentinel: FakeSentinel = {
    released: false,
    listeners,
    release: jest.fn(async () => {
      sentinel.released = true;
    }),
    addEventListener: jest.fn((_type: string, fn: () => void) => {
      listeners.add(fn);
    }),
    removeEventListener: jest.fn((_type: string, fn: () => void) => {
      listeners.delete(fn);
    }),
    fire: () => {
      sentinel.released = true;
      for (const fn of [...listeners]) fn();
    },
  };
  return sentinel;
}

function installWakeLock(): { request: jest.Mock; sentinels: FakeSentinel[] } {
  const sentinels: FakeSentinel[] = [];
  const request = jest.fn(async () => {
    const sentinel = makeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', {
    value: { request },
    configurable: true,
  });
  return { request, sentinels };
}

function removeWakeLock(): void {
  // The property must be genuinely absent — `isSupported()` checks for
  // `typeof request === 'function'`, so an `undefined` value would also do,
  // but `delete` is what a real Firefox looks like.
  Reflect.deleteProperty(navigator, 'wakeLock');
}

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
}

/** Re-acquires are kicked off, not awaited, so let the microtasks land. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
}

describe('ScreenWakeService', () => {
  /**
   * Every instance binds a `visibilitychange` listener on the one shared
   * jsdom document, so an un-torn-down instance from an earlier test answers
   * the next test's events. Production has a singleton; the suite has to
   * clean up after itself or it tests the union of every case at once.
   */
  const live: ScreenWakeService[] = [];

  function newService(): ScreenWakeService {
    const created = new ScreenWakeService();
    live.push(created);
    return created;
  }

  beforeEach(() => {
    setHidden(false);
    installWakeLock();
  });

  afterEach(() => {
    for (const created of live.splice(0)) created.cleanup();
    removeWakeLock();
  });

  it('acquires a screen lock on hold', async () => {
    const { request, sentinels } = installWakeLock();
    const service = newService();
    await service.initialize();

    await service.hold();

    expect(request).toHaveBeenCalledWith('screen');
    expect(service.isHeld()).toBe(true);
    expect(sentinels[0].released).toBe(false);
  });

  it('is idempotent: a second hold does not take a second lock', async () => {
    const { request } = installWakeLock();
    const service = newService();
    await service.initialize();

    await service.hold();
    await service.hold();

    // Two locks for one run is the kind of thing that looks fine in a test
    // and gets the OS to revoke both on a real phone.
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('releases the sentinel on release()', async () => {
    const { sentinels } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();

    service.release();

    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(service.isHeld()).toBe(false);
  });

  it('does not re-acquire after an explicit release', async () => {
    const { request, sentinels } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();
    service.release();

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(request).toHaveBeenCalledTimes(1);
    expect(sentinels[0].listeners.size).toBe(0);
  });

  it('re-acquires when the tab comes back while the run still wants it', async () => {
    const { request } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();
    expect(request).toHaveBeenCalledTimes(1);

    // The browser drops the lock on hide. Our sentinel's `release` event is
    // the notification; the visibility change is the backstop.
    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(request).toHaveBeenCalledTimes(1);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    expect(service.isHeld()).toBe(true);
  });

  it('re-acquires when the browser revokes the lock outright', async () => {
    const { request, sentinels } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();

    // Chrome taking the lock back for battery: the tab never hid, so the
    // visibility backstop would not fire.
    sentinels[0].fire();
    await flush();

    expect(request).toHaveBeenCalledTimes(2);
    expect(service.isHeld()).toBe(true);
  });

  it('does not re-acquire after release() even if the browser revokes later', async () => {
    const { request, sentinels } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();
    service.release();

    sentinels[0].fire();

    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does not re-acquire on a release event fired while hidden', async () => {
    const { request, sentinels } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();

    setHidden(true);
    sentinels[0].fire();
    expect(request).toHaveBeenCalledTimes(1);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(request).toHaveBeenCalledTimes(2);
  });

  describe('unsupported browsers', () => {
    beforeEach(() => removeWakeLock());

    it('reports itself unsupported', () => {
      const service = newService();
      expect(service.isSupported()).toBe(false);
    });

    it('no-ops on hold and release without throwing', async () => {
      const service = newService();
      await service.initialize();

      await expect(service.hold()).resolves.toBeUndefined();
      expect(() => service.release()).not.toThrow();
      expect(service.isHeld()).toBe(false);
    });

    it('stays quiet through visibility changes', async () => {
      const service = newService();
      await service.initialize();
      await service.hold();

      setHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
      setHidden(false);
      expect(() => document.dispatchEvent(new Event('visibilitychange'))).not.toThrow();
    });
  });

  it('swallows a rejected request and stays usable', async () => {
    // NotAllowedError: permission or policy. AbortError: the page hid
    // mid-request. Neither should take the run down.
    const request = jest.fn(async () => {
      throw new DOMException('not allowed', 'NotAllowedError');
    });
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request },
      configurable: true,
    });
    const service = newService();
    await service.initialize();

    await expect(service.hold()).resolves.toBeUndefined();
    expect(service.isHeld()).toBe(false);
    expect(() => service.release()).not.toThrow();
  });

  it('releases the lock on cleanup', async () => {
    // A torn-down service that keeps a phone glowing is a battery bug that
    // only shows up after HMR or a route change.
    const { sentinels } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();

    service.cleanup();

    expect(sentinels[0].release).toHaveBeenCalledTimes(1);
    expect(service.isHeld()).toBe(false);
  });

  it('detaches its visibility listener on cleanup', async () => {
    const { request } = installWakeLock();
    const service = newService();
    await service.initialize();
    await service.hold();
    service.cleanup();

    setHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(request).toHaveBeenCalledTimes(1);
  });
});
