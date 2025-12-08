// Import service types for type safety

import { WidgetState } from '../components/widget-state-service';
import { GhostRunner } from '../services/ai-service';
import { RunPoint, RunSession } from '../services/run-tracking-service';
import {
  Territory,
  TerritoryBounds,
  TerritoryMetadata,
  TerritoryPreview,
} from '../services/territory-service';

// Define route-related types
interface RouteData {
  coordinates: number[][] | RunPoint[];
  distance: number;
  difficulty?: number;
  waypoints?: RunPoint[];
  totalDistance?: number;
  estimatedTime?: number;
  origin?: string;
  destination?: string;
}

interface RouteVisualizationData {
  coordinates: number[][];
  type: string;
  style: MapStyle | VisualStyle;
  metadata: RouteMetadata;
}

interface MapStyle {
  color?: string;
  weight?: number;
  opacity?: number;
  width?: number;
  test?: boolean;
  [key: string]: unknown;
}

interface VisualStyle {
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
  [key: string]: unknown;
}

interface RouteMetadata {
  name?: string;
  description?: string;
  difficulty?: number;
  elevation?: number;
  startTime?: number;
  test?: boolean;
  [key: string]: unknown;
}

// Define game-related types
interface AchievementData {
  achievementId: string;
  achievement: Achievement;
  player: Player;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  points: number;
  unlockedAt?: number;
}

interface Player {
  id: string;
  address: string;
  level: number;
  experience: number;
}

// Define navigation types
interface RouteInfo {
  name?: string;
  path?: string;
  component?: string;
  params?: Record<string, unknown>;
}

interface RouteParams {
  id?: string;
  type?: string;
  filter?: string;
  [key: string]: unknown;
}

// Define territory preview point
interface TerritoryPreviewPoint {
  lat: number;
  lng: number;
}

// Define dashboard data
interface DashboardData {
  currentRun?: RunSession;
  territories?: Territory[];
  stats?: GameStats;
  achievements?: Achievement[];
}

interface GameStats {
  totalDistance: number;
  totalDuration: number;
  averagePace: number;
  territoriesOwned: number;
  level: number;
  experience: number;
}

// Define cross-chain data types
interface CrossChainTerritoryData {
  id: string;
  geohash: string;
  owner: string;
  chainId: number;
  tokenId?: string;
  metadata?: Record<string, unknown>;
}

interface StatsData {
  totalRuns: number;
  totalDistance: number;
  territoriesClaimed: number;
  level: number;
  experience: number;
  achievementsUnlocked: number;
}

interface MessageData {
  id: string;
  content: string;
  sender: string;
  recipient: string;
  timestamp: number;
}

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
  'territory:eligible': { territory: Territory; run: RunSession; message: string };
  'territory:preview': {
    territory: TerritoryPreview;
    bounds: TerritoryBounds;
    metadata: TerritoryMetadata;
  };
  'territory:nearbyUpdated': { count: number; territories: Territory[] };
  'territory:claimed': {
    territory: Territory;
    transactionHash: string;
    isCrossChain?: boolean;
    sourceChainId?: number;
    source?: string;
  };
  'territory:claimFailed': {
    error: string;
    territory: Territory;
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
    route: RouteData;
    distance: number;
    duration: number;
    waypoints?: RunPoint[];
    totalDistance?: number;
    difficulty?: number;
    estimatedTime?: number;
  };
  'ai:routeFailed': { message: string };
  'ai:routeVisualize': RouteVisualizationData;
  'ai:waypointsVisualize': { waypoints: RunPoint[]; routeMetadata: RouteMetadata };
  'ai:routeClear': Record<string, never>;
  'ai:ghostRunnerGenerated': {
    runner: GhostRunner;
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
  'game:achievementUnlocked': AchievementData;
  'game:statsUpdated': { stats: GameStats };
  'game:rewardEarned': { amount: number };
  'navigation:routesRegistered': { routes: RouteInfo[] };
  'navigation:routeChanged': {
    routeId: string;
    route: RouteInfo;
    params?: RouteParams;
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
  'widget:stateChanged': { widgetId: string; state: WidgetState };
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
  'rewards:dataUpdated': { data: any };
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
  'ghost:unlocked': { ghost: GhostRunner; reason: string };
  'ghost:deployed': { ghost: GhostRunner; territoryId: string };
  'ghost:completed': { ghostRun: { ghostId: string; runId: string; completedAt: number } };
  'ghost:upgraded': { ghost: GhostRunner };
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

  private constructor() { }

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
