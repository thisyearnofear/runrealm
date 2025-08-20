// Centralized application configuration
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

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
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

  private getMapboxToken(): string {
    // Try multiple sources for token
    let token: string | undefined;

    // Try to load from appsettings.secrets.ts (optional)
    try {
      const secretsModule = require("../appsettings.secrets");
      token = secretsModule.MAPBOX_ACCESS_TOKEN;
    } catch (error) {
      // Silently fail if secrets file doesn't exist - this is expected
      console.debug("Optional secrets file not found, continuing with other sources");
    }

    if (!token) {
      // Use webpack DefinePlugin injected environment variable
      token =
        process.env.MAPBOX_ACCESS_TOKEN ||
        localStorage.getItem("MAPBOX_ACCESS_TOKEN") ||
        undefined;
    }

    if (!token) {
      console.warn(
        "Mapbox access token not found. Provide it via src/appsettings.secrets.ts, environment (MAPBOX_ACCESS_TOKEN), or localStorage."
      );
    }

    return token || "";
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
        geminiApiKey: this.getEnvVar("GOOGLE_GEMINI_API_KEY") || "",
      },
    };
  }

  private getEnvVar(name: string): string | undefined {
    // Check multiple sources for environment variables
    // Use webpack DefinePlugin injected environment variables
    return (
      (process.env as any)[name] ||
      localStorage.getItem(`runrealm_${name.toLowerCase()}`) ||
      undefined
    );
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
