/**
 * Canonical semantic state for Sunprint Atlas. Renderers and Orbis consume
 * this privacy-preserving snapshot instead of independently interpreting GPS,
 * territory, and ghost events.
 */
import { BaseService } from '../core/base-service';
import type { AppEvents } from '../core/event-bus';
import type { WorldSnapshot, WorldTransitionReason } from '../types/world-state';
import { coordsToCell } from '../utils/h3-territory';
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
    return { ...this.snapshot };
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
        },
        'run-started'
      );
    });
    this.subscribe('run:paused', () => this.update({ runStatus: 'paused' }, 'run-paused'));
    this.subscribe('run:resumed', () => this.update({ runStatus: 'recording' }, 'run-resumed'));
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
      const paceBand = derivePaceBand(data.speed);
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
    const previous = { ...this.snapshot };
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      timeOfDay: patch.timeOfDay ?? deriveTimeOfDay(Date.now()),
    };
    this.publish(reason, previous);
  }

  private publish(reason: WorldTransitionReason, previous?: WorldSnapshot): void {
    this.safeEmit('world:stateChanged', {
      previous: previous ?? { ...this.snapshot },
      snapshot: { ...this.snapshot },
      reason,
      timestamp: Date.now(),
    });
  }
}

function statusFromTerritory(territory: Territory): WorldSnapshot['territoryStatus'] {
  if (territory.status === 'contested' || territory.defenseStatus === 'claimable')
    return 'contested';
  if (territory.defenseStatus === 'vulnerable') return 'vulnerable';
  if (territory.status === 'claimed') return 'developed';
  return 'claimable';
}

export type WorldStateEventPayload = AppEvents['world:stateChanged'];
