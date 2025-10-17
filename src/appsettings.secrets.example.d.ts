export declare const MAPBOX_ACCESS_TOKEN = "your_mapbox_access_token_here";
export declare const GOOGLE_GEMINI_API_KEY = "your_google_gemini_api_key_here";
export declare const STRAVA_CLIENT_ID = "your_strava_client_id_here";
export declare const STRAVA_CLIENT_SECRET = "your_strava_client_secret_here";
export declare const STRAVA_REDIRECT_URI = "http://localhost:3000/auth/strava/callback";
export declare const STRAVA_VERIFY_TOKEN = "your_secure_verify_token_here";
export declare const STRAVA_WEBHOOK_CALLBACK_URL = "http://localhost:3000/api/strava/webhook";
export declare const ZETACHAIN_RPC_URL = "https://zetachain-athens-evm.blockpi.network/v1/rpc/public";
export declare const REALM_TOKEN_ADDRESS = "0x18082d110113B40A24A41dF10b4b249Ee461D3eb";
export declare const UNIVERSAL_CONTRACT_ADDRESS = "0x7A52d845Dc37aC5213a546a59A43148308A88983";
export declare const GAME_LOGIC_ADDRESS = "0x0590F45F223B87e51180f6B7546Cc25955984726";
export declare const TERRITORY_NFT_ADDRESS = "";
export declare const TERRITORY_MANAGER_ADDRESS = "";
export declare const appSettings: {
    mapbox: {
        accessToken: string;
        style: string;
    };
    googleAI: {
        apiKey: string;
        model: string;
    };
    strava: {
        clientId: string;
        clientSecret: string;
        redirectUri: string;
        verifyToken: string;
        webhookCallbackUrl: string;
    };
    web3: {
        zetachain: {
            chainId: number;
            rpcUrl: string;
            explorerUrl: string;
            contracts: {
                universal: string;
                realmToken: string;
                gameLogic: string;
            };
        };
    };
    ui: {
        enableAnimations: boolean;
        isMobile: boolean;
    };
    fitness: {
        enableStrava: boolean;
        enableGarmin: boolean;
        enableAppleHealth: boolean;
        enableGoogleFit: boolean;
    };
};
