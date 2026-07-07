/**
 * Inspector — the side panel that opens when a territory is tapped on
 * the map. Shows name, difficulty, estimated reward, owner, and a
 * claim button. The map drives selection through MapService; this
 * component just renders whatever is in `selected`.
 */
import { type ReactNode, useCallback } from 'react';

export interface InspectorTerritory {
  id: string;
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  difficulty: number;
  estimatedReward: number;
  owner?: string;
  h3Index?: string;
  isClaimable: boolean;
}

export interface InspectorProps {
  selected: InspectorTerritory | null;
  onClaim?: (territoryId: string) => void;
  onClose?: () => void;
  children?: ReactNode;
}

const RARITY_COLORS: Record<InspectorTerritory['rarity'], string> = {
  common: '#2ECC71',
  rare: '#3498DB',
  epic: '#9B59B6',
  legendary: '#FFD700',
};

export function Inspector({
  selected,
  onClaim,
  onClose,
  children,
}: InspectorProps): JSX.Element | null {
  const handleClaim = useCallback(() => {
    if (selected && onClaim) onClaim(selected.id);
  }, [selected, onClaim]);

  if (!selected) {
    return (
      <aside className="rr-inspector rr-inspector--empty" aria-hidden>
        <div className="rr-inspector__empty">Tap a territory on the map.</div>
      </aside>
    );
  }

  return (
    <aside className="rr-inspector" data-rarity={selected.rarity}>
      <header className="rr-inspector__header">
        <h2 className="rr-inspector__name">{selected.name}</h2>
        {onClose && (
          <button
            type="button"
            className="rr-inspector__close"
            onClick={onClose}
            aria-label="Close inspector"
          >
            ×
          </button>
        )}
      </header>
      <dl className="rr-inspector__stats">
        <div>
          <dt>Rarity</dt>
          <dd>
            <span
              className="rr-inspector__dot"
              style={{ background: RARITY_COLORS[selected.rarity] }}
              aria-hidden
            />
            {selected.rarity}
          </dd>
        </div>
        <div>
          <dt>Difficulty</dt>
          <dd>{selected.difficulty}/100</dd>
        </div>
        <div>
          <dt>Reward</dt>
          <dd>{selected.estimatedReward} REALM</dd>
        </div>
        {selected.owner && (
          <div>
            <dt>Owner</dt>
            <dd className="rr-inspector__address">{selected.owner}</dd>
          </div>
        )}
        {selected.h3Index && (
          <div>
            <dt>Cell</dt>
            <dd className="rr-inspector__mono">{selected.h3Index}</dd>
          </div>
        )}
      </dl>
      {selected.isClaimable && onClaim && (
        <button type="button" className="rr-inspector__claim" onClick={handleClaim}>
          Claim Territory
        </button>
      )}
      {children}
    </aside>
  );
}
