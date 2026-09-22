import { EventBus } from '../../core/event-bus';
import type { OrbisPromptIntent, WorldStateChange } from '../../types/world-state';
import { emitOrbisDemoStep, ORBIS_DEMO_STEPS } from '../../utils/orbis-demo';
import { OrbisDirector } from '../orbis-director';
import { WorldStateService } from '../world-state-service';

describe('Orbis demo event adapter', () => {
  let bus: EventBus;
  let world: WorldStateService;
  let director: OrbisDirector;
  let worldChanges: WorldStateChange[];
  let dispatched: OrbisPromptIntent[];
  let now: number;

  beforeEach(async () => {
    jest.useFakeTimers();
    bus = EventBus.getInstance();
    bus.clear();
    worldChanges = [];
    dispatched = [];
    now = 1_000;

    world = new WorldStateService();
    director = new OrbisDirector({
      enabled: true,
      minDispatchIntervalMs: 500,
      now: () => now,
    });

    bus.on('world:stateChanged', (change) => worldChanges.push(change));
    bus.on('orbis:promptDispatched', ({ intent }) => dispatched.push(intent));

    await world.initialize();
    await director.initialize();
    director.setTransport({ setPrompt: jest.fn().mockResolvedValue(undefined) });
  });

  afterEach(() => {
    director.cleanup();
    world.cleanup();
    bus.clear();
    jest.useRealTimers();
  });

  it('defines the wallet-free challenge loop in order', () => {
    expect(ORBIS_DEMO_STEPS.map((step) => step.id)).toEqual([
      'run-started',
      'cell-exposed',
      'ghost-deployed',
      'ghost-racing',
      'territory-overexposed',
      'territory-developed',
      'run-completed',
    ]);
  });

  it('translates the full loop into rate-limited Sunprint prompt intents', async () => {
    for (const step of ORBIS_DEMO_STEPS) {
      emitOrbisDemoStep(step.id, bus);
      now += 500;
      await jest.advanceTimersByTimeAsync(500);
    }

    expect(dispatched.map((intent) => intent.reason)).toEqual([
      'run-started',
      'cell-exposed',
      'ghost-deployed',
      'ghost-racing',
      'territory-overexposed',
      'territory-developed',
      'run-completed',
    ]);

    const finalChange = worldChanges[worldChanges.length - 1];
    expect(finalChange.reason).toBe('run-completed');
    expect(finalChange.snapshot.runStatus).toBe('completed');
    expect(finalChange.snapshot.territoryStatus).toBe('developed');
    expect(finalChange.snapshot.ghostPresence).toBe('none');
  });

  it('keeps generated prompts free of raw GPS coordinates', async () => {
    emitOrbisDemoStep('run-started', bus);
    now += 500;
    await jest.advanceTimersByTimeAsync(500);
    emitOrbisDemoStep('cell-exposed', bus);
    now += 500;
    await jest.advanceTimersByTimeAsync(500);

    expect(dispatched).toHaveLength(2);
    for (const intent of dispatched) {
      expect(intent.prompt).not.toMatch(/-1\.2921|36\.8219/);
      expect(intent.prompt).toContain('living cyanotype-inspired athletic atlas');
    }
  });
});
