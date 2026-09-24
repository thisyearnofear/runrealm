/**
 * First-run experience tests for the Orbis Live client (Pass A arc).
 *
 * Covers:
 *  - Fresh visitor gets the intro card instead of the conductor console
 *  - "Skip to the console" reveals the panel and persists the flag
 *  - Returning visitors bypass the intro entirely
 *  - Auto-played guided sequence settles → console reveal + persisted flag
 *  - 12s stalled-stream chip appears after silence; Reconnect resets
 *
 * The Reactor SDK and the procedural stage canvas are mocked; the event bus,
 * WorldStateService, OrbisDirector, and the intro store all run for real.
 */

import '@testing-library/jest-dom';
import { TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createElement, Fragment, type ReactNode } from 'react';
import { INTRO_STORAGE_KEY } from '../../../lib/orbis-live';
import OrbisLiveClient from '../OrbisLiveClient';

jest.mock('@reactor-models/visko-orbis-dynamic', () => ({
  ViskoOrbisDynamicProvider: ({ children }: { children?: ReactNode }) =>
    createElement(Fragment, null, children),
  ViskoOrbisDynamicMainVideoView: () => null,
  useViskoOrbisDynamic: () => mockReactor,
  useViskoOrbisDynamicState: () => undefined,
  useViskoOrbisDynamicCommandError: () => undefined,
  useViskoOrbisDynamicGenerationStarted: () => undefined,
  useViskoOrbisDynamicChunkComplete: (callback: (message: ChunkComplete) => void) => {
    mockChunkCompleteCallback = callback;
  },
}));

jest.mock('../OrbisStageCanvas', () => ({
  OrbisStageCanvas: () => null,
}));

interface ChunkComplete {
  frames_emitted: number;
}

interface MockReactor {
  status: string;
  connect: jest.Mock;
  reset: jest.Mock;
  start: jest.Mock;
  setPrompt: jest.Mock;
}

// Referenced lazily inside the SDK mock factory (never at module-eval time).
let mockReactor: MockReactor;
let mockChunkCompleteCallback: ((message: ChunkComplete) => void) | undefined;

function makeMockReactor(status: string): MockReactor {
  const reactor: MockReactor = {
    status,
    connect: jest.fn(async () => {
      reactor.status = 'ready';
    }),
    reset: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    setPrompt: jest.fn().mockResolvedValue(undefined),
  };
  return reactor;
}

const INTRO_REGION = { name: 'First-run introduction' } as const;
const CONSOLE_REGION = { name: 'Orbis challenge controls' } as const;

beforeEach(() => {
  window.localStorage.clear();
  mockReactor = makeMockReactor('disconnected');
  mockChunkCompleteCallback = undefined;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('first-run intro gate', () => {
  it('shows the intro card to a fresh visitor instead of the console', () => {
    render(<OrbisLiveClient />);
    expect(screen.getByRole('region', INTRO_REGION)).toBeInTheDocument();
    expect(screen.queryByRole('complementary', CONSOLE_REGION)).not.toBeInTheDocument();
  });

  it('reveals the console and persists the flag when Skip is clicked', () => {
    render(<OrbisLiveClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to the console' }));
    expect(screen.getByRole('complementary', CONSOLE_REGION)).toBeInTheDocument();
    expect(screen.queryByRole('region', INTRO_REGION)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_STORAGE_KEY)).toBe('1');
  });

  it('sends returning visitors straight to the console', () => {
    window.localStorage.setItem(INTRO_STORAGE_KEY, '1');
    render(<OrbisLiveClient />);
    expect(screen.getByRole('complementary', CONSOLE_REGION)).toBeInTheDocument();
    expect(screen.queryByRole('region', INTRO_REGION)).not.toBeInTheDocument();
  });

  it('auto-plays the guided sequence and reveals the console when it settles', async () => {
    jest.useFakeTimers();
    render(<OrbisLiveClient />);
    expect(screen.getByRole('region', INTRO_REGION)).toBeInTheDocument();

    // Autoplay kickoff (motion-safe): the intro starts the guided sequence
    // and the primary button reports its progress.
    await act(async () => {
      jest.advanceTimersByTime(1_400);
    });
    expect(screen.getByRole('button', { name: 'Sequence running…' })).toBeInTheDocument();

    // Seven steps at 2.8s each (19.6s) plus margin: the sequence settles,
    // the reveal effect fires, and the flag is persisted.
    await act(async () => {
      jest.advanceTimersByTime(19_700);
    });
    expect(screen.getByRole('complementary', CONSOLE_REGION)).toBeInTheDocument();
    expect(screen.queryByRole('region', INTRO_REGION)).not.toBeInTheDocument();
    expect(window.localStorage.getItem(INTRO_STORAGE_KEY)).toBe('1');
  });
});

describe('territory persistence', () => {
  it('persists the Fix step outcome and shows the settled-territory proof', async () => {
    // TerritoryService is a process-wide singleton whose map survives
    // localStorage.clear(); reset it so this test starts from an empty store
    // (e.g. the autoplay test above already persisted the same demo id).
    (TerritoryService as unknown as { instance?: unknown }).instance = undefined;
    // Returning visitor so the first-run autoplay cannot switch the mode.
    window.localStorage.setItem(INTRO_STORAGE_KEY, '1');
    mockReactor = makeMockReactor('ready');
    render(<OrbisLiveClient />);

    // Flush the async world + territory store initialization.
    await act(async () => {});

    // Step 1 opens the run (storyboard path emits synchronously), which
    // enables the gated Fix step.
    fireEvent.click(screen.getByRole('button', { name: 'Play storyboard' }));
    fireEvent.click(screen.getByRole('button', { name: /Fix territory/ }));

    expect(screen.getByText(/Settled in territory/)).toBeInTheDocument();
    // Territories persist in a versioned envelope ({ v, t, n, c, d });
    // unwrap it here so this test asserts the payload, not the envelope.
    const raw = JSON.parse(window.localStorage.getItem('runrealm_claimed_territories') ?? '[]') as
      | Array<{ id: string }>
      | { d: string };
    const stored = (Array.isArray(raw) ? raw : JSON.parse((raw as { d: string }).d)) as Array<{
      id: string;
    }>;
    expect(stored.some((territory) => territory.id === 'orbis-demo-territory')).toBe(true);
  });
});

describe('stalled-stream recovery', () => {
  it('surfaces the chip after 12s of silence and Reconnect resets the session', async () => {
    jest.useFakeTimers();
    // Returning visitor so the first-run autoplay cannot switch the mode.
    window.localStorage.setItem(INTRO_STORAGE_KEY, '1');
    mockReactor = makeMockReactor('ready');
    render(<OrbisLiveClient />);

    // A chunk arrives, then the stream goes quiet.
    act(() => {
      mockChunkCompleteCallback?.({ frames_emitted: 1 });
    });
    expect(screen.queryByText(/Stream stalled/)).not.toBeInTheDocument();

    // Three watchdog ticks (4s cadence) later the threshold is crossed.
    await act(async () => {
      jest.advanceTimersByTime(16_000);
    });
    expect(screen.getByText(/Stream stalled/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();

    // A ready session reconnects by resetting in place, which opens a fresh
    // activity window — the chip clears as soon as run-started lands.
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    await act(async () => {
      jest.advanceTimersByTime(0);
    });
    expect(mockReactor.reset).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Stream stalled/)).not.toBeInTheDocument();
  });
});
