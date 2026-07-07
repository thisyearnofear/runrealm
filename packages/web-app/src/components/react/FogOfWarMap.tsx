/**
 * FogOfWarMap — a decorative map overlay that visualizes the
 * confidential shield state. Non-anchored or foreign territories
 * appear dimmed behind a radial "fog" mask; the selected / owned
 * anchored territory is revealed.
 *
 * This is a presentational layer only; the map itself stays in
 * `MapCanvas` for performance.
 */
import { type ReactElement } from 'react';

export interface FogOfWarMapProps {
  /** Territory IDs that are anchored to the FHEVM shield. */
  revealedTerritoryIds?: string[];
  /** Currently selected territory, if any. */
  selectedTerritoryId?: string | null;
  /** Whether the confidential shield is active on the current chain. */
  shieldActive?: boolean;
  children?: React.ReactNode;
}

export function FogOfWarMap({
  revealedTerritoryIds = [],
  selectedTerritoryId,
  shieldActive,
  children,
}: FogOfWarMapProps): ReactElement {
  const revealed = new Set(revealedTerritoryIds);
  const isRevealed = selectedTerritoryId ? revealed.has(selectedTerritoryId) : false;

  return (
    <div
      className="rr-fog-of-war"
      data-active={shieldActive ? 'true' : 'false'}
      data-revealed={isRevealed ? 'true' : 'false'}
    >
      {children}
      {shieldActive && (
        <div className="rr-fog-of-war__overlay" aria-hidden>
          <div className="rr-fog-of-war__vignette" />
          {!isRevealed && selectedTerritoryId && (
            <div className="rr-fog-of-war__label">Encrypted territory</div>
          )}
        </div>
      )}
    </div>
  );
}
