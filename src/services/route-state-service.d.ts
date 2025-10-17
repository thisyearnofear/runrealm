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
export declare class RouteStateService extends BaseService {
    private static instance;
    protected eventBus: EventBus;
    private routeState;
    private cacheTimeout;
    private constructor();
    static getInstance(): RouteStateService;
    protected onInitialize(): Promise<void>;
    private setupEventListeners;
    /**
     * Set current route data
     */
    setRouteData(routeId: string, routeData: RouteData): void;
    /**
     * Get current route data
     */
    getCurrentRoute(): RouteData | null;
    /**
     * Get route by ID
     */
    getRouteById(routeId: string): RouteData | undefined;
    /**
     * Activate a specific route
     */
    activateRoute(routeId: string): boolean;
    /**
     * Clear current route
     */
    clearCurrentRoute(): void;
    /**
     * Remove a specific route
     */
    removeRoute(routeId: string): void;
    /**
     * Check if route is still valid (not expired)
     */
    isRouteValid(routeData: RouteData): boolean;
    /**
     * Clean up old/expired routes
     */
    private cleanupOldRoutes;
    /**
     * Get all planned routes
     */
    getAllRoutes(): Map<string, RouteData>;
    /**
     * Get active route ID
     */
    getActiveRouteId(): string | null;
}
