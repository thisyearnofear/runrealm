import { BaseService } from '../core/base-service';

export class RunProgressFeedback extends BaseService {
  private lastMilestone = 0;

  constructor() {
    super();
    this.subscribe(
      'run:statsUpdated',
      (data: { distance: number; duration: number; speed: number }) => {
        this.checkMilestones(data);
      }
    );
  }

  private checkMilestones(stats: { distance: number; speed: number }): void {
    const km = Math.floor(stats.distance / 1000);

    if (km > this.lastMilestone) {
      this.lastMilestone = km;
      this.showMilestone(km, stats.speed);
    }

    // Territory proximity alerts every 500m
    if (Math.floor(stats.distance / 500) > Math.floor((stats.distance - 100) / 500)) {
      this.checkTerritoryProximity();
    }
  }

  private showMilestone(km: number, speed: number): void {
    const pace = speed > 0 ? 1000 / speed / 60 : 0;
    const encouragement = this.getEncouragement(km, pace);

    // Show toast notification
    this.safeEmit('ui:toast', {
      message: `🎉 ${km}km completed! ${encouragement}`,
      type: 'success',
      duration: 3000,
    });
  }

  private getEncouragement(_km: number, pace: number): string {
    if (pace < 5) return 'Lightning fast! ⚡';
    if (pace < 7) return 'Great pace! 🏃‍♂️';
    return 'Keep it up! 💪';
  }

  private checkTerritoryProximity(): void {
    // Note: This event is not in the AppEvents interface
    // this.safeEmit('territory:checkProximity', {});
  }
}
