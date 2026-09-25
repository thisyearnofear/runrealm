/**
 * @jest-environment jsdom
 */
import { EventBus } from '../../core/event-bus';
import {
  DEMO_GHOST_ID,
  DEMO_GHOSTS_SEEN_KEY,
  DemoGhostDirector,
} from '../../services/demo-ghost-director';

describe('DemoGhostDirector', () => {
  let memory: Record<string, string>;
  let storage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  let animation: {
    setDemoGhostRoute: jest.Mock;
    clearDemoGhostRoute: jest.Mock;
    startGhostAnimation: jest.Mock;
    stopGhostAnimation: jest.Mock;
  };

  beforeEach(() => {
    DemoGhostDirector.resetInstance();
    EventBus.getInstance().clear();
    memory = {};
    storage = {
      getItem: (key) => memory[key] ?? null,
      setItem: (key, value) => {
        memory[key] = value;
      },
    };
    animation = {
      setDemoGhostRoute: jest.fn(),
      clearDemoGhostRoute: jest.fn(),
      startGhostAnimation: jest.fn(),
      stopGhostAnimation: jest.fn(),
    };
    document.body.innerHTML = '';
  });

  afterEach(() => {
    DemoGhostDirector.resetInstance();
    document.body.innerHTML = '';
  });

  it('skips when already seen and emits settled', () => {
    memory[DEMO_GHOSTS_SEEN_KEY] = 'true';
    const settled = jest.fn();
    EventBus.getInstance().on('demo:ghostsSettled', settled);

    const started = DemoGhostDirector.getInstance().maybeStart({
      center: { lat: 51.5, lng: -0.12 },
      animation: animation as never,
      storage,
    });

    expect(started).toBe(false);
    expect(animation.startGhostAnimation).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledWith({ reason: 'already-seen' });
  });

  it('starts trail + ghost animation and mounts CTA chip', () => {
    const started = DemoGhostDirector.getInstance().maybeStart({
      center: { lat: 51.5, lng: -0.12 },
      animation: animation as never,
      storage,
    });

    expect(started).toBe(true);
    expect(animation.setDemoGhostRoute).toHaveBeenCalled();
    expect(animation.startGhostAnimation).toHaveBeenCalledWith(
      expect.objectContaining({ id: DEMO_GHOST_ID, route: expect.any(Array) }),
      expect.objectContaining({ emitProgress: false, loop: true })
    );
    expect(document.getElementById('demo-ghost-chip')).toBeTruthy();
  });

  it('teardown marks seen and clears map artefacts', () => {
    const director = DemoGhostDirector.getInstance();
    director.maybeStart({
      center: { lat: 51.5, lng: -0.12 },
      animation: animation as never,
      storage,
    });

    const settled = jest.fn();
    EventBus.getInstance().on('demo:ghostsSettled', settled);
    director.stop({ markSeen: true, reason: 'dismissed' });

    expect(memory[DEMO_GHOSTS_SEEN_KEY]).toBe('true');
    expect(animation.stopGhostAnimation).toHaveBeenCalledWith(DEMO_GHOST_ID);
    expect(animation.clearDemoGhostRoute).toHaveBeenCalled();
    expect(document.getElementById('demo-ghost-chip')).toBeNull();
    expect(settled).toHaveBeenCalledWith({ reason: 'dismissed' });
  });
});
