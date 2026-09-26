/**
 * SensoryFeedbackService - Heads-Up Sensory Feedback for Outdoor Runners
 *
 * Provides eyes-free auditory and haptic cues so runners can keep their phones
 * in pockets or armbands and still feel when they cross territory boundaries,
 * approach relics, or claim new ground.
 */

import { BaseService } from '../core/base-service';
import type { WorldStateChange } from '../types/world-state';
import { SoundService } from './sound-service';

export class SensoryFeedbackService extends BaseService {
  private static instance: SensoryFeedbackService;
  private soundService: SoundService;
  private hapticsEnabled: boolean = true;
  private audioCuesEnabled: boolean = true;
  private lastHapticTime: number = 0;

  private constructor() {
    super();
    this.soundService = SoundService.getInstance();

    try {
      const savedHaptics = localStorage.getItem('runrealm_haptics_enabled');
      this.hapticsEnabled = savedHaptics ? JSON.parse(savedHaptics) : true;
    } catch (_e) {
      this.hapticsEnabled = true;
    }
  }

  public static getInstance(): SensoryFeedbackService {
    if (!SensoryFeedbackService.instance) {
      SensoryFeedbackService.instance = new SensoryFeedbackService();
    }
    return SensoryFeedbackService.instance;
  }

  protected async onInitialize(): Promise<void> {
    // 1. Listen to semantic world state transitions
    this.subscribe('world:stateChanged', (change: WorldStateChange) => {
      this.handleWorldStateChange(change);
    });

    // 2. Listen to run milestones & controls
    this.subscribe('run:started', () => {
      this.vibrate([100, 50, 100]);
      this.soundService.playNotificationSound();
    });

    this.subscribe('run:completed', () => {
      this.vibrate([150, 80, 200]);
      this.soundService.playSuccessSound();
    });

    this.subscribe('run:statsUpdated', (data: { distance: number }) => {
      this.handleDistanceMilestone(data.distance);
    });

    // 3. Territory claims & rewards
    this.subscribe('territory:claimed', () => {
      this.vibrate([120, 60, 120, 60, 250]);
      // Note: SoundService.playDeedRevealSound is also invoked in SunprintDeedModal
    });

    // 4. Relic collected
    this.subscribe('relic:collected', () => {
      this.vibrate([80, 40, 140]);
    });

    this.safeEmit('service:initialized', { service: 'SensoryFeedbackService', success: true });
  }

  private lastMilestoneKm = 0;
  private handleDistanceMilestone(distanceMeters: number): void {
    const km = Math.floor(distanceMeters / 1000);
    if (km > this.lastMilestoneKm && km > 0) {
      this.lastMilestoneKm = km;
      // 1km pacing buzz
      this.vibrate([80, 60, 120]);
      this.soundService.playNotificationSound();
    }
  }

  private handleWorldStateChange(change: WorldStateChange): void {
    const reason = change.reason;
    const now = Date.now();

    // Prevent haptic saturation (minimum 400ms between boundary pulses)
    if (now - this.lastHapticTime < 400) return;

    switch (reason) {
      case 'cell-exposed':
        // Crossing into a new cell
        this.vibrate(50);
        this.soundService.playProximityPulse(0.3);
        this.lastHapticTime = now;
        break;

      case 'territory-developing':
        // Territory loop closing or developing
        this.vibrate([80, 50, 100]);
        this.soundService.playProximityPulse(0.7);
        this.lastHapticTime = now;
        break;

      case 'territory-overexposed':
        // Threat / rival contested territory
        this.vibrate([120, 80, 120]);
        this.soundService.playErrorSound();
        this.lastHapticTime = now;
        break;

      case 'ghost-deployed':
      case 'ghost-racing':
        // Rival ghost encounter
        this.vibrate([70, 40, 70]);
        this.lastHapticTime = now;
        break;
    }
  }

  /**
   * Safely trigger mobile vibration pattern
   */
  public vibrate(pattern: number | number[]): void {
    if (!this.hapticsEnabled) return;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (_e) {
        // Ignored if browser policy blocks
      }
    }
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
    try {
      localStorage.setItem('runrealm_haptics_enabled', JSON.stringify(enabled));
    } catch (_e) {
      // Ignored
    }
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }
}
