/**
 * AIService - Google Gemini AI integration for RunRealm
 * Provides route optimization, ghost runners, and strategic territory analysis
 */

// Dynamically import Google Generative AI to reduce initial bundle size
// import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { BaseService } from '../core/base-service';
import type { CurrentRun } from '../current-run';

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
  pace: number; // seconds per meter
  specialAbility: string;
  backstory: string;
}

export interface TerritoryAnalysis {
  value: number; // 0-100 strategic value
  rarity: number; // 0-100 rarity score
  competition: number; // 0-100 competition level
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
}

export class AIService extends BaseService {
  private static instance: AIService;
  private genAI: any = null;
  private model: any = null;
  private isEnabled = false;

  private constructor() {
    super();
  }

  /**
   * Public initialization method
   */
  public async initializeService(): Promise<void> {
    await this.initialize();
  }

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * Initialize AI service with Google Gemini
   */
  public async init(): Promise<void> {
    // Always try to get the latest config which should have runtime tokens
    const web3Config = this.config.getWeb3Config();
    
    // Check if AI features are enabled
    const aiEnabled = web3Config?.ai?.enabled;
    if (!aiEnabled) {
      console.log('AIService: AI features disabled');
      this.isEnabled = false;
      return;
    }
    
    // Get API key, prioritizing runtime-injected tokens
    let apiKey = '';
    
    // 1. Check runtime-injected tokens (highest priority for production)
    if (web3Config?.ai?.geminiApiKey) {
      apiKey = web3Config.ai.geminiApiKey;
      console.log('AIService: Using runtime-injected Gemini API key');
    } 
    // 2. Fallback to localStorage (for development)
    else if (typeof localStorage !== 'undefined') {
      apiKey = localStorage.getItem('runrealm_google_gemini_api_key') || '';
      if (apiKey) {
        console.log('AIService: Using localStorage Gemini API key');
      }
    }
    
    if (!apiKey) {
      console.log('AIService: No API key available for Google Gemini');
      this.isEnabled = false;
      return;
    }

    // Dynamically import Google Generative AI only when needed
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      this.genAI = new GoogleGenerativeAI(apiKey);
      this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      this.isEnabled = true;
      this.isInitialized = true; // Mark as fully initialized
      console.log('AIService: Google Generative AI initialized successfully');
    } catch (error) {
      console.error('AIService: Failed to initialize Google Generative AI:', error);
      this.isEnabled = false;
      this.isInitialized = false;
    }
  }

  protected async onInitialize(): Promise<void> {
    // Initialization is now handled in init() method with dynamic imports
  }

  protected ensureInitialized(): void {
    if (!this.isEnabled || !this.model) {
      const status = this.getStatus();
      const errorMsg = `AIService not properly initialized. Call init() first. Status: ${JSON.stringify(status)}`;
      console.warn(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Generate AI-optimized route suggestions
   */
  public async suggestRoute(
    currentLocation: { lat: number; lng: number },
    goals: AIGoals,
    existingTerritories?: string[]
  ): Promise<RouteOptimization> {
    this.ensureInitialized();

    if (!this.isEnabled) {
      throw new Error('AI service not enabled');
    }

    const prompt = this.buildRoutePrompt(currentLocation, goals, existingTerritories);
    
    return this.retry(async () => {
      const result = await this.model!.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const optimization = this.parseRouteOptimization(text, currentLocation, goals);
      
      this.safeEmit('ai:routeSuggested', {
        route: optimization.suggestedRoute,
        confidence: optimization.confidence,
        reasoning: optimization.suggestedRoute.reasoning
      });

      return optimization;
    }, 3, 1000, 'route suggestion');
  }

  /**
   * Generate ghost runner for competition
   */
  public async generateGhostRunner(
    difficulty: number,
    userStats?: { averagePace: number; totalDistance: number }
  ): Promise<GhostRunner> {
    this.ensureInitialized();

    if (!this.isEnabled) {
      return this.createFallbackGhostRunner(difficulty);
    }

    const prompt = this.buildGhostRunnerPrompt(difficulty, userStats);
    
    return this.retry(async () => {
      const result = await this.model!.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const ghostRunner = this.parseGhostRunner(text, difficulty);
      
      this.safeEmit('ai:ghostRunnerGenerated', {
        runner: ghostRunner,
        difficulty
      });

      return ghostRunner;
    }, 3, 1000, 'ghost runner generation');
  }

  /**
   * Analyze territory strategic value
   */
  public async analyzeTerritory(
    geohash: string,
    territoryData: {
      distance: number;
      difficulty: number;
      landmarks: string[];
      elevation: number;
    },
    contextData?: {
      nearbyTerritories: number;
      userLevel: number;
      marketActivity: number;
    }
  ): Promise<TerritoryAnalysis> {
    this.ensureInitialized();

    if (!this.isEnabled) {
      return this.createFallbackAnalysis(territoryData);
    }

    const prompt = this.buildTerritoryAnalysisPrompt(territoryData, contextData);
    
    return this.retry(async () => {
      const result = await this.model!.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      const analysis = this.parseTerritoryAnalysis(text, territoryData);
      
      this.safeEmit('ai:territoryAnalyzed', {
        tokenId: geohash,
        analysis,
        recommendations: analysis.recommendations
      });

      return analysis;
    }, 3, 1000, 'territory analysis');
  }

  /**
   * Get personalized running coaching
   */
  public async getRunningCoaching(
    currentRun: CurrentRun,
    userGoals: AIGoals,
    weatherConditions?: string
  ): Promise<{
    motivation: string;
    tips: string[];
    warnings: string[];
    paceRecommendation: number;
  }> {
    this.ensureInitialized();

    if (!this.isEnabled) {
      return this.createFallbackCoaching(currentRun, userGoals);
    }

    const prompt = this.buildCoachingPrompt(currentRun, userGoals, weatherConditions);
    
    return this.retry(async () => {
      const result = await this.model!.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return this.parseCoachingAdvice(text, currentRun);
    }, 3, 1000, 'coaching advice');
  }

  // Prompt builders
  private buildRoutePrompt(
    location: { lat: number; lng: number },
    goals: AIGoals,
    existingTerritories?: string[]
  ): string {
    return `
You are an AI running coach and territory strategist for RunRealm, a fitness GameFi app. 
Generate an optimal running route that helps the user claim valuable territory NFTs.

Current location: ${location.lat}, ${location.lng}
Goals: ${JSON.stringify(goals)}
Existing territories nearby: ${existingTerritories?.length || 0}

Consider:
- Route safety and attractiveness for running
- Strategic territory value (landmarks, uniqueness)
- Distance and difficulty preferences
- Avoiding oversaturated areas
- Connecting valuable points of interest

Respond with JSON format:
{
  "suggestedRoute": {
    "coordinates": [[lng, lat], ...],
    "distance": number_in_meters,
    "difficulty": number_0_to_100,
    "reasoning": "explanation of route strategy"
  },
  "territories": {
    "claimable": estimated_new_territories,
    "strategic": strategic_value_score
  },
  "confidence": confidence_0_to_100
}

Focus on creating engaging, gamified suggestions that make running feel like an adventure.
    `.trim();
  }

  private buildGhostRunnerPrompt(
    difficulty: number,
    userStats?: { averagePace: number; totalDistance: number }
  ): string {
    return `
Create a compelling AI ghost runner opponent for RunRealm GameFi app.
This runner will compete against the user in territory battles.

Difficulty level: ${difficulty}/100
User stats: ${userStats ? JSON.stringify(userStats) : 'No previous data'}

Create a character that feels alive and motivating, with:
- Unique personality and backstory
- Appropriate challenge level
- Special abilities that make competition interesting
- Engaging narrative elements

Respond with JSON format:
{
  "id": "unique_identifier",
  "name": "Character name",
  "difficulty": ${difficulty},
  "avatar": "description for avatar generation",
  "pace": pace_in_seconds_per_meter,
  "specialAbility": "unique competitive advantage",
  "backstory": "engaging 1-2 sentence character story"
}

Make this character memorable and fun to compete against!
    `.trim();
  }

  private buildTerritoryAnalysisPrompt(
    territoryData: any,
    contextData?: any
  ): string {
    return `
Analyze this territory for strategic value in RunRealm GameFi app.
Territory data: ${JSON.stringify(territoryData)}
Context: ${contextData ? JSON.stringify(contextData) : 'Limited context'}

Evaluate based on:
- Rarity and uniqueness of the route
- Strategic gaming value
- Competition likelihood
- Long-term value potential
- Risk factors

Respond with JSON format:
{
  "value": strategic_value_0_to_100,
  "rarity": rarity_score_0_to_100,
  "competition": expected_competition_0_to_100,
  "recommendations": ["actionable advice"],
  "threats": ["potential risks"],
  "opportunities": ["potential advantages"]
}

Provide GameFi-focused analysis that helps players make strategic decisions.
    `.trim();
  }

  private buildCoachingPrompt(
    currentRun: CurrentRun,
    goals: AIGoals,
    weather?: string
  ): string {
    return `
Provide motivational running coaching for RunRealm GameFi app.
Current run: ${currentRun.distance}m distance
Goals: ${JSON.stringify(goals)}
Weather: ${weather || 'Unknown'}

Give personalized, gamified coaching that:
- Motivates the user
- Provides practical running tips
- Warns about potential issues
- Suggests optimal pace

Respond with JSON format:
{
  "motivation": "encouraging message with GameFi elements",
  "tips": ["practical running advice"],
  "warnings": ["safety or performance warnings"],
  "paceRecommendation": pace_in_seconds_per_meter
}

Make this feel like a personal AI running coach in a game world!
    `.trim();
  }

  // Response parsers
  private parseRouteOptimization(text: string, location: any, goals: AIGoals): RouteOptimization {
    try {
      return JSON.parse(text);
    } catch {
      // Fallback if JSON parsing fails
      return {
        suggestedRoute: {
          coordinates: this.generateFallbackRoute(location, goals.distance || 2000),
          distance: goals.distance || 2000,
          difficulty: goals.difficulty || 50,
          reasoning: 'AI-generated route optimized for territory claiming'
        },
        territories: {
          claimable: Math.floor(Math.random() * 3) + 1,
          strategic: Math.floor(Math.random() * 50) + 25
        },
        confidence: 75
      };
    }
  }

  private parseGhostRunner(text: string, difficulty: number): GhostRunner {
    try {
      return JSON.parse(text);
    } catch {
      return this.createFallbackGhostRunner(difficulty);
    }
  }

  private parseTerritoryAnalysis(text: string, territoryData: any): TerritoryAnalysis {
    try {
      return JSON.parse(text);
    } catch {
      return this.createFallbackAnalysis(territoryData);
    }
  }

  private parseCoachingAdvice(text: string, currentRun: CurrentRun): any {
    try {
      return JSON.parse(text);
    } catch {
      return this.createFallbackCoaching(currentRun, {});
    }
  }

  // Fallback creators
  private createFallbackGhostRunner(difficulty: number): GhostRunner {
    const runners = [
      { name: 'Lightning Bolt', ability: 'Speed Surge', story: 'Former track star turned digital competitor.' },
      { name: 'Mountain Echo', ability: 'Endurance Boost', story: 'Trail runner who conquered the highest peaks.' },
      { name: 'City Phantom', ability: 'Urban Navigation', story: 'Street runner who knows every shortcut in town.' },
      { name: 'Dawn Chaser', ability: 'Early Bird', story: 'Morning runner who catches the sunrise every day.' }
    ];

    const runner = runners[Math.floor(Math.random() * runners.length)];
    
    return {
      id: `ghost_${Date.now()}_${difficulty}`,
      name: runner.name,
      difficulty,
      avatar: `Athletic runner with ${difficulty < 30 ? 'beginner' : difficulty < 70 ? 'intermediate' : 'professional'} gear`,
      pace: this.calculatePaceFromDifficulty(difficulty),
      specialAbility: runner.ability,
      backstory: runner.story
    };
  }

  private createFallbackAnalysis(territoryData: any): TerritoryAnalysis {
    const baseDifficulty = territoryData.difficulty || 50;
    
    return {
      value: Math.min(95, baseDifficulty + Math.floor(Math.random() * 20)),
      rarity: Math.floor(Math.random() * 40) + 30,
      competition: Math.floor(Math.random() * 60) + 20,
      recommendations: [
        'Consider claiming during off-peak hours',
        'Stack territories for district bonuses',
        'Monitor nearby competition levels'
      ],
      threats: [
        'High competition area',
        'Weather-dependent accessibility'
      ],
      opportunities: [
        'Strategic location for expansion',
        'Potential for high rewards'
      ]
    };
  }

  private createFallbackCoaching(currentRun: CurrentRun, goals: AIGoals): any {
    return {
      motivation: `Great work, Runner! You've covered ${Math.floor(currentRun.distance)}m. Every step earns you territory and $REALM tokens!`,
      tips: [
        'Maintain steady breathing',
        'Keep your territory claiming pace',
        'Stay hydrated for optimal performance'
      ],
      warnings: currentRun.distance > 5000 ? ['Consider a rest break'] : [],
      paceRecommendation: 4.5 // 4.5 seconds per meter (moderate pace)
    };
  }

  private generateFallbackRoute(
    center: { lat: number; lng: number },
    distance: number
  ): [number, number][] {
    // Generate a simple circular route
    const points: [number, number][] = [];
    const radius = distance / (2 * Math.PI * 111000); // Approximate radius in degrees
    const numPoints = 8;
    
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const lat = center.lat + radius * Math.cos(angle);
      const lng = center.lng + radius * Math.sin(angle);
      points.push([lng, lat]);
    }
    
    return points;
  }

  private calculatePaceFromDifficulty(difficulty: number): number {
    // Convert difficulty to realistic pace (seconds per meter)
    // Lower difficulty = slower pace, higher difficulty = faster pace
    const basePace = 5.0; // 5 seconds per meter baseline
    const adjustment = (difficulty - 50) * 0.02; // ±1 second per meter range
    return Math.max(3.0, Math.min(7.0, basePace - adjustment));
  }

  /**
   * Check if AI features are enabled
   */
  public isAIEnabled(): boolean {
    return this.isEnabled && this.isInitialized;
  }

  /**
   * Get AI service status
   */
  public getStatus(): {
    enabled: boolean;
    initialized: boolean;
    modelReady: boolean;
  } {
    return {
      enabled: this.isEnabled,
      initialized: this.isInitialized,
      modelReady: this.model !== null
    };
  }

  /**
   * Refresh AI service configuration
   * Call this when runtime tokens are updated
   */
  public async refreshConfig(): Promise<void> {
    // Clean up existing resources
    this.cleanup();
    
    // Re-initialize with new configuration
    await this.init();
  }
}
