import '@testing-library/jest-dom';
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { OrbisDirector } from '@runrealm/shared-core/services/orbis-director';
import { WorldStateService } from '@runrealm/shared-core/services/world-state-service';
import type { NeighbourhoodState } from '@runrealm/shared-core/types/neighbourhood';
import { LIVING_REALM_SESSION_LIMIT_MS } from '@runrealm/shared-core/utils/neighbourhood-orbis';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, Fragment, type ReactNode } from 'react';
import { type LivingRealmDeps, LivingRealmRoot } from '../LivingRealmRoot';

interface StateMessage {
  type: 'state';
  started: boolean;
  paused: boolean;
  running: boolean;
}

interface MockReactor {
  status: string;
  connect: jest.Mock;
  disconnect: jest.Mock;
  pause: jest.Mock;
  resume: jest.Mock;
  start: jest.Mock;
  reset: jest.Mock;
  setPrompt: jest.Mock;
  setAudioPrompt: jest.Mock;
  setAudioEnabled: jest.Mock;
}

let mockReactor: MockReactor;
let stateHandler: ((m: StateMessage) => void) | undefined;
let chunkHandler: ((m: { frames_emitted: number }) => void) | undefined;
let generationStartedHandler: (() => void) | undefined;
let generationCompleteHandler: (() => void) | undefined;

jest.mock('@reactor-models/visko-orbis-dynamic', () => ({
  ViskoOrbisDynamicProvider: ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children),
  ViskoOrbisDynamicMainVideoView: () => null,
  useViskoOrbisDynamic: () => mockReactor,
  useViskoOrbisDynamicState: (cb: (m: StateMessage) => void) => {
    stateHandler = cb;
  },
  useViskoOrbisDynamicChunkComplete: (cb: (m: { frames_emitted: number }) => void) => {
    chunkHandler = cb;
  },
  useViskoOrbisDynamicCommandError: () => undefined,
  useViskoOrbisDynamicGenerationStarted: (cb: () => void) => {
    generationStartedHandler = cb;
  },
  useViskoOrbisDynamicGenerationComplete: (cb: () => void) => {
    generationCompleteHandler = cb;
  },
}));

const emitState = (started = false, paused = false) =>
  act(() => {
    stateHandler?.({ type: 'state', started, paused, running: started && !paused });
  });

const nhState = (overrides: Partial<NeighbourhoodState> = {}): NeighbourhoodState => ({
  anchorCell: null,
  cells: {},
  collectedCount: 3,
  strengthenedCount: 1,
  ringCellIds: [],
  qualifyingRuns: 0,
  goal: 'explore',
  lastSummary: null,
  referenceRun: null,
  persisted: true,
  readOnly: false,
  ...overrides,
});

let bus: EventBus;
let worldState: WorldStateService;
let director: OrbisDirector;
let runTracking: { getCurrentRun: jest.Mock; pauseRun: jest.Mock };
let neighbourhood: { getState: jest.Mock; setGoal: jest.Mock; getGoal: jest.Mock };
let map: { resize: jest.Mock };

const deps = (): LivingRealmDeps => ({
  eventBus: bus,
  worldState,
  orbisDirector: director,
  neighbourhood: neighbourhood as never,
  runTracking: runTracking as never,
  map,
  restoreDirectorEnabled: false,
});

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 10)));

/** The map is the arrival; the realm (and its connect CTA) is one tab away. */
const openRealm = () => fireEvent.click(screen.getByRole('button', { name: 'Realm' }));

beforeEach(async () => {
  bus = EventBus.getInstance();
  bus.clear();
  worldState = new WorldStateService();
  await worldState.initialize();
  director = new OrbisDirector({ enabled: false, minDispatchIntervalMs: 0 });
  await director.initialize();
  director.setEnabled(true);
  runTracking = {
    getCurrentRun: jest.fn(() => null),
    pauseRun: jest.fn(),
  };
  neighbourhood = {
    getState: jest.fn(() => nhState()),
    setGoal: jest.fn(() => true),
    getGoal: jest.fn(() => 'explore'),
  };
  map = { resize: jest.fn() };
  stateHandler = undefined;
  chunkHandler = undefined;
  generationStartedHandler = undefined;
  generationCompleteHandler = undefined;
  mockReactor = {
    status: 'disconnected',
    connect: jest.fn(async () => {
      mockReactor.status = 'ready';
    }),
    disconnect: jest.fn(async () => {
      mockReactor.status = 'disconnected';
    }),
    pause: jest.fn(async () => ({ type: 'generation_paused' })),
    resume: jest.fn(async () => ({ type: 'generation_resumed' })),
    start: jest.fn(async () => undefined),
    reset: jest.fn(async () => ({ type: 'generation_reset' })),
    setPrompt: jest.fn(async () => ({ type: 'prompt_accepted' })),
    setAudioPrompt: jest.fn(async () => ({ type: 'audio_prompt_accepted' })),
    setAudioEnabled: jest.fn(async () => ({ type: 'audio_enabled_accepted' })),
  };
});

afterEach(() => {
  document.body.classList.remove('living-realm-view', 'pocket-mode');
  director.cleanup();
  worldState.cleanup();
  bus.clear();
  jest.useRealTimers();
});

describe('LivingRealmRoot', () => {
  it('arrives on the map, keeping live-generation status out of the first impression', () => {
    render(<LivingRealmRoot {...deps()} />);
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('Live generation is not connected')).not.toBeInTheDocument();
    expect(screen.queryByText(/Reactor credits/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bring realm to life' })).not.toBeInTheDocument();
  });

  it('boots disconnected without contacting the broker or model', () => {
    render(<LivingRealmRoot {...deps()} />);
    openRealm();
    expect(document.body.classList.contains('living-realm-view')).toBe(true);
    expect(mockReactor.connect).not.toHaveBeenCalled();
    expect(screen.getAllByText('Live generation is not connected').length).toBeGreaterThan(0);
    expect(screen.getByText('Local atlas preview — not generated video')).toBeInTheDocument();
    expect(screen.getByText(/3 cells collected · 1 revisited/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bring realm to life' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Realm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('connects once, sends the initial scene prompt before starting', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    const connect = screen.getByRole('button', { name: 'Bring realm to life' });
    await act(async () => {
      fireEvent.click(connect);
      fireEvent.click(connect);
    });
    expect(mockReactor.connect).toHaveBeenCalledTimes(1);

    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();

    expect(mockReactor.setPrompt).toHaveBeenCalledTimes(1);
    expect(mockReactor.setPrompt.mock.calls[0][0].prompt).toContain(
      'living cyanotype-inspired athletic atlas'
    );

    emitState(false, false);
    await flush();
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    expect(mockReactor.start).toHaveBeenCalled();
  });

  it('disables model audio before starting and never exposes an audio transport', async () => {
    const setTransportSpy = jest.spyOn(director, 'setTransport');
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();

    expect(mockReactor.setAudioEnabled).toHaveBeenCalledWith({ audio_enabled: false });
    expect(mockReactor.setAudioEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      mockReactor.setPrompt.mock.invocationCallOrder[0]
    );
    const attached = setTransportSpy.mock.calls.map((call) => call[0]).find(Boolean);
    expect(attached).toBeDefined();
    expect(attached && (attached as { setAudioPrompt?: unknown }).setAudioPrompt).toBeUndefined();
  });

  it('disconnects a session whose connect resolves after the cap', async () => {
    jest.useFakeTimers();
    let resolveConnect: (() => void) | undefined;
    mockReactor.connect = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
    );
    render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await jest.advanceTimersByTimeAsync(LIVING_REALM_SESSION_LIMIT_MS + 10);
    expect(mockReactor.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect?.();
      mockReactor.status = 'ready';
      await Promise.resolve();
    });
    await jest.advanceTimersByTimeAsync(1);
    expect(mockReactor.disconnect).toHaveBeenCalledTimes(2);
  });

  it('pauses generation started while the realm is hidden', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    emitState(true, false);

    act(() => {
      document.body.classList.add('pocket-mode');
    });
    await flush();
    expect(mockReactor.pause).toHaveBeenCalledTimes(1);

    act(() => {
      generationStartedHandler?.();
    });
    await flush();
    expect(mockReactor.pause).toHaveBeenCalledTimes(1);
  });

  it('clears stale frames so a reconnect cannot claim Live from an old session', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    emitState(true, false);
    const stage = document.querySelector('.living-realm-stage') as HTMLElement;
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 2 });
    stage.appendChild(video);
    await act(async () => {
      video.dispatchEvent(new Event('loadeddata'));
      chunkHandler?.({ frames_emitted: 20 });
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    expect(screen.getByText('Live')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    });
    await flush();
    await act(async () => {
      stateHandler?.({ type: 'state', started: true, paused: false, running: true });
      chunkHandler?.({ frames_emitted: 20 });
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('keeps Disconnect reachable in map view', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    act(() => bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } }));
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
  });

  it('holds the first prompt until audio configuration settles', async () => {
    let releaseAudio: (() => void) | undefined;
    mockReactor.setAudioEnabled = jest.fn(
      () =>
        new Promise((resolve) => {
          releaseAudio = () => resolve({ type: 'audio_enabled_accepted' });
        })
    );
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();

    expect(mockReactor.status).toBe('ready');
    expect(mockReactor.setPrompt).not.toHaveBeenCalled();
    expect(mockReactor.start).not.toHaveBeenCalled();

    await act(async () => {
      releaseAudio?.();
      await Promise.resolve();
    });
    await flush();
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    expect(mockReactor.setPrompt).toHaveBeenCalledTimes(1);
  });

  it('flags a stalled stream only on real frame silence, not state heartbeats', async () => {
    jest.useFakeTimers();
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await jest.advanceTimersByTimeAsync(50);
    act(() => {
      stateHandler?.({ type: 'state', started: true, paused: false, running: true });
    });
    for (let i = 0; i < 7; i += 1) {
      await jest.advanceTimersByTimeAsync(2000);
      act(() => {
        stateHandler?.({ type: 'state', started: true, paused: false, running: true });
        chunkHandler?.({ frames_emitted: 0 });
      });
    }
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    expect(screen.getByText(/stream went quiet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume stream' })).toBeInTheDocument();
  });

  it('does not autostart a new generation after generation_complete', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    emitState(true, false);
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    const starts = mockReactor.start.mock.calls.length;

    act(() => {
      generationCompleteHandler?.();
    });
    emitState(true, false);
    await flush();
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    expect(mockReactor.start.mock.calls.length).toBe(starts);
  });

  it('re-measures the free area when the neighbourhood panel is replaced', async () => {
    const shell = document.createElement('div');
    shell.id = 'neighbourhood-shell';
    const panel = document.createElement('div');
    panel.className = 'nh-panel';
    panel.getBoundingClientRect = () => ({ top: 500, right: 336 }) as DOMRect;
    shell.appendChild(panel);
    document.body.appendChild(shell);
    try {
      const view = render(
        <LivingRealmRoot {...deps()} getPanel={() => shell.querySelector('.nh-panel')} />
      );
      await flush();
      const root = document.querySelector('.living-realm') as HTMLElement;
      const leftBefore = root.style.getPropertyValue('--realm-left');
      expect(leftBefore).toBe('360px');

      const nextPanel = document.createElement('div');
      nextPanel.className = 'nh-panel';
      nextPanel.getBoundingClientRect = () => ({ top: 500, right: 500 }) as DOMRect;
      await act(async () => {
        shell.replaceChild(nextPanel, panel);
      });
      await act(async () =>
        view.rerender(
          <LivingRealmRoot {...deps()} getPanel={() => shell.querySelector('.nh-panel')} />
        )
      );
      await flush();
      expect(root.style.getPropertyValue('--realm-left')).toBe('524px');
    } finally {
      shell.remove();
    }
  });

  it('never claims Live without a real frame and video readiness', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    emitState(true, false);
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('marks Live only when video is ready and frames have emitted', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    emitState(true, false);
    const stage = document.querySelector('.living-realm-stage') as HTMLElement;
    const video = document.createElement('video');
    Object.defineProperty(video, 'readyState', { value: 2 });
    stage.appendChild(video);
    await act(async () => {
      video.dispatchEvent(new Event('loadeddata'));
    });
    await act(async () => {
      chunkHandler?.({ frames_emitted: 12 });
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('switches to map on run start and stays there through pause, resume and finish', async () => {
    render(<LivingRealmRoot {...deps()} />);
    openRealm();
    expect(document.body.classList.contains('living-realm-view')).toBe(true);
    act(() => bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } }));
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
    expect(map.resize).toHaveBeenCalled();
    act(() => bus.emit('run:paused', { runId: 'r', timestamp: 1, stats: {} }));
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
    act(() => bus.emit('run:resumed', { runId: 'r', timestamp: 2, stats: {} }));
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
    act(() => bus.emit('run:completed', {} as never));
    // The finished outing's reveal plays on the map, so the map stays.
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
    expect(screen.getByRole('button', { name: 'Map' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps the map when a run is cancelled', async () => {
    render(<LivingRealmRoot {...deps()} />);
    act(() => bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } }));
    act(() => bus.emit('run:cancelled', {} as never));
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
  });

  it('pauses generation and detaches the transport when hidden', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    emitState(true, false);

    act(() => {
      document.body.classList.add('pocket-mode');
    });
    await flush();
    expect(mockReactor.pause).toHaveBeenCalled();
  });

  it('disconnects at the hard session cap, including connect wait', async () => {
    jest.useFakeTimers();
    mockReactor.connect = jest.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, LIVING_REALM_SESSION_LIMIT_MS + 500))
    );
    render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await jest.advanceTimersByTimeAsync(LIVING_REALM_SESSION_LIMIT_MS + 10);
    expect(mockReactor.disconnect).toHaveBeenCalled();
  });

  it('shows an honest failure when connect rejects', async () => {
    mockReactor.connect = jest.fn(async () => {
      throw new Error('provider denied placement JWT abc123');
    });
    render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await flush();
    expect(
      screen.getByText('Live generation could not connect. The map and your ledger still work.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/abc123/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('treats an undefined prompt reply as failure, not success', async () => {
    mockReactor.setPrompt = jest.fn(async () => undefined);
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await flush();
    expect(
      screen.getByText('The realm did not accept the scene. The map and your ledger still work.')
    ).toBeInTheDocument();
    expect(mockReactor.start).not.toHaveBeenCalled();
    expect(screen.queryByText('Live')).not.toBeInTheDocument();
  });

  it('pauses the run when the Realm tab is used during recording', async () => {
    runTracking.getCurrentRun.mockReturnValue({ status: 'recording' });
    render(<LivingRealmRoot {...deps()} />);
    act(() => bus.emit('run:started', { startPoint: { lat: 0, lng: 0 } }));
    const tab = screen.getByRole('button', { name: 'Pause & view realm' });
    fireEvent.click(tab);
    expect(runTracking.pauseRun).toHaveBeenCalled();
  });

  it('unmount detaches its own session and restores the director flag', async () => {
    const view = render(<LivingRealmRoot {...deps()} />);
    openRealm();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Bring realm to life' }));
    });
    await act(async () => view.rerender(<LivingRealmRoot {...deps()} />));
    await act(async () => view.unmount());
    await flush();
    expect(mockReactor.disconnect).toHaveBeenCalled();
    expect(director.isEnabled()).toBe(false);
    expect(document.body.classList.contains('living-realm-view')).toBe(false);
  });
});
