/**
 * AIService - Google Gemini AI integration for RunRealm
 * Provides route optimization, ghost runners, and strategic territory analysis
 */
import { BaseService } from '../core/base-service';
import type { CurrentRun } from '../current-run';
import { RunPoint } from './run-tracking-service';
export interface RouteOptimization {
    suggestedRoute: {
        coordinates: [number, number][];
        distance: number;
        difficulty: number;
        reasoning: string;
    };
    territories: {
        claimable: number;
        strategic: number;
    };
    confidence: number;
}
export interface GhostRunner {
    id: string;
    name: string;
    difficulty: number;
    avatar: string;
    pace: number;
    specialAbility: string;
    backstory: string;
    route?: RunPoint[];
}
export interface TerritoryAnalysis {
    value: number;
    rarity: number;
    competition: number;
    recommendations: string[];
    threats: string[];
    opportunities: string[];
}
export interface AIGoals {
    distance?: number;
    difficulty?: number;
    territories?: number;
    exploration?: boolean;
    training?: boolean;
    quickPromptType?: string;
    contextPrompt?: string;
    timeOfDay?: string;
    timeConstraint?: string;
    focus?: string;
    priority?: string;
}
export declare class AIService extends BaseService {
    private static instance;
    private genAI;
    private model;
    private isEnabled;
    private constructor();
    /**
     * Public initialization method
     */
    initializeService(): Promise<void>;
    static getInstance(): AIService;
    /**
     * Initialize AI service with Google Gemini
     */
    init(): Promise<void>;
    /**
     * Set up event listeners for AI service
     */
    private setupEventListeners;
    protected onInitialize(): Promise<void>;
    /**
     * Get API key with improved fallback logic
     */
    private getApiKey;
    /**
     * Validate API key format
     */
    private isValidApiKey;
    /**
     * Test connection to Gemini API
     */
    private testConnection;
    protected ensureInitialized(): void;
    /**
     * Generate AI-optimized route suggestions
     */
    suggestRoute(currentLocation: {
        lat: number;
        lng: number;
    }, goals: AIGoals, existingTerritories?: string[]): Promise<RouteOptimization>;
    /**
     * Generate ghost runner for competition
     */
    generateGhostRunner(difficulty: number, userStats?: {
        averagePace: number;
        totalDistance: number;
    }): Promise<GhostRunner>;
    /**
     * Get enhanced user context for AI analysis
     */
    private getUserContext;
    /**
     * Analyze territory strategic value with enhanced context
     */
    analyzeTerritory(geohash: string, territoryData: {
        distance: number;
        difficulty: number;
        landmarks: string[];
        elevation: number;
    }, contextData?: {
        nearbyTerritories: number;
        userLevel: number;
        marketActivity: number;
    }): Promise<TerritoryAnalysis>;
    /**
     * Get personalized running coaching
     */
    getRunningCoaching(currentRun: CurrentRun, userGoals: AIGoals, weatherConditions?: string): Promise<{
        motivation: string;
        tips: string[];
        warnings: string[];
        paceRecommendation: number;
    }>;
    private buildRoutePrompt;
    /**
     * Build quick prompt context for enhanced AI responses
     */
    private buildQuickPromptContext;
    /**
     * Build territory context for AI prompts
     */
    private buildTerritoryContext;
    private buildGhostRunnerPrompt;
    private buildTerritoryAnalysisPrompt;
    private buildCoachingPrompt;
    private parseRouteOptimization;
    private parseGhostRunner;
    private parseTerritoryAnalysis;
    private parseCoachingAdvice;
    private createFallbackGhostRunner;
    private createFallbackAnalysis;
    private createFallbackCoaching;
    private generateFallbackRoute;
    private generateCircularWaypoints;
    private getMapboxRoute;
    private calculatePaceFromDifficulty;
    /**
     * Check if AI features are enabled
     */
    isAIEnabled(): boolean;
    /**
     * Get AI service status
     */
    getStatus(): {
        enabled: boolean;
        initialized: boolean;
        modelReady: boolean;
    };
    /**
     * Refresh AI service configuration
     * Call this when runtime tokens are updated
     */
    refreshConfig(): Promise<void>;
}
