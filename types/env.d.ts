declare global {
  const __ENV__: {
    NODE_ENV: string;
    // API base URL for token endpoint (dev/prod configuration)
    API_BASE_URL: string;
    // ⚠️ SECURITY NOTE: Only public configuration is exposed via __ENV__
    // Sensitive API keys are loaded via other secure methods
    ENABLE_WEB3: string;
    ENABLE_AI_FEATURES: string;
    ENABLE_CROSS_CHAIN: string;
    ENABLE_FITNESS: string;
    ZETACHAIN_RPC_URL: string;
    TERRITORY_NFT_ADDRESS: string;
    REALM_TOKEN_ADDRESS: string;
    TERRITORY_MANAGER_ADDRESS: string;
    ETHEREUM_RPC_URL: string;
    POLYGON_RPC_URL: string;
    AUTO_CONNECT_WALLET: string;
    GOOGLE_GEMINI_API_KEY: string;
  };

  // Ensure __ENV__ is available at runtime
  interface Window {
    __ENV__?: typeof __ENV__;
  }
}

export {};