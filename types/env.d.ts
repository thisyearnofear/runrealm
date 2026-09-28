declare global {
  const __ENV__: {
    NODE_ENV: string;
    // API base URL for token endpoint (dev/prod configuration)
    API_BASE_URL: string;
    // Origin the browser sends ordinary /api/* calls to. Empty means
    // same-origin (the Netlify shape). Distinct from API_BASE_URL, which
    // defaults to localhost and is only for the dev token endpoint.
    NEXT_PUBLIC_API_BASE_URL: string;
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
    // Comma-separated attestation-oracle base URLs. Public by design —
    // the app must be able to reach the quorum to read the network board
    // and to ask for signatures; the oracle's private key stays server-side.
    RUNREALM_ATTESTATION_ORACLES: string;
    // Public feature flag only; Reactor API credentials stay server-side.
    ENABLE_ORBIS: string;
  };

  // Ensure __ENV__ is available at runtime
  interface Window {
    __ENV__?: typeof __ENV__;
  }
}

export {};