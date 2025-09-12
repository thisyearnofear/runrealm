import { BaseService } from '../core/base-service';

export class RunProgressFeedback extends BaseService {
  private lastMilestone = 0;

  constructor() {
    super();
    this.subscribe('run:statsUpdated', (data: { stats: any; runId: string }) => {
      if (data.stats) {
        this.checkMilestones(data.stats);
      }
    });
  }

  private checkMilestones(stats: { distance: number; averageSpeed: number }): void {
    const km = Math.floor(stats.distance / 1000);
    
    if (km > this.lastMilestone) {
      this.lastMilestone = km;
      this.showMilestone(km, stats.averageSpeed);
    }

    // Territory proximity alerts every 500m
    if (Math.floor(stats.distance / 500) > Math.floor((stats.distance - 100) / 500)) {
      this.checkTerritoryProximity();
    }
  }

  private showMilestone(km: number, speed: number): void {
    const pace = speed > 0 ? (1000 / speed) / 60 : 0;
    const encouragement = this.getEncouragement(km, pace);
    
    // Enhanced celebration with animation and sound
    this.safeEmit('ui:celebration', {
      type: 'milestone',
      achievement: `${km}km completed!`,
      message: encouragement,
      animation: 'confetti',
      sound: 'achievement',
      duration: 4000
    });

    // Legacy toast for fallback
    this.safeEmit('ui:showToast', {
      message: `🎉 ${km}km completed! ${encouragement}`,
      type: 'success',
      duration: 3000
    });
  }

  private getEncouragement(km: number, pace: number): string {
    if (pace < 5) return "Lightning fast! ⚡";
    if (pace < 7) return "Great pace! 🏃‍♂️";
    return "Keep it up! 💪";
  }

  private checkTerritoryProximity(): void {
    this.safeEmit('territory:checkProximity');
  }
}
