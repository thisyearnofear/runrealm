/**
 * NavigationService - Centralized navigation management
 * Handles routing, state management, and UI navigation
 */
import { BaseService } from '../core/base-service';
import { EventBus } from '../core/event-bus';
import { DOMService } from './dom-service';
export class NavigationService extends BaseService {
    constructor() {
        super();
        this.routes = new Map();
        this.state = {
            currentRoute: 'map',
            history: [],
            params: {}
        };
        this.navigationContainer = null;
        this.domService = DOMService.getInstance();
        this.eventBus = EventBus.getInstance();
    }
    static getInstance() {
        if (!NavigationService.instance) {
            NavigationService.instance = new NavigationService();
        }
        return NavigationService.instance;
    }
    /**
     * Register navigation routes
     */
    registerRoutes(routes) {
        routes.forEach(route => {
            this.routes.set(route.id, route);
        });
        // Emit event for UI updates
        this.safeEmit('navigation:routesRegistered', { routes });
    }
    /**
     * Navigate to a specific route
     */
    navigateTo(routeId, params) {
        const route = this.routes.get(routeId);
        if (!route) {
            console.warn(`Route ${routeId} not found`);
            return;
        }
        // Update navigation state
        this.state.previousRoute = this.state.currentRoute;
        this.state.history.push(this.state.currentRoute);
        this.state.currentRoute = routeId;
        this.state.params = params || {};
        // Limit history to prevent memory issues
        if (this.state.history.length > 50) {
            this.state.history = this.state.history.slice(-25);
        }
        // Update UI
        this.updateNavigationUI();
        // Emit navigation event
        this.safeEmit('navigation:routeChanged', {
            routeId,
            route,
            params,
            previousRoute: this.state.previousRoute
        });
    }
    /**
     * Go back to previous route
     */
    goBack() {
        if (this.state.history.length > 0) {
            const previousRoute = this.state.history.pop();
            this.state.previousRoute = this.state.currentRoute;
            this.state.currentRoute = previousRoute;
            this.updateNavigationUI();
            this.safeEmit('navigation:routeChanged', {
                routeId: previousRoute,
                route: this.routes.get(previousRoute),
                params: this.state.params,
                previousRoute: this.state.previousRoute
            });
        }
    }
    /**
     * Get current route information
     */
    getCurrentRoute() {
        return this.routes.get(this.state.currentRoute);
    }
    /**
     * Get navigation state
     */
    getState() {
        return { ...this.state };
    }
    /**
     * Check if a route is currently active
     */
    isRouteActive(routeId) {
        return this.state.currentRoute === routeId;
    }
    /**
     * Create navigation UI (bottom navigation bar for mobile)
     */
    createNavigationUI(containerId = 'navigation-container') {
        const container = this.domService.getElement(containerId);
        if (!container) {
            console.warn(`Navigation container ${containerId} not found`);
            return;
        }
        this.navigationContainer = container;
        this.renderNavigation();
    }
    /**
     * Update navigation UI based on current state
     */
    updateNavigationUI() {
        if (this.navigationContainer) {
            this.renderNavigation();
        }
    }
    /**
     * Render navigation UI
     */
    renderNavigation() {
        if (!this.navigationContainer)
            return;
        // Clear existing content
        this.navigationContainer.innerHTML = '';
        // Filter visible routes
        const visibleRoutes = Array.from(this.routes.values()).filter(route => route.visible !== false);
        // Create navigation bar
        const navBar = this.domService.createElement('nav', {
            className: 'bottom-navigation',
            style: {
                display: 'flex',
                justifyContent: 'space-around',
                alignItems: 'center',
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                height: '60px',
                backgroundColor: 'white',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
                zIndex: '1000'
            }
        });
        // Create navigation items
        visibleRoutes.forEach(route => {
            const isActive = this.isRouteActive(route.id);
            const navItem = this.domService.createElement('button', {
                className: `nav-item ${isActive ? 'active' : ''}`,
                style: {
                    flex: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'none',
                    border: 'none',
                    padding: '8px 0',
                    cursor: 'pointer',
                    color: isActive ? '#00bd00' : '#999',
                    fontSize: '12px'
                }
            });
            // Add icon if available
            if (route.icon) {
                const icon = this.domService.createElement('span', {
                    className: 'nav-icon',
                    innerHTML: route.icon,
                    style: {
                        fontSize: '20px',
                        marginBottom: '4px'
                    }
                });
                navItem.appendChild(icon);
            }
            // Add title
            const title = this.domService.createElement('span', {
                textContent: route.title,
                style: {
                    fontSize: '10px'
                }
            });
            navItem.appendChild(title);
            // Add click handler
            navItem.addEventListener('click', () => {
                this.navigateTo(route.id);
            });
            navBar.appendChild(navItem);
        });
        this.navigationContainer.appendChild(navBar);
    }
    /**
     * Create quick action buttons
     */
    createQuickActions(containerId = 'quick-actions-container') {
        const container = this.domService.getElement(containerId);
        if (!container)
            return;
        // Clear existing content
        container.innerHTML = '';
        // Create quick actions container
        const actionsContainer = this.domService.createElement('div', {
            className: 'quick-actions',
            style: {
                position: 'fixed',
                bottom: '80px',
                right: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '15px',
                zIndex: '999'
            }
        });
        // Common quick actions
        const actions = [
            {
                id: 'start-run',
                icon: '🏃',
                title: 'Start Run',
                action: () => this.eventBus.emit('run:startRequested', { runId: 'quick-action-' + Date.now() })
            },
            {
                id: 'claim-territory',
                icon: '🗺️',
                title: 'Claim Territory',
                action: () => this.eventBus.emit('territory:claimRequested', { runId: 'quick-action-' + Date.now() })
            },
            {
                id: 'ai-route',
                icon: '🤖',
                title: 'AI Route',
                action: () => this.eventBus.emit('ai:routeRequested', {})
            }
        ];
        actions.forEach(action => {
            const button = this.domService.createElement('button', {
                id: `quick-action-${action.id}`,
                className: 'quick-action-button',
                innerHTML: `
          <div style="font-size: 24px; margin-bottom: 4px;">${action.icon}</div>
          <div style="font-size: 10px;">${action.title}</div>
        `,
                style: {
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    backgroundColor: '#00bd00',
                    color: 'white',
                    border: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0,189,0,0.3)',
                    transition: 'all 0.2s ease'
                }
            });
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'scale(1.1)';
            });
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'scale(1)';
            });
            button.addEventListener('click', () => {
                action.action();
            });
            actionsContainer.appendChild(button);
        });
        container.appendChild(actionsContainer);
    }
    /**
     * Protected initialization
     */
    async onInitialize() {
        // Set up default routes
        this.registerRoutes([
            {
                id: 'map',
                path: '/',
                title: 'Map',
                icon: '🗺️',
                visible: true
            },
            {
                id: 'territories',
                path: '/territories',
                title: 'Territories',
                icon: '🏆',
                visible: true
            },
            {
                id: 'profile',
                path: '/profile',
                title: 'Profile',
                icon: '👤',
                visible: true
            },
            {
                id: 'leaderboard',
                path: '/leaderboard',
                title: 'Leaderboard',
                icon: '🏅',
                visible: true
            }
        ]);
        this.safeEmit('service:initialized', { service: 'NavigationService', success: true });
    }
}
