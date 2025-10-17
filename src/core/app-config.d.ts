export interface StravaConfig {
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
}
export interface ExternalFitnessConfig {
    strava?: StravaConfig;
    garmin?: {
        enabled: boolean;
    };
    appleHealth?: {
        enabled: boolean;
    };
    googleFit?: {
        enabled: boolean;
    };
}
export interface Web3Config {
    enabled: boolean;
    zetachain: {
        rpcUrl: string;
        chainId: number;
        contractAddresses: {
            territoryNFT?: string;
            realmToken?: string;
            territoryManager?: string;
        };
    };
    ethereum: {
        rpcUrl: string;
        chainId: number;
    };
    polygon: {
        rpcUrl: string;
        chainId: number;
    };
    wallet: {
        autoConnect: boolean;
        supportedWallets: string[];
    };
    ai: {
        enabled: boolean;
        geminiApiKey: string;
    };
}
export interface AppConfig {
    mapbox: {
        accessToken: string;
        defaultStyle: string;
        defaultZoom: number;
    };
    ui: {
        isMobile: boolean;
        enableAnimations: boolean;
        enableHaptics: boolean;
    };
    features: {
        enableOnboarding: boolean;
        enableToasts: boolean;
        enableKeyboardShortcuts: boolean;
        enableWeb3: boolean;
        enableFitness: boolean;
    };
    web3?: Web3Config;
    fitness?: ExternalFitnessConfig;
}
export declare class ConfigService {
    private static instance;
    private config;
    private runtimeTokensLoaded;
    private eventBus;
    private constructor();
    static getInstance(): ConfigService;
    initializeRuntimeTokens(): Promise<void>;
    private refreshConfig;
    private loadConfig;
    private getEnvVar;
    private getSecureEnvVar;
    private fetchRuntimeTokens;
    private getMapboxToken;
    private getGeminiApiKey;
    private detectMobile;
    private prefersReducedMotion;
    /**
     * 🔒 PRODUCTION SECURITY: Fetch tokens from secure server endpoint
     * This method should be implemented to call your secure token service
     * Default implementation uses Express.js server endpoint
     */
    private getTokenFromSecureEndpoint;
    getConfig(): AppConfig;
    updateConfig(updates: Partial<AppConfig>): void;
    private loadWeb3Config;
    private loadFitnessConfig;
    private loadStravaConfig;
    isFitnessEnabled(): boolean;
    getFitnessConfig(): ExternalFitnessConfig | undefined;
    getStravaConfig(): StravaConfig | undefined;
    updateStravaTokens(accessToken: string, refreshToken: string, expiresAt: number): void;
    clearStravaTokens(): void;
    isWeb3Enabled(): boolean;
    getWeb3Config(): Web3Config | undefined;
    updateWeb3Config(updates: Partial<Web3Config>): void;
}
