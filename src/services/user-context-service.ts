import { BaseService } from '../core/base-service';
import { PreferenceService } from '../preference-service';

export interface UserProfile {
  fitnessLevel: 'beginner' | 'intermediate' | 'advanced';
  preferredDistance: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
  goals: string[];
  completedRuns: number;
  avgPace?: number;
}

export class UserContextService extends BaseService {
  private static instance: UserContextService;
  private preferenceService = new PreferenceService();

  public static getInstance(): UserContextService {
    if (!UserContextService.instance) {
      UserContextService.instance = new UserContextService();
    }
    return UserContextService.instance;
  }
  
  public getSmartSuggestions(): { distance: number; difficulty: number; goals: string[] } {
    const profile = this.getUserProfile();
    const timeContext = this.getTimeContext();
    
    return {
      distance: this.calculateOptimalDistance(profile, timeContext),
      difficulty: this.calculateDifficulty(profile),
      goals: this.suggestGoals(profile, timeContext)
    };
  }

  private getUserProfile(): UserProfile {
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

  private getTimeContext(): string {
    const hour = new Date().getHours();
    if (hour < 10) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  private calculateOptimalDistance(profile: UserProfile, timeContext: string): number {
    const base = profile.preferredDistance || 2000;
    const multiplier = timeContext === 'morning' ? 0.8 : timeContext === 'evening' ? 1.2 : 1.0;
    return Math.round(base * multiplier);
  }

  private calculateDifficulty(profile: UserProfile): number {
    const base = profile.fitnessLevel === 'beginner' ? 30 : 
                 profile.fitnessLevel === 'intermediate' ? 50 : 70;
    return Math.min(base + (profile.completedRuns * 2), 90);
  }

  private suggestGoals(profile: UserProfile, timeContext: string): string[] {
    const goals = ['exploration'];
    if (profile.completedRuns > 5) goals.push('territory');
    if (timeContext === 'morning') goals.push('training');
    return goals;
  }

  private calculateAvgDistance(runs: any[]): number {
    if (!runs.length) return 2000;
    const total = runs.reduce((sum, run) => sum + (run.distance || 0), 0);
    return Math.round(total / runs.length);
  }

  private getPreferredTime(): 'morning' | 'afternoon' | 'evening' {
    // Could analyze run history timestamps
    return 'morning';
  }

  public trackUserAction(action: string, data?: any): void {
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
    
    // Emit for real-time tracking
    this.safeEmit('analytics:userAction', event);
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('session-id');
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      sessionStorage.setItem('session-id', sessionId);
    }
    return sessionId;
  }

  public getAnalytics(): any[] {
    return JSON.parse(localStorage.getItem('user-analytics') || '[]');
  }
}
