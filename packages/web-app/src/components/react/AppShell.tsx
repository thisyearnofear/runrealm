/**
 * AppShell — composes the React shell: HUD on top, MapCanvas filling
 * the viewport, BottomSheet anchored to the bottom, Inspector as a
 * slide-in panel. Owns the cross-component wiring (selected territory
 * flows from MapService → Inspector; run state flows from
 * RunTrackingService → HUD).
 */

import { MAP_STYLES } from '@runrealm/shared-core/utils/map-style';
import type { Map as MaplibreMap } from 'maplibre-gl';
import { useCallback, useMemo, useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { GameHUD } from './GameHUD';
import { Inspector, type InspectorTerritory } from './Inspector';
import { MapCanvas } from './MapCanvas';
import { type RunStateSource, useRunState } from './useRunState';

export interface AppShellProps {
  runState: RunStateSource | null;
  tokenBalance?: string;
  initialBottomSheet?: 'collapsed' | 'half' | 'full';
}

export function AppShell({
  runState,
  tokenBalance,
  initialBottomSheet = 'half',
}: AppShellProps): JSX.Element {
  const snapshot = useRunState(runState);
  const [selected, setSelected] = useState<InspectorTerritory | null>(null);
  const [mapInstance, setMapInstance] = useState<MaplibreMap | null>(null);

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

  return (
    <div className="rr-app-shell">
      <MapCanvas options={mapOptions} onMapReady={handleMapReady} className="rr-app-shell__map" />
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
      <Inspector selected={selected} onClaim={handleClaim} onClose={() => setSelected(null)} />
    </div>
  );
}
