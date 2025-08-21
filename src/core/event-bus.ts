// Centralized event system for loose coupling
export type EventCallback<T = any> = (data: T) => void;

// Web3 and GameFi event types
export interface Web3Events {
  "web3:walletConnected": { address: string; chainId: number };
  "web3:walletDisconnected": {};
  "web3:networkChanged": { chainId: number; networkName: string };
  "web3:transactionSubmitted": { hash: string; type: string };
  "web3:transactionConfirmed": { hash: string; blockNumber: number };
  "web3:transactionFailed": { hash?: string; error: string };
  "territory:claimed": { tokenId: string; geohash: string; metadata: any };
  "territory:challenged": {
    tokenId: string;
    challenger: string;
    challenge: any;
  };
  "territory:transferred": {
    tokenId: string;
    from: string;
    to: string;
    chainId: number;
  };
  "territory:staked": { tokenId: string; amount: number; staker: string };
  "territory:unstaked": { tokenId: string; amount: number; staker: string };
  "ai:routeSuggested": { route: any; confidence: number; reasoning: string };
  "ai:ghostRunnerGenerated": { runner: any; difficulty: number };
  "ai:territoryAnalyzed": {
    tokenId: string;
    analysis: any;
    recommendations: string[];
  };
  "game:rewardEarned": { amount: number; reason: string; tokenId?: string };
  "game:challengeStarted": {
    challengeId: string;
    challenger: string;
    territory: string;
  };
  "game:challengeResolved": {
    challengeId: string;
    winner: string;
    loser: string;
  };
  "game:leaderboardUpdated": { rankings: any[]; userRank?: number };
  "service:error": { service: string; context: string; error: string };
  "service:initialized": { service: string; success: boolean };
}

// Combined event interface
export interface AppEvents extends Web3Events {
  "run:started": { startPoint: any };
  "run:pointAdded": { point: any; totalDistance: number };
  "run:pointRemoved": { totalDistance: number };
  "run:cleared": { timeSpent?: number; totalDistance?: number };
  "run:loaded": { run: any };
  "run:plannedRouteChanged": { geojson: any };
  "ui:settingsOpened": {};
  "ui:settingsClosed": {};
  "ui:unitsToggled": { useMetric: boolean };
  "ui:toast": { message: string; type: string; duration?: number };
  "ui:showRunControls": {};
  "ui:hideRunControls": {};
  "map:styleChanged": { style: string };
  "mobile:gestureDetected": { type: string; data: any };
  "territory:claimRequested": { geohash?: string; estimatedReward?: number };
  "ai:routeRequested": {
    distance?: number;
    difficulty?: number;
    goals?: string[];
  };
  'ai:routeReady': { route: any; distance: number; duration: number; waypoints?: any[]; totalDistance?: number; difficulty?: number; estimatedTime?: number };
  "ai:routeFailed": { message: string };
  "map:focusTerritory": { geohash: string };
  "game:levelUp": { newLevel: number; player: string };
  "game:achievementUnlocked": { achievementId: string; achievement: any; player: string };
  "game:statsUpdated": { stats: any };
  "navigation:routesRegistered": { routes: any[] };
  "navigation:routeChanged": { routeId: string; route: any; params?: any; previousRoute?: string };
  "onboarding:completed": {};
  "onboarding:skipped": {};
  "onboarding:stepChanged": { stepIndex: number; stepId: string; totalSteps: number };
  "progression:achievementsLoaded": { count: number };
  "progression:levelsLoaded": { maxLevel: number };
  "run:startRequested": {};
  "location:changed": { lat: number; lng: number; accuracy?: number; address?: string; source: string; timestamp: number };
  "config:updated": {};
  'visibility:changed': { elementId: string; visible: boolean };
  "widget:stateChanged": { widgetId: string; state: any };
  "widget:stateReset": { widgetId: string };
  "widget:allStatesReset": {};
  "mobile:swipeLeft": {};
  "mobile:swipeRight": {};
  "mobile:orientationChanged": { orientation: string; compactMode?: boolean };
  "mobile:compactModeChanged": { compactMode: boolean };
  "mobile:shakeDetected": {};
  "run:addPointRequested": {};
  "run:undoRequested": {};
  "run:clearRequested": {};
  "ui:territoryPreview": { point: any; totalDistance: number };
  "ui:gamefiEnabled": { enabled: boolean };
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

  on<K extends keyof AppEvents>(
    event: K,
    callback: EventCallback<AppEvents[K]>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off<K extends keyof AppEvents>(
    event: K,
    callback: EventCallback<AppEvents[K]>
  ): void {
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

  once<K extends keyof AppEvents>(
    event: K,
    callback: EventCallback<AppEvents[K]>
  ): void {
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
