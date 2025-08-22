/**
 * StatusIndicator - Real-time status feedback for GPS, connectivity, and app state
 * Provides contextual visual feedback to enhance user experience
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';

export interface StatusIndicatorOptions {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  showGPS?: boolean;
  showConnectivity?: boolean;
  showBattery?: boolean;
  autoHide?: boolean;
  autoHideDelay?: number;
}

export interface StatusData {
  gps?: {
    available: boolean;
    accuracy?: number;
    signal?: 'excellent' | 'good' | 'fair' | 'poor';
  };
  connectivity?: {
    online: boolean;
    type?: string;
    speed?: 'fast' | 'medium' | 'slow';
  };
  battery?: {
    level: number;
    charging: boolean;
  };
  app?: {
    state: 'idle' | 'tracking' | 'paused' | 'error';
    message?: string;
  };
}

export class StatusIndicator extends BaseService {
  private domService: DOMService;
  private container: HTMLElement | null = null;
  private options: StatusIndicatorOptions;
  private currentStatus: StatusData = {};
  private hideTimeout: number | null = null;

  constructor(domService: DOMService, options: StatusIndicatorOptions = {}) {
    super();
    this.domService = domService;
    this.options = {
      position: 'top-right',
      showGPS: true,
      showConnectivity: true,
      showBattery: false,
      autoHide: true,
      autoHideDelay: 5000,
      ...options
    };
  }

  protected async onInitialize(): Promise<void> {
    this.createStatusIndicator();
    this.setupEventListeners();
    this.startMonitoring();
    this.safeEmit('service:initialized', { service: 'StatusIndicator', success: true });
  }

  private createStatusIndicator(): void {
    this.container = this.domService.createElement('div', {
      id: 'status-indicator',
      className: `status-indicator status-${this.options.position}`,
      innerHTML: this.renderStatusContent(),
      parent: document.body
    });

    this.addStatusStyles();
  }

  private renderStatusContent(): string {
    const { gps, connectivity, battery, app } = this.currentStatus;

    return `
      <div class="status-content">
        ${this.options.showGPS ? `
          <div class="status-item gps-status ${gps?.available ? 'active' : 'inactive'}">
            <span class="status-icon">${this.getGPSIcon(gps)}</span>
            <span class="status-label">GPS</span>
            ${gps?.accuracy ? `<span class="status-detail">${Math.round(gps.accuracy)}m</span>` : ''}
          </div>
        ` : ''}
        
        ${this.options.showConnectivity ? `
          <div class="status-item connectivity-status ${connectivity?.online ? 'active' : 'inactive'}">
            <span class="status-icon">${this.getConnectivityIcon(connectivity)}</span>
            <span class="status-label">Network</span>
            ${connectivity?.type ? `<span class="status-detail">${connectivity.type}</span>` : ''}
          </div>
        ` : ''}
        
        ${this.options.showBattery && battery ? `
          <div class="status-item battery-status ${battery.charging ? 'charging' : ''}">
            <span class="status-icon">${this.getBatteryIcon(battery)}</span>
            <span class="status-label">${battery.level}%</span>
          </div>
        ` : ''}
        
        ${app?.state && app.state !== 'idle' ? `
          <div class="status-item app-status ${app.state}">
            <span class="status-icon">${this.getAppIcon(app.state)}</span>
            <span class="status-label">${app.message || app.state}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Listen for GPS events
    this.subscribe('location:updated', (data) => {
      this.updateGPSStatus({
        available: true,
        accuracy: data.accuracy,
        signal: this.getSignalQuality(data.accuracy)
      });
    });

    this.subscribe('location:error', () => {
      this.updateGPSStatus({ available: false });
    });

    // Listen for run events
    this.subscribe('run:started', () => {
      this.updateAppStatus({ state: 'tracking', message: 'Tracking' });
    });

    this.subscribe('run:paused', () => {
      this.updateAppStatus({ state: 'paused', message: 'Paused' });
    });

    this.subscribe('run:completed', () => {
      this.updateAppStatus({ state: 'idle' });
    });

    this.subscribe('run:cancelled', () => {
      this.updateAppStatus({ state: 'idle' });
    });

    // Listen for connectivity changes
    window.addEventListener('online', () => {
      this.updateConnectivityStatus({ online: true });
    });

    window.addEventListener('offline', () => {
      this.updateConnectivityStatus({ online: false });
    });

    // Battery API if available
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        this.updateBatteryStatus({
          level: Math.round(battery.level * 100),
          charging: battery.charging
        });

        battery.addEventListener('levelchange', () => {
          this.updateBatteryStatus({
            level: Math.round(battery.level * 100),
            charging: battery.charging
          });
        });

        battery.addEventListener('chargingchange', () => {
          this.updateBatteryStatus({
            level: Math.round(battery.level * 100),
            charging: battery.charging
          });
        });
      });
    }
  }

  private startMonitoring(): void {
    // Monitor connectivity
    this.updateConnectivityStatus({
      online: navigator.onLine,
      type: this.getConnectionType()
    });

    // Check GPS periodically
    setInterval(() => {
      this.checkGPSStatus();
    }, 10000); // Check every 10 seconds
  }

  private checkGPSStatus(): void {
    if (!navigator.geolocation) {
      this.updateGPSStatus({ available: false });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.updateGPSStatus({
          available: true,
          accuracy: position.coords.accuracy,
          signal: this.getSignalQuality(position.coords.accuracy)
        });
      },
      () => {
        this.updateGPSStatus({ available: false });
      },
      { timeout: 5000, maximumAge: 30000 }
    );
  }

  public updateGPSStatus(gps: StatusData['gps']): void {
    this.currentStatus.gps = gps;
    this.updateDisplay();
    this.showTemporarily();
  }

  public updateConnectivityStatus(connectivity: StatusData['connectivity']): void {
    this.currentStatus.connectivity = connectivity;
    this.updateDisplay();
    this.showTemporarily();
  }

  public updateBatteryStatus(battery: StatusData['battery']): void {
    this.currentStatus.battery = battery;
    this.updateDisplay();
  }

  public updateAppStatus(app: StatusData['app']): void {
    this.currentStatus.app = app;
    this.updateDisplay();
    this.showTemporarily();
  }

  private updateDisplay(): void {
    if (!this.container) return;
    this.container.innerHTML = this.renderStatusContent();
  }

  private showTemporarily(): void {
    if (!this.container || !this.options.autoHide) return;

    this.container.classList.add('status-visible');

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }

    this.hideTimeout = window.setTimeout(() => {
      this.container?.classList.remove('status-visible');
    }, this.options.autoHideDelay);
  }

  public show(): void {
    this.container?.classList.add('status-visible');
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  public hide(): void {
    this.container?.classList.remove('status-visible');
  }

  private getGPSIcon(gps?: StatusData['gps']): string {
    if (!gps?.available) return '📍❌';
    
    switch (gps.signal) {
      case 'excellent': return '📍✨';
      case 'good': return '📍✅';
      case 'fair': return '📍⚠️';
      case 'poor': return '📍❌';
      default: return '📍';
    }
  }

  private getConnectivityIcon(connectivity?: StatusData['connectivity']): string {
    if (!connectivity?.online) return '📶❌';
    
    switch (connectivity.speed) {
      case 'fast': return '📶✨';
      case 'medium': return '📶✅';
      case 'slow': return '📶⚠️';
      default: return '📶';
    }
  }

  private getBatteryIcon(battery?: StatusData['battery']): string {
    if (!battery) return '🔋';
    
    if (battery.charging) return '🔋⚡';
    
    if (battery.level > 75) return '🔋';
    if (battery.level > 50) return '🔋';
    if (battery.level > 25) return '🔋⚠️';
    return '🔋❌';
  }

  private getAppIcon(state: string): string {
    switch (state) {
      case 'tracking': return '🏃‍♂️';
      case 'paused': return '⏸️';
      case 'error': return '❌';
      default: return 'ℹ️';
    }
  }

  private getSignalQuality(accuracy: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (accuracy <= 5) return 'excellent';
    if (accuracy <= 10) return 'good';
    if (accuracy <= 20) return 'fair';
    return 'poor';
  }

  private getConnectionType(): string {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    return connection?.effectiveType || 'unknown';
  }

  private addStatusStyles(): void {
    if (document.querySelector('#status-indicator-styles')) return;

    this.domService.createElement('style', {
      id: 'status-indicator-styles',
      textContent: `
        .status-indicator {
          position: fixed;
          z-index: 1050;
          pointer-events: none;
          opacity: 0;
          transform: translateY(-10px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .status-indicator.status-visible {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        .status-top-left {
          top: 20px;
          left: 20px;
        }

        .status-top-right {
          top: 20px;
          right: 20px;
        }

        .status-bottom-left {
          bottom: 20px;
          left: 20px;
        }

        .status-bottom-right {
          bottom: 20px;
          right: 20px;
        }

        .status-content {
          background: rgba(0, 0, 0, 0.9);
          border-radius: 12px;
          padding: 12px 16px;
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 120px;
        }

        .status-item {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.8);
          transition: all 0.2s ease;
        }

        .status-item.active {
          color: #00ff88;
        }

        .status-item.inactive {
          color: #ff6b6b;
        }

        .status-item.charging {
          color: #ffc107;
        }

        .status-icon {
          font-size: 14px;
          min-width: 16px;
        }

        .status-label {
          font-weight: 500;
          flex: 1;
        }

        .status-detail {
          font-size: 10px;
          opacity: 0.7;
        }

        .app-status.tracking {
          color: #00ff88;
          animation: pulse 2s infinite;
        }

        .app-status.paused {
          color: #ffc107;
        }

        .app-status.error {
          color: #ff6b6b;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }

        /* Mobile responsiveness */
        @media (max-width: 768px) {
          .status-indicator {
            font-size: 11px;
          }

          .status-top-left,
          .status-top-right {
            top: 10px;
          }

          .status-top-left {
            left: 10px;
          }

          .status-top-right {
            right: 10px;
          }

          .status-content {
            padding: 8px 12px;
            min-width: 100px;
          }

          .status-item {
            gap: 6px;
          }
        }

        /* Reduced motion support */
        @media (prefers-reduced-motion: reduce) {
          .status-indicator {
            transition: opacity 0.2s ease;
          }

          .app-status.tracking {
            animation: none;
          }
        }
      `,
      parent: document.head
    });
  }

  protected async onDestroy(): Promise<void> {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    this.container?.remove();
  }
}
