import { Map, GeoJSONSource, LineLayer } from 'mapbox-gl';
import { RunSegment, CurrentRun } from './current-run';
import { FeatureCollection, LineString } from 'geojson';

/**
 * Responsible for display of the layers for the lines for the run's route.
 * Handles requests to add a new segment to the map and animating along
 * the length of the line. Requests while drawing will complete the
 * current animation, then kick off the next segment.
 */
export class AnimationService {
  private map: Map;

  private animationFrame: number;
  private currentSegment: RunSegment;
  private counter = 0;

  private activeGeo: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: [],
      geometry: {
        type: 'LineString',
        coordinates: [
        ]
      }
    }]
  };

  constructor(map: Map) {
    this.map = map;
  }

  /**
   * Called upon map style load in order to add all of the
   * current run's segments back as visible layers.
   * @param run The page's CurrentRun with segments to add to the map
   */
  public readdRunToMap(run: CurrentRun) {
    if (run) {
      for (let segment of run.segments) {
        const layer = this.getLineLayer(segment.id, segment.geometry.coordinates);
        this.map.addLayer(layer);
      }
    }
  }

  /**
   * Queue up animating the addition of a new segment to the map.
   * @param segment The RunSegment to add to the map
   */
  public animateSegment(segment: RunSegment) {
    // finish current animation if necessary
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      for (; this.counter < this.currentSegment.geometry.coordinates.length; this.counter++) {
        const currentCoordinates = this.currentSegment.geometry.coordinates[this.counter];
        this.setLayerGeojson(this.currentSegment.id, currentCoordinates);
      }
    }
    // initialize
    this.currentSegment = segment;
    this.activeGeo.features[0].geometry.coordinates = [this.currentSegment.geometry.coordinates[0]];
    // add new layer
    let layer = this.getLineLayer(segment.id);
    this.map.addLayer(layer);
    // kick off animation loop
    this.counter = 0;
    this.animationFrame = requestAnimationFrame(() => this.animationCallback());
  }

  /**
   * Unbelievably naive way to animate:
   * Add each coordinate from the segment to the layer at the mercy of `requestAnimationFrame`
   */
  private animationCallback() {
    if (this.counter === this.currentSegment.geometry.coordinates.length) {
      this.animationFrame = undefined;
    } else {
      const nextCoordinate = this.currentSegment.geometry.coordinates[this.counter];
      this.setLayerGeojson(this.currentSegment.id, nextCoordinate);
      this.counter++;
      this.animationFrame = requestAnimationFrame(() => this.animationCallback());
    }
  }

  private setLayerGeojson(id: string, coordinates: number[]) {
    this.activeGeo.features[0].geometry.coordinates.push(coordinates);
    const source = this.map.getSource(id) as GeoJSONSource;
    source.setData(this.activeGeo);
  }

  // Minimal hook to render a planned route layer (dashed)
  public setPlannedRoute(geojson: FeatureCollection<LineString> | any) {
    const sourceId = 'planned-route';
    const layerId = 'planned-route-line';

    const hasSource = !!this.map.getSource(sourceId);
    if (!hasSource) {
      this.map.addSource(sourceId, { type: 'geojson', data: geojson });
      this.map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#ff00aa',
          'line-width': 3,
          'line-opacity': 0.9,
          'line-dasharray': [2, 2]
        }
      } as any);
    } else {
      const src = this.map.getSource(sourceId) as GeoJSONSource;
      src.setData(geojson);
    }
  }

  /**
   * Render AI-suggested route with custom styling
   * Leverages existing infrastructure while providing AI-specific visualization
   */
  public setAIRoute(coordinates: number[][], style: any = {}, metadata: any = {}) {
    const sourceId = 'ai-route';
    const layerId = 'ai-route-line';

    // Create GeoJSON from coordinates
    const geojson: FeatureCollection<LineString> = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          routeType: 'ai-suggested',
          distance: metadata.distance || 0,
          difficulty: metadata.difficulty || 50,
          confidence: metadata.confidence || 75
        },
        geometry: {
          type: 'LineString',
          coordinates: coordinates
        }
      }]
    };

    // Default AI route styling
    const defaultStyle = {
      color: '#00ff88',
      width: 4,
      opacity: 0.8,
      dashArray: [5, 5]
    };

    const routeStyle = { ...defaultStyle, ...style };

    const hasSource = !!this.map.getSource(sourceId);
    if (!hasSource) {
      this.map.addSource(sourceId, { type: 'geojson', data: geojson });
      this.map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': routeStyle.color,
          'line-width': routeStyle.width,
          'line-opacity': routeStyle.opacity,
          'line-dasharray': routeStyle.dashArray
        }
      } as any);

      // Add subtle glow effect for AI routes
      this.map.addLayer({
        id: `${layerId}-glow`,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': routeStyle.color,
          'line-width': routeStyle.width + 2,
          'line-opacity': routeStyle.opacity * 0.3,
          'line-blur': 2
        }
      } as any, layerId); // Insert glow layer below main line

    } else {
      const src = this.map.getSource(sourceId) as GeoJSONSource;
      src.setData(geojson);
    }

    console.log('AnimationService: AI route visualized with', coordinates.length, 'points');
  }

  /**
   * Clear AI route from map
   */
  public clearAIRoute() {
    const sourceId = 'ai-route';
    const layerId = 'ai-route-line';
    const glowLayerId = `${layerId}-glow`;

    if (this.map.getLayer(layerId)) {
      this.map.removeLayer(layerId);
    }
    if (this.map.getLayer(glowLayerId)) {
      this.map.removeLayer(glowLayerId);
    }
    if (this.map.getSource(sourceId)) {
      this.map.removeSource(sourceId);
    }

    // Also clear waypoints
    this.clearAIWaypoints();

    console.log('AnimationService: AI route cleared');
  }

  /**
   * Add strategic waypoints to the map
   * Leverages existing marker infrastructure
   */
  public setAIWaypoints(waypoints: any[], routeMetadata: any = {}) {
    // Clear existing waypoints first
    this.clearAIWaypoints();

    waypoints.forEach((waypoint, index) => {
      const markerId = `ai-waypoint-${index}`;

      // Create waypoint marker element
      const markerElement = document.createElement('div');
      markerElement.className = 'ai-waypoint-marker';
      markerElement.innerHTML = this.getWaypointIcon(waypoint.type, waypoint.claimPriority);

      // Style the marker
      markerElement.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        cursor: pointer;
        transition: transform 0.2s ease;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        ${this.getWaypointStyle(waypoint.type, waypoint.claimPriority)}
      `;

      // Add hover effect
      markerElement.addEventListener('mouseenter', () => {
        markerElement.style.transform = 'scale(1.2)';
      });
      markerElement.addEventListener('mouseleave', () => {
        markerElement.style.transform = 'scale(1)';
      });

      // Add click handler for waypoint details
      markerElement.addEventListener('click', () => {
        this.showWaypointPopup(waypoint, routeMetadata);
      });

      // Create and add marker to map
      const marker = new (this.mapboxgl as any).Marker(markerElement)
        .setLngLat(waypoint.coordinates)
        .addTo(this.map);

      // Store marker reference for cleanup
      if (!this.aiWaypoints) {
        this.aiWaypoints = [];
      }
      this.aiWaypoints.push(marker);
    });

    console.log('AnimationService: Added', waypoints.length, 'AI waypoints to map');
  }

  /**
   * Clear AI waypoints from map
   */
  public clearAIWaypoints() {
    if (this.aiWaypoints) {
      this.aiWaypoints.forEach(marker => marker.remove());
      this.aiWaypoints = [];
    }

    // Close any open popups
    const existingPopup = document.querySelector('.ai-waypoint-popup');
    if (existingPopup) {
      existingPopup.remove();
    }
  }

  /**
   * Get waypoint icon based on type
   */
  private getWaypointIcon(type: string, priority: string): string {
    const icons = {
      territory_claim: priority === 'high' ? '🏆' : priority === 'medium' ? '🎯' : '📍',
      rest_stop: '🛑',
      landmark: '🏛️',
      strategic: '⭐'
    };

    return icons[type as keyof typeof icons] || '📍';
  }

  /**
   * Get waypoint styling based on type and priority
   */
  private getWaypointStyle(type: string, priority: string): string {
    const baseStyle = 'background: linear-gradient(135deg, ';

    if (type === 'territory_claim') {
      if (priority === 'high') {
        return baseStyle + '#ff6b35, #f7931e); border: 2px solid #ff6b35;';
      } else if (priority === 'medium') {
        return baseStyle + '#4ecdc4, #44a08d); border: 2px solid #4ecdc4;';
      } else {
        return baseStyle + '#a8e6cf, #7fcdcd); border: 2px solid #a8e6cf;';
      }
    } else if (type === 'rest_stop') {
      return baseStyle + '#ff9a9e, #fecfef); border: 2px solid #ff9a9e;';
    } else if (type === 'landmark') {
      return baseStyle + '#a18cd1, #fbc2eb); border: 2px solid #a18cd1;';
    } else {
      return baseStyle + '#ffecd2, #fcb69f); border: 2px solid #ffecd2;';
    }
  }

  /**
   * Show waypoint details popup
   */
  private showWaypointPopup(waypoint: any, routeMetadata: any) {
    // Remove existing popup
    const existingPopup = document.querySelector('.ai-waypoint-popup');
    if (existingPopup) {
      existingPopup.remove();
    }

    // Create popup element
    const popup = document.createElement('div');
    popup.className = 'ai-waypoint-popup';
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: linear-gradient(135deg, #1a1a1a, #2d2d2d);
      border: 2px solid rgba(0, 255, 0, 0.3);
      border-radius: 12px;
      padding: 20px;
      max-width: 300px;
      z-index: 10000;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      animation: fadeInScale 0.3s ease-out;
    `;

    popup.innerHTML = `
      <div style="color: #00ff00; font-size: 18px; font-weight: bold; margin-bottom: 12px;">
        ${this.getWaypointIcon(waypoint.type, waypoint.claimPriority)} ${waypoint.name}
      </div>
      <div style="color: #ffffff; margin-bottom: 8px; line-height: 1.4;">
        ${waypoint.description}
      </div>
      <div style="color: #aaa; font-size: 12px; margin-bottom: 12px;">
        Type: ${waypoint.type.replace('_', ' ')} • Priority: ${waypoint.claimPriority}
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="color: #00ff88;">Territory Value: ${waypoint.territoryValue}/100</span>
        <span style="color: #ffd700;">Reward: ${waypoint.estimatedReward} REALM</span>
      </div>
      <button onclick="this.parentElement.remove()" style="
        background: linear-gradient(135deg, #00ff00, #00aa00);
        color: #000;
        border: none;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        width: 100%;
      ">Got it!</button>
    `;

    // Add CSS animation if not already present
    if (!document.querySelector('#waypoint-popup-animations')) {
      const style = document.createElement('style');
      style.id = 'waypoint-popup-animations';
      style.textContent = `
        @keyframes fadeInScale {
          from {
            opacity: 0;
            transform: translate(-50%, -50%) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(popup);
  }

  // Add property to store waypoint markers
  private aiWaypoints: any[] = [];

  private getLineLayer(id: string, coordinates: number[][] = []): LineLayer {
    return {
      id: id,
      type: 'line',
      source: { // mapboxgl.GeoJSONSourceOptions
        type: 'geojson',
        data: { // GeoJSON.Feature<GeoJSON.Geometry>
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        }
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        visibility: 'visible'
      },
      paint: {
        'line-color': '#3887be',
        'line-width': 5,
        'line-opacity': .75
      }
    } as LineLayer;
  }
}
