/**
 * The next action line.
 *
 * The game knows what it wants from the runner; these tests pin that the game
 * says it out loud, in the shared voice, only when there is a real next move,
 * and that the button does the thing rather than merely existing.
 *
 * @jest-environment jsdom
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { VOICE_BANNED_TERMS, VOICE_MAX_LINE } from '@runrealm/shared-core/utils/atlas-voice';
import NextActionHint from '../next-action-hint';

const bus = EventBus.getInstance();

function chip(): HTMLElement {
  return document.querySelector('#next-action-hint') as HTMLElement;
}

function line(): string | null {
  return document.querySelector('#next-action-hint .nah-line')?.textContent ?? null;
}

function button(): HTMLButtonElement | null {
  return document.querySelector('#next-action-hint .nah-act');
}

describe('NextActionHint', () => {
  let component: NextActionHint;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    component = new NextActionHint();
    component.initialize(container);
  });

  afterEach(() => {
    component.hide();
    jest.useRealTimers();
  });

  it('stays out of the way until something actually needs doing', () => {
    expect(chip().classList.contains('hidden')).toBe(true);
    expect(line()).toBeNull();
  });

  it('names the move when location cannot be read, and offers a way to fix it', () => {
    bus.emit('location:error', {});

    expect(chip().classList.contains('hidden')).toBe(false);
    expect(line()).toMatch(/atlas|location/i);
    // A blocker gets a real button, never a dismiss-and-hope.
    expect(button()?.textContent).toBe('Do that');
    expect(button()?.classList.contains('nah-dismiss')).toBe(false);
  });

  it('clears itself once the map can see the runner again', () => {
    bus.emit('location:error', {});
    expect(chip().classList.contains('hidden')).toBe(false);

    bus.emit('location:changed', {
      lat: 51.5,
      lng: -0.12,
      accuracy: 10,
      source: 'gps',
      timestamp: 1,
    });
    expect(chip().classList.contains('hidden')).toBe(true);
  });

  it('stands down when the wallet comes back', () => {
    bus.emit('web3:walletDisconnected', {});
    expect(line()).toBeTruthy();

    bus.emit('web3:walletConnected', { address: '0xabc', chainId: 7001 });
    expect(chip().classList.contains('hidden')).toBe(true);
  });

  it('names a thinning claim and boosts it when tapped', () => {
    const onBoost = jest.fn();
    bus.on('territory:boostActivity', onBoost as never);

    bus.emit('territory:vulnerable', {
      territory: { id: 't-harbour', metadata: { name: 'Harbour Cell' } },
    });

    expect(line()).toContain('Harbour Cell');
    button()?.click();

    expect(onBoost).toHaveBeenCalledWith({ territoryId: 't-harbour' });
    expect(chip().classList.contains('hidden')).toBe(true);

    bus.off('territory:boostActivity', onBoost as never);
  });

  it('ignores a vulnerable event with no territory to act on', () => {
    bus.emit('territory:vulnerable', { territory: undefined });
    expect(chip().classList.contains('hidden')).toBe(true);
  });

  it('keeps a standing blocker rather than letting a nudge replace it', () => {
    bus.emit('location:error', {});
    const blocker = line();

    bus.emit('territory:vulnerable', {
      territory: { id: 't-canal', metadata: { name: 'Canal Bend' } },
    });

    expect(line()).toBe(blocker);
  });

  it('does not re-announce the same nudge twice', () => {
    const territory = { territory: { id: 't-canal', metadata: { name: 'Canal Bend' } } };
    bus.emit('territory:vulnerable', territory);
    const first = chip().innerHTML;
    bus.emit('territory:vulnerable', territory);

    expect(chip().innerHTML).toBe(first);
  });

  it('leaves on its own for a transient nudge but not for a blocker', () => {
    jest.useFakeTimers();
    bus.emit('territory:vulnerable', {
      territory: { id: 't-canal', metadata: { name: 'Canal Bend' } },
    });
    jest.advanceTimersByTime(30_000);
    expect(chip().classList.contains('hidden')).toBe(true);

    bus.emit('web3:walletDisconnected', {});
    jest.advanceTimersByTime(60_000);
    expect(chip().classList.contains('hidden')).toBe(false);
  });

  it('speaks in the shared voice — short, and never the banned register', () => {
    bus.emit('location:error', {});
    bus.emit('web3:walletDisconnected', {});
    bus.emit('territory:vulnerable', {
      territory: { id: 't-ridge', metadata: { name: 'Ridge Line' } },
    });

    const text = (line() ?? '').toLowerCase();
    expect(text.length).toBeGreaterThan(0);
    expect((line() ?? '').length).toBeLessThanOrEqual(VOICE_MAX_LINE);
    for (const term of VOICE_BANNED_TERMS) {
      expect(text).not.toContain(term);
    }
  });
});
