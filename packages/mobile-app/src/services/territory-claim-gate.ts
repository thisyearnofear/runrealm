/**
 * Whether a finished run may be offered a territory claim.
 *
 * Territory eligibility is 500m *and* a closed loop, and
 * `RunTrackingService.checkTerritoryEligibility` is the only thing that
 * computes it. This reads that verdict rather than re-deriving it: an earlier
 * version of the map screen checked distance alone, which silently dropped
 * the loop half and opened the claim modal for runs that
 * `TerritoryService.claimTerritoryFromExternalActivity` then refused.
 *
 * Re-deriving the rule here is the bug this module exists to prevent. If the
 * eligibility rules change, change them in the tracker.
 */
export interface ClaimableRun {
  territoryEligible?: boolean;
  geohash?: string;
}

export function shouldOfferTerritoryClaim(run: ClaimableRun | null | undefined): boolean {
  if (!run) return false;
  // The geohash is what the claim is keyed on; without it the service rejects
  // the claim even for an otherwise eligible run, so do not offer it.
  return run.territoryEligible === true && Boolean(run.geohash);
}
