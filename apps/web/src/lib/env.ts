/**
 * Environment bridge for the Next.js build.
 *
 * The original webpack app injected a global `__ENV__` object via
 * DefinePlugin. Next.js exposes public env vars through `NEXT_PUBLIC_*`,
 * so this module reconstructs the expected global shape before the
 * legacy app boots.
 */

export interface RunRealmEnv {
  NODE_ENV: string;
  API_BASE_URL: string;
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
}

const DEFAULT_ENV: RunRealmEnv = {
  NODE_ENV: 'development',
  API_BASE_URL: 'http://localhost:3000',
  ENABLE_WEB3: 'true',
  ENABLE_AI_FEATURES: 'false',
  ENABLE_CROSS_CHAIN: 'true',
  ENABLE_FITNESS: 'true',
  ZETACHAIN_RPC_URL: 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public',
  TERRITORY_NFT_ADDRESS: '0x0000000000000000000000000000000000000000',
  REALM_TOKEN_ADDRESS: '0x18082d110113B40A24A41dF10b4b249Ee461D3eb',
  TERRITORY_MANAGER_ADDRESS: '0x7A52d845Dc37aC5213a546a59A43148308A88983',
  ETHEREUM_RPC_URL: 'https://ethereum-sepolia-rpc.publicnode.com',
  POLYGON_RPC_URL: 'https://polygon-rpc.com',
  AUTO_CONNECT_WALLET: 'false',
  GOOGLE_GEMINI_API_KEY: '',
};

export function createEnvGlobal(): RunRealmEnv {
  const env: RunRealmEnv = {
    NODE_ENV: process.env.NODE_ENV || DEFAULT_ENV.NODE_ENV,
    API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_ENV.API_BASE_URL,
    ENABLE_WEB3: process.env.NEXT_PUBLIC_ENABLE_WEB3 || DEFAULT_ENV.ENABLE_WEB3,
    ENABLE_AI_FEATURES:
      process.env.NEXT_PUBLIC_ENABLE_AI_FEATURES || DEFAULT_ENV.ENABLE_AI_FEATURES,
    ENABLE_CROSS_CHAIN:
      process.env.NEXT_PUBLIC_ENABLE_CROSS_CHAIN || DEFAULT_ENV.ENABLE_CROSS_CHAIN,
    ENABLE_FITNESS: process.env.NEXT_PUBLIC_ENABLE_FITNESS || DEFAULT_ENV.ENABLE_FITNESS,
    ZETACHAIN_RPC_URL: process.env.NEXT_PUBLIC_ZETACHAIN_RPC_URL || DEFAULT_ENV.ZETACHAIN_RPC_URL,
    TERRITORY_NFT_ADDRESS:
      process.env.NEXT_PUBLIC_TERRITORY_NFT_ADDRESS || DEFAULT_ENV.TERRITORY_NFT_ADDRESS,
    REALM_TOKEN_ADDRESS:
      process.env.NEXT_PUBLIC_REALM_TOKEN_ADDRESS || DEFAULT_ENV.REALM_TOKEN_ADDRESS,
    TERRITORY_MANAGER_ADDRESS:
      process.env.NEXT_PUBLIC_TERRITORY_MANAGER_ADDRESS || DEFAULT_ENV.TERRITORY_MANAGER_ADDRESS,
    ETHEREUM_RPC_URL: process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || DEFAULT_ENV.ETHEREUM_RPC_URL,
    POLYGON_RPC_URL: process.env.NEXT_PUBLIC_POLYGON_RPC_URL || DEFAULT_ENV.POLYGON_RPC_URL,
    AUTO_CONNECT_WALLET:
      process.env.NEXT_PUBLIC_AUTO_CONNECT_WALLET || DEFAULT_ENV.AUTO_CONNECT_WALLET,
    GOOGLE_GEMINI_API_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY || DEFAULT_ENV.GOOGLE_GEMINI_API_KEY,
  };

  if (typeof window !== 'undefined') {
    (window as any).__ENV__ = env;
  }

  return env;
}
