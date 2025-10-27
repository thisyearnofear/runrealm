// Centralized application configuration
import { EventBus } from './event-bus';
export class ConfigService {
    constructor() {
        this.runtimeTokensLoaded = false;
        this.eventBus = EventBus.getInstance();
        // Initialize config asynchronously
        this.config = {};
        this.initializeConfig();
    }
    
    async initializeConfig() {
        this.config = await this.loadConfig();
    }
    static getInstance() {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        return ConfigService.instance;
    }
    async initializeRuntimeTokens() {
        try {
            console.debug('Fetching runtime tokens...');
            const runtimeTokens = await this.fetchRuntimeTokens();
            console.debug('Runtime tokens received:', Object.keys(runtimeTokens));
            // Store tokens in localStorage for immediate use
            if (runtimeTokens.mapbox) {
                localStorage.setItem('runrealm_mapbox_access_token', runtimeTokens.mapbox);
                // Update the config
                this.config.mapbox.accessToken = runtimeTokens.mapbox;
                console.debug('Mapbox token updated in config');
            }
            else {
                console.debug('No Mapbox token received from runtime endpoint');
            }
            if (runtimeTokens.gemini && this.config.web3?.ai) {
                localStorage.setItem('runrealm_google_gemini_api_key', runtimeTokens.gemini);
                // Update the config
                this.config.web3.ai.geminiApiKey = runtimeTokens.gemini;
                console.debug('Gemini API key updated in config');
            }
            else {
                console.debug('No Gemini API key received from runtime endpoint');
            }
            // Handle Strava configuration
            if (runtimeTokens.strava && runtimeTokens.strava.clientId) {
                localStorage.setItem('runrealm_strava_client_id', runtimeTokens.strava.clientId);
                localStorage.setItem('runrealm_strava_redirect_uri', runtimeTokens.strava.redirectUri);
                if (this.config.fitness?.strava) {
                    this.config.fitness.strava.clientId = runtimeTokens.strava.clientId;
                    this.config.fitness.strava.redirectUri = runtimeTokens.strava.redirectUri;
                }
                console.debug('Strava configuration updated in config');
            }
            else {
                console.debug('No Strava configuration received from runtime endpoint');
            }
            this.runtimeTokensLoaded = true;
            // Refresh config with new tokens
            this.config = await this.loadConfig();
            // Emit event to notify services of config update
            this.eventBus.emit('config:updated', {});
            // Log success without exposing token values
            const tokenCount = Object.keys(runtimeTokens).length;
            console.debug(`Runtime tokens initialized successfully (${tokenCount} tokens loaded)`);
        }
        catch (error) {
            console.error('Runtime token initialization failed:', error);
            this.runtimeTokensLoaded = true; // Mark as attempted
        }
    }
    async refreshConfig() {
        // Reload config with updated tokens
        this.config = await this.loadConfig();
    }
    async loadConfig() {
        const isMobile = this.detectMobile();
        return {
            mapbox: {
                accessToken: await this.getMapboxToken(),
                defaultStyle: "streets-v11",
                defaultZoom: 13,
            },
            ui: {
                isMobile,
                enableAnimations: !this.prefersReducedMotion(),
                enableHaptics: isMobile && "vibrate" in navigator,
            },
            features: {
                enableOnboarding: !localStorage.getItem("runrealm_onboarding_complete"),
                enableToasts: true,
                enableKeyboardShortcuts: !isMobile,
                enableWeb3: this.getEnvVar("ENABLE_WEB3") === "true" ||
                    localStorage.getItem("runrealm_web3_enabled") === "true",
                enableFitness: this.getEnvVar("ENABLE_FITNESS") !== "false" &&
                    localStorage.getItem("runrealm_fitness_enabled") !== "false",
            },
            web3: await this.loadWeb3Config(),
            fitness: this.loadFitnessConfig(),
        };
    }
    getEnvVar(name) {
        // Use webpack DefinePlugin injected environment variables (public only)
        try {
            const value = typeof __ENV__ !== 'undefined' ? __ENV__[name] : undefined;
            return value || localStorage.getItem(`runrealm_${name.toLowerCase()}`);
        }
        catch (error) {
            console.warn(`Failed to access environment variable ${name}:`, error);
            return localStorage.getItem(`runrealm_${name.toLowerCase()}`);
        }
    }
    getSecureEnvVar(name) {
        // For sensitive variables, only check localStorage and secrets file
        // These are NOT exposed via webpack DefinePlugin for security
        return localStorage.getItem(`runrealm_${name.toLowerCase()}`);
    }
    async fetchRuntimeTokens() {
        try {
            // In production, use relative URL to leverage Netlify proxy
            // In development, use full API base URL
            const isProduction = process.env.NODE_ENV === 'production';
            const apiUrl = isProduction
                ? '/api/tokens' // Netlify will proxy this to Hetzner backend
                : `${(typeof __ENV__ !== 'undefined' && __ENV__.API_BASE_URL) || 'http://localhost:3000'}/api/tokens`;
            console.debug(`Fetching tokens from: ${apiUrl} (production: ${isProduction})`);
            const response = await fetch(apiUrl);
            console.debug(`Response status: ${response.status}, ok: ${response.ok}`);
            if (response.ok) {
                const tokens = await response.json();
                console.debug('Successfully fetched runtime tokens, keys:', Object.keys(tokens));
                return tokens;
            }
            else {
                const errorText = await response.text();
                console.error(`Token fetch failed with status: ${response.status}, body: ${errorText}`);
            }
        }
        catch (error) {
            console.error('Runtime token fetch failed:', error);
        }
        return {};
    }
    async getMapboxToken() {
        // 🔒 PRODUCTION SECURITY: Never expose real tokens in client-side code
        if (process.env.NODE_ENV === 'production') {
            console.warn('🔒 Production mode: Using secure token endpoint for Mapbox');
            // In production, tokens should come from secure server endpoints only
            const token = await this.getTokenFromSecureEndpoint('mapbox');
            return token || '';
        }
        // 🔒 DEVELOPMENT ONLY: Try localStorage for development tokens
        const devToken = localStorage.getItem('runrealm_dev_mapbox_token');
        if (devToken && devToken !== 'your-mapbox-token-here') {
            console.debug('🔒 Development mode: Using token from localStorage');
            return devToken;
        }
        // 🔒 SECURE: Check localStorage (user can set manually)
        const token = this.getSecureEnvVar("MAPBOX_ACCESS_TOKEN");
        if (!token) {
            // Only show warning if runtime tokens have been attempted
            if (this.runtimeTokensLoaded) {
                console.warn("🔒 Mapbox access token not found. For security, provide it via:\n" +
                    "1. src/appsettings.secrets.ts (recommended for development)\n" +
                    "2. localStorage.setItem('runrealm_mapbox_access_token', 'your_token')\n" +
                    "3. Runtime token endpoint (production)\n" +
                    "4. Environment variables are NO LONGER exposed to client for security");
            }
            return "";
        }
        return token;
    }
    async getGeminiApiKey() {
        // Try environment variables first (from .env via webpack DefinePlugin)
        const envKey = this.getEnvVar("GOOGLE_GEMINI_API_KEY");
        if (envKey) {
            return envKey;
        }
        // 🔒 PRODUCTION SECURITY: Never expose real API keys in client-side code
        if (process.env.NODE_ENV === 'production') {
            console.warn('🔒 Production mode: Using secure token endpoint for Gemini API');
            // In production, API keys should come from secure server endpoints only
            const apiKey = await this.getTokenFromSecureEndpoint('gemini');
            return apiKey || '';
        }
        // 🔒 DEVELOPMENT ONLY: Try localStorage for development API key
        const devKey = localStorage.getItem('runrealm_dev_gemini_key');
        if (devKey && devKey !== 'your-gemini-api-key-here') {
            console.debug('🔒 Development mode: Using API key from localStorage');
            return devKey;
        }
        // 🔒 SECURE: Check localStorage (user can set manually)
        const apiKey = this.getSecureEnvVar("GOOGLE_GEMINI_API_KEY");
        if (!apiKey) {
            // Only show warning if runtime tokens have been attempted
            if (this.runtimeTokensLoaded) {
                console.warn("🔒 Google Gemini API key not found. For security, provide it via:\n" +
                    "1. Environment variables (.env file)\n" +
                    "2. src/appsettings.secrets.ts (recommended for development)\n" +
                    "3. localStorage.setItem('runrealm_google_gemini_api_key', 'your_key')\n" +
                    "4. Runtime token endpoint (production)");
            }
            return "";
        }
        return apiKey;
    }
    detectMobile() {
        return (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768);
    }
    prefersReducedMotion() {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    /**
     * 🔒 PRODUCTION SECURITY: Fetch tokens from secure server endpoint
     * This method calls the secure token service endpoint
     */
    async getTokenFromSecureEndpoint(tokenType) {
        try {
            // In production, use relative URL to leverage Netlify proxy
            // In development, use full API base URL
            const isProduction = process.env.NODE_ENV === 'production';
            const apiUrl = isProduction
                ? '/api/tokens' // Netlify will proxy this to Hetzner backend
                : `${(typeof __ENV__ !== 'undefined' && __ENV__.API_BASE_URL) || 'http://localhost:3000'}/api/tokens`;
            
            console.debug(`🔒 Fetching ${tokenType} token from secure endpoint: ${apiUrl}`);
            
            const response = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
                // Don't send credentials to prevent CSRF issues
                credentials: 'omit'
            });
            
            if (!response.ok) {
                console.error(`🔒 Secure token endpoint failed with status: ${response.status}`);
                return null;
            }
            
            const tokens = await response.json();
            console.debug(`🔒 Successfully fetched tokens, available: ${Object.keys(tokens).join(', ')}`);
            
            // Return the requested token type
            return tokens[tokenType] || null;
        } catch (error) {
            console.error(`🔒 Failed to fetch ${tokenType} token from secure endpoint:`, error);
            return null;
        }
    }
    getConfig() {
        return { ...this.config }; // Return copy to prevent mutation
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    async loadWeb3Config() {
        // Check if Web3 is enabled via environment or feature flags
        const web3Enabled = this.getEnvVar("ENABLE_WEB3") === "true" ||
            localStorage.getItem("runrealm_web3_enabled") === "true";
        if (!web3Enabled) {
            return undefined;
        }
        return {
            enabled: true,
            zetachain: {
                rpcUrl: this.getEnvVar("ZETACHAIN_RPC_URL") ||
                    "https://zetachain-athens-evm.blockpi.network/v1/rpc/public",
                chainId: 7001, // Athens testnet
                contractAddresses: {
                    territoryNFT: this.getEnvVar("TERRITORY_NFT_ADDRESS"),
                    realmToken: this.getEnvVar("REALM_TOKEN_ADDRESS"),
                    territoryManager: this.getEnvVar("TERRITORY_MANAGER_ADDRESS"),
                },
            },
            ethereum: {
                rpcUrl: this.getEnvVar("ETHEREUM_RPC_URL") || "",
                chainId: 1,
            },
            polygon: {
                rpcUrl: this.getEnvVar("POLYGON_RPC_URL") || "https://polygon-rpc.com/",
                chainId: 137,
            },
            wallet: {
                autoConnect: this.getEnvVar("AUTO_CONNECT_WALLET") !== "false",
                supportedWallets: ["MetaMask", "WalletConnect", "Coinbase Wallet"],
            },
            ai: {
                enabled: this.getEnvVar("ENABLE_AI_FEATURES") === "true",
                geminiApiKey: await this.getGeminiApiKey(),
            },
        };
    }
    loadFitnessConfig() {
        const fitnessEnabled = this.config?.features?.enableFitness !== false;
        if (!fitnessEnabled) {
            return undefined;
        }
        return {
            strava: this.loadStravaConfig(),
            garmin: {
                enabled: false // Coming soon
            },
            appleHealth: {
                enabled: false // Coming soon
            },
            googleFit: {
                enabled: false // Coming soon
            }
        };
    }
    loadStravaConfig() {
        const clientId = this.getSecureEnvVar("STRAVA_CLIENT_ID") ||
            localStorage.getItem('runrealm_strava_client_id');
        const redirectUri = this.getSecureEnvVar("STRAVA_REDIRECT_URI") ||
            localStorage.getItem('runrealm_strava_redirect_uri') ||
            'http://localhost:3000/auth/strava/callback';
        if (!clientId) {
            console.debug('Strava client ID not found. Strava integration disabled.');
            return undefined;
        }
        return {
            clientId,
            redirectUri,
            accessToken: localStorage.getItem('runrealm_strava_access_token') || undefined,
            refreshToken: localStorage.getItem('runrealm_strava_refresh_token') || undefined,
            expiresAt: parseInt(localStorage.getItem('runrealm_strava_expires_at') || '0') || undefined
        };
    }
    isFitnessEnabled() {
        return this.config.fitness !== undefined;
    }
    getFitnessConfig() {
        return this.config.fitness;
    }
    getStravaConfig() {
        return this.config.fitness?.strava;
    }
    updateStravaTokens(accessToken, refreshToken, expiresAt) {
        // Store in localStorage
        localStorage.setItem('runrealm_strava_access_token', accessToken);
        localStorage.setItem('runrealm_strava_refresh_token', refreshToken);
        localStorage.setItem('runrealm_strava_expires_at', expiresAt.toString());
        // Update config
        if (this.config.fitness?.strava) {
            this.config.fitness.strava.accessToken = accessToken;
            this.config.fitness.strava.refreshToken = refreshToken;
            this.config.fitness.strava.expiresAt = expiresAt;
        }
        // Emit event
        this.eventBus.emit('fitness:tokens:updated', { source: 'strava' });
    }
    clearStravaTokens() {
        localStorage.removeItem('runrealm_strava_access_token');
        localStorage.removeItem('runrealm_strava_refresh_token');
        localStorage.removeItem('runrealm_strava_expires_at');
        if (this.config.fitness?.strava) {
            delete this.config.fitness.strava.accessToken;
            delete this.config.fitness.strava.refreshToken;
            delete this.config.fitness.strava.expiresAt;
        }
        this.eventBus.emit('fitness:tokens:cleared', { source: 'strava' });
    }
    isWeb3Enabled() {
        return this.config.web3?.enabled === true;
    }
    getWeb3Config() {
        return this.config.web3;
    }
    updateWeb3Config(updates) {
        if (this.config.web3) {
            this.config.web3 = { ...this.config.web3, ...updates };
        }
    }
}
