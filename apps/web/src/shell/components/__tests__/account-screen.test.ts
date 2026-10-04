import { EventBus } from "@runrealm/shared-core/core/event-bus";
import { AccountService } from "@runrealm/shared-core/services/account-service";
import { PreferenceService } from "@runrealm/shared-core/services/preference-service";
import { VOICE_BANNED_TERMS } from "@runrealm/shared-core/utils/atlas-voice";
import AccountScreen from "../account-screen";

jest.mock("@runrealm/shared-core/services/account-service", () => ({
  AccountService: { getInstance: jest.fn() },
  DEFAULT_GAME_SCOPES: ["claim", "boost", "deployGhost"],
}));
jest.mock("@runrealm/shared-core/services/preference-service", () => ({
  PreferenceService: jest.fn(),
}));

describe("AccountScreen device-local atlas copy", () => {
  beforeEach(() => {
    EventBus.getInstance().clear();
    document.body.replaceChildren();
    (PreferenceService as jest.Mock).mockImplementation(() => ({
      getPublicTerritoryIds: () => [],
    }));
  });

  for (const [tier, expected] of [
    ["guest", "A passkey does not restore it on another device."],
    ["passkey", "cannot be restored from the passkey."],
    ["wallet", "linking a wallet does not sync it."],
  ] as const) {
    it(`does not promise atlas recovery for a ${tier} account`, () => {
      (AccountService.getInstance as jest.Mock).mockReturnValue({
        getAccount: () => ({
          id: "account-example-1234",
          tier,
          createdAt: Date.now(),
          address: tier === "wallet" ? "0x1234567890abcdef" : undefined,
        }),
        getActiveSessionKeys: () => [],
      });
      const screen = new AccountScreen();
      screen.initialize(document.body);
      screen.show();
      expect(
        document.querySelector(".account-card .account-copy")?.textContent,
      ).toContain(expected);
      expect(
        document.querySelector(".account-card .account-copy")?.textContent,
      ).not.toContain("make it recoverable");
    });
  }

  describe("map credits", () => {
    beforeEach(() => {
      (AccountService.getInstance as jest.Mock).mockReturnValue({
        getAccount: () => ({
          id: "account-example-1234",
          tier: "guest",
          createdAt: Date.now(),
        }),
        getActiveSessionKeys: () => [],
      });
    });

    /** Render the screen and return its credits card. */
    function renderCredits(): HTMLElement {
      const screen = new AccountScreen();
      screen.initialize(document.body);
      screen.show();
      const heading = [...document.querySelectorAll(".account-card h3")].find(
        (h) => h.textContent === "Map credits",
      );
      expect(heading).toBeDefined();
      return heading!.closest(".account-card") as HTMLElement;
    }

    it("shows Mapbox for the street labels", () => {
      // Mapbox requires credit for its geocoding data, and this is the only
      // place a runner will ever look for it. Deleting this card is a licence
      // change, not a copy change.
      const text = renderCredits().textContent ?? "";
      expect(text).toContain("Mapbox");
      expect(text).toMatch(/our server/i);
    });

    it("credits the basemap to OpenStreetMap, not Mapbox", () => {
      const text = renderCredits().textContent ?? "";
      expect(text).toContain("OpenStreetMap");
      expect(text).toContain("OpenFreeMap");
    });

    it("marks external links noopener", () => {
      // These are innerHTML, so an anchor without noopener hands the opened
      // page a window.opener reference back into the running app.
      const anchors = [...renderCredits().querySelectorAll("a")];
      expect(anchors.length).toBeGreaterThan(0);
      for (const anchor of anchors) {
        expect(anchor.rel).toContain("noopener");
      }
    });
  });

  describe("spend allowance", () => {
    beforeEach(() => {
      (PreferenceService as jest.Mock).mockImplementation(() => ({
        getPublicTerritoryIds: () => [],
      }));
      (AccountService.getInstance as jest.Mock).mockReturnValue({
        getAccount: () => ({
          id: "account-example-1234",
          tier: "passkey",
          createdAt: Date.now(),
        }),
        getActiveSessionKeys: () => [
          {
            id: "key-app",
            scopes: ["claim", "boost", "deployGhost"],
            expiresAt: Date.now() + 24 * 60 * 60 * 1000,
            spendLimitRealm: 0,
            spentRealm: 0,
          },
        ],
      });
    });

    /** Render the screen and return its Authorizations card. */
    function renderAuthorizations(): HTMLElement {
      const screen = new AccountScreen();
      screen.initialize(document.body);
      screen.show();
      const heading = [...document.querySelectorAll(".account-card h3")].find(
        (h) => h.textContent === "Authorizations",
      );
      expect(heading).toBeDefined();
      return heading!.closest(".account-card") as HTMLElement;
    }

    it("prints what each ceiling is for, so the two can be told apart without a hover", () => {
      // A touch screen never shows `title`, and two bare amounts make a
      // runner guess which one to press at the exact moment we ask them
      // to spend. The purpose belongs on the button.
      const text = renderAuthorizations().textContent ?? "";
      expect(text).toContain("Approve 25 $REALM");
      expect(text).toContain("for bounties and boosts");
      expect(text).toContain("Approve 100 $REALM");
      expect(text).toContain("for bounties and trading");
    });

    it("frames an allowance as a ceiling before it asks", () => {
      // The anxiety an approve button creates is "will this take my
      // money" — the answer is printed above the buttons, not implied.
      const text = renderAuthorizations().textContent ?? "";
      expect(text).toContain("ceiling, not a charge");
      expect(text).toContain("nothing moves until you spend it");
    });
  });

  it("keeps the banned dashboard register out of every account copy line", () => {
    // The privacy card pointed at "the dashboard" — a banned term and a
    // word this screen's own audience would not recognise as a place they
    // can go. Sweep every `.account-copy` so the next string is held to
    // the same contract as the toast banks.
    (PreferenceService as jest.Mock).mockImplementation(() => ({
      getPublicTerritoryIds: () => [],
    }));
    (AccountService.getInstance as jest.Mock).mockReturnValue({
      getAccount: () => ({
        id: "account-example-1234",
        tier: "guest",
        createdAt: Date.now(),
      }),
      getActiveSessionKeys: () => [],
    });
    const screen = new AccountScreen();
    screen.initialize(document.body);
    screen.show();

    const lines = [...document.querySelectorAll(".account-copy")];
    expect(lines.length).toBeGreaterThan(3);
    for (const line of lines) {
      const text = (line.textContent ?? "").toLowerCase();
      for (const term of VOICE_BANNED_TERMS) {
        expect({ term, found: text.includes(term) }).toEqual({
          term,
          found: false,
        });
      }
    }
  });
});
