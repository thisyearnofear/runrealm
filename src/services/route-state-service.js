/**
 * RouteStateService - Centralized state management for route-related data
 * Provides consistent state handling and caching for AI-generated routes
 */
import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';
export class RouteStateService extends BaseService {
    constructor() {
        super();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
        this.eventBus = EventBus.getInstance();
        this.routeState = {
            currentRoute: null,
            plannedRoutes: new Map(),
            activeRouteId: null
        };
    }
    static getInstance() {
        if (!RouteStateService.instance) {
            RouteStateService.instance = new RouteStateService();
        }
        return RouteStateService.instance;
    }
    async onInitialize() {
        this.setupEventListeners();
        this.safeEmit('service:initialized', { service: 'RouteStateService', success: true });
    }
    setupEventListeners() {
        // Listen for AI route events
        this.eventBus.on('ai:routeReady', (data) => {
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
        this.eventBus.on('run:started', () => {
            // Don't clear route when run starts - user might want to see it during run
        });
        // Listen for run completion events
        this.eventBus.on('run:completed', () => {
            // Optionally clear route after run completion
            // this.clearCurrentRoute();
        });
    }
    /**
     * Set current route data
     */
    setRouteData(routeId, routeData) {
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
    getCurrentRoute() {
        return this.routeState.currentRoute;
    }
    /**
     * Get route by ID
     */
    getRouteById(routeId) {
        return this.routeState.plannedRoutes.get(routeId);
    }
    /**
     * Activate a specific route
     */
    activateRoute(routeId) {
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
    clearCurrentRoute() {
        this.routeState.currentRoute = null;
        this.routeState.activeRouteId = null;
        this.safeEmit('route:cleared', {});
    }
    /**
     * Remove a specific route
     */
    removeRoute(routeId) {
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
    isRouteValid(routeData) {
        return (Date.now() - routeData.generatedAt) < this.cacheTimeout;
    }
    /**
     * Clean up old/expired routes
     */
    cleanupOldRoutes() {
        const now = Date.now();
        const expiredRoutes = [];
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
    getAllRoutes() {
        return new Map(this.routeState.plannedRoutes);
    }
    /**
     * Get active route ID
     */
    getActiveRouteId() {
        return this.routeState.activeRouteId;
    }
}
