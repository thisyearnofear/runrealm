/**
 * The return card.
 *
 * `offline:catchup` already carried everything needed to welcome someone back;
 * these tests pin that the card actually reads it, names the claims that got
 * thin, offers exactly one obvious action, and stays out of the way otherwise.
 *
 * @jest-environment jsdom
 */
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { NavigationService } from '@runrealm/shared-core/services/navigation-service';
import { type Territory, TerritoryService } from '@runrealm/shared-core/services/territory-service';
import WhileYouWereAway from '../while-you-were-away';

const DAY_MS = 24 * 60 * 60 * 1000;
const bus = EventBus.getInstance();

function claim(id: string, name: string): Territory {
  return {
    id,
    geohash: '32.780000_-79.930000',
    metadata: { name },
    defenseStatus: 'vulnerable',
  } as unknown as Territory;
}

function card(): HTMLElement {
  return document.querySelector('#while-you-were-away .wywa-card') as HTMLElement;
}

describe('WhileYouWereAway', () => {
  let component: WhileYouWereAway;
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    jest
      .spyOn(TerritoryService.getInstance(), 'getClaimedTerritories')
      .mockReturnValue([
        claim('t-harbour', 'Harbour Cell'),
        claim('t-canal', 'Canal Bend'),
        { ...claim('t-ridge', 'Ridge Line'), defenseStatus: 'strong' } as unknown as Territory,
      ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    component = new WhileYouWereAway();
    component.initialize(container);
  });

  afterEach(() => {
    component.hide();
    jest.restoreAllMocks();
  });

  it('starts hidden and waits for an absence', () => {
    expect(document.querySelector('#while-you-were-away')?.classList.contains('hidden')).toBe(true);
    expect(card()).toBeNull();
  });

  it('greets the return, names the claims that got thin, and counts what held', () => {
    bus.emit('offline:catchup', {
      absenceMs: 3 * DAY_MS,
      crossings: [
        { territoryId: 't-harbour', threshold: 300, atMs: 1 },
        { territoryId: 't-canal', threshold: 700, atMs: 2 },
      ],
      truncated: 0,
    });

    const html = card().innerHTML;
    expect(document.querySelector('#while-you-were-away')?.classList.contains('hidden')).toBe(
      false
    );
    expect(html).toContain('3 days');
    expect(html).toContain('Harbour Cell');
    expect(html).toContain('Canal Bend');
    // One of the three claims is still strong, and the card says so.
    expect(html).toMatch(/1 claim held firm/);
  });

  it('aims its one action at the most endangered claim', () => {
    bus.emit('offline:catchup', {
      absenceMs: 2 * DAY_MS,
      crossings: [
        { territoryId: 't-harbour', threshold: 700, atMs: 1 },
        { territoryId: 't-canal', threshold: 100, atMs: 2 },
      ],
      truncated: 0,
    });

    const primary = document.querySelector('[data-wywa-action="walk"]') as HTMLElement;
    expect(primary.dataset.territoryId).toBe('t-canal');
    expect(primary.textContent).toContain('Canal Bend');
  });

  it('counts a claim once even when it crossed two thresholds', () => {
    bus.emit('offline:catchup', {
      absenceMs: 4 * DAY_MS,
      crossings: [
        { territoryId: 't-harbour', threshold: 700, atMs: 1 },
        { territoryId: 't-harbour', threshold: 300, atMs: 2 },
      ],
      truncated: 0,
    });

    // One claim appeared twice in the crossing list; it must be counted — and
    // described — once. (Which of the summary lines gets drawn is the voice
    // module's business, so only the grammar is pinned here.)
    expect(card().querySelectorAll('.wywa-list li')).toHaveLength(1);
    expect(card().textContent).not.toMatch(/\b1 (claims|cells)\b/);
    expect(card().textContent).not.toMatch(/\b1 claim need\b/);
  });

  it('asks for a territory walk, then gets out of the way', () => {
    const walks: Array<{ territoryId: string }> = [];
    bus.on('territoryWalk:startRequested', (data) => walks.push(data));

    bus.emit('offline:catchup', {
      absenceMs: DAY_MS,
      crossings: [{ territoryId: 't-harbour', threshold: 300, atMs: 1 }],
      truncated: 0,
    });
    (document.querySelector('[data-wywa-action="walk"]') as HTMLElement).click();

    expect(walks).toEqual([{ territoryId: 't-harbour' }]);
    expect(document.querySelector('#while-you-were-away')?.classList.contains('hidden')).toBe(true);
  });

  it('falls back to the map when there is nothing to walk', () => {
    const navigate = jest
      .spyOn(NavigationService.getInstance(), 'navigateTo')
      .mockImplementation(() => undefined);

    bus.emit('offline:catchup', {
      absenceMs: 5 * DAY_MS,
      crossings: [],
      truncated: 0,
    });

    expect(document.querySelector('[data-wywa-action="walk"]')).toBeNull();
    (document.querySelector('[data-wywa-action="map"]') as HTMLElement).click();
    expect(navigate).toHaveBeenCalledWith('map');
  });

  it('says the realm held rather than inventing decay', () => {
    bus.emit('offline:catchup', { absenceMs: DAY_MS, crossings: [], truncated: 0 });
    expect(card().textContent).toMatch(/held|exactly as you left it/);
    expect(card().querySelector('.wywa-list')).toBeNull();
  });

  it('does not re-open for the same absence', () => {
    const payload = {
      absenceMs: DAY_MS,
      crossings: [{ territoryId: 't-harbour', threshold: 300, atMs: 1 }],
      truncated: 0,
    };
    bus.emit('offline:catchup', payload);
    component.hide();
    bus.emit('offline:catchup', payload);
    expect(document.querySelector('#while-you-were-away')?.classList.contains('hidden')).toBe(true);
  });

  it('dismisses on the close button', () => {
    bus.emit('offline:catchup', {
      absenceMs: DAY_MS,
      crossings: [{ territoryId: 't-harbour', threshold: 300, atMs: 1 }],
      truncated: 0,
    });
    (document.querySelector('[data-wywa-action="dismiss"]') as HTMLElement).click();
    expect(document.querySelector('#while-you-were-away')?.classList.contains('hidden')).toBe(true);
  });
});
