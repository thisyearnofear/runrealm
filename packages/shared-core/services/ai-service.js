/**
 * AIService - Google Gemini AI integration for RunRealm
 * Provides route optimization, ghost runners, and strategic territory analysis
 */
// Dynamically import Google Generative AI to reduce initial bundle size
// import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { BaseService } from '../core/base-service';
export class AIService extends BaseService {
    constructor() {
        super();
        this.genAI = null;
        this.model = null;
        this.isEnabled = false;
    }
    /**
     * Public initialization method
     */
    async initializeService() {
        await this.initialize();
    }
    static getInstance() {
        if (!AIService.instance) {
            AIService.instance = new AIService();
        }
        return AIService.instance;
    }
    /**
     * Initialize AI service with Google Gemini
     */
    async init() {
        console.log('AIService: Starting initialization...');
        // Always try to get the latest config which should have runtime tokens
        const web3Config = this.config.getWeb3Config();
        console.log('AIService: Web3 config loaded:', {
            enabled: web3Config?.enabled,
            aiEnabled: web3Config?.ai?.enabled,
            hasApiKey: !!web3Config?.ai?.geminiApiKey
        });
        // Check if AI features are enabled
        const aiEnabled = web3Config?.ai?.enabled;
        if (!aiEnabled) {
            console.warn('AIService: AI features disabled in configuration');
            this.isEnabled = false;
            this.safeEmit('service:error', {
                service: 'AIService',
                context: 'initialization',
                error: 'AI features disabled in configuration. Set ENABLE_AI_FEATURES=true in .env'
            });
            return;
        }
        // Get API key with improved fallback logic
        let apiKey = this.getApiKey(web3Config);
        if (!apiKey) {
            const errorMsg = 'No valid Gemini API key found. Check your .env file or appsettings.secrets.ts';
            console.error('AIService:', errorMsg);
            this.isEnabled = false;
            this.safeEmit('service:error', {
                service: 'AIService',
                context: 'initialization',
                error: errorMsg
            });
            return;
        }
        // Test API key validity before proceeding
        if (!this.isValidApiKey(apiKey)) {
            const errorMsg = 'Invalid Gemini API key format. Please check your API key.';
            console.error('AIService:', errorMsg);
            this.isEnabled = false;
            this.safeEmit('service:error', {
                service: 'AIService',
                context: 'initialization',
                error: errorMsg
            });
            return;
        }
        // Dynamically import Google Generative AI only when needed
        try {
            console.log('AIService: Loading Google Generative AI library...');
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            console.log('AIService: Initializing Gemini client...');
            this.genAI = new GoogleGenerativeAI(apiKey);
            this.model = this.genAI.getGenerativeModel({
                model: 'gemini-1.5-flash-001',
                generationConfig: {
                    temperature: 0.7,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 1024,
                },
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_HARASSMENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                    {
                        category: 'HARM_CATEGORY_HATE_SPEECH',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                ],
            });
            // Test the connection with a simple request
            await this.testConnection();
            this.isEnabled = true;
            this.isInitialized = true;
            console.log('AIService: Google Generative AI initialized successfully');
            // Set up event listeners after successful initialization
            this.setupEventListeners();
            this.safeEmit('service:initialized', { service: 'AIService', success: true });
        }
        catch (error) {
            const errorMsg = `Failed to initialize Google Generative AI: ${error.message}`;
            console.error('AIService:', errorMsg, error);
            this.isEnabled = false;
            this.isInitialized = false;
            this.safeEmit('service:error', {
                service: 'AIService',
                context: 'initialization',
                error: errorMsg
            });
        }
    }
    /**
     * Set up event listeners for AI service
     */
    setupEventListeners() {
        console.log('AIService: Setting up event listeners');
        // Wire EventBus listeners for AI triggers
        // Listen for route requests
        this.subscribe('ai:routeRequested', async (data) => {
            console.log('AIService: Received ai:routeRequested event:', data);
            try {
                // Note: Dynamic event emission is not supported
                // if (data.requestId) {
                //   this.safeEmit(`${data.requestId}:progress`, { progress: 10 });
                // }
                // Initialize if needed
                if (!this.isInitialized) {
                    await this.init();
                }
                // Note: Dynamic event emission is not supported
                // if (data.requestId) {
                //   this.safeEmit(`${data.requestId}:progress`, { progress: 20 });
                // }
                const goals = {};
                if (Array.isArray(data?.goals) && data.goals.length) {
                    // If goals provided as strings, map a couple of simple flags
                    goals.exploration = data.goals.includes('exploration');
                    goals.training = data.goals.includes('training');
                }
                if (typeof data?.distance === 'number')
                    goals.distance = data.distance;
                if (typeof data?.difficulty === 'number')
                    goals.difficulty = data.difficulty;
                // Add quick prompt context if available
                if (data?.quickPromptType && data?.contextPrompt) {
                    goals.quickPromptType = data.quickPromptType;
                    goals.contextPrompt = data.contextPrompt;
                    goals.timeOfDay = data.timeOfDay;
                    goals.timeConstraint = data.timeConstraint;
                    goals.focus = data.focus;
                    goals.priority = data.priority;
                }
                // Get current location from multiple sources
                let currentLocation = { lat: 40.7128, lng: -74.0060 }; // Default to NYC
                // Try to get from window.RunRealm first
                if (window?.RunRealm?.currentLocation) {
                    currentLocation = window.RunRealm.currentLocation;
                }
                // Try to get from LocationService
                else if (window?.RunRealm?.locationService?.getCurrentLocation) {
                    try {
                        const locationInfo = await window.RunRealm.locationService.getCurrentLocation();
                        if (locationInfo && locationInfo.lat && locationInfo.lng) {
                            currentLocation = { lat: locationInfo.lat, lng: locationInfo.lng };
                        }
                    }
                    catch (error) {
                        console.warn('AIService: Failed to get current location, using default');
                    }
                }
                // Try to get from map center as fallback
                else if (window?.RunRealm?.map?.getCenter) {
                    try {
                        const center = window.RunRealm.map.getCenter();
                        if (center && center.lat && center.lng) {
                            currentLocation = { lat: center.lat, lng: center.lng };
                        }
                    }
                    catch (error) {
                        console.warn('AIService: Failed to get map center, using default');
                    }
                }
                console.log('AIService: Using location for route generation:', currentLocation);
                // Note: Dynamic event emission is not supported
                // if (data.requestId) {
                //   this.safeEmit(`${data.requestId}:progress`, { progress: 40 });
                // }
                // If AI disabled or init failed, synthesize a fallback route and emit failure for UI
                if (!this.isAIEnabled()) {
                    const fallback = await this.parseRouteOptimization(JSON.stringify({}), currentLocation, goals);
                    const waypoints = fallback.suggestedRoute.coordinates.map(([lng, lat]) => ({ lat, lng }));
                    if (waypoints.length < 2) {
                        this.safeEmit('ai:routeFailed', { message: 'AI is disabled and no fallback route available.' });
                        return;
                    }
                    this.safeEmit('ai:routeReady', {
                        route: fallback.suggestedRoute.coordinates || [],
                        distance: fallback.suggestedRoute.distance,
                        duration: Math.round((fallback.suggestedRoute.distance || 0) * 5),
                        waypoints,
                        totalDistance: fallback.suggestedRoute.distance,
                        difficulty: fallback.suggestedRoute.difficulty,
                        estimatedTime: Math.round((fallback.suggestedRoute.distance || 0) * 5) // naive 5s/m
                    });
                    return;
                }
                // Note: Dynamic event emission is not supported
                // if (data.requestId) {
                //   this.safeEmit(`${data.requestId}:progress`, { progress: 50 });
                // }
                const optimization = await this.suggestRoute(currentLocation, goals, []);
                // Note: Dynamic event emission is not supported
                // if (data.requestId) {
                //   this.safeEmit(`${data.requestId}:progress`, { progress: 80 });
                // }
                const coords = optimization.suggestedRoute.coordinates || [];
                const waypoints = coords.map(([lng, lat]) => ({ lat, lng }));
                if (waypoints.length < 2) {
                    this.safeEmit('ai:routeFailed', { message: 'Not enough route data returned by AI.' });
                    return;
                }
                // Fix coordinate format: AI returns [lat, lng] but Mapbox needs [lng, lat]
                const mapboxCoordinates = optimization.suggestedRoute.coordinates.map(coord => {
                    if (Array.isArray(coord) && coord.length === 2) {
                        // Swap from [lat, lng] to [lng, lat]
                        return [coord[1], coord[0]];
                    }
                    return coord;
                });
                // Emit route visualization event for map integration
                this.safeEmit('ai:routeVisualize', {
                    coordinates: mapboxCoordinates,
                    type: 'ai-suggested',
                    style: {
                        color: '#00ff88',
                        width: 4,
                        opacity: 0.8,
                        dashArray: [5, 5]
                    },
                    metadata: {
                        distance: optimization.suggestedRoute.distance,
                        difficulty: optimization.suggestedRoute.difficulty,
                        confidence: optimization.confidence
                    }
                });
                // Emit waypoint visualization event if waypoints exist
                if (optimization.suggestedRoute.waypoints && optimization.suggestedRoute.waypoints.length > 0) {
                    // Clean waypoint data to avoid circular references and fix coordinates
                    const cleanWaypoints = optimization.suggestedRoute.waypoints.map((wp) => {
                        // Fix coordinate format for waypoints too
                        let coordinates = wp.coordinates;
                        if (Array.isArray(coordinates) && coordinates.length === 2) {
                            // Swap from [lat, lng] to [lng, lat]
                            coordinates = [coordinates[1], coordinates[0]];
                        }
                        return {
                            coordinates: coordinates,
                            type: wp.type,
                            name: wp.name,
                            description: wp.description,
                            territoryValue: wp.territoryValue,
                            estimatedReward: wp.estimatedReward,
                            claimPriority: wp.claimPriority
                        };
                    });
                    this.safeEmit('ai:waypointsVisualize', {
                        waypoints: cleanWaypoints,
                        routeMetadata: {
                            distance: optimization.suggestedRoute.distance,
                            difficulty: optimization.suggestedRoute.difficulty,
                            totalEstimatedRewards: optimization.territories.claimable + optimization.territories.strategic
                        }
                    });
                }
                // Note: Dynamic event emission is not supported
                // if (data.requestId) {
                //   this.safeEmit(`${data.requestId}:progress`, { progress: 100 });
                //   this.safeEmit(`${data.requestId}:success`, { requestId: data.requestId });
                // }
            }
            catch (err) {
                console.error('AI route request failed', err);
                this.safeEmit('ai:routeFailed', {
                    message: 'Failed to generate route. Please try again.'
                });
            }
        });
        // Listen for ghost runner requests
        this.subscribe('ai:ghostRunnerRequested', async (data) => {
            console.log('AIService: Received ai:ghostRunnerRequested event:', data);
            try {
                console.log('AIService: Ghost runner request received:', data);
                if (!this.isInitialized) {
                    console.log('AIService: Initializing for ghost runner request...');
                    await this.init();
                }
                const difficulty = typeof data?.difficulty === 'number' ? data.difficulty : 50;
                console.log('AIService: Generating ghost runner with difficulty:', difficulty);
                const ghost = await this.generateGhostRunner(difficulty);
                console.log('AIService: Ghost runner generated successfully:', ghost.name);
                this.safeEmit('ai:ghostRunnerGenerated', {
                    runner: ghost,
                    difficulty: ghost.difficulty,
                    success: true
                });
                // Note: Dynamic event emission is not supported
                // if (data.requestId) {
                //   this.safeEmit(`${data.requestId}:success`, { requestId: data.requestId });
                // }
            }
            catch (err) {
                const errorMsg = `Ghost runner generation failed: ${err.message || err}`;
                console.error('AIService:', errorMsg, err);
                // Emit both specific error and general service error
                this.safeEmit('ai:ghostRunnerFailed', {
                    message: errorMsg
                });
                this.safeEmit('service:error', {
                    service: 'AIService',
                    context: 'ghostRunner',
                    error: errorMsg
                });
            }
        });
    }
    async onInitialize() {
        // This method is called by the base service initialize() method
        // Event listeners are now set up in setupEventListeners() after successful init
        console.log('AIService: onInitialize() called - event listeners will be set up after init()');
    }
    /**
     * Get API key with improved fallback logic
     */
    getApiKey(web3Config) {
        // 1. Check runtime-injected tokens (highest priority for production)
        if (web3Config?.ai?.geminiApiKey) {
            console.log('AIService: Using runtime-injected Gemini API key');
            return web3Config.ai.geminiApiKey;
        }
        // 2. Check localStorage (for development)
        if (typeof localStorage !== 'undefined') {
            const localKey = localStorage.getItem('runrealm_google_gemini_api_key');
            if (localKey) {
                console.log('AIService: Using localStorage Gemini API key');
                return localKey;
            }
        }
        // 3. Try to load from secrets file (development fallback)
        try {
            // This will be handled by webpack at build time
            const secrets = require('../appsettings.secrets');
            if (secrets?.GOOGLE_GEMINI_API_KEY) {
                console.log('AIService: Using secrets file Gemini API key');
                return secrets.GOOGLE_GEMINI_API_KEY;
            }
        }
        catch (error) {
            // This is normal in production - secrets file doesn't exist
            console.log('AIService: Could not load from secrets file (this is normal in production)');
        }
        return '';
    }
    /**
     * Validate API key format
     */
    isValidApiKey(apiKey) {
        // Gemini API keys start with 'AIza' and are typically 39 characters long
        return apiKey.startsWith('AIza') && apiKey.length >= 35;
    }
    /**
     * Test connection to Gemini API
     */
    async testConnection() {
        if (!this.model) {
            throw new Error('Model not initialized');
        }
        try {
            console.log('AIService: Testing connection to Gemini API...');
            const result = await this.model.generateContent('Hello');
            const response = await result.response;
            const text = response.text();
            console.log('AIService: Connection test successful, response length:', text.length);
        }
        catch (error) {
            console.error('AIService: Connection test failed:', error);
            throw new Error(`API connection test failed: ${error.message}`);
        }
    }
    ensureInitialized() {
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
    async suggestRoute(currentLocation, goals, existingTerritories) {
        console.log('AIService: Generating route suggestion for location:', currentLocation);
        // Always try to initialize if not already done
        if (!this.isInitialized) {
            console.log('AIService: Not initialized, attempting to initialize...');
            await this.init();
        }
        if (!this.isEnabled) {
            const errorMsg = 'AI service not enabled - check configuration';
            console.error('AIService:', errorMsg);
            this.safeEmit('ai:routeFailed', { message: errorMsg });
            throw new Error(errorMsg);
        }
        const prompt = this.buildRoutePrompt(currentLocation, goals, existingTerritories);
        console.log('AIService: Route prompt prepared');
        try {
            const optimization = await this.retry(async () => {
                console.log('AIService: Sending request to Gemini for route suggestion...');
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                console.log('AIService: Received response from Gemini:', text.substring(0, 100) + '...');
                const optimization = await this.parseRouteOptimization(text, currentLocation, goals);
                console.log('AIService: Route optimization parsed successfully');
                return optimization;
            }, 3, 1000, 'route suggestion');
            this.safeEmit('ai:routeSuggested', {
                route: optimization.suggestedRoute,
                confidence: optimization.confidence,
                reasoning: optimization.suggestedRoute.reasoning
            });
            console.log('AIService: Route suggestion completed successfully');
            return optimization;
        }
        catch (error) {
            const errorMsg = `Route suggestion failed: ${error.message}`;
            console.error('AIService:', errorMsg, error);
            this.safeEmit('ai:routeFailed', { message: errorMsg });
            throw error;
        }
    }
    /**
     * Generate ghost runner for competition
     */
    async generateGhostRunner(difficulty, userStats) {
        console.log(`AIService: Generating ghost runner with difficulty ${difficulty}`);
        // Always try to initialize if not already done
        if (!this.isInitialized) {
            console.log('AIService: Not initialized, attempting to initialize...');
            await this.init();
        }
        if (!this.isEnabled) {
            console.log('AIService: AI disabled, using fallback ghost runner');
            return this.createFallbackGhostRunner(difficulty);
        }
        const prompt = this.buildGhostRunnerPrompt(difficulty, userStats);
        console.log('AIService: Ghost runner prompt prepared');
        try {
            const ghostRunner = await this.retry(async () => {
                console.log('AIService: Sending request to Gemini for ghost runner...');
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const text = response.text();
                console.log('AIService: Received response from Gemini:', text.substring(0, 100) + '...');
                const ghostRunner = this.parseGhostRunner(text, difficulty);
                console.log('AIService: Ghost runner parsed successfully:', ghostRunner.name);
                return ghostRunner;
            }, 3, 1000, 'ghost runner generation');
            this.safeEmit('ai:ghostRunnerGenerated', {
                runner: ghostRunner,
                difficulty
            });
            console.log('AIService: Ghost runner generation completed successfully');
            return ghostRunner;
        }
        catch (error) {
            console.error('AIService: Ghost runner generation failed, using fallback:', error);
            const fallbackRunner = this.createFallbackGhostRunner(difficulty);
            this.safeEmit('ai:ghostRunnerGenerated', {
                runner: fallbackRunner,
                difficulty,
                fallback: true
            });
            return fallbackRunner;
        }
    }
    /**
     * Get enhanced user context for AI analysis
     */
    async getUserContext() {
        try {
            const web3Service = (await import('../services/web3-service')).Web3Service.getInstance();
            // This import violates architectural principles - should use dependency injection
            // const territoryDashboard = (await import('../components/territory-dashboard')).default.getInstance();
            const currentWallet = web3Service.getCurrentWallet();
            // Return mock data for now due to architectural violation
            const territories = [];
            const playerStats = { level: 1, experience: 0, territoriesOwned: 0 };
            const walletHistory = {
                address: currentWallet?.address,
                chainId: currentWallet?.chainId,
                networkName: currentWallet?.networkName,
                balance: currentWallet?.balance,
                connectedAt: new Date().toISOString()
            };
            return {
                walletHistory,
                territories,
                playerStats
            };
        }
        catch (error) {
            console.warn('Failed to get user context:', error);
            return {
                walletHistory: null,
                territories: [],
                playerStats: null
            };
        }
    }
    /**
     * Analyze territory strategic value with enhanced context
     */
    async analyzeTerritory(geohash, territoryData, contextData) {
        this.ensureInitialized();
        if (!this.isEnabled) {
            return this.createFallbackAnalysis(territoryData);
        }
        // Get enhanced user context
        const userContext = await this.getUserContext();
        const prompt = this.buildTerritoryAnalysisPrompt(territoryData, contextData, userContext);
        return this.retry(async () => {
            const result = await this.model.generateContent(prompt);
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
    async getRunningCoaching(currentRun, userGoals, weatherConditions) {
        this.ensureInitialized();
        if (!this.isEnabled) {
            return this.createFallbackCoaching(currentRun, userGoals);
        }
        const prompt = this.buildCoachingPrompt(currentRun, userGoals, weatherConditions);
        return this.retry(async () => {
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            return this.parseCoachingAdvice(text, currentRun);
        }, 3, 1000, 'coaching advice');
    }
    // Prompt builders
    buildRoutePrompt(location, goals, existingTerritories) {
        const territoryContext = this.buildTerritoryContext(existingTerritories);
        const quickPromptContext = this.buildQuickPromptContext(goals);
        return `
You are an AI running coach and territory strategist for RunRealm, a fitness GameFi app.
Generate an optimal running route with strategic waypoints that helps the user claim valuable territory NFTs.

Current location: ${location.lat}, ${location.lng}
Goals: ${JSON.stringify(goals)}
${territoryContext}
${quickPromptContext}

Consider:
- Route safety and attractiveness for running
- Strategic territory value (landmarks, uniqueness, parks, intersections)
- Distance and difficulty preferences
- Avoiding oversaturated areas with existing territories
- Connecting valuable points of interest
- Creating 4-6 strategic waypoints for territory claiming
- Time constraints and user context from quick prompt

IMPORTANT: Return coordinates in [latitude, longitude] format (NOT [lng, lat]).

Respond with JSON format:
{
  "suggestedRoute": {
    "coordinates": [[lat, lng], [lat, lng], ...],
    "distance": number_in_meters,
    "difficulty": number_0_to_100,
    "reasoning": "explanation of route strategy tailored to the specific scenario",
    "waypoints": [
      {
        "coordinates": [lat, lng],
        "type": "territory_claim|rest_stop|landmark|strategic",
        "name": "descriptive_waypoint_name",
        "description": "why_this_location_is_strategically_valuable",
        "territoryValue": number_0_to_100,
        "estimatedReward": estimated_realm_tokens,
        "claimPriority": "high|medium|low"
      }
    ]
  },
  "territories": {
    "claimable": estimated_new_territories,
    "strategic": strategic_value_score,
    "totalEstimatedRewards": total_realm_tokens_from_route
  },
  "confidence": confidence_0_to_100
}

Focus on creating engaging, gamified suggestions with strategic waypoints that make running feel like a territory conquest adventure.
    `.trim();
    }
    /**
     * Build quick prompt context for enhanced AI responses
     */
    buildQuickPromptContext(goals) {
        if (!goals.quickPromptType || !goals.contextPrompt) {
            return '';
        }
        let context = `\nQuick Prompt Context: ${goals.contextPrompt}`;
        if (goals.timeOfDay) {
            context += `\nTime of Day: ${goals.timeOfDay} - optimize for lighting and safety`;
        }
        if (goals.timeConstraint) {
            context += `\nTime Constraint: ${goals.timeConstraint} - prioritize efficiency`;
        }
        if (goals.focus) {
            context += `\nFocus: ${goals.focus} - tailor route accordingly`;
        }
        if (goals.priority) {
            context += `\nPriority: ${goals.priority} - emphasize this aspect`;
        }
        return context;
    }
    /**
     * Build territory context for AI prompts
     */
    buildTerritoryContext(existingTerritories) {
        if (!existingTerritories || existingTerritories.length === 0) {
            return 'Territory Context: This is a fresh area with no existing territories. Focus on identifying high-value claiming opportunities at landmarks, parks, and strategic intersections.';
        }
        return `Territory Context: There are ${existingTerritories.length} existing territories in this area. Avoid these claimed zones and focus on unclaimed strategic locations with high territory value.`;
    }
    buildGhostRunnerPrompt(difficulty, userStats) {
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
    buildTerritoryAnalysisPrompt(territoryData, contextData, userContext) {
        const userContextStr = userContext ? `
User Context:
- Wallet: ${userContext.walletHistory?.address ? `${userContext.walletHistory.address.substring(0, 8)}...` : 'Not connected'}
- Network: ${userContext.walletHistory?.networkName || 'Unknown'}
- Territories Owned: ${userContext.territories?.length || 0}
- Player Level: ${userContext.playerStats?.level || 1}
- Total Distance: ${userContext.playerStats?.totalDistance || 0}m
- REALM Balance: ${userContext.playerStats?.realmBalance || 0}
- Cross-Chain Activity: ${userContext.territories?.filter((t) => t.crossChainHistory?.length > 0).length || 0} territories with cross-chain history` : '';
        return `
Analyze this territory for strategic value in RunRealm GameFi app.
Territory data: ${JSON.stringify(territoryData)}
Context: ${contextData ? JSON.stringify(contextData) : 'Limited context'}${userContextStr}

Evaluate based on:
- Rarity and uniqueness of the route
- Strategic gaming value considering user's current portfolio
- Competition likelihood
- Cross-chain potential and ZetaChain integration
- Long-term value potential
- Risk factors
- Synergy with user's existing territories

Respond with JSON format:
{
  "value": strategic_value_0_to_100,
  "rarity": rarity_score_0_to_100,
  "competition": expected_competition_0_to_100,
  "recommendations": ["actionable advice considering user's portfolio"],
  "threats": ["potential risks"],
  "opportunities": ["potential advantages including cross-chain benefits"]
}

Provide GameFi-focused analysis that helps players make strategic decisions based on their current position and ZetaChain's cross-chain capabilities.
    `.trim();
    }
    buildCoachingPrompt(currentRun, goals, weather) {
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
    async parseRouteOptimization(text, location, goals) {
        try {
            // Try to extract JSON from the response
            let jsonText = text.trim();
            // Look for JSON block markers
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[1] || jsonMatch[0];
            }
            // Clean up common AI response artifacts
            jsonText = jsonText
                .replace(/^[^{]*/, '') // Remove text before first {
                .replace(/[^}]*$/, '') // Remove text after last }
                .trim();
            const parsed = JSON.parse(jsonText);
            // Validate the parsed response has required structure
            if (!parsed.suggestedRoute || !parsed.suggestedRoute.coordinates) {
                throw new Error('Invalid route structure');
            }
            // Ensure coordinates are valid
            if (!Array.isArray(parsed.suggestedRoute.coordinates) || parsed.suggestedRoute.coordinates.length < 2) {
                console.warn('AIService: Invalid coordinates in response, generating fallback');
                parsed.suggestedRoute.coordinates = await this.generateFallbackRoute(location, goals.distance || 2000);
            }
            console.log('AIService: Successfully parsed route optimization:', {
                coordinateCount: parsed.suggestedRoute.coordinates.length,
                distance: parsed.suggestedRoute.distance,
                confidence: parsed.confidence
            });
            return parsed;
        }
        catch (error) {
            console.warn('AIService: Failed to parse route optimization, using fallback:', error.message);
            // Fallback if JSON parsing fails
            return {
                suggestedRoute: {
                    coordinates: await this.generateFallbackRoute(location, goals.distance || 2000),
                    distance: goals.distance || 2000,
                    difficulty: goals.difficulty || 50,
                    reasoning: 'AI-generated fallback route optimized for territory claiming'
                },
                territories: {
                    claimable: Math.floor(Math.random() * 3) + 1,
                    strategic: Math.floor(Math.random() * 50) + 25
                },
                confidence: 65 // Lower confidence for fallback
            };
        }
    }
    parseGhostRunner(text, difficulty) {
        try {
            // Try to extract JSON from the response
            let jsonText = text.trim();
            // Look for JSON block markers
            const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonText = jsonMatch[1] || jsonMatch[0];
            }
            // Clean up common AI response artifacts
            jsonText = jsonText
                .replace(/^[^{]*/, '') // Remove text before first {
                .replace(/[^}]*$/, '') // Remove text after last }
                .trim();
            const parsed = JSON.parse(jsonText);
            // Validate required fields
            if (!parsed.name || !parsed.id) {
                throw new Error('Missing required ghost runner fields');
            }
            // Ensure all required fields are present with defaults
            const ghostRunner = {
                id: parsed.id || `ghost_${Date.now()}_${difficulty}`,
                name: parsed.name || 'Mystery Runner',
                difficulty: parsed.difficulty || difficulty,
                avatar: parsed.avatar || 'Athletic runner with standard gear',
                pace: parsed.pace || this.calculatePaceFromDifficulty(difficulty),
                specialAbility: parsed.specialAbility || 'Steady Pace',
                backstory: parsed.backstory || 'A determined runner ready for competition.'
            };
            console.log('AIService: Successfully parsed ghost runner:', ghostRunner.name);
            return ghostRunner;
        }
        catch (error) {
            console.warn('AIService: Failed to parse ghost runner, using fallback:', error.message);
            return this.createFallbackGhostRunner(difficulty);
        }
    }
    parseTerritoryAnalysis(text, territoryData) {
        try {
            return JSON.parse(text);
        }
        catch {
            return this.createFallbackAnalysis(territoryData);
        }
    }
    parseCoachingAdvice(text, currentRun) {
        try {
            return JSON.parse(text);
        }
        catch {
            return this.createFallbackCoaching(currentRun, {});
        }
    }
    // Fallback creators
    createFallbackGhostRunner(difficulty) {
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
    createFallbackAnalysis(territoryData) {
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
    createFallbackCoaching(currentRun, goals) {
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
    async generateFallbackRoute(center, distance) {
        // Try to get road-following route via Mapbox Directions
        try {
            const waypoints = this.generateCircularWaypoints(center, distance);
            const roadRoute = await this.getMapboxRoute(waypoints);
            if (roadRoute && roadRoute.length > 2) {
                return roadRoute;
            }
        }
        catch (error) {
            console.warn('Failed to get road route, using fallback:', error);
        }
        // Fallback to simple circular route
        const points = [];
        const radius = distance / (2 * Math.PI * 111000);
        const numPoints = 8;
        for (let i = 0; i <= numPoints; i++) {
            const angle = (i / numPoints) * 2 * Math.PI;
            const lat = center.lat + radius * Math.cos(angle);
            const lng = center.lng + radius * Math.sin(angle);
            points.push([lng, lat]);
        }
        return points;
    }
    generateCircularWaypoints(center, distance) {
        const radius = distance / (2 * Math.PI * 111000);
        const waypoints = [];
        // Generate 4 waypoints for a roughly circular route
        for (let i = 0; i < 4; i++) {
            const angle = (i / 4) * 2 * Math.PI;
            const lat = center.lat + radius * Math.cos(angle);
            const lng = center.lng + radius * Math.sin(angle);
            waypoints.push([lng, lat]);
        }
        waypoints.push(waypoints[0]); // Close the loop
        return waypoints;
    }
    async getMapboxRoute(waypoints) {
        const config = this.config.getConfig();
        const token = config.mapbox?.accessToken;
        if (!token) {
            throw new Error('No Mapbox token available');
        }
        const coordinates = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';');
        const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${coordinates}?geometries=geojson&access_token=${token}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Mapbox API error: ${response.status}`);
        }
        const data = await response.json();
        if (data.routes && data.routes[0] && data.routes[0].geometry) {
            return data.routes[0].geometry.coordinates;
        }
        throw new Error('No route found');
    }
    calculatePaceFromDifficulty(difficulty) {
        // Convert difficulty to realistic pace (seconds per meter)
        // Lower difficulty = slower pace, higher difficulty = faster pace
        const basePace = 5.0; // 5 seconds per meter baseline
        const adjustment = (difficulty - 50) * 0.02; // ±1 second per meter range
        return Math.max(3.0, Math.min(7.0, basePace - adjustment));
    }
    /**
     * Check if AI features are enabled
     */
    isAIEnabled() {
        return this.isEnabled && this.isInitialized;
    }
    /**
     * Get AI service status
     */
    getStatus() {
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
    async refreshConfig() {
        // Clean up existing resources
        this.cleanup();
        // Re-initialize with new configuration
        await this.init();
    }
}
//# sourceMappingURL=ai-service.js.map