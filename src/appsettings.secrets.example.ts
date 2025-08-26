// 🔒 DEVELOPMENT ONLY - DO NOT COMMIT TO VERSION CONTROL
// Copy this file to src/appsettings.secrets.ts and add your actual keys

// Mapbox Access Token - get from https://account.mapbox.com/access-tokens/
export const MAPBOX_ACCESS_TOKEN = "your_mapbox_access_token_here";

// Google Gemini API Key - get from https://makersuite.google.com/app/apikey
export const GOOGLE_GEMINI_API_KEY = "your_google_gemini_api_key_here";

// Web3 Configuration - LIVE DEPLOYED CONTRACTS ON ZETACHAIN TESTNET
export const ZETACHAIN_RPC_URL =
  "https://zetachain-athens-evm.blockpi.network/v1/rpc/public";

// ✅ CORRECT DEPLOYED CONTRACT ADDRESSES (January 13, 2025)
export const REALM_TOKEN_ADDRESS = "0x18082d110113B40A24A41dF10b4b249Ee461D3eb";
export const UNIVERSAL_CONTRACT_ADDRESS =
  "0x7A52d845Dc37aC5213a546a59A43148308A88983";
export const GAME_LOGIC_ADDRESS = "0x0590F45F223B87e51180f6B7546Cc25955984726";

// Legacy support (deprecated)
export const TERRITORY_NFT_ADDRESS = "";
export const TERRITORY_MANAGER_ADDRESS = "";

// Full app settings configuration
export const appSettings = {
  mapbox: {
    accessToken: MAPBOX_ACCESS_TOKEN,
    style: "mapbox://styles/mapbox/outdoors-v12",
  },
  googleAI: {
    apiKey: GOOGLE_GEMINI_API_KEY,
    model: "gemini-pro",
  },
  web3: {
    zetachain: {
      chainId: 7001,
      rpcUrl: ZETACHAIN_RPC_URL,
      explorerUrl: "https://zetachain-athens-3.blockscout.com",
      contracts: {
        universal: UNIVERSAL_CONTRACT_ADDRESS,
        realmToken: REALM_TOKEN_ADDRESS,
        gameLogic: GAME_LOGIC_ADDRESS,
      },
    },
  },
  ui: {
    enableAnimations: true,
    isMobile: false,
  },
};
