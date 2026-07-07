/**
 * AppShell — composes the React shell: HUD on top, MapCanvas filling
 * the viewport, BottomSheet anchored to the bottom, Inspector as a
 * slide-in panel. Owns the cross-component wiring (selected territory
 * flows from MapService → Inspector; run state flows from
 * RunTrackingService → HUD).
 *
 * Phase 5 adds the confidential shield layer: an `EncryptedShield`
 * badge in the HUD, a `ConfidentialDefensePanel` inside the inspector,
 * a `ContestModal` for challenging defenders, and a `FogOfWarMap`
 * overlay that dims non-anchored territories.
 */

import { MAP_STYLES } from '@runrealm/shared-core/utils/map-style';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { useCallback, useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { ConfidentialDefensePanel } from './ConfidentialDefensePanel';
import { ContestModal } from './ContestModal';
import { EncryptedShield } from './EncryptedShield';
import { FogOfWarMap } from './FogOfWarMap';
import { GameHUD } from './GameHUD';
import { Inspector, type InspectorTerritory } from './Inspector';
import { MapCanvas } from './MapCanvas';
import { type UseConfidentialShieldOptions, useConfidentialShield } from './useConfidentialShield';
import { type RunStateSource, useRunState } from './useRunState';

export interface AppShellProps {
  runState: RunStateSource | null;
  tokenBalance?: string;
  initialBottomSheet?: 'collapsed' | 'half' | 'full';
  /**
   * Pre-wired options for the confidential shield hook. When omitted,
   * the shield UI renders in `unsupported` state.
   */
  confidentialOptions?: UseConfidentialShieldOptions;
  /** Territory IDs considered anchored to the FHEVM shield. */
  anchoredTerritoryIds?: string[];
}

export function AppShell({
  runState,
  tokenBalance,
  initialBottomSheet = 'half',
  confidentialOptions,
  anchoredTerritoryIds = [],
}: AppShellProps): JSX.Element {
  const snapshot = useRunState(runState);
  const [selected, setSelected] = useState<InspectorTerritory | null>(null);
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null);
  const [contestOpen, setContestOpen] = useState(false);

  const confidential = useConfidentialShield(
    confidentialOptions ?? {
      eventBus: {
        on: () => {},
        off: () => {},
      } as unknown as UseConfidentialShieldOptions['eventBus'],
      isSupportedChain: () => false,
      getDefenseMetadata: async () => null,
      myDefenseCipher: async () => null,
      publicDecryptOutcome: async () => null,
      boostEncrypted: async () => null,
      contestEncrypted: async () => null,
    }
  );

  const mapOptions = useMemo(
    () => ({
      style: MAP_STYLES.street.url,
      center: [-73.9855, 40.758] as [number, number],
      zoom: 13,
    }),
    []
  );

  const handleMapReady = useCallback((map: MaplibreMap) => {
    setMapInstance(map);
  }, []);

  const handleClaim = useCallback((_territoryId: string) => {
    // Wired up by the orchestrator in step 6; the shell is just the
    // chrome and delegates all game actions to the singleton.
  }, []);

  const selectedTerritoryId = selected?.id;

  return (
    <div className="rr-app-shell">
      <FogOfWarMap
        revealedTerritoryIds={anchoredTerritoryIds}
        selectedTerritoryId={selectedTerritoryId}
        shieldActive={confidential.status !== 'unsupported'}
      >
        <MapCanvas options={mapOptions} onMapReady={handleMapReady} className="rr-app-shell__map" />
      </FogOfWarMap>
      <GameHUD
        stats={{
          distanceMeters: snapshot.distanceMeters,
          durationMs: snapshot.durationMs,
          paceSecondsPerKm: snapshot.paceSecondsPerKm,
          currentSpeedMps: snapshot.currentSpeedMps,
          isRecording: snapshot.isRecording,
        }}
        territoryCount={snapshot.territoryCount}
        tokenBalance={tokenBalance}
        rightSlot={
          <EncryptedShield
            status={confidential.status}
            busy={confidential.busy}
            onClick={() => selectedTerritoryId && void confidential.refresh(selectedTerritoryId)}
          />
        }
      />
      <BottomSheet
        initial={initialBottomSheet}
        header={<h2 className="rr-bottom-sheet__title">Run Details</h2>}
      >
        <p className="rr-bottom-sheet__placeholder">
          Wire to RouteInfoPanel / EnhancedRunControls in step 6.
          {mapInstance ? '' : ' Map is initializing…'}
        </p>
      </BottomSheet>
      <Inspector selected={selected} onClaim={handleClaim} onClose={() => setSelected(null)}>
        {selectedTerritoryId && (
          <ConfidentialDefensePanel
            territoryId={selectedTerritoryId}
            status={confidential.status}
            defense={confidential.defense}
            busy={confidential.busy}
            error={confidential.error}
            onRefresh={() => void confidential.refresh(selectedTerritoryId)}
            onBoost={(amount) => void confidential.boost(selectedTerritoryId, amount)}
          />
        )}
        {selected?.owner && selectedTerritoryId && confidential.defense?.anchored && (
          <button
            type="button"
            className="rr-inspector__claim"
            onClick={() => setContestOpen(true)}
          >
            Contest Territory
          </button>
        )}
      </Inspector>
      <ContestModal
        open={contestOpen}
        territoryId={selectedTerritoryId ?? ''}
        defenderAddress={selected?.owner}
        busy={confidential.busy}
        error={confidential.error}
        onClose={() => setContestOpen(false)}
        onContest={async (amount) => {
          if (!selectedTerritoryId) return;
          await confidential.contest(selectedTerritoryId, amount);
          setContestOpen(false);
        }}
      />
    </div>
  );
}
