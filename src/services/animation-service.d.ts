/**
 * AnimationService - Centralized animation management
 * Provides consistent animations and transitions across the application
 */
import { BaseService } from '../core/base-service';
import type { Map as MapboxMap } from 'mapbox-gl';
import { GhostRunner } from './ai-service';
export interface AnimationConfig {
    duration?: number;
    easing?: string;
    delay?: number;
}
export declare class AnimationService extends BaseService {
    private static instance;
    map: MapboxMap | null;
    private userLocationMarker;
    private easingFunctions;
    constructor();
    static getInstance(): AnimationService;
    /**
     * Fade in an element
     */
    fadeIn(element: HTMLElement, config?: AnimationConfig): Promise<void>;
    /**
     * Fade out an element
     */
    fadeOut(element: HTMLElement, config?: AnimationConfig): Promise<void>;
    /**
     * Slide in from bottom
     */
    slideInBottom(element: HTMLElement, config?: AnimationConfig): Promise<void>;
    /**
     * Bounce animation for celebrations
     */
    bounce(element: HTMLElement, config?: AnimationConfig): Promise<void>;
    /**
     * Confetti effect for celebrations
     */
    confetti(element: HTMLElement, config?: AnimationConfig): Promise<void>;
    /**
     * Pulse animation for attention
     */
    pulse(element: HTMLElement, config?: AnimationConfig): Promise<void>;
    /**
     * Shake animation for errors or attention
     */
    shake(element: HTMLElement, config?: AnimationConfig): Promise<void>;
    /**
     * Add or update user location marker on the map with enhanced styling
     */
    updateUserLocationMarker(lng: number, lat: number): void;
    /**
     * Visualize AI-generated route on the map with animation
     */
    setAIRoute(coordinates: [number, number][], style: any, metadata: any): void;
    /**
     * Animate route drawing for enhanced user experience
     */
    private animateRouteDrawing;
    /**
     * Clear AI route from the map
     */
    clearAIRoute(): void;
    /**
     * Visualize AI waypoints on the map with interactive popups
     */
    setAIWaypoints(waypoints: any[], metadata: any): void;
    /**
     * Animate a route being drawn on the map
     */
    animateRoute(coordinates: [number, number][], options?: {
        duration?: number;
        color?: string;
        metadata?: any;
    }): void;
    /**
     * Add interactive popups to waypoints
     */
    private addWaypointPopups;
    /**
     * Add hover effect to waypoints
     */
    private addWaypointHoverEffect;
    readdRunToMap(run: any): void;
    animateSegment(segment: any): void;
    startGhostAnimation(ghost: GhostRunner): void;
    /**
     * Set or update a planned route on the map
     * This method handles both AI-generated routes and user-defined routes
     */
    setPlannedRoute(geojson: any): void;
    /**
     * Clear planned route from the map
     */
    clearPlannedRoute(): void;
}
