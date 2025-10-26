/**
 * UserDashboardService - Centralized dashboard for user information
 * Aggregates data from various services into a unified interface
 */

import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';
import { ProgressionService, PlayerStats } from './progression-service';
import { RunTrackingService, RunSession } from './run-tracking-service';
import { Web3Service, WalletInfo } from './web3-service';
import { TerritoryService, Territory } from './territory-service';
import { AIService } from './ai-service';
import { WidgetStateService } from './widget-state-service';

export interface DashboardState {
  isVisible: boolean;
  isMinimized: boolean;
  lastUpdated: number;
}

export interface DashboardData {
  userStats: PlayerStats | null;
  currentRun: RunSession | null;
  recentActivity: {
    lastRun?: RunSession;
    recentAchievements: string[];
  };
  territories: Territory[];
  walletInfo: WalletInfo | null;
  aiInsights: {
    suggestedRoute?: any;
    territoryAnalysis?: any;
    personalizedTips: string[];
  };
  notifications: {
    territoryEligible?: boolean;
    territoryClaimed?: boolean;
    achievementUnlocked?: string;
    levelUp?: number;
  };
}

export class UserDashboardService extends BaseService {
  private static instance: UserDashboardService;
  protected eventBus: EventBus;
  private widgetStateService: WidgetStateService;
  private dashboardState: DashboardState = {
    isVisible: false,
    isMinimized: true,
    lastUpdated: Date.now()
  };
  
  private dashboardData: DashboardData = {
    userStats: null,
    currentRun: null,
    recentActivity: {
      recentAchievements: []
    },
    territories: [],
    walletInfo: null,
    aiInsights: {
      personalizedTips: []
    },
    notifications: {}
  };
  
  private updateInterval: number | null = null;
  private debouncedUpdate: (() => void) | null = null;
  private throttledRealTimeUpdate: (() => void) | null = null;
  private realTimeUpdateInterval: number | null = null;
  private isDataLoaded: boolean = false;
  
  // Service references
  private progressionService: ProgressionService;
  private runTrackingService: RunTrackingService;
  private web3Service: Web3Service;
  private territoryService: TerritoryService;
  private aiService: AIService;

  private constructor() {
    super();
    this.widgetStateService = WidgetStateService.getInstance();
    this.progressionService = ProgressionService.getInstance();
    this.runTrackingService = RunTrackingService.getInstance();
    this.web3Service = Web3Service.getInstance();
    this.territoryService = TerritoryService.getInstance();
    this.aiService = AIService.getInstance();
  }

  static getInstance(): UserDashboardService {
    if (!UserDashboardService.instance) {
      UserDashboardService.instance = new UserDashboardService();
    }
    return UserDashboardService.instance;
  }

  private debounce(func: Function, wait: number): () => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: any[]) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  private throttle(func: Function, wait: number): () => void {
    let timeout: NodeJS.Timeout | null = null;
    let lastExecTime = 0;
    return (...args: any[]) => {
      const now = Date.now();
      if (now - lastExecTime > wait) {
        func.apply(this, args);
        lastExecTime = now;
      } else if (!timeout) {
        timeout = setTimeout(() => {
          func.apply(this, args);
          lastExecTime = Date.now();
          timeout = null;
        }, wait - (now - lastExecTime));
      }
    };
  }

  protected async onInitialize(): Promise<void> {
    // Load state from WidgetStateService
    this.loadWidgetState();
    
    // Set up debounced update function
    this.debouncedUpdate = this.debounce(() => {
      this.updateDashboardData();
    }, 1000); // 1 second debounce
    
    // Set up throttled real-time updates for critical data
    this.throttledRealTimeUpdate = this.throttle(() => {
      this.updateRealTimeData();
    }, 5000); // 5 second throttle for real-time data
    
    // Set up event listeners for data updates
    this.setupEventListeners();
    
    // Initialize with current data (lazy loading)
    if (this.dashboardState.isVisible) {
      await this.updateDashboardData();
    }
    
    this.safeEmit('service:initialized', { service: 'UserDashboardService', success: true });
  }

  private loadWidgetState(): void {
    try {
      const widgetState = this.widgetStateService.getWidgetState('user-dashboard');
      if (widgetState) {
        this.dashboardState.isVisible = widgetState.visible ?? false;
        this.dashboardState.isMinimized = widgetState.minimized ?? true;
        this.dashboardState.lastUpdated = widgetState.lastAccessed ?? Date.now();
      }
    } catch (error) {
      console.warn('Failed to load widget state for user dashboard:', error);
    }
  }

  private saveWidgetState(): void {
    try {
      this.widgetStateService.setWidgetState('user-dashboard', {
        visible: this.dashboardState.isVisible,
        minimized: this.dashboardState.isMinimized,
        lastAccessed: this.dashboardState.lastUpdated
      });
    } catch (error) {
      console.warn('Failed to save widget state for user dashboard:', error);
    }
  }

  

  private async updateDashboardData(): Promise<void> {
    try {
      // Update user stats from progression service
      const playerStats = this.progressionService.getPlayerStats();
      this.dashboardData.userStats = {
        level: playerStats.level,
        experience: playerStats.experience,
        totalDistance: playerStats.totalDistance,
        territoriesOwned: playerStats.territoriesOwned,
        territoriesClaimed: playerStats.territoriesClaimed,
        challengesWon: playerStats.challengesWon,
        totalTime: playerStats.totalTime,
        achievements: playerStats.achievements,
        streak: playerStats.streak
      };

      // Update territories from territory service
      this.dashboardData.territories = this.territoryService.getClaimedTerritories();

      // Update timestamp
      this.dashboardState.lastUpdated = Date.now();
      this.isDataLoaded = true;
      
      // Emit update event
      this.safeEmit('dashboard:dataUpdated', {
        data: this.dashboardData,
        state: this.dashboardState
      });
    } catch (error) {
      this.handleError(error, 'updateDashboardData');
    }
  }

  private async updateRealTimeData(): Promise<void> {
    try {
      // Only update real-time data when dashboard is visible
      if (!this.dashboardState.isVisible) return;
      
      // Update timestamp
      this.dashboardState.lastUpdated = Date.now();
      
      // Emit lightweight update event for real-time data only
      this.safeEmit('dashboard:realTimeDataUpdated', {
        currentRun: this.dashboardData.currentRun,
        lastUpdated: this.dashboardState.lastUpdated
      });
    } catch (error) {
      this.handleError(error, 'updateRealTimeData');
    }
  }

  private setupEventListeners(): void {
    // Listen for player stats updates (debounced)
    this.subscribe('game:statsUpdated', (data: any) => {
      this.dashboardData.userStats = data.stats;
      this.debouncedUpdate?.();
    });

    // Listen for run events (throttled for real-time updates, debounced for full updates)
    this.subscribe('run:started', () => {
      // Immediate update for run start
      this.updateDashboardData();
      // Start real-time updates
      this.startRealTimeUpdates();
    });

    this.subscribe('run:pointAdded', () => {
      // Throttled real-time update for ongoing runs
      this.throttledRealTimeUpdate?.();
    });

    this.subscribe('run:cleared', (data: any) => {
      this.dashboardData.recentActivity.lastRun = {
        id: data.runId,
        startTime: Date.now(),
        points: [],
        segments: [],
        laps: [],
        totalDistance: 0,
        totalDuration: 0,
        averageSpeed: 0,
        maxSpeed: 0,
        status: 'completed',
        territoryEligible: false
      } as RunSession;
      // Stop real-time updates
      this.stopRealTimeUpdates();
      // Debounced full update
      this.debouncedUpdate?.();
    });

    // Listen for territory events
    this.subscribe('territory:claimed', (data: any) => {
      this.dashboardData.notifications.territoryClaimed = true;
      this.dashboardData.notifications.territoryEligible = false;
      this.debouncedUpdate?.();
    });

    this.subscribe('territory:eligible', (data: any) => {
      this.dashboardData.notifications.territoryEligible = true;
      this.debouncedUpdate?.();
    });

    // Listen for achievement events
    this.subscribe('game:achievementUnlocked', (data: any) => {
      this.dashboardData.notifications.achievementUnlocked = data.achievementId;
      if (this.dashboardData.recentActivity.recentAchievements) {
        this.dashboardData.recentActivity.recentAchievements.push(data.achievementId);
        // Keep only the last 5 achievements
        if (this.dashboardData.recentActivity.recentAchievements.length > 5) {
          this.dashboardData.recentActivity.recentAchievements.shift();
        }
      }
      this.debouncedUpdate?.();
    });

    // Listen for level up events
    this.subscribe('game:levelUp', (data: any) => {
      this.dashboardData.notifications.levelUp = data.newLevel;
      this.debouncedUpdate?.();
    });

    // Listen for wallet events
    this.subscribe('web3:walletConnected', (data: any) => {
      this.dashboardData.walletInfo = {
        address: data.address,
        chainId: data.chainId,
        networkName: '', // Will be updated in updateDashboardData
        balance: '0'
      };
      this.debouncedUpdate?.();
    });

    this.subscribe('web3:walletDisconnected', () => {
      this.dashboardData.walletInfo = null;
      this.debouncedUpdate?.();
    });

    // Listen for AI events
    this.subscribe('ai:routeReady', (data: any) => {
      this.dashboardData.aiInsights.suggestedRoute = data;
      this.debouncedUpdate?.();
    });

    this.subscribe('ai:territoryAnalyzed', (data: any) => {
      this.dashboardData.aiInsights.territoryAnalysis = data;
      this.debouncedUpdate?.();
    });
  }

  private startRealTimeUpdates(): void {
    if (this.realTimeUpdateInterval) return;
    
    // Start interval for continuous real-time updates during active runs
    this.realTimeUpdateInterval = setInterval(() => {
      this.throttledRealTimeUpdate?.();
    }, 2000); // Update every 2 seconds during active runs
  }

  private stopRealTimeUpdates(): void {
    if (this.realTimeUpdateInterval) {
      clearInterval(this.realTimeUpdateInterval);
      this.realTimeUpdateInterval = null;
    }
  }

  // Performance optimization methods
  private async lazyLoadDashboardData(): Promise<void> {
    // Only load data when dashboard becomes visible
    if (this.dashboardState.isVisible && !this.isDataLoaded) {
      await this.updateDashboardData();
      this.isDataLoaded = true;
    }
  }

  public show(): void {
    this.dashboardState.isVisible = true;
    this.dashboardState.isMinimized = false;
    this.dashboardState.lastUpdated = Date.now();
    
    // Lazy load data when dashboard is shown
    this.lazyLoadDashboardData();
    
    this.saveWidgetState();
    this.safeEmit('dashboard:visibilityChanged', { visible: true, minimized: false });
  }

  // Data access methods with lazy loading
  public getData(): DashboardData {
    // Trigger lazy loading if data hasn't been loaded yet
    if (this.dashboardState.isVisible && !this.isDataLoaded) {
      this.lazyLoadDashboardData();
    }
    return { ...this.dashboardData };
  }

  public subscribeToDataUpdates(callback: (data: { data: DashboardData; state: DashboardState }) => void): void {
    this.subscribe('dashboard:dataUpdated', callback);
  }

  public unsubscribeFromDataUpdates(callback: (data: { data: DashboardData; state: DashboardState }) => void): void {
    this.eventBus.off('dashboard:dataUpdated', callback);
  }

  public subscribeToVisibilityChanges(callback: (state: { visible: boolean; minimized: boolean }) => void): void {
    this.subscribe('dashboard:visibilityChanged', callback);
  }

  public unsubscribeFromVisibilityChanges(callback: (state: { visible: boolean; minimized: boolean }) => void): void {
    this.eventBus.off('dashboard:visibilityChanged', callback);
  }

  public hide(): void {
    this.dashboardState.isVisible = false;
    this.saveWidgetState();
    this.safeEmit('dashboard:visibilityChanged', { visible: false, minimized: this.isMinimized });
  }

  public toggle(): void {
    if (this.dashboardState.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  public minimize(): void {
    this.dashboardState.isMinimized = true;
    this.saveWidgetState();
    this.safeEmit('dashboard:visibilityChanged', { visible: this.dashboardState.isVisible, minimized: true });
  }

  public expand(): void {
    this.dashboardState.isMinimized = false;
    this.saveWidgetState();
    this.safeEmit('dashboard:visibilityChanged', { visible: this.dashboardState.isVisible, minimized: false });
  }

  public getState(): DashboardState {
    return { ...this.dashboardState };
  }

  // Cleanup
  public cleanup(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    this.stopRealTimeUpdates();
    super.cleanup();
  }
}