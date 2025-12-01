// Centralized application configuration

import { StorageAdapter } from '../utils/storage-adapter';
import { EventBus } from './event-bus';

// Global environment variables injected by webpack DefinePlugin
declare const __ENV__: {
  NODE_ENV?: string;
  API_BASE_URL?: string;
  ENABLE_WEB3?: string;
  ENABLE_AI_FEATURES?: string;
  ENABLE_CROSS_CHAIN?: string;
  ENABLE_FITNESS?: string;
  AUTO_CONNECT_WALLET?: string;
  ZETACHAIN_RPC_URL?: string;
  ETHEREUM_RPC_URL?: string;
  POLYGON_RPC_URL?: string;
  TERRITORY_NFT_ADDRESS?: string;
  REALM_TOKEN_ADDRESS?: string;
  TERRITORY_MANAGER_ADDRESS?: string;
  GOOGLE_GEMINI_API_KEY?: string;
};

export interface StravaConfig {
  clientId: string;
  clientSecret?: string; // Only on server-side
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

export class ConfigService {
  private static instance: ConfigService;
  private config: AppConfig;
  private runtimeTokensLoaded: boolean = false;
  private eventBus: EventBus;

  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async initializeRuntimeTokens(): Promise<void> {
    try {
      console.debug('Fetching runtime tokens...');
      const runtimeTokens = await this.fetchRuntimeTokens();
      console.debug('Runtime tokens received:', Object.keys(runtimeTokens));

      // Store tokens in storage for immediate use
      if (runtimeTokens.mapbox) {
        StorageAdapter.setItemSync('runrealm_mapbox_access_token', runtimeTokens.mapbox);
        // Update the config
        this.config.mapbox.accessToken = runtimeTokens.mapbox;
        console.debug('Mapbox token updated in config');
      } else {
        console.debug('No Mapbox token received from runtime endpoint');
      }

      if (runtimeTokens.gemini && this.config.web3?.ai) {
        StorageAdapter.setItemSync('runrealm_google_gemini_api_key', runtimeTokens.gemini);
        // Update the config
        this.config.web3.ai.geminiApiKey = runtimeTokens.gemini;
        console.debug('Gemini API key updated in config');
      } else {
        console.debug('No Gemini API key received from runtime endpoint');
      }

      // Handle Strava configuration
      if (runtimeTokens.strava?.clientId) {
        StorageAdapter.setItemSync('runrealm_strava_client_id', runtimeTokens.strava.clientId);
        StorageAdapter.setItemSync(
          'runrealm_strava_redirect_uri',
          runtimeTokens.strava.redirectUri
        );
        if (this.config.fitness?.strava) {
          this.config.fitness.strava.clientId = runtimeTokens.strava.clientId;
          this.config.fitness.strava.redirectUri = runtimeTokens.strava.redirectUri;
        }
        console.debug('Strava configuration updated in config');
      } else {
        console.debug('No Strava configuration received from runtime endpoint');
      }

      this.runtimeTokensLoaded = true;

      // Update config with new tokens
      if (runtimeTokens.mapbox) {
        this.config.mapbox.accessToken = runtimeTokens.mapbox;
        console.debug('Updated config with Mapbox token');
      }
      if (runtimeTokens.gemini && this.config.web3?.ai) {
        this.config.web3.ai.geminiApiKey = runtimeTokens.gemini;
        console.debug('Updated config with Gemini API key');
      }

      // Emit event to notify services of config update
      this.eventBus.emit('config:updated', {});

      // Log success without exposing token values
      const tokenCount = Object.keys(runtimeTokens).length;
      console.debug(`Runtime tokens initialized successfully (${tokenCount} tokens loaded)`);
    } catch (error) {
      console.error('Runtime token initialization failed:', error);
      this.runtimeTokensLoaded = true; // Mark as attempted
    }
  }

  private loadConfig(): AppConfig {
    const isMobile = this.detectMobile();

    return {
      mapbox: {
        accessToken: this.getMapboxToken(),
        defaultStyle: 'streets-v11',
        defaultZoom: 13,
      },
      ui: {
        isMobile,
        enableAnimations: !this.prefersReducedMotion(),
        enableHaptics: isMobile && typeof navigator !== 'undefined' && 'vibrate' in navigator,
      },
      features: {
        enableOnboarding: !StorageAdapter.getItemSync('runrealm_onboarding_complete'),
        enableToasts: true,
        enableKeyboardShortcuts: !isMobile,
        enableWeb3:
          this.getEnvVar('ENABLE_WEB3') === 'true' ||
          StorageAdapter.getItemSync('runrealm_web3_enabled') === 'true',
        enableFitness:
          this.getEnvVar('ENABLE_FITNESS') !== 'false' &&
          StorageAdapter.getItemSync('runrealm_fitness_enabled') !== 'false',
      },
      web3: this.loadWeb3Config(),
      fitness: this.loadFitnessConfig(),
    };
  }

  private getEnvVar(name: keyof typeof __ENV__): string | undefined {
    // Use webpack DefinePlugin injected environment variables (public only)
    try {
      const value = typeof __ENV__ !== 'undefined' ? __ENV__[name] : undefined;
      return (
        value ?? (StorageAdapter.getItemSync(`runrealm_${String(name).toLowerCase()}`) || undefined)
      );
    } catch (error) {
      console.warn(`Failed to access environment variable ${name}:`, error);
      return StorageAdapter.getItemSync(`runrealm_${String(name).toLowerCase()}`) || undefined;
    }
  }

  private getSecureEnvVar(name: string): string | undefined {
    // For sensitive variables, only check storage
    // These are NOT exposed via webpack DefinePlugin for security
    return StorageAdapter.getItemSync(`runrealm_${name.toLowerCase()}`) || undefined;
  }

  private async fetchRuntimeTokens(): Promise<{
    mapbox?: string;
    gemini?: string;
    strava?: StravaConfig;
  }> {
    try {
      // Use API base URL from environment or default
      const apiUrl = `${__ENV__?.API_BASE_URL || 'http://localhost:3000'}/api/tokens`;

      console.debug(`Fetching tokens from: ${apiUrl}`);
      const response = await fetch(apiUrl);
      console.debug(`Response status: ${response.status}, ok: ${response.ok}`);

      if (response.ok) {
        const tokens = await response.json();
        console.debug('Successfully fetched runtime tokens, keys:', Object.keys(tokens));
        return tokens;
      } else {
        const errorText = await response.text();
        console.error(`Token fetch failed with status: ${response.status}, body: ${errorText}`);
      }
    } catch (error) {
      console.error('Runtime token fetch failed:', error);
    }
    return {};
  }

  private getMapboxToken(): string {
    // 🔒 PRODUCTION SECURITY: In production, tokens should come from runtime initialization
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '🔒 Production mode: Mapbox token will be loaded asynchronously via initializeRuntimeTokens()'
      );
      // Return empty string - token will be updated when initializeRuntimeTokens completes
      return '';
    }

    // 🔒 DEVELOPMENT ONLY: Try localStorage for development tokens
    // const devToken = localStorage.getItem("runrealm_dev_mapbox_token");
    // if (devToken && devToken !== "your-mapbox-token-here") {
    //   console.debug("🔒 Development mode: Using token from localStorage");
    //   return devToken;
    // }

    // 🔒 SECURE: Check localStorage (user can set manually)
    const token = this.getSecureEnvVar('MAPBOX_ACCESS_TOKEN');

    if (!token) {
      // Only show warning if runtime tokens have been attempted
      if (this.runtimeTokensLoaded) {
        console.warn(
          '🔒 Mapbox access token not found. For security, provide it via:\n' +
            "2. localStorage.setItem('runrealm_mapbox_access_token', 'your_token')\n" +
            '3. Runtime token endpoint (production)\n' +
            '4. Environment variables are NO LONGER exposed to client for security'
        );
      }
      return '';
    }

    return token;
  }

  private getGeminiApiKey(): string {
    // Try environment variables first (from .env via webpack DefinePlugin)
    const envKey = this.getEnvVar('GOOGLE_GEMINI_API_KEY');
    if (envKey) {
      return envKey;
    }

    // 🔒 PRODUCTION SECURITY: In production, API keys should come from runtime initialization
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        '🔒 Production mode: Gemini API key will be loaded asynchronously via initializeRuntimeTokens()'
      );
      // Return empty string - key will be updated when initializeRuntimeTokens completes
      return '';
    }

    // 🔒 SECURE: Check localStorage (user can set manually)
    const apiKey = this.getSecureEnvVar('GOOGLE_GEMINI_API_KEY');

    if (!apiKey) {
      // Only show warning if runtime tokens have been attempted
      if (this.runtimeTokensLoaded) {
        console.warn(
          '🔒 Google Gemini API key not found. For security, provide it via:\n' +
            '1. Environment variables (.env file)\n' +
            "3. localStorage.setItem('runrealm_google_gemini_api_key', 'your_key')\n" +
            '4. Runtime token endpoint (production)'
        );
      }
      return '';
    }

    return apiKey;
  }

  private detectMobile(): boolean {
    // Check if we're in React Native
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      return true;
    }

    // Browser detection
    if (typeof navigator !== 'undefined' && typeof window !== 'undefined') {
      return (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        ) || window.innerWidth <= 768
      );
    }

    // Default to mobile if we can't detect
    return true;
  }

  private prefersReducedMotion(): boolean {
    // React Native doesn't have matchMedia, default to false
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') {
      return false;
    }

    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_e) {
      return false;
    }
  }

  getConfig(): AppConfig {
    return { ...this.config }; // Return copy to prevent mutation
  }

  updateConfig(updates: Partial<AppConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  private loadWeb3Config(): Web3Config | undefined {
    // Check if Web3 is enabled via environment or feature flags
    const web3Enabled =
      this.getEnvVar('ENABLE_WEB3') === 'true' ||
      StorageAdapter.getItemSync('runrealm_web3_enabled') === 'true';

    if (!web3Enabled) {
      return undefined;
    }

    return {
      enabled: true,
      zetachain: {
        rpcUrl:
          this.getEnvVar('ZETACHAIN_RPC_URL') ||
          'https://zetachain-athens-evm.blockpi.network/v1/rpc/public',
        chainId: 7001, // Athens testnet
        contractAddresses: {
          territoryNFT: this.getEnvVar('TERRITORY_NFT_ADDRESS'),
          realmToken: this.getEnvVar('REALM_TOKEN_ADDRESS'),
          territoryManager: this.getEnvVar('TERRITORY_MANAGER_ADDRESS'),
        },
      },
      ethereum: {
        rpcUrl: this.getEnvVar('ETHEREUM_RPC_URL') || '',
        chainId: 1,
      },
      polygon: {
        rpcUrl: this.getEnvVar('POLYGON_RPC_URL') || 'https://polygon-rpc.com/',
        chainId: 137,
      },
      wallet: {
        autoConnect: this.getEnvVar('AUTO_CONNECT_WALLET') !== 'false',
        supportedWallets: ['MetaMask', 'WalletConnect', 'Coinbase Wallet'],
      },
      ai: {
        enabled: this.getEnvVar('ENABLE_AI_FEATURES') === 'true',
        geminiApiKey: this.getGeminiApiKey(),
      },
    };
  }

  private loadFitnessConfig(): ExternalFitnessConfig | undefined {
    const fitnessEnabled = this.config?.features?.enableFitness !== false;

    if (!fitnessEnabled) {
      return undefined;
    }

    return {
      strava: this.loadStravaConfig(),
      garmin: {
        enabled: false, // Coming soon
      },
      appleHealth: {
        enabled: false, // Coming soon
      },
      googleFit: {
        enabled: false, // Coming soon
      },
    };
  }

  private loadStravaConfig(): StravaConfig | undefined {
    const clientId =
      this.getSecureEnvVar('STRAVA_CLIENT_ID') ||
      StorageAdapter.getItemSync('runrealm_strava_client_id');

    const redirectUri =
      this.getSecureEnvVar('STRAVA_REDIRECT_URI') ||
      StorageAdapter.getItemSync('runrealm_strava_redirect_uri') ||
      'http://localhost:3000/auth/strava/callback';

    if (!clientId) {
      console.debug('Strava client ID not found. Strava integration disabled.');
      return undefined;
    }

    return {
      clientId,
      redirectUri,
      accessToken: StorageAdapter.getItemSync('runrealm_strava_access_token') || undefined,
      refreshToken: StorageAdapter.getItemSync('runrealm_strava_refresh_token') || undefined,
      expiresAt:
        parseInt(StorageAdapter.getItemSync('runrealm_strava_expires_at') || '0', 10) || undefined,
    };
  }

  isFitnessEnabled(): boolean {
    return this.config.fitness !== undefined;
  }

  getFitnessConfig(): ExternalFitnessConfig | undefined {
    return this.config.fitness;
  }

  getStravaConfig(): StravaConfig | undefined {
    return this.config.fitness?.strava;
  }

  updateStravaTokens(accessToken: string, refreshToken: string, expiresAt: number): void {
    // Store in storage
    StorageAdapter.setItemSync('runrealm_strava_access_token', accessToken);
    StorageAdapter.setItemSync('runrealm_strava_refresh_token', refreshToken);
    StorageAdapter.setItemSync('runrealm_strava_expires_at', expiresAt.toString());

    // Update config
    if (this.config.fitness?.strava) {
      this.config.fitness.strava.accessToken = accessToken;
      this.config.fitness.strava.refreshToken = refreshToken;
      this.config.fitness.strava.expiresAt = expiresAt;
    }

    // Emit event
    this.eventBus.emit('fitness:tokens:updated', { source: 'strava' });
  }

  clearStravaTokens(): void {
    StorageAdapter.removeItemSync('runrealm_strava_access_token');
    StorageAdapter.removeItemSync('runrealm_strava_refresh_token');
    StorageAdapter.removeItemSync('runrealm_strava_expires_at');

    if (this.config.fitness?.strava) {
      delete this.config.fitness.strava.accessToken;
      delete this.config.fitness.strava.refreshToken;
      delete this.config.fitness.strava.expiresAt;
    }

    this.eventBus.emit('fitness:tokens:cleared', { source: 'strava' });
  }

  isWeb3Enabled(): boolean {
    return this.config.web3?.enabled === true;
  }

  getWeb3Config(): Web3Config | undefined {
    return this.config.web3;
  }

  updateWeb3Config(updates: Partial<Web3Config>): void {
    if (this.config.web3) {
      this.config.web3 = { ...this.config.web3, ...updates };
    }
  }
}
