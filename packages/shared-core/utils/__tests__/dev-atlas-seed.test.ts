/**
 * Dev atlas seed (H8 local eyeballing).
 *
 * The seeded records must be shaped like production ones — real H3
 * geometry, synthetic `{lat}_{lng}` geohash, and the same service calls a
 * real claim / poll makes — otherwise the layers can render "fine" in dev
 * while the real path is broken. These tests pin the shape and the
 * privacy invariant (fog is presence, never points).
 *
 * @jest-environment jsdom
 */
import { RivalTerritoryService } from '@runrealm/shared-blockchain/services/rival-territory-service';
import { EventBus } from '../../core/event-bus';
import { type Territory, TerritoryService } from '../../services/territory-service';
import {
  buildDemoOwnedTerritory,
  buildDemoRivalTerritories,
  buildDemoVulnerableTerritory,
  seedDemoAtlas,
} from '../dev-atlas-seed';

const CENTER = { lat: 40.785091, lng: -73.968285 };

function stubDeps() {
  const recorded: Territory[] = [];
  const seededRivals: unknown[][] = [];
  return {
    recorded,
    seededRivals,
    deps: {
      territory: {
        recordExternalClaim: (territory: Territory) => {
          recorded.push(territory);
          return { stored: true, territory };
        },
      },
      rivalTerritoryService: {
        seedForDev: (records: unknown[]) => {
          seededRivals.push(records);
        },
      },
    },
  };
}

describe('buildDemoOwnedTerritory', () => {
  it('carries real multi-cell H3 geometry, not just a center point', () => {
    const territory = buildDemoOwnedTerritory(CENTER);

    expect(territory.h3Cells?.length).toBeGreaterThan(1);
    for (const cell of territory.h3Cells ?? []) {
      expect(typeof cell.h3Index).toBe('string');
      expect(cell.boundary.length).toBeGreaterThanOrEqual(3);
    }
    expect(territory.geohash).toBe('40.785091_-73.968285');
    expect(territory.status).toBe('claimed');
  });

  it('is deterministic across calls (comparable screenshots)', () => {
    expect(buildDemoOwnedTerritory(CENTER)).toEqual(buildDemoOwnedTerritory(CENTER));
  });
});

describe('buildDemoVulnerableTerritory', () => {
  /** The service's own classifier is the contract, not a copy of the bands. */
  const classify = (points: number): string =>
    (
      TerritoryService.getInstance() as unknown as {
        calculateDefenseStatus(p: number): string;
      }
    ).calculateDefenseStatus(points);

  it('is "vulnerable" by the real classifier, so the coral fill and pulse fire', () => {
    const territory = buildDemoVulnerableTerritory(CENTER);

    expect(territory.defenseStatus).toBe('vulnerable');
    expect(territory.activityPoints).toBeDefined();
    expect(classify(territory.activityPoints ?? 0)).toBe('vulnerable');
  });

  it('carries real geometry, clear of the main demo claim', () => {
    const owned = buildDemoOwnedTerritory(CENTER);
    const vulnerable = buildDemoVulnerableTerritory(CENTER);

    expect(vulnerable.h3Cells?.length).toBeGreaterThan(1);
    expect(vulnerable.geohash).not.toBe(owned.geohash);
    const ownedCells = new Set((owned.h3Cells ?? []).map((c) => c.h3Index));
    expect((vulnerable.h3Cells ?? []).some((c) => ownedCells.has(c.h3Index))).toBe(false);
    expect(vulnerable.id).not.toBe(owned.id);
  });

  it('records a decayed claim (pins the defense-state pair)', () => {
    const { deps, recorded } = stubDeps();
    seedDemoAtlas(deps as never, CENTER);

    const stored = recorded.find((t) => t.id === 'territory_demo_vulnerable');
    expect(stored).toBeDefined();
    // `recordExternalClaim` only auto-seeds a defense state when
    // activityPoints is undefined, so this pair must be explicit — and it
    // must survive the store unchanged.
    expect(stored?.defenseStatus).toBe('vulnerable');
    expect(classify(stored?.activityPoints ?? 0)).toBe('vulnerable');
  });
});

describe('buildDemoRivalTerritories', () => {
  it('emits one fog record per rival, each with real geometry', () => {
    const rivals = buildDemoRivalTerritories(CENTER);

    expect(rivals).toHaveLength(4);
    for (const rival of rivals) {
      expect(rival.h3Cells).toHaveLength(1);
      expect(rival.geohash).toMatch(/^-?\d+\.\d{6}_-?\d+\.\d{6}$/);
      // The silhouettes must not sit on the viewer's own claim.
      expect(rival.geohash).not.toBe('40.785091_-73.968285');
    }
    // Distinct records so they don't dedupe to one silhouette.
    expect(new Set(rivals.map((r) => r.tokenId)).size).toBe(rivals.length);
  });

  it('exposes presence only — never a score', () => {
    for (const rival of buildDemoRivalTerritories(CENTER)) {
      const keys = Object.keys(rival);
      for (const forbidden of ['score', 'defenseScore', 'defense', 'activityPoints', 'pace']) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });
});

describe('seedDemoAtlas', () => {
  it('persists both claims and feeds the rival set through the services', () => {
    const { deps, recorded, seededRivals } = stubDeps();

    const seeded = seedDemoAtlas(deps as never, CENTER);

    expect(recorded).toHaveLength(2);
    expect(seededRivals).toHaveLength(1);
    expect(seededRivals[0]).toHaveLength(4);
    // Returns the service's own records (so callers can use the stored ones).
    expect(seeded.owned).toBe(recorded[0]);
    expect(seeded.vulnerable).toBe(recorded[1]);
    expect(seeded.vulnerable.defenseStatus).toBe('vulnerable');
    expect(seeded.rivals).toHaveLength(4);
  });
});

describe('RivalTerritoryService.seedForDev', () => {
  it('adds records once, repaints on change only, and emits the feed event', () => {
    const bus = EventBus.getInstance();
    bus.clear();
    const onUpdate = jest.fn();
    bus.on('territory:rivalsUpdated', onUpdate);
    const service = RivalTerritoryService.getInstance();
    const rivals = buildDemoRivalTerritories(CENTER);

    service.seedForDev(rivals);
    expect(onUpdate).toHaveBeenCalledWith({ count: rivals.length });
    expect(service.getRivalTerritories()).toHaveLength(rivals.length);

    // Idempotent: re-seeding the same tokens is a no-op (no event churn).
    service.seedForDev(rivals);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(service.getRivalTerritories()).toHaveLength(rivals.length);

    bus.clear();
  });
});
