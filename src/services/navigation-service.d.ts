/**
 * NavigationService - Centralized navigation management
 * Handles routing, state management, and UI navigation
 */
import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';
export interface NavigationRoute {
    id: string;
    path: string;
    title: string;
    component?: string;
    icon?: string;
    visible?: boolean;
}
export interface NavigationState {
    currentRoute: string;
    previousRoute?: string;
    history: string[];
    params?: Record<string, any>;
}
export declare class NavigationService extends BaseService {
    private static instance;
    private domService;
    protected eventBus: EventBus;
    private routes;
    private state;
    private navigationContainer;
    private constructor();
    static getInstance(): NavigationService;
    /**
     * Register navigation routes
     */
    registerRoutes(routes: NavigationRoute[]): void;
    /**
     * Navigate to a specific route
     */
    navigateTo(routeId: string, params?: Record<string, any>): void;
    /**
     * Go back to previous route
     */
    goBack(): void;
    /**
     * Get current route information
     */
    getCurrentRoute(): NavigationRoute | undefined;
    /**
     * Get navigation state
     */
    getState(): NavigationState;
    /**
     * Check if a route is currently active
     */
    isRouteActive(routeId: string): boolean;
    /**
     * Create navigation UI (bottom navigation bar for mobile)
     */
    createNavigationUI(containerId?: string): void;
    /**
     * Update navigation UI based on current state
     */
    private updateNavigationUI;
    /**
     * Render navigation UI
     */
    private renderNavigation;
    /**
     * Create quick action buttons
     */
    createQuickActions(containerId?: string): void;
    /**
     * Protected initialization
     */
    protected onInitialize(): Promise<void>;
}
