/**
 * Canonical semantic state for Sunprint Atlas. Renderers and Orbis consume
 * this privacy-preserving snapshot instead of independently interpreting GPS,
 * territory, and ghost events.
 */
import { BaseService } from '../core/base-service';
import type { AppEvents } from '../core/event-bus';
import type { NeighbourhoodState } from '../types/neighbourhood';
import {
  cloneWorldSnapshot,
  type WorldSnapshot,
  type WorldTransitionReason,
} from '../types/world-state';
import { coordsToCell } from '../utils/h3-territory';
import type { NeighbourhoodRealmScene } from '../utils/neighbourhood-orbis';
import {
  createInitialWorldSnapshot,
  derivePaceBand,
  deriveTimeOfDay,
  threatLevelForTerritory,
} from '../utils/sunprint-atlas';
import type { Territory } from './territory-service';

export class WorldStateService extends BaseService {
  private static instance: WorldStateService;
  private snapshot: WorldSnapshot = createInitialWorldSnapshot(0);

  static getInstance(): WorldStateService {
    if (!WorldStateService.instance) WorldStateService.instance = new WorldStateService();
    return WorldStateService.instance;
  }

  protected async onInitialize(): Promise<void> {
    this.snapshot = createInitialWorldSnapshot(Date.now());
    this.setupEventListeners();
    this.publish('initialized');
  }

  public getSnapshot(): WorldSnapshot {
    return {
      ...this.snapshot,
      neighbourhood: this.snapshot.neighbourhood ? { ...this.snapshot.neighbourhood } : undefined,
    };
  }

  public setNeighbourhoodState(state: NeighbourhoodState): void {
    if (this.snapshot.neighbourhood) {
      const scene = this.snapshot.neighbourhood;
      if (
        scene.collectedCells === state.collectedCount &&
        scene.strengthenedCells === state.strengthenedCount
      )
        return;
      this.update(
        {
          neighbourhood: {
            ...scene,
            collectedCells: state.collectedCount,
            strengthenedCells: state.strengthenedCount,
          },
        },
        'realm-entered'
      );
      return;
    }
    this.update({ neighbourhood: seedScene(state) }, 'realm-entered');
  }

  private setupEventListeners(): void {
    this.subscribe('run:started', () => {
      this.update(
        {
          runStatus: 'recording',
          currentCell: null,
          enteredNewCell: false,
          territoryStatus: 'exposing',
          threatLevel: threatLevelForTerritory('exposing'),
          neighbourhood: this.snapshot.neighbourhood
            ? {
                ...this.snapshot.neighbourhood,
                stage: 'recording',
                newCells: 0,
                revisitedCells: 0,
                outcome: undefined,
                challengeTargetReached: undefined,
              }
            : undefined,
        },
        'run-started'
      );
    });
    this.subscribe('run:paused', () => this.update({ runStatus: 'paused' }, 'run-paused'));
    this.subscribe('run:resumed', () => {
      this.update(
        {
          runStatus: 'recording',
          neighbourhood: this.snapshot.neighbourhood
            ? { ...this.snapshot.neighbourhood, stage: 'recording' }
            : undefined,
        },
        'run-resumed'
      );
    });
    this.subscribe('run:completed', () => {
      this.update(
        { runStatus: 'completed', enteredNewCell: false, ghostPresence: 'none' },
        'run-completed'
      );
    });
    this.subscribe('run:cancelled', () => {
      this.update(
        {
          runStatus: 'cancelled',
          currentCell: null,
          enteredNewCell: false,
          territoryStatus: 'none',
          threatLevel: 0,
        },
        'run-cancelled'
      );
    });
    this.subscribe('run:statsUpdated', (data) => {
      // Canonical shape first: the tracker's `stats`, with the legacy flat
      // field as a fallback. Reading only the flat field meant paceBand — and
      // therefore the whole Orbis scene — never changed during a run.
      const paceBand = derivePaceBand(data.stats?.averageSpeed ?? data.speed ?? 0);
      if (paceBand !== this.snapshot.paceBand) this.update({ paceBand }, 'pace-changed');
    });

    this.subscribe('location:changed', (location) => {
      if (this.snapshot.runStatus !== 'recording') return;
      try {
        const cell = coordsToCell(location.lat, location.lng);
        if (cell.h3Index !== this.snapshot.currentCell) {
          const territoryStatus =
            this.snapshot.territoryStatus === 'none' ? 'exposing' : this.snapshot.territoryStatus;
          this.update(
            {
              currentCell: cell.h3Index,
              enteredNewCell: true,
              territoryStatus,
              threatLevel: Math.max(
                this.snapshot.threatLevel,
                threatLevelForTerritory(territoryStatus)
              ),
              timeOfDay: deriveTimeOfDay(location.timestamp),
            },
            'cell-exposed'
          );
        }
      } catch (error) {
        this.handleError(error, 'location-to-h3');
      }
    });

    this.subscribe('territory:claimStarted', () => {
      this.setTerritoryStatus('developing', 'territory-developing');
    });
    this.subscribe('territory:claimed', (data) => {
      this.setTerritoryStatus(
        statusFromTerritory(data.territory) === 'vulnerable' ? 'vulnerable' : 'developed',
        'territory-developed'
      );
    });
    this.subscribe('territory:vulnerable', () => {
      this.setTerritoryStatus('vulnerable', 'territory-overexposed');
    });
    this.subscribe('territory:activityUpdated', (data) => {
      this.setTerritoryStatus(statusFromTerritory(data.territory), 'territory-updated');
    });
    this.subscribe('neighbourhood:updated', ({ state }) => {
      this.setNeighbourhoodState(state);
    });
    this.subscribe('neighbourhood:goalSelected', ({ goal }) => {
      const scene = this.snapshot.neighbourhood;
      if (!scene) return;
      if (scene.goal === goal && scene.stage === 'preview' && scene.outcome === undefined) return;
      this.update(
        {
          neighbourhood: {
            ...scene,
            goal,
            stage: 'preview',
            newCells: 0,
            revisitedCells: 0,
            outcome: undefined,
            challengeTargetReached: undefined,
          },
        },
        'goal-selected'
      );
    });
    this.subscribe('neighbourhood:runCompleted', ({ summary, state }) => {
      const developed =
        summary.reason === 'collected' &&
        summary.newCellIds.length + summary.strengthenedCellIds.length > 0;
      const scene: NeighbourhoodRealmScene = {
        goal: summary.goal,
        stage: 'settled',
        collectedCells: state.collectedCount,
        strengthenedCells: state.strengthenedCount,
        newCells: summary.newCellIds.length,
        revisitedCells: summary.strengthenedCellIds.length,
        outcome: summary.reason,
        challengeTargetReached: summary.challenge?.targetReached,
      };
      this.update(
        developed
          ? {
              neighbourhood: scene,
              territoryStatus: 'developed',
              threatLevel: threatLevelForTerritory('developed'),
            }
          : { neighbourhood: scene },
        developed ? 'local-ground-developed' : 'local-outing-uncredited'
      );
    });
    this.subscribe('ghost:unlocked', ({ ghost }) => {
      const ghostType = (ghost as { type?: string } | undefined)?.type;
      if (ghostType === 'allrounder' && this.snapshot.ghostPresence === 'none') {
        this.update({ ghostPresence: 'nearby' }, 'companion-arrived');
      }
    });

    this.subscribe('ghost:deployed', () => {
      this.update({ ghostPresence: 'defending' }, 'ghost-deployed');
    });
    this.subscribe('ghost:progress', () => {
      if (this.snapshot.ghostPresence !== 'racing') {
        this.update({ ghostPresence: 'racing' }, 'ghost-racing');
      }
    });
    this.subscribe('ghost:raceCompleted', () => {
      this.update({ ghostPresence: 'none' }, 'ghost-completed');
    });
    this.subscribe('ghost:completed', () => {
      this.update({ ghostPresence: 'none' }, 'ghost-completed');
    });
  }

  private setTerritoryStatus(
    territoryStatus: WorldSnapshot['territoryStatus'],
    reason: WorldTransitionReason
  ): void {
    const threatLevel = threatLevelForTerritory(territoryStatus);
    if (
      this.snapshot.territoryStatus === territoryStatus &&
      this.snapshot.threatLevel === threatLevel
    )
      return;
    this.update({ territoryStatus, threatLevel }, reason);
  }

  private update(patch: Partial<WorldSnapshot>, reason: WorldTransitionReason): void {
    const previous = cloneWorldSnapshot(this.snapshot);
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      timeOfDay: patch.timeOfDay ?? deriveTimeOfDay(Date.now()),
    };
    this.publish(reason, previous);
  }

  private publish(reason: WorldTransitionReason, previous?: WorldSnapshot): void {
    this.safeEmit('world:stateChanged', {
      previous: previous ?? cloneWorldSnapshot(this.snapshot),
      snapshot: cloneWorldSnapshot(this.snapshot),
      reason,
      timestamp: Date.now(),
    });
  }
}

function seedScene(state: NeighbourhoodState): NeighbourhoodRealmScene {
  const summary = state.lastSummary;
  if (summary) {
    return {
      goal: summary.goal,
      stage: 'settled',
      collectedCells: state.collectedCount,
      strengthenedCells: state.strengthenedCount,
      newCells: summary.newCellIds.length,
      revisitedCells: summary.strengthenedCellIds.length,
      outcome: summary.reason,
      challengeTargetReached: summary.challenge?.targetReached,
    };
  }
  return {
    goal: state.goal,
    stage: 'preview',
    collectedCells: state.collectedCount,
    strengthenedCells: state.strengthenedCount,
    newCells: 0,
    revisitedCells: 0,
  };
}

function statusFromTerritory(territory: Territory): WorldSnapshot['territoryStatus'] {
  if (territory.status === 'contested' || territory.defenseStatus === 'claimable')
    return 'contested';
  if (territory.defenseStatus === 'vulnerable') return 'vulnerable';
  if (territory.status === 'claimed') return 'developed';
  return 'claimable';
}

export type WorldStateEventPayload = AppEvents['world:stateChanged'];
