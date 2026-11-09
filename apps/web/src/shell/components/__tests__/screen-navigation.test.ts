import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { AccountService } from '@runrealm/shared-core/services/account-service';
import { AttestationService } from '@runrealm/shared-core/services/attestation-service';
import { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import { NavigationService } from '@runrealm/shared-core/services/navigation-service';
import { NetworkLeaderboardService } from '@runrealm/shared-core/services/network-leaderboard-service';
import { PreferenceService } from '@runrealm/shared-core/services/preference-service';
import AccountScreen from '../account-screen';
import LeaderboardScreen from '../leaderboard-screen';
import LedgerScreen from '../ledger-screen';

jest.mock('@runrealm/shared-core/services/account-service', () => ({
  AccountService: { getInstance: jest.fn() },
  DEFAULT_GAME_SCOPES: ['claim', 'boost', 'deployGhost'],
}));
jest.mock('@runrealm/shared-core/services/preference-service', () => ({
  PreferenceService: jest.fn(),
}));
jest.mock('@runrealm/shared-core/services/attestation-service', () => ({
  AttestationService: { getInstance: jest.fn() },
  PACE_BAND_EDGES_SEC_PER_KM: [330, 360, 390, 420, 480, 540, 600],
}));
jest.mock('@runrealm/shared-core/services/ghost-runner-service', () => ({
  GhostRunnerService: { getInstance: jest.fn() },
}));
jest.mock('@runrealm/shared-core/services/network-leaderboard-service', () => ({
  NetworkLeaderboardService: { getInstance: jest.fn() },
}));

const EMPTY_NEIGHBOURHOOD = {
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
};

const ROUTED_SCREENS = [
  {
    route: 'ledger',
    id: 'ledger-screen',
    closeSelector: '[data-ledger-action="close"]',
  },
  {
    route: 'leaderboard',
    id: 'leaderboard-screen',
    closeSelector: '[data-leaderboard-action="close"]',
  },
] as const;

describe('routed screens', () => {
  let navigation: NavigationService;

  function mountScreens() {
    new AccountScreen().initialize(document.body);
    new LeaderboardScreen().initialize(document.body);
    new LedgerScreen({
      neighbourhood: { getState: () => EMPTY_NEIGHBOURHOOD },
      runTracking: { getRunSessions: () => [] },
    } as never).initialize(document.body);
  }

  function screen(id: string): HTMLElement {
    return document.getElementById(id) as HTMLElement;
  }

  function expectOnlyVisible(id: string): void {
    for (const other of ['ledger-screen', 'leaderboard-screen', 'account-screen']) {
      expect({ id: other, hidden: screen(other).classList.contains('hidden') }).toEqual({
        id: other,
        hidden: other !== id,
      });
    }
  }

  beforeEach(() => {
    EventBus.getInstance().clear();
    document.body.replaceChildren();

    (AttestationService.getInstance as jest.Mock).mockReturnValue({
      getAttestations: () => [],
    });
    (GhostRunnerService.getInstance as jest.Mock).mockReturnValue({
      getGhosts: () => [],
      getGhost: () => undefined,
    });
    (NetworkLeaderboardService.getInstance as jest.Mock).mockReturnValue({
      fetchEntries: () => Promise.resolve([]),
    });
    (AccountService.getInstance as jest.Mock).mockReturnValue({
      getAccount: () => ({ id: 'account-example-1234', tier: 'guest', createdAt: Date.now() }),
      getActiveSessionKeys: () => [],
    });
    (PreferenceService as jest.Mock).mockImplementation(() => ({
      getPublicTerritoryIds: () => [],
    }));

    navigation = NavigationService.getInstance();
    navigation.registerRoutes([
      { id: 'map', path: '/', title: 'Map' },
      { id: 'ledger', path: '/ledger', title: 'Ledger' },
      { id: 'leaderboard', path: '/leaderboard', title: 'Pace bands' },
    ]);
    navigation.navigateTo('map');
  });

  for (const { route, id, closeSelector } of ROUTED_SCREENS) {
    it(`${route}: opens on its route, closes on Escape or click, focus returns to the opener`, () => {
      mountScreens();
      const opener = document.createElement('button');
      document.body.appendChild(opener);
      opener.focus();

      navigation.navigateTo(route);
      const container = screen(id);
      expect(container.classList.contains('hidden')).toBe(false);
      expectOnlyVisible(id);
      expect(document.activeElement).toBe(container.querySelector(closeSelector));

      container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(container.classList.contains('hidden')).toBe(true);
      expect(navigation.isRouteActive('map')).toBe(true);
      expect(document.activeElement).toBe(opener);

      navigation.navigateTo(route);
      expect(container.classList.contains('hidden')).toBe(false);
      expect(document.activeElement).toBe(container.querySelector(closeSelector));
      (container.querySelector(closeSelector) as HTMLButtonElement).click();
      expect(container.classList.contains('hidden')).toBe(true);
      expect(navigation.isRouteActive('map')).toBe(true);
      expect(document.activeElement).toBe(opener);
    });
  }

  it('account opened over the ledger closes it, and a later route takes over cleanly', () => {
    mountScreens();
    navigation.navigateTo('ledger');
    expectOnlyVisible('ledger-screen');

    EventBus.getInstance().emit('account:showRequested', {} as never);
    expectOnlyVisible('account-screen');
    expect(navigation.isRouteActive('map')).toBe(true);

    navigation.navigateTo('leaderboard');
    expectOnlyVisible('leaderboard-screen');
  });

  it('switches ledger → leaderboard → ledger without going through the map', () => {
    mountScreens();
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    navigation.navigateTo('ledger');
    const ledgerClose = screen('ledger-screen').querySelector('[data-ledger-action="close"]');
    expect(document.activeElement).toBe(ledgerClose);

    navigation.navigateTo('leaderboard');
    expectOnlyVisible('leaderboard-screen');
    const boardClose = screen('leaderboard-screen').querySelector(
      '[data-leaderboard-action="close"]'
    );
    expect(document.activeElement).toBe(boardClose);

    navigation.navigateTo('ledger');
    expectOnlyVisible('ledger-screen');
    expect(document.activeElement).toBe(
      screen('ledger-screen').querySelector('[data-ledger-action="close"]')
    );
  });

  it('keeps focus inside the leaderboard when the network board re-renders it', async () => {
    mountScreens();
    navigation.navigateTo('leaderboard');
    await Promise.resolve();
    await Promise.resolve();
    const container = screen('leaderboard-screen');
    expect(container.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(
      container.querySelector('[data-leaderboard-action="close"]')
    );
  });
});

describe('screen overlay styling', () => {
  it('never uses the undefined --z-modal token', () => {
    const css = readFileSync(join(__dirname, '../../../styles/components.css'), 'utf8');
    expect(css).not.toMatch(/var\(--z-modal\)/);
  });
});
