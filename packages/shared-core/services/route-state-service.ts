/**
 * RouteStateService - Centralized state management for route-related data
 * Provides consistent state handling and caching for AI-generated routes
 */

import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';

export interface RouteData {
  coordinates: [number, number][];
  distance: number;
  difficulty: number;
  waypoints?: any[];
  estimatedTime?: number;
  totalDistance?: number;
  generatedAt: number;
  source: 'ai' | 'user' | 'ghost';
}

export interface RouteState {
  currentRoute: RouteData | null;
  plannedRoutes: Map<string, RouteData>;
  activeRouteId: string | null;
}

export class RouteStateService extends BaseService {
  private static instance: RouteStateService;
  protected eventBus: EventBus;
  private routeState: RouteState;
  private cacheTimeout: number = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    super();
    this.eventBus = EventBus.getInstance();
    this.routeState = {
      currentRoute: null,
      plannedRoutes: new Map(),
      activeRouteId: null
    };
  }

  static getInstance(): RouteStateService {
    if (!RouteStateService.instance) {
      RouteStateService.instance = new RouteStateService();
    }
    return RouteStateService.instance;
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    this.safeEmit('service:initialized', { service: 'RouteStateService', success: true });
  }

  private setupEventListeners(): void {
    // Listen for AI route events
    this.eventBus.on('ai:routeReady', (data: any) => {
      this.setRouteData('ai-generated', {
        coordinates: data.route || [],
        distance: data.distance || 0,
        difficulty: data.difficulty || 50,
        waypoints: data.waypoints || [],
        estimatedTime: data.estimatedTime || 0,
        totalDistance: data.totalDistance || 0,
        generatedAt: Date.now(),
        source: 'ai'
      });
    });

    // Listen for route clear events
    this.eventBus.on('ai:routeClear', () => {
      this.clearCurrentRoute();
    });

    // Listen for run start events
    this.eventBus.on('run:started' as any, () => {
      // Don't clear route when run starts - user might want to see it during run
    });

    // Listen for run completion events
    this.eventBus.on('run:completed' as any, () => {
      // Optionally clear route after run completion
      // this.clearCurrentRoute();
    });
  }

  /**
   * Set current route data
   */
  public setRouteData(routeId: string, routeData: RouteData): void {
    // Store in planned routes
    this.routeState.plannedRoutes.set(routeId, routeData);
    
    // Set as current route
    this.routeState.currentRoute = routeData;
    this.routeState.activeRouteId = routeId;
    
    // Emit state change event
    this.safeEmit('route:stateChanged', {
      routeId,
      routeData,
      isActive: true
    });
    
    // Clean up old routes
    this.cleanupOldRoutes();
  }

  /**
   * Get current route data
   */
  public getCurrentRoute(): RouteData | null {
    return this.routeState.currentRoute;
  }

  /**
   * Get route by ID
   */
  public getRouteById(routeId: string): RouteData | undefined {
    return this.routeState.plannedRoutes.get(routeId);
  }

  /**
   * Activate a specific route
   */
  public activateRoute(routeId: string): boolean {
    const route = this.routeState.plannedRoutes.get(routeId);
    if (route) {
      this.routeState.currentRoute = route;
      this.routeState.activeRouteId = routeId;
      
      // Note: This event is not in the AppEvents interface
      // this.safeEmit('route:activated', {
      //   routeId,
      //   routeData: route
      // });
      
      return true;
    }
    return false;
  }

  /**
   * Clear current route
   */
  public clearCurrentRoute(): void {
    this.routeState.currentRoute = null;
    this.routeState.activeRouteId = null;
    
    this.safeEmit('route:cleared', {});
  }

  /**
   * Remove a specific route
   */
  public removeRoute(routeId: string): void {
    this.routeState.plannedRoutes.delete(routeId);
    
    if (this.routeState.activeRouteId === routeId) {
      this.clearCurrentRoute();
    }
    
    // Note: This event is not in the AppEvents interface
    // this.safeEmit('route:removed', { routeId });
  }

  /**
   * Check if route is still valid (not expired)
   */
  public isRouteValid(routeData: RouteData): boolean {
    return (Date.now() - routeData.generatedAt) < this.cacheTimeout;
  }

  /**
   * Clean up old/expired routes
   */
  private cleanupOldRoutes(): void {
    const now = Date.now();
    const expiredRoutes: string[] = [];
    
    this.routeState.plannedRoutes.forEach((route, routeId) => {
      if ((now - route.generatedAt) > this.cacheTimeout) {
        expiredRoutes.push(routeId);
      }
    });
    
    expiredRoutes.forEach(routeId => {
      this.removeRoute(routeId);
    });
  }

  /**
   * Get all planned routes
   */
  public getAllRoutes(): Map<string, RouteData> {
    return new Map(this.routeState.plannedRoutes);
  }

  /**
   * Get active route ID
   */
  public getActiveRouteId(): string | null {
    return this.routeState.activeRouteId;
  }
}