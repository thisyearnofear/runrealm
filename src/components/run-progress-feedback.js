import { BaseService } from '../core/base-service';
export class RunProgressFeedback extends BaseService {
    constructor() {
        super();
        this.lastMilestone = 0;
        this.subscribe('run:statsUpdated', (data) => {
            this.checkMilestones(data);
        });
    }
    checkMilestones(stats) {
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
    showMilestone(km, speed) {
        const pace = speed > 0 ? (1000 / speed) / 60 : 0;
        const encouragement = this.getEncouragement(km, pace);
        // Show toast notification
        this.safeEmit('ui:toast', {
            message: `🎉 ${km}km completed! ${encouragement}`,
            type: 'success',
            duration: 3000
        });
    }
    getEncouragement(km, pace) {
        if (pace < 5)
            return "Lightning fast! ⚡";
        if (pace < 7)
            return "Great pace! 🏃‍♂️";
        return "Keep it up! 💪";
    }
    checkTerritoryProximity() {
        // Note: This event is not in the AppEvents interface
        // this.safeEmit('territory:checkProximity', {});
    }
}
