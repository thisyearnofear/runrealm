import { shouldOfferTerritoryClaim } from '../territory-claim-gate';

describe('shouldOfferTerritoryClaim', () => {
  // The three cases that matter: long enough but unclosed, closed but short,
  // and genuinely claimable. The middle two are exactly what the map screen
  // got wrong when it re-derived eligibility from distance alone.
  it('offers the claim for a long run that closed its loop', () => {
    expect(shouldOfferTerritoryClaim({ territoryEligible: true, geohash: 'gh-1' })).toBe(true);
  });

  it('refuses a long run that did not close its loop, even though distance passed', () => {
    // A 900m out-and-back that never returned to its start. Distance alone
    // used to open the modal here; TerritoryService would then refuse it.
    expect(shouldOfferTerritoryClaim({ territoryEligible: false, geohash: 'gh-2' })).toBe(false);
  });

  it('refuses a short run that did close its loop', () => {
    expect(shouldOfferTerritoryClaim({ territoryEligible: false, geohash: 'gh-3' })).toBe(false);
  });

  it('refuses an eligible run with no geohash, which the claim is keyed on', () => {
    expect(shouldOfferTerritoryClaim({ territoryEligible: true })).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(shouldOfferTerritoryClaim(null)).toBe(false);
    expect(shouldOfferTerritoryClaim(undefined)).toBe(false);
  });

  it('trusts the tracker rather than a non-boolean truthy value', () => {
    // Some flows carry `undefined` before eligibility is computed; only an
    // explicit true may open a claim.
    expect(shouldOfferTerritoryClaim({ geohash: 'gh-4' })).toBe(false);
  });
});
