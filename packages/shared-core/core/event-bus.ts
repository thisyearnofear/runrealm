import { GhostRunner } from '../services/ai-service';

// Centralized event system for loose coupling
export type EventCallback<T = any> = (data: T) => void;

// Web3 and GameFi event types
export interface Web3Events {
  'web3:walletConnected': { address: string; chainId: number };
  'web3:walletDisconnected': Record<string, never>;
  'web3:networkChanged': { chainId: number; networkName: string };
  'web3:transactionSubmitted': { hash: string; type: string };
  'web3:transactionConfirmed': { hash: string; blockNumber: number };
  'web3:transactionFailed': { hash?: string; error: string };
  'web3:territoryClaimed': { tokenId: string; geohash: string; metadata: any };
  'web3:crossChainTerritoryClaimed': {
    hash: string;
    geohash: string;
    originChainId: number;
  };
  'web3:crossChainTerritoryClaimFailed': { error: string; geohash: string };
  'territory:challenged': {
    tokenId: string;
    challenger: string;
    challenge: any;
  };
  'territory:transferred': {
    tokenId: string;
    from: string;
    to: string;
    chainId: number;
  };
  'territory:staked': { tokenId: string; amount: number; staker: string };
  'territory:unstaked': { tokenId: string; amount: number; staker: string };
  'ai:routeSuggested': { route: any; confidence: number; reasoning: string };
  'ai:ghostRunnerGenerated': { runner: any; difficulty: number };
  'ai:territoryAnalyzed': {
    tokenId: string;
    analysis: any;
    recommendations: string[];
  };
  'game:rewardEarned': { amount: number; reason?: string; tokenId?: string };
  'game:challengeStarted': {
    challengeId: string;
    challenger: string;
    territory: string;
  };
  'game:challengeResolved': {
    challengeId: string;
    winner: string;
    loser: string;
  };
  'game:leaderboardUpdated': { rankings: any[]; userRank?: number };
  'service:error': { service: string; context: string; error: string };
  'service:initialized': { service: string; success: boolean };
}

// Combined event interface
export interface AppEvents extends Web3Events {
  'run:started': { startPoint: any };
  'run:pointAdded': { point: any; totalDistance: number };
  'run:pointRemoved': { totalDistance: number };
  'run:cleared': { runId: string };
  'run:loaded': { run: any };
  'territory:toggleVisibility': Record<string, never>;
  'route:stateChanged': { routeId: string; routeData: any; isActive: boolean };
  'route:cleared': Record<string, never>;
  'run:plannedRouteChanged': { geojson: any };
  'run:plannedRouteActivated': {
    coordinates: any[];
    distance: number;
    runId: string;
  };
  'run:completed': { distance: number; duration: number; points: any[] };
  'run:paused': { runId: string; timestamp: number; stats: any };
  'run:resumed': { runId: string; timestamp: number; stats: any };
  'run:cancelled': { runId: string; timestamp: number };
  'run:statusChanged': { status: string };
  'run:statsUpdated': { distance: number; duration: number; speed: number };
  'ui:settingsOpened': Record<string, never>;
  'ui:settingsClosed': Record<string, never>;
  'ui:unitsToggled': { useMetric: boolean };
  'ui:toast': { message: string; type: string; duration?: number };
  'ui:showRunControls': Record<string, never>;
  'ui:hideRunControls': Record<string, never>;
  'map:styleChanged': { style: string };
  'mobile:gestureDetected': { type: string; data: any };
  'territory:claimRequested': { runId: string };
  'territory:claimStarted': { territoryId: string; territoryName: string };
  'territory:eligible': { territory: any; run: any; message: string };
  'territory:preview': { territory: any; bounds: any; metadata: any };
  'territory:nearbyUpdated': { count: number; territories: any[] };
  'territory:claimed': {
    territory: any;
    transactionHash: string;
    isCrossChain?: boolean;
    sourceChainId?: number;
    source?: string;
  };
  'territory:claimFailed': {
    error: string;
    territory: any;
    runId?: string;
    isCrossChain?: boolean;
  };
  'ai:routeRequested': {
    distance?: number;
    difficulty?: number;
    goals?: string[];
  };
  'ai:ghostRunnerRequested': { difficulty?: number };
  'ai:routeReady': {
    route: any;
    distance: number;
    duration: number;
    waypoints?: any[];
    totalDistance?: number;
    difficulty?: number;
    estimatedTime?: number;
  };
  'ai:routeFailed': { message: string };
  'ai:routeVisualize': {
    coordinates: number[][];
    type: string;
    style: any;
    metadata: any;
  };
  'ai:waypointsVisualize': { waypoints: any[]; routeMetadata: any };
  'ai:routeClear': Record<string, never>;
  'ai:ghostRunnerGenerated': {
    runner: any;
    difficulty: number;
    success?: boolean;
    fallback?: boolean;
  };
  'ai:ghostRunnerFailed': { message: string };
  'ghost:ready': { runner: GhostRunner };
  'ghost:progress': {
    ghostId: string;
    progress: number;
    location: { lat: number; lng: number };
  };
  'map:focusTerritory': { geohash: string };
  'game:levelUp': { newLevel: number; player: string };
  'game:achievementUnlocked': {
    achievementId: string;
    achievement: any;
    player: string;
  };
  'game:statsUpdated': { stats: any };
  'game:rewardEarned': { amount: number };
  'navigation:routesRegistered': { routes: any[] };
  'navigation:routeChanged': {
    routeId: string;
    route: any;
    params?: any;
    previousRoute?: string;
  };
  'onboarding:completed': Record<string, never>;
  'onboarding:skipped': Record<string, never>;
  'onboarding:stepChanged': {
    stepIndex: number;
    stepId: string;
    totalSteps: number;
  };
  'progression:achievementsLoaded': { count: number };
  'progression:levelsLoaded': { maxLevel: number };
  'run:startRequested': { runId?: string };
  'location:changed': {
    lat: number;
    lng: number;
    accuracy?: number;
    address?: string;
    source: string;
    timestamp: number;
  };
  'location:updated': { accuracy: number };
  'location:error': Record<string, never>;
  'config:updated': Record<string, never>;
  'visibility:changed': { elementId: string; visible: boolean };
  'widget:stateChanged': { widgetId: string; state: any };
  'widget:stateReset': { widgetId: string };
  'widget:allStatesReset': Record<string, never>;
  'mobile:swipeLeft': Record<string, never>;
  'mobile:swipeRight': Record<string, never>;
  'mobile:orientationChanged': { orientation: string; compactMode?: boolean };
  'mobile:compactModeChanged': { compactMode: boolean };
  'mobile:shakeDetected': Record<string, never>;
  'run:addPointRequested': Record<string, never>;
  'run:undoRequested': Record<string, never>;
  'run:clearRequested': Record<string, never>;
  'ui:territoryPreview': { point: any; totalDistance: number };
  'ui:gamefiEnabled': { enabled: boolean };
  'token:transferStarted': {
    transactionHash: string;
    amount: number;
    token: string;
  };
  'staking:stakeStarted': { transactionHash: string; amount: number };
  'staking:rewardEarned': { amount: number };
  'rewards:settingsChanged': Record<string, never>;
  'rewards:claim': Record<string, never>;
  'wallet:connect': { provider?: string };
  'wallet:disconnect': Record<string, never>;
  'wallet:switchNetwork': { chainId?: number };
  'wallet:retryConnection': Record<string, never>;
  // Dashboard events
  'dashboard:dataUpdated': { data: any; state: any };
  'dashboard:visibilityChanged': { visible: boolean; minimized: boolean };
  'dashboard:realTimeDataUpdated': { currentRun: any; lastUpdated: number };
  'dashboard:territoriesFiltered': { filter: string };
  'dashboard:openWidget': { widgetId: string };
  'dashboard:showTerritoriesOnMap': Record<string, never>;
  'dashboard:showTerritoryOnMap': { territoryId: string };
  'dashboard:viewAllTerritories': Record<string, never>;
  'ui:showGhostManagement': Record<string, never>;
  'ghost:deployRequested': { ghostId: string; territoryId?: string };
  'ui:showChallenges': Record<string, never>;
  'territory:manage': { territoryId: string };
  'territory:boostActivity': { territoryId: string };
  'game:claimChallenge': { challengeId: string };
  // Cross-chain events
  'crosschain:territoryClaimRequested': {
    territoryData: any;
    targetChainId: number;
  };
  'crosschain:territoryClaimInitiated': {
    messageId: string;
    territoryData: any;
    targetChainId: number;
  };
  'crosschain:territoryClaimFailed': { error: string; data: any };
  'crosschain:statsUpdateRequested': { statsData: any; targetChainId: number };
  'crosschain:statsUpdateInitiated': {
    messageId: string;
    statsData: any;
    targetChainId: number;
  };
  'crosschain:statsUpdateFailed': { error: string; data: any };
  'crosschain:messageSent': {
    messageId: string;
    targetChainId: number;
    targetAddress: string;
    data: string;
  };
  'crosschain:messageReceived': { message: any; decodedData: any };
  'crosschain:territoryUpdated': {
    territoryId: string;
    action: string;
    sourceChainId: number;
  };
  // Fitness integration events
  'fitness:connected': { source: string };
  'fitness:disconnected': { source: string };
  'fitness:connectionFailed': { source: string; error: string };
  'fitness:activities': { activities: any[]; source: string };
  'fitness:tokens:updated': { source: string };
  'fitness:tokens:cleared': { source: string };
  // Strava events
  'strava:activity:created': {
    activityId: number;
    ownerId: number;
    eventTime: number;
  };
  'strava:activity:privacy_changed': {
    activityId: number;
    ownerId: number;
    isPrivate: boolean;
  };
  'strava:activity:updated': {
    activityId: number;
    ownerId: number;
    updates?: Record<string, any>;
    eventTime: number;
  };
  'strava:activity:deleted': {
    activityId: number;
    ownerId: number;
    eventTime: number;
  };
  'strava:athlete:deauthorized': { athleteId: number; eventTime: number };
  // Ghost runner events
  'ghost:unlocked': { ghost: any; reason: string };
  'ghost:deployed': { ghost: any; territoryId: string };
  'ghost:completed': { ghostRun: any };
  'ghost:upgraded': { ghost: any };
  'ghost:unlockAvailable': { message: string; types: string[] };
  // Realm token events
  'realm:earned': { amount: number; reason: string };
  // Territory activity events
  'territory:activityUpdated': { territory: any };
  'territory:vulnerable': { territory: any };
  'territory:boostRequested': { territoryId: string; cost: number; points: number };
}

export class EventBus {
  private static instance: EventBus;
  private listeners: Map<keyof AppEvents, Set<EventCallback>> = new Map();

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  on<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
  }

  off<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  emit<K extends keyof AppEvents>(event: K, data: AppEvents[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
    }
  }

  once<K extends keyof AppEvents>(event: K, callback: EventCallback<AppEvents[K]>): void {
    const onceCallback = (data: AppEvents[K]) => {
      callback(data);
      this.off(event, onceCallback);
    };
    this.on(event, onceCallback);
  }

  clear(): void {
    this.listeners.clear();
  }
}
