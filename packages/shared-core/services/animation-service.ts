/**
 * AnimationService - Centralized animation management
 * Provides consistent animations and transitions across the application
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import { BaseService } from '../core/base-service';
import { GhostRunner } from './ai-service';

export interface AnimationConfig {
  duration?: number;
  easing?: string;
  delay?: number;
}

export class AnimationService extends BaseService {
  private static instance: AnimationService;
  public map: MapboxMap | null = null;
  private userLocationMarker: any = null;

  // Common easing functions
  private easingFunctions = {
    linear: (t: number) => t,
    easeInQuad: (t: number) => t * t,
    easeOutQuad: (t: number) => t * (2 - t),
    easeInOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    easeOutElastic: (t: number) => {
      const p = 0.3;
      return 2 ** (-10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
    },
  };

  static getInstance(): AnimationService {
    if (!AnimationService.instance) {
      AnimationService.instance = new AnimationService();
    }
    return AnimationService.instance;
  }

  /**
   * Fade in an element
   */
  public fadeIn(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 300, easing = 'easeOutQuad', delay = 0 } = config;

    return new Promise((resolve) => {
      setTimeout(() => {
        element.style.opacity = '0';
        element.style.display = 'block';

        const startTime = performance.now();
        const easingFn =
          this.easingFunctions[easing as keyof typeof this.easingFunctions] ||
          this.easingFunctions.easeOutQuad;

        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easingFn(progress);

          element.style.opacity = easedProgress.toString();

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            resolve();
          }
        };

        requestAnimationFrame(animate);
      }, delay);
    });
  }

  /**
   * Fade out an element
   */
  public fadeOut(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 300, easing = 'easeOutQuad', delay = 0 } = config;

    return new Promise((resolve) => {
      setTimeout(() => {
        const startTime = performance.now();
        const easingFn =
          this.easingFunctions[easing as keyof typeof this.easingFunctions] ||
          this.easingFunctions.easeOutQuad;

        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easingFn(progress);

          element.style.opacity = (1 - easedProgress).toString();

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            element.style.display = 'none';
            resolve();
          }
        };

        requestAnimationFrame(animate);
      }, delay);
    });
  }

  /**
   * Slide in from bottom
   */
  public slideInBottom(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 300, easing = 'easeOutQuad', delay = 0 } = config;

    return new Promise((resolve) => {
      setTimeout(() => {
        // Store original styles
        const originalTransform = element.style.transform;
        const originalOpacity = element.style.opacity;

        // Set initial state
        element.style.transform = 'translateY(100%)';
        element.style.opacity = '0';
        element.style.display = 'block';

        const startTime = performance.now();
        const easingFn =
          this.easingFunctions[easing as keyof typeof this.easingFunctions] ||
          this.easingFunctions.easeOutQuad;

        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easingFn(progress);

          element.style.transform = `translateY(${(1 - easedProgress) * 100}%)`;
          element.style.opacity = easedProgress.toString();

          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            element.style.transform = originalTransform;
            element.style.opacity = originalOpacity;
            resolve();
          }
        };

        requestAnimationFrame(animate);
      }, delay);
    });
  }

  /**
   * Bounce animation for celebrations
   */
  public bounce(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 600, delay = 0 } = config;

    return new Promise((resolve) => {
      setTimeout(() => {
        const keyframes = [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1.2)', offset: 0.3 },
          { transform: 'scale(0.9)', offset: 0.6 },
          { transform: 'scale(1.1)', offset: 0.8 },
          { transform: 'scale(1)', offset: 1 },
        ];

        const animation = element.animate(keyframes, {
          duration,
          easing: 'ease-out',
        });

        animation.onfinish = () => resolve();
      }, delay);
    });
  }

  /**
   * Confetti effect for celebrations
   */
  public confetti(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 3000, delay = 0 } = config;

    return new Promise((resolve) => {
      setTimeout(() => {
        // Create confetti container
        const confettiContainer = document.createElement('div');
        confettiContainer.style.position = 'absolute';
        confettiContainer.style.top = '0';
        confettiContainer.style.left = '0';
        confettiContainer.style.width = '100%';
        confettiContainer.style.height = '100%';
        confettiContainer.style.pointerEvents = 'none';
        confettiContainer.style.zIndex = '10000';
        confettiContainer.style.overflow = 'hidden';

        element.appendChild(confettiContainer);

        // Create confetti pieces
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
        const confettiCount = 100;

        for (let i = 0; i < confettiCount; i++) {
          const confetti = document.createElement('div');
          confetti.style.position = 'absolute';
          confetti.style.width = `${Math.random() * 10 + 5}px`;
          confetti.style.height = `${Math.random() * 10 + 5}px`;
          confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
          confetti.style.borderRadius = Math.random() > 0.5 ? '50%' : '0';
          confetti.style.left = `${Math.random() * 100}%`;
          confetti.style.top = '-20px';
          confetti.style.opacity = '0';
          confetti.style.transform = `rotate(${Math.random() * 360}deg)`;

          confettiContainer.appendChild(confetti);

          // Animate confetti
          const animation = confetti.animate(
            [
              { transform: 'translateY(0) rotate(0deg)', opacity: 0 },
              { transform: 'translateY(20px) rotate(90deg)', opacity: 1, offset: 0.1 },
              {
                transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 360}deg)`,
                opacity: 0,
              },
            ],
            {
              duration: duration,
              easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)',
            }
          );

          animation.onfinish = () => {
            confetti.remove();
          };
        }

        // Add some special effects
        const specialEffects = document.createElement('div');
        specialEffects.style.position = 'absolute';
        specialEffects.style.top = '50%';
        specialEffects.style.left = '50%';
        specialEffects.style.transform = 'translate(-50%, -50%)';
        specialEffects.style.fontSize = '48px';
        specialEffects.style.fontWeight = 'bold';
        specialEffects.style.color = '#00bd00';
        specialEffects.style.opacity = '0';
        specialEffects.style.zIndex = '10001';
        specialEffects.textContent = '🎉';

        confettiContainer.appendChild(specialEffects);

        // Animate special effects
        const specialAnimation = specialEffects.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0)', opacity: 1 },
            { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 1, offset: 0.5 },
            { transform: 'translate(-50%, -50%) scale(2)', opacity: 0 },
          ],
          {
            duration: duration / 2,
            easing: 'ease-out',
          }
        );

        specialAnimation.onfinish = () => {
          specialEffects.remove();
        };

        // Remove container after animation
        setTimeout(() => {
          confettiContainer.remove();
          resolve();
        }, duration);
      }, delay);
    });
  }

  /**
   * Pulse animation for attention
   */
  public pulse(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 1000, delay = 0 } = config;

    return new Promise((resolve) => {
      setTimeout(() => {
        const keyframes = [
          { transform: 'scale(1)', opacity: 1, offset: 0 },
          { transform: 'scale(1.05)', opacity: 0.7, offset: 0.5 },
          { transform: 'scale(1)', opacity: 1, offset: 1 },
        ];

        const animation = element.animate(keyframes, {
          duration,
          iterations: 2,
        });

        animation.onfinish = () => resolve();
      }, delay);
    });
  }

  /**
   * Shake animation for errors or attention
   */
  public shake(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 500, delay = 0 } = config;

    return new Promise((resolve) => {
      setTimeout(() => {
        const keyframes = [
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(-10px)', offset: 0.1 },
          { transform: 'translateX(10px)', offset: 0.2 },
          { transform: 'translateX(-10px)', offset: 0.3 },
          { transform: 'translateX(10px)', offset: 0.4 },
          { transform: 'translateX(-10px)', offset: 0.5 },
          { transform: 'translateX(10px)', offset: 0.6 },
          { transform: 'translateX(-10px)', offset: 0.7 },
          { transform: 'translateX(10px)', offset: 0.8 },
          { transform: 'translateX(-5px)', offset: 0.9 },
          { transform: 'translateX(0)', offset: 1 },
        ];

        const animation = element.animate(keyframes, {
          duration,
          easing: 'ease-in-out',
        });

        animation.onfinish = () => resolve();
      }, delay);
    });
  }

  /**
   * Add or update user location marker on the map with enhanced styling
   */
  public updateUserLocationMarker(lng: number, lat: number): void {
    if (!this.map) {
      console.warn('AnimationService: Map not available for location marker');
      return;
    }

    // Remove existing marker if it exists
    if (this.userLocationMarker) {
      this.userLocationMarker.remove();
    }

    // Create a more visually appealing marker element with pulse effect
    const markerElement = document.createElement('div');
    markerElement.style.position = 'relative';
    markerElement.style.width = '24px';
    markerElement.style.height = '24px';

    // Inner circle
    const innerCircle = document.createElement('div');
    innerCircle.style.width = '16px';
    innerCircle.style.height = '16px';
    innerCircle.style.borderRadius = '50%';
    innerCircle.style.backgroundColor = '#00bd00';
    innerCircle.style.position = 'absolute';
    innerCircle.style.top = '4px';
    innerCircle.style.left = '4px';
    innerCircle.style.zIndex = '2';

    // Outer circle with pulse animation
    const outerCircle = document.createElement('div');
    outerCircle.style.width = '24px';
    outerCircle.style.height = '24px';
    outerCircle.style.borderRadius = '50%';
    outerCircle.style.backgroundColor = 'rgba(0, 189, 0, 0.3)';
    outerCircle.style.position = 'absolute';
    outerCircle.style.top = '0';
    outerCircle.style.left = '0';
    outerCircle.style.zIndex = '1';
    outerCircle.style.boxShadow = '0 0 0 0 rgba(0, 189, 0, 0.7)';
    outerCircle.style.animation = 'pulse 2s infinite';

    // Add CSS for pulse animation
    if (!document.getElementById('pulse-animation-style')) {
      const style = document.createElement('style');
      style.id = 'pulse-animation-style';
      style.textContent = `
        @keyframes pulse {
          0% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(0, 189, 0, 0.7);
          }
          70% {
            transform: scale(1);
            box-shadow: 0 0 0 10px rgba(0, 189, 0, 0);
          }
          100% {
            transform: scale(0.95);
            box-shadow: 0 0 0 0 rgba(0, 189, 0, 0);
          }
        }
      `;
      document.head.appendChild(style);
    }

    markerElement.appendChild(outerCircle);
    markerElement.appendChild(innerCircle);

    // Create marker using Mapbox
    const mapboxgl = (window as any).mapboxgl;
    if (mapboxgl?.Marker) {
      this.userLocationMarker = new mapboxgl.Marker({
        element: markerElement,
        anchor: 'center',
      })
        .setLngLat([lng, lat])
        .addTo(this.map);

      // Add a subtle bounce effect when the marker is added
      markerElement.style.animation = 'bounce 0.5s';

      // Add CSS for bounce animation
      if (!document.getElementById('bounce-animation-style')) {
        const style = document.createElement('style');
        style.id = 'bounce-animation-style';
        style.textContent = `
          @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
              transform: translateY(0);
            }
            40% {
              transform: translateY(-10px);
            }
            60% {
              transform: translateY(-5px);
            }
          }
        `;
        document.head.appendChild(style);
      }
    } else {
      console.warn('AnimationService: MapboxGL not available for marker creation');
    }
  }

  /**
   * Visualize AI-generated route on the map with animation
   */
  public setAIRoute(coordinates: [number, number][], style: any, metadata: any): void {
    if (!this.map) {
      console.warn('AnimationService: Map not available for route visualization');
      return;
    }

    // Validate coordinates
    if (!coordinates || coordinates.length < 2) {
      console.warn('AnimationService: Invalid coordinates for route visualization');
      return;
    }

    console.log('AnimationService: Visualizing AI route with', coordinates.length, 'coordinates');

    // Remove existing AI route layer if it exists
    this.clearAIRoute();

    // Animate the route drawing
    this.animateRouteDrawing(coordinates, style, metadata);
  }

  /**
   * Animate route drawing for enhanced user experience
   */
  private async animateRouteDrawing(
    coordinates: [number, number][],
    style: any,
    metadata: any
  ): Promise<void> {
    if (!this.map) return;

    // Add source for the route
    try {
      this.map.addSource('ai-route-source', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {
            ...metadata,
            source: 'ai-route',
          },
          geometry: {
            type: 'LineString',
            coordinates: [], // Start with empty coordinates
          },
        },
      });

      // Add layer for the route
      this.map.addLayer({
        id: 'ai-route-layer',
        type: 'line',
        source: 'ai-route-source',
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': style?.color || '#00ff88',
          'line-width': style?.width || 4,
          'line-opacity': style?.opacity || 0.8,
          'line-dasharray': style?.dashArray || [5, 5],
        },
      });

      // Animate the drawing of the route
      const animationDuration = 2000; // 2 seconds
      const startTime = performance.now();
      const totalPoints = coordinates.length;

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        const pointsToShow = Math.floor(progress * totalPoints);

        // Update the source with progressively more coordinates
        if (this.map?.getSource('ai-route-source')) {
          const partialCoordinates = coordinates.slice(0, Math.max(2, pointsToShow));

          (this.map.getSource('ai-route-source') as any).setData({
            type: 'Feature',
            properties: {
              ...metadata,
              source: 'ai-route',
            },
            geometry: {
              type: 'LineString',
              coordinates: partialCoordinates,
            },
          });
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          // Ensure all coordinates are shown
          if (this.map?.getSource('ai-route-source')) {
            (this.map.getSource('ai-route-source') as any).setData({
              type: 'Feature',
              properties: {
                ...metadata,
                source: 'ai-route',
              },
              geometry: {
                type: 'LineString',
                coordinates: coordinates,
              },
            });
          }
          console.log('AnimationService: AI route visualized successfully with animation');
        }
      };

      requestAnimationFrame(animate);
    } catch (error) {
      console.error('AnimationService: Failed to visualize AI route:', error);
    }
  }

  /**
   * Clear AI route from the map
   */
  public clearAIRoute(): void {
    if (!this.map) return;

    // Remove layer if it exists
    if (this.map.getLayer('ai-route-layer')) {
      this.map.removeLayer('ai-route-layer');
    }

    // Remove source if it exists
    if (this.map.getSource('ai-route-source')) {
      this.map.removeSource('ai-route-source');
    }

    console.log('AnimationService: AI route cleared');
  }

  /**
   * Visualize AI waypoints on the map with interactive popups
   */
  public setAIWaypoints(waypoints: any[], _metadata: any): void {
    if (!this.map || !waypoints || waypoints.length === 0) {
      console.warn('AnimationService: Invalid waypoints for visualization');
      return;
    }

    console.log('AnimationService: Visualizing', waypoints.length, 'AI waypoints');

    // Convert waypoints to GeoJSON format
    const geoJson = {
      type: 'FeatureCollection',
      features: waypoints.map((wp, index) => ({
        type: 'Feature',
        properties: {
          ...wp,
          index,
        },
        geometry: {
          type: 'Point',
          coordinates: [wp.coordinates[0], wp.coordinates[1]], // [lng, lat]
        },
      })),
    };

    // Remove existing waypoints layer if it exists
    if (this.map.getLayer('ai-waypoints-layer')) {
      this.map.removeLayer('ai-waypoints-layer');
    }
    if (this.map.getSource('ai-waypoints-source')) {
      this.map.removeSource('ai-waypoints-source');
    }

    // Remove existing waypoints popup layer if it exists
    if (this.map.getLayer('ai-waypoints-labels')) {
      this.map.removeLayer('ai-waypoints-labels');
    }

    // Add source for the waypoints
    try {
      this.map.addSource('ai-waypoints-source', {
        type: 'geojson',
        data: geoJson as any,
      });

      // Add layer for the waypoints
      this.map.addLayer({
        id: 'ai-waypoints-layer',
        type: 'circle',
        source: 'ai-waypoints-source',
        paint: {
          'circle-radius': 12,
          'circle-color': [
            'match',
            ['get', 'type'],
            'territory_claim',
            '#ff0000',
            'rest_stop',
            '#0000ff',
            'landmark',
            '#ffff00',
            'strategic',
            '#ff00ff',
            '#00ffff', // default color
          ],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-opacity': 0.9,
        },
      });

      // Add labels for the waypoints
      this.map.addLayer({
        id: 'ai-waypoints-labels',
        type: 'symbol',
        source: 'ai-waypoints-source',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-size': 12,
          'text-offset': [0, 1.5],
          'text-anchor': 'top',
        },
        paint: {
          'text-color': '#000000',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
      });

      // Add popup interactions
      this.addWaypointPopups(waypoints);

      // Add hover effect
      this.addWaypointHoverEffect();

      console.log('AnimationService: AI waypoints visualized successfully');
    } catch (error) {
      console.error('AnimationService: Failed to visualize AI waypoints:', error);
    }
  }

  /**
   * Animate a route being drawn on the map
   */
  public animateRoute(
    coordinates: [number, number][],
    options: {
      duration?: number;
      color?: string;
      metadata?: any;
    } = {}
  ): void {
    if (!this.map || !coordinates || coordinates.length < 2) {
      console.warn('AnimationService: Invalid coordinates for route animation');
      return;
    }

    const { duration = 2000, color = '#00ff88', metadata = {} } = options;
    const totalPoints = coordinates.length;
    const startTime = performance.now();
    const animationDuration = duration;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      const pointsToShow = Math.floor(progress * totalPoints);

      // Update the source with progressively more coordinates
      if (this.map?.getSource('planned-route-source')) {
        const partialCoordinates = coordinates.slice(0, Math.max(2, pointsToShow));

        (this.map.getSource('planned-route-source') as any).setData({
          type: 'Feature',
          properties: {
            ...metadata,
            source: 'planned-route',
          },
          geometry: {
            type: 'LineString',
            coordinates: partialCoordinates,
          },
        });
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Ensure all coordinates are shown
        if (this.map?.getSource('planned-route-source')) {
          (this.map.getSource('planned-route-source') as any).setData({
            type: 'Feature',
            properties: {
              ...metadata,
              source: 'planned-route',
            },
            geometry: {
              type: 'LineString',
              coordinates: coordinates,
            },
          });
        }
        console.log('AnimationService: Route animated successfully');
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Add interactive popups to waypoints
   */
  private addWaypointPopups(_waypoints: any[]): void {
    if (!this.map) return;

    // Create popup element
    const popup = new (window as any).mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
    });

    // Add mouse event listeners
    this.map.on('mouseenter', 'ai-waypoints-layer', (e: any) => {
      if (!this.map) return;

      // Change the cursor style as a UI indicator
      this.map.getCanvas().style.cursor = 'pointer';

      // Copy coordinates array
      const coordinates = e.features[0].geometry.coordinates.slice();
      const props = e.features[0].properties;

      // Ensure that if the map is zoomed out such that multiple
      // copies of the feature are visible, the popup appears
      // over the copy being pointed to
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      // Populate the popup and set its coordinates
      let description = `<strong>${props.name}</strong><br/>`;
      description += `<small>Type: ${props.type}</small><br/>`;

      if (props.description) {
        description += `<p>${props.description}</p>`;
      }

      if (props.territoryValue) {
        description += `<p>Territory Value: ${props.territoryValue}/100</p>`;
      }

      if (props.estimatedReward) {
        description += `<p>Estimated Reward: ${props.estimatedReward} REALM</p>`;
      }

      if (props.claimPriority) {
        description += `<p>Priority: ${props.claimPriority}</p>`;
      }

      popup.setLngLat(coordinates).setHTML(description).addTo(this.map);
    });

    this.map.on('mouseleave', 'ai-waypoints-layer', () => {
      if (!this.map) return;

      this.map.getCanvas().style.cursor = '';
      popup.remove();
    });
  }

  /**
   * Add hover effect to waypoints
   */
  private addWaypointHoverEffect(): void {
    if (!this.map) return;

    // When the user moves their mouse over the waypoints, we'll update the cursor
    this.map.on('mouseenter', 'ai-waypoints-layer', () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = 'pointer';
      }
    });

    this.map.on('mouseleave', 'ai-waypoints-layer', () => {
      if (this.map) {
        this.map.getCanvas().style.cursor = '';
      }
    });
  }

  // Placeholder methods to satisfy type checking
  public readdRunToMap(_run: any): void {
    // Implementation would go here
  }

  public animateSegment(_segment: any): void {
    // Implementation would go here
  }

  public startGhostAnimation(ghost: GhostRunner): void {
    if (!this.map || !ghost.route || ghost.route.length < 2) {
      console.warn('AnimationService: Map not available or invalid route for ghost animation');
      return;
    }

    const ghostMarkerElement = document.createElement('div');
    ghostMarkerElement.className = 'ghost-marker'; // I'll need to add styles for this

    const ghostMarker = new (window as any).mapboxgl.Marker({
      element: ghostMarkerElement,
    })
      .setLngLat([ghost.route[0].lng, ghost.route[0].lat])
      .addTo(this.map);

    const startTime = Date.now();
    const runDuration = ghost.route[ghost.route.length - 1].timestamp - ghost.route[0].timestamp;

    const animate = () => {
      const elapsedTime = Date.now() - startTime;
      const progress = Math.min(elapsedTime / runDuration, 1);

      // Find the current segment
      if (!ghost.route || ghost.route.length < 2) return;
      let currentSegmentIndex = -1;
      for (let i = 0; i < ghost.route.length - 1; i++) {
        if (
          elapsedTime >= ghost.route[i].timestamp - ghost.route[0].timestamp &&
          elapsedTime <= ghost.route[i + 1].timestamp - ghost.route[0].timestamp
        ) {
          currentSegmentIndex = i;
          break;
        }
      }

      if (currentSegmentIndex !== -1) {
        const segmentStart = ghost.route[currentSegmentIndex];
        const segmentEnd = ghost.route[currentSegmentIndex + 1];
        const segmentDuration = segmentEnd.timestamp - segmentStart.timestamp;
        const timeIntoSegment = elapsedTime - (segmentStart.timestamp - ghost.route[0].timestamp);
        const segmentProgress = timeIntoSegment / segmentDuration;

        const lng = segmentStart.lng + (segmentEnd.lng - segmentStart.lng) * segmentProgress;
        const lat = segmentStart.lat + (segmentEnd.lat - segmentStart.lat) * segmentProgress;

        ghostMarker.setLngLat([lng, lat]);

        this.safeEmit('ghost:progress', {
          ghostId: ghost.id,
          progress: progress * 100,
          location: { lat, lng },
        });
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        ghostMarker.remove();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Set or update a planned route on the map
   * This method handles both AI-generated routes and user-defined routes
   */
  public setPlannedRoute(geojson: any): void {
    if (!this.map || !geojson) {
      console.warn('AnimationService: Map or geojson not available for planned route');
      return;
    }

    try {
      // Ensure we have a valid GeoJSON structure
      const featureCollection =
        geojson.type === 'FeatureCollection'
          ? geojson
          : geojson.type === 'Feature'
            ? { type: 'FeatureCollection', features: [geojson] }
            : null;

      if (!featureCollection) {
        console.warn('AnimationService: Invalid GeoJSON for planned route');
        return;
      }

      // Remove existing planned route if it exists
      if (this.map.getLayer('planned-route-layer')) {
        this.map.removeLayer('planned-route-layer');
      }
      if (this.map.getSource('planned-route-source')) {
        this.map.removeSource('planned-route-source');
      }

      // Add source for the planned route
      this.map.addSource('planned-route-source', {
        type: 'geojson',
        data: featureCollection as any,
      });

      // Add layer for the planned route
      this.map.addLayer({
        id: 'planned-route-layer',
        type: 'line',
        source: 'planned-route-source',
        paint: {
          'line-color': '#00ff88',
          'line-width': 4,
          'line-opacity': 0.8,
          'line-dasharray': [2, 2],
        },
      });

      // If we have a LineString feature, animate it
      const lineFeature = featureCollection.features.find(
        (f: any) => f.geometry.type === 'LineString'
      );
      if (lineFeature) {
        this.animateRoute(lineFeature.geometry.coordinates, {
          duration: 2000,
          color: '#00ff88',
          metadata: lineFeature.properties,
        });
      }

      console.log('AnimationService: Planned route set successfully');
    } catch (error) {
      console.error('AnimationService: Failed to set planned route:', error);
    }
  }

  /**
   * Clear planned route from the map
   */
  public clearPlannedRoute(): void {
    if (!this.map) return;

    // Remove layer if it exists
    if (this.map.getLayer('planned-route-layer')) {
      this.map.removeLayer('planned-route-layer');
    }

    // Remove source if it exists
    if (this.map.getSource('planned-route-source')) {
      this.map.removeSource('planned-route-source');
    }

    console.log('AnimationService: Planned route cleared');
  }
}
