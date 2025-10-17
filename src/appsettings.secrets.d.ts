export declare const MAPBOX_ACCESS_TOKEN = "pk.eyJ1IjoicGFwYWphbXMiLCJhIjoiY21land3ZW9lMGpqdjJsczhhc3dtNXVlZyJ9.1gOQMw-mN5B0JDC51f1YeA";
export declare const GOOGLE_GEMINI_API_KEY = "AIzaSyAyWHEosF-YpX6hdp1gPsQT-SFl8wXSetA";
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
};
export declare const STRAVA_CLIENT_ID = "177382";
export declare const STRAVA_CLIENT_SECRET = "6f28cbf87a8e42175419085a4fafdf6d8d7b2a93";
export declare const STRAVA_REDIRECT_URI = "http://localhost:3000/auth/strava/callback";
