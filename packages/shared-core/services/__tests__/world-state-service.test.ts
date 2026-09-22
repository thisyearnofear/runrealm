import { EventBus } from '../../core/event-bus';
import type { WorldStateChange } from '../../types/world-state';
import { WorldStateService } from '../world-state-service';

describe('WorldStateService', () => {
  let bus: EventBus;
  let service: WorldStateService;
  let changes: WorldStateChange[];

  beforeEach(async () => {
    bus = EventBus.getInstance();
    bus.clear();
    service = new WorldStateService();
    changes = [];
    bus.on('world:stateChanged', (change) => changes.push(change));
    await service.initialize();
  });

  afterEach(() => {
    service.cleanup();
    bus.clear();
  });

  it('starts from a privacy-preserving idle snapshot', () => {
    const snapshot = service.getSnapshot();
    expect(snapshot.runStatus).toBe('idle');
    expect(snapshot.currentCell).toBeNull();
    expect(snapshot).not.toHaveProperty('lat');
    expect(snapshot).not.toHaveProperty('lng');
  });

  it('translates run start and a new H3 cell into exposure state', () => {
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    bus.emit('location:changed', {
      lat: 0,
      lng: 0,
      accuracy: 5,
      source: 'gps',
      timestamp: Date.now(),
    });

    const last = changes[changes.length - 1];
    expect(last?.reason).toBe('cell-exposed');
    expect(last?.snapshot.runStatus).toBe('recording');
    expect(last?.snapshot.currentCell).toMatch(/^[0-9a-f]+$/);
    expect(last?.snapshot.enteredNewCell).toBe(true);
  });

  it('does not emit a new-cell transition for GPS fixes in the same cell', () => {
    bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } });
    const location = {
      lat: 0,
      lng: 0,
      accuracy: 5,
      source: 'gps',
      timestamp: Date.now(),
    };
    bus.emit('location:changed', location);
    const count = changes.length;
    bus.emit('location:changed', { ...location, timestamp: Date.now() + 1000 });
    expect(changes.length).toBe(count);
  });

  it('translates vulnerability into semantic overexposure', () => {
    bus.emit('territory:vulnerable', { territory: { status: 'claimed' } });
    const last = changes[changes.length - 1];
    expect(last?.reason).toBe('territory-overexposed');
    expect(last?.snapshot.territoryStatus).toBe('vulnerable');
    expect(last?.snapshot.threatLevel).toBeGreaterThan(0.5);
  });

  it('tracks ghost presence without leaking location details', () => {
    bus.emit('ghost:deployed', { ghost: {} as never, territoryId: 't1' });
    expect(service.getSnapshot().ghostPresence).toBe('defending');
    expect(service.getSnapshot()).not.toHaveProperty('lat');
  });
});
