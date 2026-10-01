import { EventBus } from '@runrealm/shared-core/core/event-bus';
import { AccountService } from '@runrealm/shared-core/services/account-service';
import { PreferenceService } from '@runrealm/shared-core/services/preference-service';
import AccountScreen from '../account-screen';

jest.mock('@runrealm/shared-core/services/account-service', () => ({
  AccountService: { getInstance: jest.fn() },
  DEFAULT_GAME_SCOPES: ['claim', 'boost', 'deployGhost'],
}));
jest.mock('@runrealm/shared-core/services/preference-service', () => ({
  PreferenceService: jest.fn(),
}));

describe('AccountScreen device-local atlas copy', () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
    document.body.replaceChildren();
    (PreferenceService as jest.Mock).mockImplementation(() => ({
      getPublicTerritoryIds: () => [],
    }));
  });

  for (const [tier, expected] of [
    ['guest', 'A passkey does not restore it on another device.'],
    ['passkey', 'cannot be restored from the passkey.'],
    ['wallet', 'linking a wallet does not sync it.'],
  ] as const) {
    it(`does not promise atlas recovery for a ${tier} account`, () => {
      (AccountService.getInstance as jest.Mock).mockReturnValue({
        getAccount: () => ({
          id: 'account-example-1234',
          tier,
          createdAt: Date.now(),
          address: tier === 'wallet' ? '0x1234567890abcdef' : undefined,
        }),
        getActiveSessionKeys: () => [],
      });
      const screen = new AccountScreen();
      screen.initialize(document.body);
      screen.show();
      expect(document.querySelector('.account-card .account-copy')?.textContent).toContain(
        expected
      );
      expect(document.querySelector('.account-card .account-copy')?.textContent).not.toContain(
        'make it recoverable'
      );
    });
  }
});
