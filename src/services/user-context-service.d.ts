import { BaseService } from '../core/base-service';
export interface UserProfile {
    fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
    preferredDistance: number;
    timeOfDay: 'morning' | 'afternoon' | 'evening';
    goals: string[];
    completedRuns: number;
    avgPace?: number;
}
export declare class UserContextService extends BaseService {
    private static instance;
    private preferenceService;
    static getInstance(): UserContextService;
    getSmartSuggestions(): {
        distance: number;
        difficulty: number;
        goals: string[];
    };
    private getUserProfile;
    private getTimeContext;
    private calculateOptimalDistance;
    private calculateDifficulty;
    private suggestGoals;
    private calculateAvgDistance;
    private getPreferredTime;
    trackUserAction(action: string, data?: any): void;
    private getSessionId;
    getAnalytics(): any[];
}
