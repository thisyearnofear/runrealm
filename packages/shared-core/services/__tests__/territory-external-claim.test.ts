import { createOrbisDemoTerritory } from '../../utils/orbis-demo';
import { TerritoryService } from '../territory-service';

describe('TerritoryService.recordExternalClaim', () => {
  it('stores a wallet-free demo claim without chain access', () => {
    const service = TerritoryService.getInstance();
    const territory = {
      ...createOrbisDemoTerritory('strong'),
      id: `orbis-external-${Date.now()}-a`,
    };

    const result = service.recordExternalClaim(territory);

    expect(result.stored).toBe(true);
    expect(service.getClaimedTerritories().some((entry) => entry.id === territory.id)).toBe(true);
  });

  it('is idempotent by territory id', () => {
    const service = TerritoryService.getInstance();
    const territory = {
      ...createOrbisDemoTerritory('strong'),
      id: `orbis-external-${Date.now()}-b`,
    };

    expect(service.recordExternalClaim(territory).stored).toBe(true);
    const second = service.recordExternalClaim(territory);

    expect(second.stored).toBe(false);
    expect(
      service.getClaimedTerritories().filter((entry) => entry.id === territory.id)
    ).toHaveLength(1);
  });
});
