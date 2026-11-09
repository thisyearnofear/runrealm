import { EventBus } from '@runrealm/shared-core/core/event-bus';
import type { NeighbourhoodState } from '@runrealm/shared-core/types/neighbourhood';
import { gridDisk, latLngToCell } from 'h3-js';
import { announceReveal, REVEAL_EVENT } from '../../../lib/reveal';
import { NeighbourhoodExperience } from '../neighbourhood-experience';
import { NeighbourhoodMapRenderer } from '../neighbourhood-map-renderer';

jest.mock('maplibre-gl', () => ({
  Marker: class {
    addTo() {
      return this;
    }
    setLngLat() {
      return this;
    }
    remove() {}
  },
  LngLatBounds: class {
    extend() {
      return this;
    }
  },
}));

function baseState(over: Partial<NeighbourhoodState> = {}): NeighbourhoodState {
  return {
    anchorCell: null,
    cells: {},
    collectedCount: 0,
    strengthenedCount: 0,
    ringCellIds: [],
    qualifyingRuns: 0,
    goal: 'explore',
    lastSummary: null,
    referenceRun: null,
    persisted: true,
    readOnly: false,
    pages: [],
    viewAnchorCell: null,
    ...over,
  };
}

function makeDeps(over: Record<string, unknown> = {}) {
  const bus = EventBus.getInstance();
  const run = {
    current: null as null | {
      status: string;
      points: Array<{
        lat: number;
        lng: number;
        accuracy?: number;
        timestamp: number;
      }>;
      totalDistance: number;
    },
  };
  const runTracking = {
    getCurrentRun: jest.fn(() => run.current),
    getCurrentStats: jest.fn(() =>
      run.current
        ? {
            distance: run.current.totalDistance,
            duration: 60_000,
            averageSpeed: 2,
            maxSpeed: 3,
            status: run.current.status,
          }
        : null
    ),
    startRun: jest.fn(async () => 'run_test'),
    readCheckpoint: jest.fn(() => over.checkpoint ?? null),
    pauseRun: jest.fn(() => {
      if (run.current) run.current.status = 'paused';
    }),
    resumeRun: jest.fn(() => {
      if (run.current) run.current.status = 'recording';
    }),
    stopRun: jest.fn(() => null),
    __setRun: (r: typeof run.current) => {
      run.current = r;
    },
  };
  const neighbourhood = {
    getState: jest.fn(() => baseState(over.state as Partial<NeighbourhoodState>)),
    goalAvailability: jest.fn(
      () =>
        over.availability ?? {
          explore: { available: true },
          strengthen: { available: false },
          challenge: { available: false },
        }
    ),
    setGoal: jest.fn(() => true),
    getGoal: jest.fn(() => (over.goal as string) ?? 'explore'),
    viewPage: jest.fn((anchor: string | null) => {
      const state = (over.state ?? {}) as {
        pages?: Array<{ anchorCell: string | null }>;
      };
      if (!(state.pages ?? []).some((p) => p.anchorCell === anchor)) return false;
      const mutable = over.state as Record<string, unknown>;
      mutable.viewAnchorCell = anchor;
      mutable.anchorCell = anchor;
      bus.emit('neighbourhood:updated', {
        state: baseState(over.state as Partial<NeighbourhoodState>),
      } as never);
      return true;
    }),
    isPageComplete: jest.fn(() => false),
    activeRingCellIds: jest.fn((): string[] => []),
    previewLive: jest.fn(() => ({
      projectedNewCellIds: [],
      projectedRevisitedCellIds: [],
      outsideCellCount: 0,
      distanceRemainingM: 500,
      usablePointCount: 0,
    })),
  };
  const location = {
    getCurrentLocation: jest.fn(async () => null),
    getCurrentLocationInfo: jest.fn(() => null),
  };
  const ghostRunnerService = {
    getGhosts: jest.fn(() => over.ghosts ?? []),
  };
  return {
    bus,
    eventBus: bus,
    runTracking,
    neighbourhood,
    location,
    ghostRunnerService,
    map: (over.map as null) ?? null,
    recoveredRunCard: over.recoveredRunCard ?? null,
  };
}

/**
 * Force `isDesk()` true.
 *
 * The jsdom matchMedia stub answers `matches: false` to everything, so every
 * desktop branch in this component has been dead in tests — including the lean
 * first visit. jsdom's window is already 1024px wide, so only the pointer query
 * needs to pass. The reduced-motion query deliberately keeps returning false.
 */
function asDesktop(): void {
  window.matchMedia = jest.fn(
    (query: string) =>
      ({
        matches: query.includes('hover: hover'),
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  ) as never;
}

/** The panel text a first visit actually sees, with hidden subtrees dropped. */
function visiblePanelText(root: HTMLElement): string {
  const visible = root.querySelector('.nh-scroll')?.cloneNode(true) as HTMLElement;
  for (const hidden of Array.from(visible.querySelectorAll('[hidden]'))) hidden.remove();
  return visible.textContent ?? '';
}

function mount(over: Record<string, unknown> = {}) {
  document.body.innerHTML = '';
  document.body.classList.remove('neighbourhood-advanced');
  const deps = makeDeps(over);
  const shell = new NeighbourhoodExperience(deps as never);
  shell.initialize(document.body);
  return {
    shell,
    deps,
    root: document.getElementById('neighbourhood-shell') as HTMLElement,
  };
}

// The reveal flag lives on <html> and outlives any single test, so a test that
// reveals would otherwise make every later mount auto-arrive — and autoplay.
beforeEach(() => {
  document.documentElement.removeAttribute('data-rr-revealed');
});

describe('NeighbourhoodExperience', () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
  });

  it('renders the idle shell with goals, start, atlas and honest framing', () => {
    const { root } = mount({ state: { collectedCount: 2, qualifyingRuns: 1 } });
    expect(root.querySelector('.nh-headline')?.textContent).toBe('Your neighbourhood');
    expect(root.textContent).toContain('Move 500m');
    expect(root.textContent).toContain('Not NFTs');
    expect(root.querySelector('[data-action="start"]')).toBeTruthy();
    expect(root.querySelectorAll('.nh-goal')).toHaveLength(1);
    expect(root.querySelector('.nh-goal--locked')).toBeNull();
  });

  it('opens a first visit with one objective and scannable rule chips', () => {
    const { root } = mount();
    expect(root.querySelector('.nh-headline')?.textContent).toBe(
      'Your neighbourhood is uncharted.'
    );

    // Rules are tokens, not a paragraph to parse.
    const rules = Array.from(root.querySelectorAll('.nh-rule')).map((r) => r.textContent);
    expect(rules).toEqual(['500m+', 'GPS within 50m', 'No loop needed']);
    expect(root.querySelector('.nh-rules-label')?.textContent).toBe('To collect');
    expect(root.querySelector('.nh-anchor')?.textContent).toContain('asks for location');

    expect(root.querySelector('.nh-honest')?.textContent).toContain(
      'Previews and samples do not count'
    );

    expect(root.querySelectorAll('.nh-goal')).toHaveLength(0);
    expect(root.querySelector('.nh-objective')?.textContent).toContain('500m');
    expect(root.querySelector('.nh-boundary')?.textContent).toContain('19 blocks');
    expect(root.querySelector('.nh-storage')?.textContent).toContain('only in this browser');
    expect(root.querySelectorAll('.nh-ownership')).toHaveLength(1);
    expect(root.querySelector('.nh-ghostline')).toBeNull();

    const tools = root.querySelector<HTMLDetailsElement>('.nh-preview-tools');
    expect(tools).toBeTruthy();
    expect(tools?.open).toBe(false);
    expect(root.querySelector('.nh-objective')?.closest('details')).toBeNull();
    expect(root.querySelectorAll('.nh-more [data-action="tour"]')).toHaveLength(1);

    // The facts sit at rest: no rulebook to open and miss. Secondary
    // affordances may fold, but the facts never hide inside a disclosure.
    expect(root.querySelector('.nh-honest')?.textContent).toContain('Previews and samples');
  });

  it('keeps the first-visit panel inside a word budget', () => {
    const { root } = mount();
    const visible = visiblePanelText(root);
    const words = visible.trim().split(/\s+/).filter(Boolean);
    // Guards the consolidation: copy that crept back is copy nobody reads.
    // Raise deliberately, never accidentally.
    expect(words.length).toBeLessThanOrEqual(140);
    expect(root.textContent).not.toContain('qualifying run');
  });

  it('never says the same thing twice', () => {
    // The real defect this panel had was not length but repetition: one fact
    // maintained by hand in four places. A word budget would pass that happily,
    // so guard the duplication itself.
    //
    // Compared as word n-grams rather than sentences, because most of this
    // panel is un-terminated button labels: splitting on punctuation glues a
    // caveat onto the button text above it and two identical lines then look
    // different. Five words is long enough that legitimate echoes like
    // "Start run" (a button and a sentence) do not trip it.
    const words = visiblePanelText(mount().root)
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const gram = 5;
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (let i = 0; i + gram <= words.length; i += 1) {
      const phrase = words.slice(i, i + gram).join(' ');
      if (seen.has(phrase)) repeated.add(phrase);
      else seen.add(phrase);
    }
    expect([...repeated].slice(0, 3)).toEqual([]);
  });

  it('autoplays the sample once on a first visit, then offers a replay', () => {
    window.matchMedia = jest.fn(
      (query: string) =>
        ({
          matches: query === '(hover: hover) and (pointer: fine)',
          addEventListener: jest.fn(),
        }) as never
    ) as never;
    announceReveal();
    const map = fakeMap();
    const { root, deps, shell } = mount({ map });
    // The splash has lifted, so the sample has already played itself — proved
    // by its controls being offered, not by the status text (always present).
    expect(root.querySelector<HTMLElement>('.nh-sample-actions')?.hidden).toBe(false);
    expect(root.querySelector('[data-action="sample"]')?.textContent).toBe('Replay sample');
    // Showing the mechanic must never touch a real run or ask for location.
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
    expect(deps.location.getCurrentLocation).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-action="skip-sample"]')?.click();
    expect(root.querySelector<HTMLElement>('.nh-sample-actions')?.hidden).toBe(true);
    // Skipping stops it; it does not re-arm itself.
    expect(root.querySelector('[data-action="sample"]')?.textContent).toBe('Replay sample');
    shell.destroy();
  });

  it('does not autoplay the sample for a returning runner', () => {
    announceReveal();
    const map = fakeMap();
    const { root, shell } = mount({
      map,
      state: baseState({ collectedCount: 2 }),
    });
    expect(root.querySelector<HTMLElement>('.nh-sample-actions')?.hidden).toBe(true);
    expect(root.querySelector('[data-action="sample"]')?.textContent).toBe('Watch a sample outing');
    shell.destroy();
  });

  it('leaves one primary preview affordance and demotes the rest to links', () => {
    const { root } = mount();
    const primary = root.querySelector('.nh-explore-actions .nh-secondary--primary');
    expect(primary?.getAttribute('data-action')).toBe('show-streets');
    const links = Array.from(root.querySelectorAll('.nh-explore-links .nh-link'));
    expect(links.map((l) => l.getAttribute('data-action'))).toEqual([
      'sample',
      'pick-spot',
      'sketch',
    ]);
    // No duplicate replay control beside the sample button itself.
    expect(root.querySelector('[data-action="replay"]')).toBeNull();
  });

  it('offers the tour once on a first visit', () => {
    const { root } = mount();
    expect(root.querySelectorAll('[data-action="tour"]')).toHaveLength(1);
    const returning = mount({
      state: { collectedCount: 2, qualifyingRuns: 1 },
    }).root;
    expect(returning.querySelectorAll('[data-action="tour"]')).toHaveLength(1);
  });

  it('shows returning runners the available goals with the facts visible', () => {
    const { root } = mount({
      state: { collectedCount: 3, qualifyingRuns: 1 },
      availability: {
        explore: { available: true },
        strengthen: { available: true },
        challenge: { available: false },
      },
    });
    expect(root.querySelector('.nh-progress')?.textContent).toContain('1 outing');
    expect(root.querySelector('.nh-saved-status')?.textContent).toContain(
      '3 collected blocks saved on this device'
    );
    expect(root.querySelectorAll('.nh-goals:not(.nh-goals--later) .nh-goal')).toHaveLength(2);
    expect(root.querySelector('.nh-goals--later')).toBeNull();
    expect(root.querySelector('.nh-rules')).toBeNull();
    expect(root.querySelector('.nh-anchor')).toBeNull();
    expect(root.querySelector('.nh-facts .nh-legend')).toBeTruthy();
  });

  it('redraws from invitation to ledger once ground is collected', () => {
    const { deps, root } = mount();
    expect(root.querySelector('.nh-rules')).toBeTruthy();
    deps.bus.emit('neighbourhood:updated', {
      state: baseState({ collectedCount: 2, qualifyingRuns: 1 }),
    } as never);
    expect(root.querySelector('.nh-rules')).toBeNull();
    expect(root.querySelector('.nh-headline')?.textContent).toBe('Your neighbourhood');
  });

  it('tells a first visit that running somewhere new opens another page', () => {
    const { root } = mount();
    expect(root.querySelector('.nh-boundary')?.textContent).toContain('19 blocks');
    expect(root.querySelector('.nh-boundary')?.textContent).toContain('another page');
  });

  it('shows a page indicator only when the atlas holds more than one page', () => {
    const single = mount({ state: { collectedCount: 2, qualifyingRuns: 1 } }).root;
    expect(single.querySelector('.nh-page')).toBeNull();

    const { root } = mount({
      state: {
        collectedCount: 2,
        qualifyingRuns: 1,
        anchorCell: 'a1',
        viewAnchorCell: 'a1',
        pages: [
          { anchorCell: 'a1', collectedCount: 2, qualifyingRuns: 1 },
          { anchorCell: 'a2', collectedCount: 5, qualifyingRuns: 3 },
        ],
      },
    });
    expect(root.querySelector('.nh-page')?.textContent).toBe('Neighbourhood 1 of 2');
    expect(root.querySelector('[data-action="page-prev"]')).toBeTruthy();
    expect(root.querySelector('[data-action="page-next"]')).toBeTruthy();
  });

  it('cycles atlas pages with prev and next through viewPage', () => {
    const { deps, root } = mount({
      state: {
        collectedCount: 2,
        qualifyingRuns: 1,
        anchorCell: 'a1',
        viewAnchorCell: 'a1',
        pages: [
          { anchorCell: 'a1', collectedCount: 2, qualifyingRuns: 1 },
          { anchorCell: 'a2', collectedCount: 5, qualifyingRuns: 3 },
        ],
      },
    });
    root.querySelector<HTMLButtonElement>('[data-action="page-next"]')?.click();
    expect(deps.neighbourhood.viewPage).toHaveBeenCalledWith('a2');
    expect(root.querySelector('.nh-page')?.textContent).toBe('Neighbourhood 2 of 2');

    root.querySelector<HTMLButtonElement>('[data-action="page-next"]')?.click();
    expect(deps.neighbourhood.viewPage).toHaveBeenLastCalledWith('a1');
    expect(root.querySelector('.nh-page')?.textContent).toBe('Neighbourhood 1 of 2');

    root.querySelector<HTMLButtonElement>('[data-action="page-prev"]')?.click();
    expect(deps.neighbourhood.viewPage).toHaveBeenLastCalledWith('a2');
  });

  it('shows the page-complete hint when every block is collected', () => {
    const { root } = mount({
      state: {
        collectedCount: 19,
        qualifyingRuns: 3,
        anchorCell: 'a1',
        viewAnchorCell: 'a1',
        pages: [{ anchorCell: 'a1', collectedCount: 19, qualifyingRuns: 3 }],
      },
    });
    expect(root.querySelector('.nh-nextstep')?.textContent).toContain('opens another page');
  });

  it('keeps the primary start in a dock that survives scroll', () => {
    const { root } = mount();
    const dock = root.querySelector<HTMLElement>('.nh-dock');
    const start = root.querySelector<HTMLElement>('[data-action="start"]');
    const scroll = root.querySelector<HTMLElement>('.nh-scroll');
    expect(dock).toBeTruthy();
    expect(scroll).toBeTruthy();
    expect(dock?.contains(start as Node)).toBe(true);
    expect(scroll?.contains(start as Node)).toBe(false);
  });

  it('disables the start button while the tracker is starting', async () => {
    const { deps, root } = mount();
    let release: () => void = () => {};
    deps.runTracking.startRun.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          release = () => resolve('run_x');
        })
    );
    const btn = root.querySelector<HTMLButtonElement>('[data-action="start"]');
    btn?.click();
    btn?.click();
    await Promise.resolve();
    expect(deps.runTracking.startRun).toHaveBeenCalledTimes(1);
    expect(btn?.disabled).toBe(true);
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.runTracking.startRun).toHaveBeenCalledWith({
      neighbourhoodGoal: 'explore',
    });
  });

  it('shows retry guidance when the start is denied', async () => {
    const { deps, root } = mount();
    deps.runTracking.startRun.mockRejectedValue(new Error('Location access denied by user'));
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const err = root.querySelector('.nh-error') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain('browser settings');
    expect(err.querySelector('.nh-retry')).toBeTruthy();
  });

  it('shows retry guidance when locate resolves no fix', async () => {
    const { deps, root } = mount();
    deps.location.getCurrentLocation.mockResolvedValue(null as never);
    root.querySelector<HTMLButtonElement>('[data-action="locate"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    const err = root.querySelector('.nh-error') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain('browser settings');
  });

  it('locate retry retries the location request, never starts a run', async () => {
    const { deps, root } = mount();
    deps.location.getCurrentLocation.mockResolvedValue(null as never);
    root.querySelector<HTMLButtonElement>('[data-action="locate"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    const calls = deps.location.getCurrentLocation.mock.calls.length;
    root.querySelector<HTMLButtonElement>('.nh-retry')?.click();
    await Promise.resolve();
    expect(deps.location.getCurrentLocation.mock.calls.length).toBeGreaterThan(calls);
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
  });

  it('refocuses the pending recovery decision instead of starting a new run', async () => {
    const refocusPending = jest.fn(() => true);
    const { deps, root } = mount({
      checkpoint: { run: { id: 'run_crashed' } },
      recoveredRunCard: { refocusPending },
    });
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    await Promise.resolve();
    expect(refocusPending).toHaveBeenCalled();
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
  });

  it('never starts over a pending checkpoint, even if the card cannot refocus', async () => {
    const refocusPending = jest.fn(() => false);
    const { deps, root } = mount({
      checkpoint: { run: { id: 'run_crashed' } },
      recoveredRunCard: { refocusPending },
    });
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
    const err = root.querySelector('.nh-error') as HTMLElement;
    expect(err.hidden).toBe(false);
    expect(err.textContent).toContain('unfinished run is waiting');
  });

  it('blocks start without the card too, when a checkpoint is pending', async () => {
    const { deps, root } = mount({
      checkpoint: { run: { id: 'run_crashed' } },
    });
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
    expect(root.querySelector('.nh-error')?.textContent).toContain('unfinished run is waiting');
  });

  it('does not leak raw provider errors to the runner', async () => {
    const { deps, root } = mount();
    deps.runTracking.startRun.mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:99'));
    root.querySelector<HTMLButtonElement>('[data-action="start"]')?.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const err = root.querySelector('.nh-error') as HTMLElement;
    expect(err.textContent).not.toContain('ECONNREFUSED');
    expect(err.textContent).toContain('try again');
  });

  it('drives pause, resume and finish through the tracker API with focus following', () => {
    const { deps, root } = mount();
    deps.runTracking.__setRun({
      status: 'recording',
      points: [{ lat: 1, lng: 1, accuracy: 5, timestamp: Date.now() }],
      totalDistance: 300,
    });
    deps.bus.emit('run:started', { startPoint: {} } as never);

    const pauseBtn = root.querySelector<HTMLButtonElement>('[data-action="pause-resume"]');
    expect(pauseBtn?.textContent).toBe('Pause');
    expect(document.activeElement).toBe(pauseBtn);
    pauseBtn?.click();
    expect(deps.runTracking.pauseRun).toHaveBeenCalled();

    deps.bus.emit('run:paused', {
      runId: 'r',
      timestamp: 1,
      stats: {},
    } as never);
    const resumeBtn = root.querySelector<HTMLButtonElement>('[data-action="pause-resume"]');
    expect(resumeBtn?.textContent).toBe('Resume');
    expect(document.activeElement).toBe(resumeBtn);
    resumeBtn?.click();
    expect(deps.runTracking.resumeRun).toHaveBeenCalled();

    deps.bus.emit('run:resumed', {
      runId: 'r',
      timestamp: 2,
      stats: {},
    } as never);
    const pauseAgain = root.querySelector<HTMLButtonElement>('[data-action="pause-resume"]');
    expect(document.activeElement).toBe(pauseAgain);
    // Finish is two-tap: the first tap arms, the second ends the run.
    const finishBtn = root.querySelector<HTMLButtonElement>('[data-action="finish"]');
    finishBtn?.click();
    expect(deps.runTracking.stopRun).not.toHaveBeenCalled();
    finishBtn?.click();
    expect(deps.runTracking.stopRun).toHaveBeenCalled();
  });

  it('says paused instead of pretending to record', () => {
    const { deps, root } = mount();
    deps.runTracking.__setRun({
      status: 'paused',
      points: [{ lat: 1, lng: 1, accuracy: 5, timestamp: Date.now() }],
      totalDistance: 300,
    });
    deps.bus.emit('run:paused', {
      runId: 'r',
      timestamp: 1,
      stats: {},
    } as never);
    expect(root.querySelector('.nh-goalprogress')?.textContent).toBe('Paused');
  });

  it('shows unknown and stale GPS honestly instead of ±0', () => {
    const { deps, root } = mount();
    deps.runTracking.__setRun({
      status: 'recording',
      points: [{ lat: 1, lng: 1, timestamp: Date.now() }],
      totalDistance: 10,
    });
    deps.bus.emit('run:started', { startPoint: {} } as never);
    expect(root.querySelector('.nh-gps')?.textContent).toContain('unknown');

    deps.runTracking.__setRun({
      status: 'recording',
      points: [{ lat: 1, lng: 1, accuracy: 5, timestamp: Date.now() - 60_000 }],
      totalDistance: 10,
    });
    deps.bus.emit('run:statsUpdated', { stats: {}, runId: 'r' } as never);
    expect(root.querySelector('.nh-gps')?.textContent).toContain('Last fix');
  });

  it('explains weak GPS before an outing is finished', () => {
    const { deps, root } = mount();
    deps.runTracking.__setRun({
      status: 'recording',
      points: [{ lat: 1, lng: 1, accuracy: 75, timestamp: Date.now() }],
      totalDistance: 100,
    });
    deps.bus.emit('run:started', { startPoint: {} } as never);
    expect(root.querySelector('.nh-gps')?.textContent).toContain('Only fixes within 50m count');
    expect(root.querySelector('.nh-run-note')?.textContent).toContain('Complete at least 500m');
  });

  it('files an honest finish summary — collected cells, never a claim', () => {
    const { deps, root } = mount();
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: {
        runId: 'r1',
        goal: 'explore',
        distanceMeters: 800,
        durationMs: 300_000,
        newCellIds: ['a', 'b'],
        strengthenedCellIds: ['c'],
        outsideCellCount: 0,
        reason: 'collected',
        persisted: true,
      },
      state: baseState({
        collectedCount: 2,
        strengthenedCount: 1,
        qualifyingRuns: 1,
      }),
    } as never);

    const text = root.textContent ?? '';
    expect(root.querySelector('.nh-receipt-credit')?.textContent).toBe(
      '2 new blocks · 1 revisited'
    );
    expect(root.querySelector('.nh-receipt-save')?.textContent).toContain('saved on this device');
    expect(root.querySelector('.nh-ownership')?.textContent).toContain('Not NFTs');
    expect(text).toContain('800 m');
    expect(text).not.toContain('claimed');
    const title = root.querySelector<HTMLElement>('.nh-headline');
    expect(document.activeElement).toBe(title);
    const btn = root.querySelector<HTMLElement>('[data-action="continue"]');
    expect(btn).toBeTruthy();
    btn?.click();
    const start = root.querySelector<HTMLElement>('[data-action="start"]');
    expect(document.activeElement).toBe(start);
  });

  it('warns plainly when the run could not be saved', () => {
    const { deps, root } = mount();
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: {
        runId: 'r2',
        goal: 'explore',
        distanceMeters: 800,
        durationMs: 300_000,
        newCellIds: ['a'],
        strengthenedCellIds: [],
        outsideCellCount: 0,
        reason: 'collected',
        persisted: false,
      },
      state: baseState({ persisted: false }),
    } as never);
    expect(root.querySelector('.nh-receipt-save')?.textContent).toContain(
      'not saved on this device'
    );
    expect(root.querySelector('.nh-receipt-credit')?.textContent).toContain('1 new block');
  });

  it('formats challenge pace as m:ss/km, not distorted distance math', () => {
    const { deps, root } = mount();
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: {
        runId: 'c3',
        goal: 'challenge',
        distanceMeters: 1200,
        durationMs: 360_000,
        newCellIds: [],
        strengthenedCellIds: ['x'],
        outsideCellCount: 0,
        reason: 'collected',
        persisted: true,
        challenge: {
          targetDistanceMeters: 1000,
          referencePaceSecPerKm: 600,
          currentPaceSecPerKm: 300,
          targetReached: true,
        },
      },
      state: baseState({ qualifyingRuns: 3 }),
    } as never);
    const text = root.querySelector('.nh-challenge')?.textContent ?? '';
    expect(text).toContain('10:00/km');
    expect(text).toContain('5:00/km');
    expect(text).toContain('distance reached');
  });

  it('offers only available goals and unlocks them as outings qualify', () => {
    const { root } = mount({ state: { collectedCount: 2, qualifyingRuns: 1 } });
    const goals = [...root.querySelectorAll<HTMLButtonElement>('.nh-goal')].map(
      (b) => b.dataset.goal
    );
    expect(goals).toEqual(['explore']);

    const twoRuns = mount({
      state: { collectedCount: 4, qualifyingRuns: 2 },
      availability: {
        explore: { available: true },
        strengthen: { available: true },
        challenge: { available: true },
      },
    });
    const later = [...twoRuns.root.querySelectorAll<HTMLButtonElement>('.nh-goal')].map(
      (b) => b.dataset.goal
    );
    expect(later).toEqual(['explore', 'strengthen', 'challenge']);
  });

  it('names the first unlocked allrounder ghost', () => {
    const { deps, root } = mount({
      ghosts: [{ type: 'allrounder', name: 'Steady Mara' }],
      state: { collectedCount: 2, qualifyingRuns: 1 },
    });
    expect(root.querySelector('.nh-ghostline')?.textContent).toContain('Steady Mara');

    deps.ghostRunnerService.getGhosts.mockReturnValue([
      { type: 'allrounder', name: 'Steady Mara' },
    ] as never);
    deps.bus.emit('ghost:unlocked', { ghost: {}, reason: 'x' } as never);
    expect(root.querySelector('.nh-ghostline')?.textContent).toContain('Steady Mara');
  });

  it('shows the challenge reference block once available', () => {
    const { root } = mount({
      ghosts: [{ type: 'allrounder', name: 'Steady Mara' }],
      availability: {
        explore: { available: true },
        strengthen: { available: true },
        challenge: { available: true },
      },
      state: {
        collectedCount: 4,
        qualifyingRuns: 2,
        referenceRun: { id: 'r2', distanceMeters: 1500, durationMs: 900_000 },
      },
    });
    const ref = root.querySelector('.nh-reference')?.textContent ?? '';
    expect(ref).toContain('Steady Mara');
    expect(ref).toContain('1.5 km');
    expect(ref).toContain('10:00/km');
  });

  it('does not re-render the panel on stats ticks (focus is preserved)', () => {
    const { deps, root } = mount();
    deps.runTracking.__setRun({
      status: 'recording',
      points: [{ lat: 1, lng: 1, accuracy: 5, timestamp: Date.now() }],
      totalDistance: 100,
    });
    deps.bus.emit('run:started', { startPoint: {} } as never);
    const finishBtn = root.querySelector<HTMLElement>('[data-action="finish"]');
    finishBtn?.focus();
    deps.bus.emit('run:statsUpdated', { stats: {}, runId: 'r' } as never);
    deps.bus.emit('run:statsUpdated', { stats: {}, runId: 'r' } as never);
    expect(document.activeElement).toBe(finishBtn);
    expect(root.querySelector('[data-action="finish"]')).toBe(finishBtn);
  });

  it('surfaces map-unavailable copy when there is no map', () => {
    const { root } = mount({ map: null });
    expect(root.textContent).toContain('atlas list still works');
  });

  it('hides the panel behind a labelled return when advanced tools open', () => {
    const { root } = mount();
    root.querySelector<HTMLButtonElement>('[data-action="advanced"]')?.click();
    expect(document.body.classList.contains('neighbourhood-advanced')).toBe(true);
    expect((root.querySelector('.nh-panel') as HTMLElement).hidden).toBe(true);
    const back = root.querySelector<HTMLButtonElement>('[data-action="back"]');
    expect(back?.hidden).toBe(false);
    expect(back?.textContent).toContain('Back to your neighbourhood');
    back?.click();
    expect(document.body.classList.contains('neighbourhood-advanced')).toBe(false);
    expect((root.querySelector('.nh-panel') as HTMLElement).hidden).toBe(false);
  });

  it('explains what opened when advanced tools open — wallet and device caveats travel with the mode', () => {
    const { root } = mount();
    const note = root.querySelector<HTMLElement>('.nh-advanced');
    expect(note?.hidden).toBe(true);
    expect(note?.textContent).toContain('Optional territory play');

    root.querySelector<HTMLButtonElement>('[data-action="advanced"]')?.click();
    // The panel is gone, so the caption is the only thing left to read.
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toContain('wallet');
    expect(note?.textContent).toContain('personal atlas is separate');
    // The banned register never makes it into player-facing copy.
    expect(note?.textContent?.toLowerCase()).not.toContain('dashboard');

    root.querySelector<HTMLButtonElement>('[data-action="back"]')?.click();
    expect(note?.hidden).toBe(true);
  });

  it('returns focus to the launcher from advanced tools, via Back or Escape', () => {
    const { root } = mount();
    const toggle = root.querySelector<HTMLButtonElement>('[data-action="advanced"]') as HTMLElement;
    toggle.click();
    expect(document.body.classList.contains('neighbourhood-advanced')).toBe(true);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.classList.contains('neighbourhood-advanced')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(toggle);

    toggle.click();
    root.querySelector<HTMLButtonElement>('[data-action="back"]')?.click();
    expect(document.body.classList.contains('neighbourhood-advanced')).toBe(false);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(toggle);
  });

  it('applies a restored atlas as settled state, clearing any prior receipt', () => {
    const { deps, root } = mount({ state: { collectedCount: 2, qualifyingRuns: 1 } });
    const summary = {
      runId: 'r5',
      goal: 'explore' as const,
      distanceMeters: 800,
      durationMs: 300_000,
      newCellIds: [latLngToCell(37.7749, -122.4194, 9)],
      strengthenedCellIds: [],
      outsideCellCount: 0,
      reason: 'collected' as const,
      persisted: true,
    };
    deps.bus.emit('neighbourhood:runCompleted', {
      summary,
      state: baseState({ collectedCount: 3, qualifyingRuns: 2 }),
    } as never);
    expect(root.querySelector('.nh-panel--summary')).not.toBeNull();
    deps.bus.emit('neighbourhood:restored', {
      state: baseState({
        anchorCell: '8928342e20fffff',
        collectedCount: 2,
        qualifyingRuns: 1,
        ringCellIds: [],
        lastSummary: {
          runId: 'r9',
          goal: 'explore',
          distanceMeters: 700,
          durationMs: 280_000,
          newCellIds: [],
          strengthenedCellIds: [],
          outsideCellCount: 0,
          reason: 'collected',
          persisted: true,
        },
      }),
    } as never);
    expect(root.querySelector('.nh-panel--summary')).toBeNull();
    expect(root.querySelector('.nh-headline')?.textContent).toBe('Your neighbourhood');
    expect(root.querySelector('.nh-progress')?.textContent).toContain('1 outing');
  });

  describe('atlas depth offer', () => {
    const OFFER_KEY = 'runrealm-modality-offer-v1';
    const returning = { collectedCount: 2, qualifyingRuns: 1 };

    const finishRun = (
      deps: ReturnType<typeof makeDeps>,
      state = baseState({ collectedCount: 3, qualifyingRuns: 2 })
    ) =>
      deps.bus.emit('neighbourhood:runCompleted', {
        summary: {
          runId: 'offer-run',
          goal: 'explore',
          distanceMeters: 800,
          durationMs: 300_000,
          newCellIds: ['z'],
          strengthenedCellIds: [],
          outsideCellCount: 0,
          reason: 'collected',
          persisted: true,
        },
        state,
      } as never);

    beforeEach(() => {
      window.localStorage.removeItem(OFFER_KEY);
    });

    it('offers one inline chip beside My atlas to a returning runner', () => {
      const { root } = mount({ state: returning });
      const chip = root.querySelector<HTMLElement>('[data-action="atlas-3d"]');
      expect(chip).toBeTruthy();
      expect(chip?.closest('.nh-footer')).toBeTruthy();
      expect(root.querySelector('.nh-footer [data-action="atlas"]')).toBeTruthy();
      expect(chip?.getAttribute('href')).toBe('/atlas-vr/');
      expect(chip?.textContent).toContain('Walk your atlas');
      expect(root.querySelectorAll('.nh-atlas-offer')).toHaveLength(1);
      expect(
        root.querySelector('[data-action="dismiss-atlas-3d"]')?.getAttribute('aria-label')
      ).toBe("Don't show again");
    });

    it('never offers it on a first visit', () => {
      const { root } = mount();
      expect(root.querySelector('[data-action="atlas-3d"]')).toBeNull();
      expect(root.querySelector('.nh-atlas-offer')).toBeNull();
      expect(window.localStorage.getItem(OFFER_KEY)).toBeNull();
    });

    it('shows for at most two sessions, then stays quiet', () => {
      const first = mount({ state: returning });
      expect(first.root.querySelector('[data-action="atlas-3d"]')).toBeTruthy();
      const second = mount({ state: returning });
      expect(second.root.querySelector('[data-action="atlas-3d"]')).toBeTruthy();
      const third = mount({ state: returning });
      expect(third.root.querySelector('[data-action="atlas-3d"]')).toBeNull();
      expect(third.root.querySelector('.nh-atlas-offer')).toBeNull();
    });

    it('counts a view when the chip is clicked and retires the offer', () => {
      const first = mount({ state: returning });
      first.root.querySelector<HTMLElement>('[data-action="atlas-3d"]')?.click();
      const stored = JSON.parse(window.localStorage.getItem(OFFER_KEY) ?? '{}') as {
        atlas3d?: { views: number; dismissed: boolean };
      };
      expect(stored.atlas3d?.views).toBe(2);
      expect(stored.atlas3d?.dismissed).toBe(false);
      const second = mount({ state: returning });
      expect(second.root.querySelector('[data-action="atlas-3d"]')).toBeNull();
    });

    it('persists dismissal and suppresses the receipt link too', () => {
      const first = mount({ state: returning });
      first.root.querySelector<HTMLElement>('[data-action="dismiss-atlas-3d"]')?.click();
      expect(first.root.querySelector('.nh-atlas-offer')).toBeNull();
      const stored = JSON.parse(window.localStorage.getItem(OFFER_KEY) ?? '{}') as {
        atlas3d?: { dismissed: boolean };
      };
      expect(stored.atlas3d?.dismissed).toBe(true);

      const { deps, root } = mount({ state: returning });
      expect(root.querySelector('[data-action="atlas-3d"]')).toBeNull();
      finishRun(deps);
      expect(root.querySelector('.nh-atlas-link')).toBeNull();
      expect(root.querySelector('[data-action="continue"]')).toBeTruthy();
    });

    it('keeps the receipt link while the offer is still open, then drops it once exhausted', () => {
      const first = mount({ state: returning });
      finishRun(first.deps);
      const link = first.root.querySelector<HTMLElement>('.nh-atlas-link a');
      expect(link?.getAttribute('href')).toBe('/atlas-vr/');
      expect(link?.textContent).toContain('Walk your atlas');
      expect(first.root.querySelector('[data-action="continue"]')).toBeTruthy();

      window.localStorage.setItem(
        OFFER_KEY,
        JSON.stringify({ atlas3d: { views: 2, lastShownAt: 1, dismissed: false } })
      );
      const second = mount({ state: returning });
      finishRun(second.deps);
      expect(second.root.querySelector('.nh-atlas-link')).toBeNull();
    });

    it('chooses the headset hint only when WebXR is present', () => {
      Object.defineProperty(window.navigator, 'xr', {
        value: { isSessionSupported: () => Promise.resolve(true) },
        configurable: true,
      });
      try {
        const { root } = mount({ state: returning });
        expect(root.querySelector('.nh-atlas-offer-hint')?.textContent).toBe(
          'in your browser or a headset'
        );
      } finally {
        Object.defineProperty(window.navigator, 'xr', { value: undefined, configurable: true });
      }
      const plain = mount({ state: returning });
      expect(plain.root.querySelector('.nh-atlas-offer-hint')?.textContent).toBe('in your browser');
    });
  });
});

function cellValue(map: ReturnType<typeof fakeMap>, cellId: string) {
  const call = map.setFeatureState.mock.calls.findLast((c) => c[0].id === cellId);
  return (call?.[1] ?? {}) as {
    develop: number;
    press: number;
    exposure: number;
    select: number;
  };
}

/** True when no cell is off its settled value — i.e. nothing is animating. */
function rendererIsIdle(map: ReturnType<typeof fakeMap>): boolean {
  const settled = { develop: 1, press: 0, exposure: 0, select: 0, reach: 0 };
  return map.setFeatureState.mock.calls.every(
    (c) => JSON.stringify(c[1]) === JSON.stringify(settled)
  );
}

function fakeMap() {
  const source = { setData: jest.fn() };
  const listeners = new Map<string, Array<(arg?: unknown) => void>>();
  let hasSource = false;
  const layers = new Set<string>();
  return {
    isStyleLoaded: jest.fn(() => true),
    setPadding: jest.fn(),
    easeTo: jest.fn(),
    fitBounds: jest.fn(),
    getZoom: jest.fn(() => 12),
    getBearing: jest.fn(() => 0),
    resize: jest.fn(),
    getCenter: jest.fn(() => ({ lat: 37.7749, lng: -122.4194 })),
    setFeatureState: jest.fn(),
    getFeatureState: jest.fn(() => ({})),
    getCanvas: jest.fn(() => null),
    getSource: jest.fn(() => (hasSource ? source : undefined)),
    addSource: jest.fn(() => {
      hasSource = true;
    }),
    addLayer: jest.fn((layer: { id: string }) => {
      layers.add(layer.id);
    }),
    getLayer: jest.fn((id: string) => (layers.has(id) ? {} : undefined)),
    removeLayer: jest.fn((id: string) => {
      layers.delete(id);
    }),
    removeSource: jest.fn(() => {
      hasSource = false;
    }),
    on: jest.fn((evt: string, layerOrCb: string | (() => void), maybeCb?: () => void) => {
      const key = typeof layerOrCb === 'string' ? `${evt}/${layerOrCb}` : evt;
      const cb = typeof layerOrCb === 'string' ? maybeCb : layerOrCb;
      if (!cb) return;
      listeners.set(key, [...(listeners.get(key) ?? []), cb]);
    }),
    once: jest.fn((evt: string, layerOrCb: string | (() => void), maybeCb?: () => void) => {
      const key = typeof layerOrCb === 'string' ? `${evt}/${layerOrCb}` : evt;
      const cb = typeof layerOrCb === 'string' ? maybeCb : layerOrCb;
      if (!cb) return;
      listeners.set(key, [...(listeners.get(key) ?? []), cb]);
    }),
    off: jest.fn((evt: string, layerOrCb: string | (() => void), maybeCb?: () => void) => {
      const key = typeof layerOrCb === 'string' ? `${evt}/${layerOrCb}` : evt;
      const cb = typeof layerOrCb === 'string' ? maybeCb : layerOrCb;
      listeners.set(
        key,
        (listeners.get(key) ?? []).filter((l) => l !== cb)
      );
    }),
    fire: (evt: string, arg?: unknown) => {
      for (const l of listeners.get(evt) ?? []) l(arg);
    },
    dropSource: () => {
      hasSource = false;
      layers.clear();
    },
    source,
    listeners,
  };
}

describe('NeighbourhoodExperience desktop exploration', () => {
  let savedMatchMedia: typeof window.matchMedia;

  beforeAll(() => {
    savedMatchMedia = window.matchMedia;
  });

  // matchMedia is global; leaving desk mode on would silently strip the goal
  // selector out of every later suite's render.
  afterAll(() => {
    window.matchMedia = savedMatchMedia;
  });

  beforeEach(() => {
    localStorage.clear();
    EventBus.getInstance().clear();
    asDesktop();
  });

  it('shows a desk first visit with the essentials and folded preview tools', () => {
    const map = fakeMap();
    const { root, shell } = mount({ map });
    // Everything here describes an action a desk cannot take, yet it is the
    // handoff explainer — facts stay, preview machinery folds.
    expect(root.querySelector('.nh-rules')).toBeTruthy();
    expect(root.querySelector('.nh-anchor')).toBeTruthy();
    expect(root.querySelector('.nh-objective')).toBeTruthy();
    expect(root.querySelectorAll('.nh-goal')).toHaveLength(0);
    expect(root.querySelector('.nh-ownership')).toBeTruthy();
    expect(root.querySelector('.nh-preview-tools')).toBeTruthy();

    expect(root.querySelector('.nh-headline')?.textContent).toBe(
      'Your neighbourhood is uncharted.'
    );
    expect(root.querySelector('.nh-secondary--primary')?.textContent).toBe('Show my streets');
    expect(root.querySelector('[data-action="handoff"]')).toBeTruthy();
    expect(root.querySelector('.nh-honest')?.textContent).toContain(
      'Previews and samples do not count'
    );
    shell.destroy();
  });

  it('lets a visitor pick a preview without filing an outing or setting the atlas anchor', () => {
    const map = fakeMap();
    const { root, deps, shell } = mount({ map });
    root.querySelector<HTMLButtonElement>('[data-action="pick-spot"]')?.click();
    expect(root.querySelector('[data-action="pick-spot"]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );
    map.fire('click', { lngLat: { lat: 37.7749, lng: -122.4194 } });
    expect(root.querySelector('.nh-preview-status')?.textContent).toContain('Previewing');
    expect(map.source.setData.mock.calls.at(-1)?.[0].features).toHaveLength(19);
    expect(deps.neighbourhood.setGoal).not.toHaveBeenCalled();
    expect(deps.neighbourhood.getState().anchorCell).toBeNull();
    expect(deps.neighbourhood.getState().qualifyingRuns).toBe(0);
    expect(root.querySelector('[data-action="start"]')).toBeTruthy();
    shell.destroy();
  });

  it('supports keyboard route points without a GPS request', () => {
    const map = fakeMap();
    const { root, deps, shell } = mount({ map });
    root.querySelector<HTMLButtonElement>('[data-action="sketch"]')?.click();
    root.querySelector<HTMLButtonElement>('[data-action="add-centre"]')?.click();
    expect(root.querySelector('.nh-sketch-status')?.textContent).toContain('planned');
    expect(deps.location.getCurrentLocation).not.toHaveBeenCalled();
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
    shell.destroy();
  });

  it('starts a sample from the map centre with no location request or run start', () => {
    const map = fakeMap();
    const { root, deps, shell } = mount({ map });
    root.querySelector<HTMLButtonElement>('[data-action="sample"]')?.click();
    expect(root.querySelector('.nh-sample-status')?.textContent).toContain('Sample');
    expect(deps.location.getCurrentLocation).not.toHaveBeenCalled();
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>('[data-action="skip-sample"]')?.click();
    expect(root.querySelector<HTMLElement>('.nh-sample-status')?.hidden).toBe(true);
    shell.destroy();
  });

  it('opens the optional tour, keeps the run untouched, and restores focus on Escape', () => {
    const map = fakeMap();
    const { root, deps, shell } = mount({ map });
    const trigger = root.querySelector<HTMLButtonElement>(
      '.nh-more [data-action="tour"]'
    ) as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    expect(document.querySelector('.nh-tour-count')?.textContent).toBe('1 of 8');
    (document.querySelector('[data-tour-action="next"]') as HTMLButtonElement).click();
    expect(document.querySelector('.nh-tour-count')?.textContent).toBe('2 of 8');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(deps.runTracking.startRun).not.toHaveBeenCalled();
    expect(document.querySelector('.nh-tour')).toBeNull();
    expect(document.activeElement).toBe(
      root.querySelector('[data-action="tour"]') ?? root.querySelector('[data-action="start"]')
    );
    shell.destroy();
  });
});

describe('NeighbourhoodExperience regressions', () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
  });

  it('marks exactly the selected goal aria-pressed', () => {
    const { root } = mount({
      goal: 'strengthen',
      state: baseState({ goal: 'strengthen', collectedCount: 2, qualifyingRuns: 1 }),
      availability: {
        explore: { available: true },
        strengthen: { available: true },
        challenge: { available: true },
      },
    });
    const pressed = [...root.querySelectorAll<HTMLButtonElement>('.nh-goal')].filter(
      (b) => b.getAttribute('aria-pressed') === 'true'
    );
    expect(pressed).toHaveLength(1);
    expect(pressed[0].dataset.goal).toBe('strengthen');
  });

  it('renders a hostile ghost name as text, not markup', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const { root } = mount({
      state: baseState({
        goal: 'challenge',
        collectedCount: 2,
        qualifyingRuns: 2,
        referenceRun: { id: 'r1', distanceMeters: 800, durationMs: 300_000 },
      }),
      availability: {
        explore: { available: true },
        strengthen: { available: true },
        challenge: { available: true },
      },
      ghosts: [{ type: 'allrounder', name: payload }],
    });
    expect(root.querySelector('.nh-reference img')).toBeNull();
    expect(root.querySelector('.nh-reference')?.textContent).toContain(payload);
  });

  it('does not report stale GPS while fresh fixes keep arriving', () => {
    const { deps, root } = mount();
    deps.runTracking.__setRun({
      status: 'recording',
      points: [{ lat: 1, lng: 2, timestamp: 1 }],
      totalDistance: 10,
    });
    deps.bus.emit('run:started', { startPoint: {} } as never);
    deps.bus.emit('location:changed', {
      lat: 1,
      lng: 2,
      accuracy: 10,
      source: 'test',
      timestamp: Date.now(),
    });
    deps.bus.emit('run:statsUpdated', { stats: {}, runId: 'r' } as never);
    const gps = root.querySelector('.nh-gps');
    expect(gps?.textContent).toContain('10');
    expect(gps?.textContent).not.toMatch(/stale/i);
  });

  it('offers ground review on the summary and never re-files the outing', () => {
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    const { deps, root, shell } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    deps.neighbourhood.getState.mockReturnValue(
      baseState({
        collectedCount: 1,
        cells: { [ids[0]]: { visits: 1, lastVisitedAt: 0 } },
      })
    );
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: {
        runId: 'r9',
        goal: 'explore',
        distanceMeters: 800,
        durationMs: 300_000,
        newCellIds: [ids[0]],
        strengthenedCellIds: [],
        outsideCellCount: 0,
        reason: 'collected',
        persisted: true,
      },
      state: baseState({ collectedCount: 1 }),
    } as never);
    expect(root.querySelector('[data-action="see-ground"]')).toBeTruthy();
    const filed = jest.fn();
    deps.bus.on('neighbourhood:runCompleted', filed);

    root.querySelector<HTMLButtonElement>('[data-action="see-ground"]')?.click();
    // The map was already visible, so the reveal runs immediately and the shell
    // returns to idle. Reviewing is not filing: the outcome is not re-emitted,
    // so nothing downstream can award or generate a second time.
    expect(filed).not.toHaveBeenCalled();
    expect(root.querySelector('[data-action="start"]')).toBeTruthy();
    shell.destroy();
  });

  it('defers the reveal while the realm covers the map, then plays it on the map view', () => {
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    document.body.classList.add('living-realm-view');
    const { deps, root, shell } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: {
        runId: 'r10',
        goal: 'explore',
        distanceMeters: 800,
        durationMs: 300_000,
        newCellIds: [ids[1]],
        strengthenedCellIds: [],
        outsideCellCount: 0,
        reason: 'collected',
        persisted: true,
      },
      state: baseState({ collectedCount: 1 }),
    } as never);
    // The map is hidden, so every cell is showing its settled ledger state and
    // nothing is animating in the dark.
    expect(cellValue(map, ids[1]).develop).toBe(1);
    expect(rendererIsIdle(map)).toBe(true);

    root.querySelector<HTMLButtonElement>('[data-action="see-ground"]')?.click();
    expect(cellValue(map, ids[1]).develop).toBe(1);

    document.body.classList.remove('living-realm-view');
    deps.bus.emit('ui:realmViewChanged', { view: 'map' });
    // The collected cell now starts its amber exposure, then resolves.
    expect(cellValue(map, ids[1]).develop).toBeLessThan(1);
    shell.destroy();
  });

  it('does not offer ground review without a map', () => {
    const { deps, root } = mount();
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: {
        runId: 'r11',
        goal: 'explore',
        distanceMeters: 800,
        durationMs: 300_000,
        newCellIds: ['a'],
        strengthenedCellIds: [],
        outsideCellCount: 0,
        reason: 'collected',
        persisted: true,
      },
      state: baseState({ collectedCount: 1 }),
    } as never);
    expect(root.querySelector('[data-action="see-ground"]')).toBeNull();
  });

  it('names the inspected block, its status and its visits', () => {
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    const { deps, root, shell } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    deps.neighbourhood.getState.mockReturnValue(
      baseState({
        ringCellIds: ids,
        cells: { [ids[2]]: { visits: 2, lastVisitedAt: 0 } },
      })
    );
    deps.bus.emit('neighbourhood:updated', {
      state: deps.neighbourhood.getState(),
    } as never);
    const clickListeners = map.listeners.get('click/neighbourhood-cells-fill') ?? [];
    expect(clickListeners.length).toBeGreaterThan(0);
    clickListeners[0]({ features: [{ id: ids[2] }] });
    const detail = root.querySelector<HTMLElement>('.nh-celldetail');
    expect(detail?.hidden).toBe(false);
    expect(detail?.textContent).toContain('Block 03');
    expect(detail?.textContent).toContain('Deepened');
    expect(detail?.textContent).toContain('2 visits');
    detail?.querySelector<HTMLButtonElement>('[data-action="clear-cell"]')?.click();
    expect(root.querySelector<HTMLElement>('.nh-celldetail')?.hidden).toBe(true);
    shell.destroy();
  });

  it('shows the provisional ring on the map during the first run', () => {
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    const { deps } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    deps.runTracking.__setRun({
      status: 'recording',
      points: [],
      totalDistance: 0,
    });
    deps.bus.emit('run:started', { startPoint: {} } as never);
    expect(map.source.setData).toHaveBeenCalled();
    const data = map.source.setData.mock.calls
      .map((call) => call[0])
      .find((value) => value.features?.length === 19);
    expect(data?.features).toHaveLength(19);
    expect(
      data.features.every(
        (f: { properties: { status: string } }) => f.properties.status === 'unvisited'
      )
    ).toBe(true);
  });

  it('re-adds the source after a style swap and detaches a pending load on destroy', () => {
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    const { deps } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    map.fire('styledata');
    expect(map.addSource).toHaveBeenCalledTimes(1);

    map.dropSource();
    map.fire('styledata');
    expect(map.addSource).toHaveBeenCalledTimes(2);
    expect(map.addLayer.mock.calls.length).toBeGreaterThanOrEqual(4);

    const pending = fakeMap();
    pending.isStyleLoaded.mockReturnValue(false);
    const second = new NeighbourhoodExperience(makeDeps({ map: pending }) as never);
    second.initialize(document.body);
    expect(pending.once).toHaveBeenCalledWith('load', expect.any(Function));
    second.destroy();
    expect(pending.off).toHaveBeenCalledWith('load', expect.any(Function));
    pending.fire('load');
  });
});

function collectedSummary(runId: string, newCellIds: string[]) {
  return {
    runId,
    goal: 'explore',
    distanceMeters: 800,
    durationMs: 300_000,
    newCellIds,
    strengthenedCellIds: [],
    outsideCellCount: 0,
    reason: 'collected',
    persisted: true,
  };
}

describe('NeighbourhoodExperience arrival and first reward', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    EventBus.getInstance().clear();
    delete document.documentElement.dataset.rrRevealed;
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    delete document.documentElement.dataset.rrRevealed;
    jest.restoreAllMocks();
  });

  it('waits for the splash to lift, then makes its entrance exactly once', () => {
    const { root, shell } = mount();
    expect(root.classList.contains('nh-shell--arriving')).toBe(false);
    announceReveal();
    expect(root.classList.contains('nh-shell--arriving')).toBe(true);

    root.dispatchEvent(new Event('animationend'));
    expect(root.classList.contains('nh-shell--arriving')).toBe(false);
    window.dispatchEvent(new Event(REVEAL_EVENT));
    expect(root.classList.contains('nh-shell--arriving')).toBe(false);
    shell.destroy();
  });

  it('arrives immediately when it mounts after the splash already lifted', () => {
    announceReveal();
    const { root, shell } = mount();
    expect(root.classList.contains('nh-shell--arriving')).toBe(true);
    shell.destroy();
  });

  it('skips the entrance motion under reduced motion', () => {
    window.matchMedia = jest.fn(() => ({ matches: true }) as MediaQueryList);
    const { root, shell } = mount();
    announceReveal();
    expect(root.classList.contains('nh-shell--arriving')).toBe(false);
    shell.destroy();
  });

  it('ripples the drawn neighbourhood on arrival, but never mid-run', () => {
    const ripple = jest.spyOn(NeighbourhoodMapRenderer.prototype, 'playArrival');
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    const { deps, shell } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    deps.bus.emit('neighbourhood:updated', {
      state: deps.neighbourhood.getState(),
    } as never);
    announceReveal();
    expect(ripple).toHaveBeenCalledTimes(1);
    expect(ripple.mock.results[0].value).toBe(true);
    shell.destroy();

    ripple.mockClear();
    delete document.documentElement.dataset.rrRevealed;
    const running = mount({ map: fakeMap() });
    running.deps.runTracking.__setRun({
      status: 'recording',
      points: [],
      totalDistance: 0,
    });
    running.deps.bus.emit('run:started', { startPoint: {} } as never);
    announceReveal();
    expect(ripple).not.toHaveBeenCalled();
    running.shell.destroy();
  });

  it('stops listening for the reveal once destroyed', () => {
    const { root, shell } = mount();
    shell.destroy();
    announceReveal();
    expect(root.classList.contains('nh-shell--arriving')).toBe(false);
  });

  it('leads the summary with the map once ground changed, and marks the first ground', () => {
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    const { deps, root, shell } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: collectedSummary('r20', [ids[0]]),
      state: baseState({ collectedCount: 1, qualifyingRuns: 1 }),
    } as never);
    const primary = root.querySelector('.nh-dock .nh-start') as HTMLElement;
    expect(primary.dataset.action).toBe('see-ground');
    expect(root.querySelector('[data-action="continue"]')?.className).toBe('nh-secondary');
    expect(root.querySelector('.nh-summary-celebrate')?.textContent).toBe(
      'Your first ground is on the map.'
    );
    shell.destroy();
  });

  it('keeps an outing that collected nothing calm, with Continue first', () => {
    const map = fakeMap();
    const { deps, root, shell } = mount({ map });
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: {
        ...collectedSummary('r21', []),
        distanceMeters: 200,
        reason: 'short',
      },
      state: baseState(),
    } as never);
    const primary = root.querySelector('.nh-dock .nh-start') as HTMLElement;
    expect(primary.dataset.action).toBe('continue');
    expect(root.querySelector('.nh-summary-celebrate')).toBeNull();
    expect(root.textContent).toContain('too short');
    expect(root.querySelector('.nh-receipt-credit')?.textContent).toBe(
      'No blocks credited this outing.'
    );
    expect(root.querySelector('.nh-receipt-save')?.textContent).toContain('saved on this device');
    shell.destroy();
  });

  it('does not repeat the first-ground line on later outings', () => {
    const map = fakeMap();
    const ids = gridDisk(latLngToCell(37.7749, -122.4194, 9), 2);
    const { deps, root, shell } = mount({ map });
    deps.neighbourhood.activeRingCellIds.mockReturnValue(ids);
    deps.bus.emit('neighbourhood:runCompleted', {
      summary: collectedSummary('r22', [ids[3]]),
      state: baseState({ collectedCount: 4, qualifyingRuns: 3 }),
    } as never);
    expect(root.querySelector('.nh-summary-celebrate')).toBeNull();
    expect((root.querySelector('.nh-dock .nh-start') as HTMLElement).dataset.action).toBe(
      'see-ground'
    );
    shell.destroy();
  });
});

describe('sample badge', () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
  });

  it('does not autoplay on a phone-sized first visit', () => {
    const { root, shell } = mount();
    expect(document.querySelector<HTMLElement>('.nh-sample-badge')?.hidden ?? true).toBe(true);
    expect(root.querySelector('[data-action="sample"]')?.textContent).toBe('Watch a sample outing');
    shell.destroy();
  });

  it('shows while a sample plays, stays after it finishes, dismisses on close', () => {
    window.matchMedia = jest.fn(
      (query: string) =>
        ({
          matches: query === '(hover: hover) and (pointer: fine)',
          addEventListener: jest.fn(),
        }) as never
    ) as never;
    announceReveal();
    const map = fakeMap();
    const { shell } = mount({ map });
    const badge = document.querySelector<HTMLElement>('.nh-sample-badge');
    expect(badge).toBeTruthy();
    expect(badge?.hidden).toBe(false);
    expect(badge?.textContent).toContain('Sample — not your atlas');
    (badge?.querySelector('button') as HTMLButtonElement).click();
    expect(badge?.hidden).toBe(true);
    shell.destroy();
    expect(document.querySelector('.nh-sample-badge')).toBeNull();
  });

  it('hides when a real run starts', () => {
    window.matchMedia = jest.fn(
      (query: string) =>
        ({
          matches: query === '(hover: hover) and (pointer: fine)',
          addEventListener: jest.fn(),
        }) as never
    ) as never;
    announceReveal();
    const map = fakeMap();
    const { deps, shell } = mount({ map });
    const badge = document.querySelector<HTMLElement>('.nh-sample-badge');
    expect(badge?.hidden).toBe(false);
    deps.bus.emit('run:started', { runId: 'r1' } as never);
    expect(badge?.hidden).toBe(true);
    shell.destroy();
  });
});
