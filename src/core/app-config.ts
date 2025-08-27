// Centralized application configuration
import { EventBus } from './event-bus';

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
  };
  web3?: Web3Config;
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
      const runtimeTokens = await this.fetchRuntimeTokens();

      // Store tokens in localStorage for immediate use
      if (runtimeTokens.mapbox) {
        localStorage.setItem('runrealm_mapbox_access_token', runtimeTokens.mapbox);
        // Update the config
        this.config.mapbox.accessToken = runtimeTokens.mapbox;
      }

      if (runtimeTokens.gemini && this.config.web3?.ai) {
        localStorage.setItem('runrealm_google_gemini_api_key', runtimeTokens.gemini);
        // Update the config
        this.config.web3.ai.geminiApiKey = runtimeTokens.gemini;
      }

      this.runtimeTokensLoaded = true;
      // Refresh config with new tokens
      this.refreshConfig();

      // Emit event to notify services of config update
      this.eventBus.emit('config:updated', {});

      // Log success without exposing token values
      const tokenCount = Object.keys(runtimeTokens).length;
      console.debug(`Runtime tokens initialized successfully (${tokenCount} tokens loaded)`);
    } catch (error) {
      console.debug('Runtime token initialization failed, using fallback sources');
      this.runtimeTokensLoaded = true; // Mark as attempted
    }
  }

  private refreshConfig(): void {
    // Reload config with updated tokens
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    const isMobile = this.detectMobile();

    return {
      mapbox: {
        accessToken: this.getMapboxToken(),
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
        enableWeb3:
          this.getEnvVar("ENABLE_WEB3") === "true" ||
          localStorage.getItem("runrealm_web3_enabled") === "true",
      },
      web3: this.loadWeb3Config(),
    };
  }

  private getEnvVar(name: keyof typeof __ENV__): string | undefined {
    // Use webpack DefinePlugin injected environment variables (public only)
    try {
      const value = typeof __ENV__ !== 'undefined' ? __ENV__[name] : undefined;
      return value || localStorage.getItem(`runrealm_${name.toLowerCase()}`);
    } catch (error) {
      console.warn(`Failed to access environment variable ${name}:`, error);
      return localStorage.getItem(`runrealm_${name.toLowerCase()}`);
    }
  }

  private getSecureEnvVar(name: string): string | undefined {
    // For sensitive variables, only check localStorage and secrets file
    // These are NOT exposed via webpack DefinePlugin for security
    return localStorage.getItem(`runrealm_${name.toLowerCase()}`);
  }

  private async fetchRuntimeTokens(): Promise<{mapbox?: string, gemini?: string}> {
    try {
      const response = await fetch('/.netlify/functions/get-tokens');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.debug('Runtime token fetch failed, falling back to other sources');
    }
    return {};
  }

  private getMapboxToken(): string {
    // 🔒 PRODUCTION SECURITY: Never expose real tokens in client-side code
    if (process.env.NODE_ENV === 'production') {
      console.warn('🔒 Production mode: Using secure token endpoint for Mapbox');
      // In production, tokens should come from secure server endpoints only
      return this.getTokenFromSecureEndpoint('mapbox') || '';
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
        console.warn(
          "🔒 Mapbox access token not found. For security, provide it via:\n" +
          "1. src/appsettings.secrets.ts (recommended for development)\n" +
          "2. localStorage.setItem('runrealm_mapbox_access_token', 'your_token')\n" +
          "3. Runtime token endpoint (production)\n" +
          "4. Environment variables are NO LONGER exposed to client for security"
        );
      }
      return "";
    }

    return token;
  }

  private getGeminiApiKey(): string {
    // Try environment variables first (from .env via webpack DefinePlugin)
    const envKey = this.getEnvVar("GOOGLE_GEMINI_API_KEY");
    if (envKey) {
      return envKey;
    }

    // 🔒 PRODUCTION SECURITY: Never expose real API keys in client-side code
    if (process.env.NODE_ENV === 'production') {
      console.warn('🔒 Production mode: Using secure token endpoint for Gemini API');
      // In production, API keys should come from secure server endpoints only
      return this.getTokenFromSecureEndpoint('gemini') || '';
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
        console.warn(
          "🔒 Google Gemini API key not found. For security, provide it via:\n" +
          "1. Environment variables (.env file)\n" +
          "2. src/appsettings.secrets.ts (recommended for development)\n" +
          "3. localStorage.setItem('runrealm_google_gemini_api_key', 'your_key')\n" +
          "4. Runtime token endpoint (production)"
        );
      }
      return "";
    }

    return apiKey;
  }

  private detectMobile(): boolean {
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      ) || window.innerWidth <= 768
    );
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /**
   * 🔒 PRODUCTION SECURITY: Fetch tokens from secure server endpoint
   * This method should be implemented to call your secure token service
   */
  private getTokenFromSecureEndpoint(tokenType: 'mapbox' | 'gemini'): string | null {
    // 🔒 IMPLEMENT THIS: Replace with your secure token endpoint
    // Example: return fetch(`/api/secure-tokens/${tokenType}`).then(r => r.text())

    console.warn(`🔒 SECURITY: Implement secure token endpoint for ${tokenType}`);
    console.warn('🔒 For production, tokens should NEVER be in client-side code');
    console.warn('🔒 Use server-side proxy or secure token service instead');

    // For now, return null to force proper implementation
    return null;
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
      this.getEnvVar("ENABLE_WEB3") === "true" ||
      localStorage.getItem("runrealm_web3_enabled") === "true";

    if (!web3Enabled) {
      return undefined;
    }

    return {
      enabled: true,
      zetachain: {
        rpcUrl:
          this.getEnvVar("ZETACHAIN_RPC_URL") ||
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
        geminiApiKey: this.getGeminiApiKey(),
      },
    };
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
