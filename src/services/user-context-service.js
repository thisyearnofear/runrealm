import { BaseService } from '../core/base-service';
import { PreferenceService } from '../preference-service';
export class UserContextService extends BaseService {
    constructor() {
        super(...arguments);
        this.preferenceService = new PreferenceService();
    }
    static getInstance() {
        if (!UserContextService.instance) {
            UserContextService.instance = new UserContextService();
        }
        return UserContextService.instance;
    }
    getSmartSuggestions() {
        const profile = this.getUserProfile();
        const timeContext = this.getTimeContext();
        return {
            distance: this.calculateOptimalDistance(profile, timeContext),
            difficulty: this.calculateDifficulty(profile),
            goals: this.suggestGoals(profile, timeContext)
        };
    }
    getUserProfile() {
        // Infer from usage patterns
        const runs = JSON.parse(localStorage.getItem('user-runs') || '[]');
        return {
            fitnessLevel: runs.length > 10 ? 'intermediate' : 'beginner',
            preferredDistance: this.calculateAvgDistance(runs),
            timeOfDay: this.getPreferredTime(),
            goals: ['exploration'],
            completedRuns: runs.length
        };
    }
    getTimeContext() {
        const hour = new Date().getHours();
        if (hour < 10)
            return 'morning';
        if (hour < 17)
            return 'afternoon';
        return 'evening';
    }
    calculateOptimalDistance(profile, timeContext) {
        const base = profile.preferredDistance || 2000;
        const multiplier = timeContext === 'morning' ? 0.8 : timeContext === 'evening' ? 1.2 : 1.0;
        return Math.round(base * multiplier);
    }
    calculateDifficulty(profile) {
        const base = profile.fitnessLevel === 'beginner' ? 30 :
            profile.fitnessLevel === 'intermediate' ? 50 : 70;
        return Math.min(base + (profile.completedRuns * 2), 90);
    }
    suggestGoals(profile, timeContext) {
        const goals = ['exploration'];
        if (profile.completedRuns > 5)
            goals.push('territory');
        if (timeContext === 'morning')
            goals.push('training');
        return goals;
    }
    calculateAvgDistance(runs) {
        if (!runs.length)
            return 2000;
        const total = runs.reduce((sum, run) => sum + (run.distance || 0), 0);
        return Math.round(total / runs.length);
    }
    getPreferredTime() {
        // Could analyze run history timestamps
        return 'morning';
    }
    trackUserAction(action, data) {
        const event = {
            action,
            timestamp: Date.now(),
            sessionId: this.getSessionId(),
            data
        };
        // Store for analytics
        const events = JSON.parse(localStorage.getItem('user-analytics') || '[]');
        events.push(event);
        // Keep only last 1000 events
        if (events.length > 1000) {
            events.splice(0, events.length - 1000);
        }
        localStorage.setItem('user-analytics', JSON.stringify(events));
        // Note: This event is not in the AppEvents interface
        // this.safeEmit('analytics:userAction', event);
    }
    getSessionId() {
        let sessionId = sessionStorage.getItem('session-id');
        if (!sessionId) {
            sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            sessionStorage.setItem('session-id', sessionId);
        }
        return sessionId;
    }
    getAnalytics() {
        return JSON.parse(localStorage.getItem('user-analytics') || '[]');
    }
}
