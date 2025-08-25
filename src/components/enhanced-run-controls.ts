import { BaseService } from '../core/base-service';
import { RunSession } from '../services/run-tracking-service';
import { getFormattedDistance, formatSpeed, formatPace, formatDuration } from '../utils/distance-formatter';

export interface RunStats {
  distance: number; // meters
  duration: number; // milliseconds
  averageSpeed: number; // m/s
  maxSpeed: number; // m/s
  pointCount: number;
  segmentCount: number;
  status: string;
  territoryEligible: boolean;
}

/**
 * Enhanced run controls widget with real-time GPS tracking and territory detection
 */
export class EnhancedRunControls extends BaseService {
  private container: HTMLElement | null = null;
  private currentStats: RunStats | null = null;
  private isRecording = false;
  private isPaused = false;
  private startTime: number = 0;
  private updateInterval: number | null = null;
  private boundClickHandler: (event: Event) => void;
  
  // Guards to avoid duplicate rendering and ensure idempotency
  private widgetInitialized = false;
  private standaloneActive = false;

  constructor() {
    super();
    this.boundClickHandler = this.handleRunTrackerClick.bind(this);
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    // Don't create widget immediately - wait for MainUI to be ready
    this.safeEmit('service:initialized', { service: 'EnhancedRunControls', success: true });
  }

  /**
   * Initialize widget after MainUI is ready
   */
  public initializeWidget(): void {
    console.log('EnhancedRunControls: Initializing widget...');
    this.createWidget();
    // Ensure event handlers are attached after widget creation
    setTimeout(() => {
      this.attachEventHandlers();
    }, 100);
  }

  private getWidgetSystem(): any {
    return (
      (window as any).runRealmApp?.mainUI?.widgetSystem ||
      (window as any).RunRealm?.mainUI?.widgetSystem
    );
  }

  private getUIService(): any {
    return (
      (window as any).runRealmApp?.ui ||
      (window as any).RunRealm?.ui ||
      (window as any).UIService?.getInstance()
    );
  }

  private setupEventListeners(): void {
    // Listen for run tracking events
    this.subscribe('run:started' as any, (data: any) => {
      this.handleRunStarted(data);
    });

    this.subscribe('run:paused' as any, (data: any) => {
      this.handleRunPaused(data);
    });

    this.subscribe('run:resumed' as any, (data: any) => {
      this.handleRunResumed(data);
    });

    this.subscribe('run:completed' as any, (data: any) => {
      this.handleRunCompleted(data);
    });

    this.subscribe('run:cancelled' as any, (data: any) => {
      this.handleRunCancelled(data);
    });

    this.subscribe('run:statsUpdated' as any, (data: any) => {
      this.updateStats(data.stats);
    });

    this.subscribe('run:pointAdded' as any, (data: any) => {
      this.updateStats(data.stats);
      this.showPointAddedFeedback();
      // Update real-time visualization
      this.updateRunVisualization(data.point);
    });

    this.subscribe('territory:eligible' as any, (data: any) => {
      this.showTerritoryEligibleNotification(data);
      // Add haptic feedback for territory eligibility
      this.hapticFeedback('heavy');
    });

    // Setup mobile-specific interactions
    this.setupMobileInteractions();
  }

  private createWidget(): void {
    if (this.widgetInitialized) return;

    // Register with the widget system instead of creating a standalone widget
    const widgetSystem = this.getWidgetSystem();

    if (widgetSystem) {
      widgetSystem.registerWidget({
        id: 'run-tracker',
        title: 'Run Tracker',
        icon: '🏃‍♂️',
        position: 'bottom-left',
        minimized: true, // Always start minimized to prevent viewport domination
        priority: 10,
        content: this.getWidgetContent()
      });

      // Listen for widget updates
      this.subscribe('widget:toggled' as any, (data: any) => {
        if (data.widgetId === 'run-tracker') {
          this.handleWidgetToggle(data.minimized);
        }
      });

      this.widgetInitialized = true;
      this.standaloneActive = false;
      
      // Inject styles for the widget
      this.injectStyles();
    } else {
      // Guard: avoid duplicate fallback rendering
      const alreadyPresent =
        document.getElementById('widget-run-tracker') ||
        document.getElementById('enhanced-run-controls');

      if (alreadyPresent) {
        console.warn('[RunTracker] WidgetSystem not ready; existing element detected. Suppressing standalone.');
        return;
      }

      console.warn('[RunTracker] WidgetSystem not found. Creating standalone fallback.');
      this.createStandaloneWidget();
      this.widgetInitialized = true;
      this.standaloneActive = true;

      // Try to migrate to widget system shortly after if it becomes available
      setTimeout(() => this.tryMigrateToWidgetSystem(), 500);
    }
  }

  private createStandaloneWidget(): void {
    this.container = document.getElementById('enhanced-run-controls');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'enhanced-run-controls';
      this.container.className = 'run-controls-widget';
      document.body.appendChild(this.container);
    }

    // Inject CSS for animations
    this.injectStyles();

    this.renderWidget();
    this.attachEventHandlers();
  }

  /**
   * Inject necessary CSS styles for animations
   */
  private injectStyles(): void {
    // Check if styles are already injected
    if (document.getElementById('runrealm-styles')) return;

    const style = document.createElement('style');
    style.id = 'runrealm-styles';
    style.textContent = `
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      .animate-pulse {
        animation: pulse 1s infinite;
      }
      
      .run-visualization {
        margin: 10px 0;
        text-align: center;
      }
      
      #run-path-canvas {
        width: 100%;
        background-color: #f0f0f0;
        border-radius: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  private getWidgetContent(): string {
    const stats = this.currentStats;
    const distance = stats ? this.formatDistance(stats.distance) : '0.00 km';
    const duration = stats ? this.formatDuration(stats.duration) : '00:00';
    const speed = stats ? this.formatSpeed(stats.averageSpeed) : '0.0 km/h';
    const pace = stats ? this.formatPace(stats.averageSpeed) : '--:--';

    return `
      <div class="run-status ${this.getStatusClass()}">
        ${this.getStatusText()}
      </div>

      <div class="run-stats">
        <div class="stat-group">
          <div class="stat-item primary">
            <span class="stat-label">Distance</span>
            <span class="stat-value">${distance}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Time</span>
            <span class="stat-value">${duration}</span>
          </div>
        </div>

        <div class="stat-group">
          <div class="stat-item">
            <span class="stat-label">Speed</span>
            <span class="stat-value">${speed}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Pace</span>
            <span class="stat-value">${pace}</span>
          </div>
        </div>

        ${stats?.territoryEligible ? `
          <div class="territory-indicator animate-pulse">
            <span class="territory-icon">🏆</span>
            <span class="territory-text">Territory Eligible!</span>
          </div>
        ` : ''}
      </div>

      <!-- Real-time visualization container -->
      <div class="run-visualization" id="run-visualization">
        <canvas id="run-path-canvas" width="200" height="100"></canvas>
      </div>

      <div class="run-controls">
        ${this.renderControlButtons()}
      </div>

      <div class="run-feedback" id="run-feedback"></div>
    `;
  }

  private handleWidgetToggle(minimized: boolean): void {
    // Update widget content when toggled
    this.updateWidgetContent();
  }

  private updateWidgetContent(): void {
    const widgetSystem = this.getWidgetSystem();
    if (widgetSystem) {
      widgetSystem.updateWidget('run-tracker', this.getWidgetContent());
      // Listen for content update completion to reattach handlers reliably
      this.subscribe('widget:contentUpdated' as any, (data: any) => {
        if (data.widgetId === 'run-tracker') {
          // Inject styles if not already present
          this.injectStyles();
          this.attachEventHandlers();
        }
      });
    }
  }

  private tryMigrateToWidgetSystem(): void {
    if (!this.standaloneActive) return;

    const widgetSystem = this.getWidgetSystem();
    if (!widgetSystem) return;

    widgetSystem.registerWidget({
      id: 'run-tracker',
      title: 'Run Tracker',
      icon: '🏃‍♂️',
      position: 'bottom-left',
      minimized: true,
      priority: 10,
      content: this.getWidgetContent(),
    });

    // Remove fallback DOM and update flags
    document.getElementById('enhanced-run-controls')?.remove();
    this.standaloneActive = false;
    this.widgetInitialized = true;
  }

  private updateDisplay(): void {
    // Update both widget system and standalone widget
    this.updateWidgetContent();
    this.renderWidget();
  }

  private renderWidget(): void {
    if (!this.container) return;

    const stats = this.currentStats;
    const distance = stats ? this.formatDistance(stats.distance) : '0.00 km';
    const duration = stats ? this.formatDuration(stats.duration) : '00:00';
    const speed = stats ? this.formatSpeed(stats.averageSpeed) : '0.0 km/h';
    const pace = stats ? this.formatPace(stats.averageSpeed) : '--:--';

    this.container.innerHTML = `
      <div class="run-controls-header">
        <h3>🏃‍♂️ Run Tracker</h3>
        <div class="run-status ${this.getStatusClass()}">
          ${this.getStatusText()}
        </div>
      </div>

      <div class="run-stats">
        <div class="stat-group">
          <div class="stat-item primary">
            <span class="stat-label">Distance</span>
            <span class="stat-value" id="distance-display">${distance}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Duration</span>
            <span class="stat-value" id="duration-display">${duration}</span>
          </div>
        </div>
        
        <div class="stat-group">
          <div class="stat-item">
            <span class="stat-label">Speed</span>
            <span class="stat-value" id="speed-display">${speed}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Pace</span>
            <span class="stat-value" id="pace-display">${pace}</span>
          </div>
        </div>

        ${stats?.territoryEligible ? `
          <div class="territory-indicator animate-pulse">
            <span class="territory-icon">🏆</span>
            <span class="territory-text">Territory Eligible!</span>
          </div>
        ` : ''}
      </div>

      <!-- Real-time visualization container -->
      <div class="run-visualization" id="run-visualization">
        <canvas id="run-path-canvas" width="200" height="100"></canvas>
      </div>

      <div class="run-controls">
        ${this.renderControlButtons()}
      </div>

      <div class="run-feedback" id="run-feedback"></div>
    `;
  }

  private renderControlButtons(): string {
    if (!this.isRecording && !this.isPaused) {
      return `
        <button class="control-btn primary" id="start-run-btn">
          <span class="btn-icon">▶️</span>
          <span class="btn-text">Start Run</span>
        </button>
        <button class="control-btn secondary" id="gps-check-btn">
          <span class="btn-icon">📍</span>
          <span class="btn-text">Check GPS</span>
        </button>
      `;
    }

    if (this.isRecording) {
      return `
        <button class="control-btn warning" id="pause-run-btn">
          <span class="btn-icon">⏸️</span>
          <span class="btn-text">Pause</span>
        </button>
        <button class="control-btn success" id="stop-run-btn">
          <span class="btn-icon">⏹️</span>
          <span class="btn-text">Finish</span>
        </button>
        <button class="control-btn danger" id="cancel-run-btn">
          <span class="btn-icon">❌</span>
          <span class="btn-text">Cancel</span>
        </button>
      `;
    }

    if (this.isPaused) {
      return `
        <button class="control-btn primary" id="resume-run-btn">
          <span class="btn-icon">▶️</span>
          <span class="btn-text">Resume</span>
        </button>
        <button class="control-btn success" id="stop-run-btn">
          <span class="btn-icon">⏹️</span>
          <span class="btn-text">Finish</span>
        </button>
        <button class="control-btn danger" id="cancel-run-btn">
          <span class="btn-icon">❌</span>
          <span class="btn-text">Cancel</span>
        </button>
      `;
    }

    return '';
  }

  private attachEventHandlers(): void {
    // Use event delegation instead of direct element binding for reliability
    // Remove any existing handlers first to prevent duplication
    this.removeEventHandlers();
    
    // Use document-level event delegation for run tracker buttons
    document.addEventListener('click', this.boundClickHandler);
    console.log('Run tracker event handlers attached');
  }

  private removeEventHandlers(): void {
    document.removeEventListener('click', this.boundClickHandler);
  }

  private handleRunTrackerClick(event: Event): void {
    const target = event.target as HTMLElement;
    
    // Only handle clicks within the run tracker widget or enhanced run controls
    const runTrackerWidget = target.closest('#widget-run-tracker, #enhanced-run-controls');
    if (!runTrackerWidget) {
      return;
    }
    
    // Debug logging
    console.log('Run tracker click detected:', target.id, target.className);
    
    // Handle different button clicks with improved selector logic
    if (target.matches('#start-run-btn, #start-run-btn *, .control-btn.primary') || 
        target.closest('#start-run-btn')) {
      event.preventDefault();
      event.stopPropagation();
      console.log('Start run button clicked');
      this.startRun();
    } else if (target.matches('#pause-run-btn, #pause-run-btn *, .control-btn.warning') || 
               target.closest('#pause-run-btn')) {
      event.preventDefault();
      event.stopPropagation();
      this.pauseRun();
    } else if (target.matches('#resume-run-btn, #resume-run-btn *, .control-btn.primary') || 
               target.closest('#resume-run-btn')) {
      event.preventDefault();
      event.stopPropagation();
      this.resumeRun();
    } else if (target.matches('#stop-run-btn, #stop-run-btn *, .control-btn.success') || 
               target.closest('#stop-run-btn')) {
      event.preventDefault();
      event.stopPropagation();
      this.stopRun();
    } else if (target.matches('#cancel-run-btn, #cancel-run-btn *, .control-btn.danger') || 
               target.closest('#cancel-run-btn')) {
      event.preventDefault();
      event.stopPropagation();
      this.cancelRun();
    } else if (target.matches('#gps-check-btn, #gps-check-btn *, .control-btn.secondary') || 
               target.closest('#gps-check-btn')) {
      event.preventDefault();
      event.stopPropagation();
      this.checkGPS();
    }
  }

  private async startRun(): Promise<void> {
    try {
      console.log('EnhancedRunControls: Starting run...');
      this.showFeedback('🚀 Starting run...', 'info');
      
      // Check GPS availability first
      const hasGPS = await this.checkGPSAvailability();
      if (!hasGPS) {
        console.log('EnhancedRunControls: GPS not available');
        this.showFeedback('❌ GPS not available. Please enable location services.', 'error');
        return;
      }

      console.log('EnhancedRunControls: GPS available, emitting run:startRequested event');
      this.safeEmit('run:startRequested', {});
      
    } catch (error) {
      console.error('EnhancedRunControls: Error starting run:', error);
      this.showFeedback(`❌ Failed to start run: ${error.message}`, 'error');
    }
  }

  private pauseRun(): void {
    this.safeEmit('run:pauseRequested' as any, {});
  }

  private resumeRun(): void {
    this.safeEmit('run:resumeRequested' as any, {});
  }

  private stopRun(): void {
    if (this.currentStats && this.currentStats.distance < 100) {
      this.getUIService().showConfirmationModal(
        'Short Run Detected',
        'Your run is very short. Are you sure you want to finish?',
        '⏹️ Finish Run',
        '↩️ Continue',
        () => this.safeEmit('run:stopRequested' as any, {})
      );
      return;
    }
    this.safeEmit('run:stopRequested' as any, {});
  }

  private cancelRun(): void {
    this.getUIService().showConfirmationModal(
      'Cancel Run',
      'Are you sure you want to cancel this run? All progress will be lost.',
      '❌ Cancel Run',
      '↩️ Keep Running',
      () => this.safeEmit('run:cancelRequested' as any, {}),
      'destructive'
    );
  }

  private async checkGPS(): Promise<void> {
    try {
      this.showFeedback('📍 Checking GPS...', 'info');
      
      const available = await this.checkGPSAvailability();
      if (available) {
        this.showFeedback('✅ GPS is working correctly', 'success');
      } else {
        this.showFeedback('❌ GPS not available', 'error');
      }
    } catch (error) {
      this.showFeedback(`❌ GPS check failed: ${error.message}`, 'error');
    }
  }

  private async checkGPSAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(false);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        () => resolve(false),
        { timeout: 5000, enableHighAccuracy: true }
      );
    });
  }

  private handleRunStarted(data: any): void {
    this.isRecording = true;
    this.isPaused = false;
    this.startTime = Date.now();
    this.startRealTimeUpdates();
    this.updateDisplay();
    this.showFeedback('🏃‍♂️ Run started! GPS tracking active.', 'success');
  }

  private handleRunPaused(data: any): void {
    this.isRecording = false;
    this.isPaused = true;
    this.stopRealTimeUpdates();
    this.updateDisplay();
    this.showFeedback('⏸️ Run paused', 'info');
  }

  private handleRunResumed(data: any): void {
    this.isRecording = true;
    this.isPaused = false;
    this.startRealTimeUpdates();
    this.updateDisplay();
    this.showFeedback('▶️ Run resumed', 'success');
  }

  private handleRunCompleted(data: { run: RunSession; territoryEligible: boolean }): void {
    this.isRecording = false;
    this.isPaused = false;
    this.stopRealTimeUpdates();
    this.updateDisplay();

    const distance = this.formatDistance(data.run.totalDistance);
    const duration = this.formatDuration(data.run.totalDuration);

    if (data.territoryEligible) {
      this.showFeedback(`🏆 Run completed! ${distance} in ${duration}. Territory eligible!`, 'success');
    } else {
      this.showFeedback(`✅ Run completed! ${distance} in ${duration}.`, 'success');
    }
  }

  private handleRunCancelled(data: any): void {
    this.isRecording = false;
    this.isPaused = false;
    this.currentStats = null;
    this.stopRealTimeUpdates();
    this.updateDisplay();
    this.showFeedback('❌ Run cancelled', 'warning');
  }

  private updateStats(stats: RunStats): void {
    this.currentStats = stats;
    this.updateDisplay();
  }

  private updateStatsDisplay(): void {
    if (!this.container || !this.currentStats) return;

    const distanceEl = this.container.querySelector('#distance-display');
    const durationEl = this.container.querySelector('#duration-display');
    const speedEl = this.container.querySelector('#speed-display');
    const paceEl = this.container.querySelector('#pace-display');

    if (distanceEl) distanceEl.textContent = this.formatDistance(this.currentStats.distance);
    if (durationEl) durationEl.textContent = this.formatDuration(this.currentStats.duration);
    if (speedEl) speedEl.textContent = this.formatSpeed(this.currentStats.averageSpeed);
    if (paceEl) paceEl.textContent = this.formatPace(this.currentStats.averageSpeed);
  }

  private startRealTimeUpdates(): void {
    this.updateInterval = window.setInterval(() => {
      if (this.isRecording && this.currentStats) {
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.startTime;
        
        // Update duration display
        const durationEl = this.container?.querySelector('#duration-display');
        if (durationEl) {
          durationEl.textContent = this.formatDuration(elapsedTime);
        }
      }
    }, 1000);
  }

  private stopRealTimeUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  private showPointAddedFeedback(): void {
    // Brief visual feedback when a GPS point is added
    const container = this.container?.querySelector('.run-stats');
    if (container) {
      container.classList.add('point-added');
      setTimeout(() => {
        container.classList.remove('point-added');
      }, 200);
    }
  }

  private showTerritoryEligibleNotification(data: any): void {
    this.showFeedback('🏆 Territory eligible! Complete your run to claim.', 'success');
    this.renderWidget(); // Re-render to show territory indicator
    
    // Add haptic feedback for territory eligibility
    this.hapticFeedback('heavy');
  }

  private showFeedback(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    const feedbackEl = this.container?.querySelector('#run-feedback');
    if (!feedbackEl) return;

    // Enhanced feedback with animation and icon
    feedbackEl.innerHTML = `
      <div class="feedback-content">
        <span class="feedback-icon">${this.getFeedbackIcon(type)}</span>
        <span class="feedback-text">${message}</span>
      </div>
    `;
    feedbackEl.className = `run-feedback ${type} feedback-show`;

    // Add haptic feedback for mobile
    if (type === 'success') {
      this.hapticFeedback('light');
    } else if (type === 'error') {
      this.hapticFeedback('medium');
    }

    // Auto-hide after 3 seconds with fade out
    setTimeout(() => {
      feedbackEl.classList.add('feedback-hide');
      setTimeout(() => {
        feedbackEl.innerHTML = '';
        feedbackEl.className = 'run-feedback';
      }, 300);
    }, 3000);
  }

  private getFeedbackIcon(type: string): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type as keyof typeof icons] || icons.info;
  }

  private hapticFeedback(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    if (!navigator.vibrate) return;

    switch (type) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate([15, 10, 15]);
        break;
      case 'heavy':
        // Special pattern for territory eligibility
        navigator.vibrate([100, 50, 100]);
        break;
    }
  }

  /**
   * Update the real-time run visualization with a new point
   */
  private updateRunVisualization(point: any): void {
    const canvas = document.getElementById('run-path-canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Initialize or get the path points array
    if (!this.pathPoints) {
      this.pathPoints = [];
    }

    // Add the new point to our path
    this.pathPoints.push({
      x: point.lat,
      y: point.lng
    });

    // Keep only the last 50 points for performance
    if (this.pathPoints.length > 50) {
      this.pathPoints.shift();
    }

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the path if we have enough points
    if (this.pathPoints.length > 1) {
      // Normalize coordinates to fit canvas
      const minX = Math.min(...this.pathPoints.map(p => p.x));
      const maxX = Math.max(...this.pathPoints.map(p => p.x));
      const minY = Math.min(...this.pathPoints.map(p => p.y));
      const maxY = Math.max(...this.pathPoints.map(p => p.y));
      
      const rangeX = maxX - minX || 1; // Avoid division by zero
      const rangeY = maxY - minY || 1; // Avoid division by zero
      
      ctx.beginPath();
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 2;
      
      this.pathPoints.forEach((point, index) => {
        const x = ((point.x - minX) / rangeX) * canvas.width;
        const y = ((point.y - minY) / rangeY) * canvas.height;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      
      ctx.stroke();
      
      // Draw current position marker
      if (this.pathPoints.length > 0) {
        const lastPoint = this.pathPoints[this.pathPoints.length - 1];
        const x = ((lastPoint.x - minX) / rangeX) * canvas.width;
        const y = ((lastPoint.y - minY) / rangeY) * canvas.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff0055';
        ctx.fill();
      }
    }
  }

  // Store path points for visualization
  private pathPoints: Array<{x: number, y: number}> = [];

  /**
   * Setup mobile-specific interactions and gestures
   */
  private setupMobileInteractions(): void {
    if (!this.isMobile()) return;

    // Add swipe gestures for mobile
    this.setupSwipeGestures();

    // Add long press interactions
    this.setupLongPressActions();

    // Add visual feedback for touch
    this.setupTouchFeedback();
  }

  private isMobile(): boolean {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768;
  }

  private setupSwipeGestures(): void {
    if (!this.container) return;

    let startY = 0;
    let startTime = 0;

    this.container.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    this.container.addEventListener('touchend', (e) => {
      const endY = e.changedTouches[0].clientY;
      const endTime = Date.now();
      const deltaY = startY - endY;
      const deltaTime = endTime - startTime;

      // Swipe up to expand stats
      if (deltaY > 50 && deltaTime < 300) {
        this.expandStats();
        this.hapticFeedback('light');
      }
      // Swipe down to minimize
      else if (deltaY < -50 && deltaTime < 300) {
        this.minimizeStats();
        this.hapticFeedback('light');
      }
    }, { passive: true });
  }

  private setupLongPressActions(): void {
    if (!this.container) return;

    const buttons = this.container.querySelectorAll('.control-btn');

    buttons.forEach(button => {
      let pressTimer: number | null = null;

      button.addEventListener('touchstart', () => {
        pressTimer = window.setTimeout(() => {
          this.showButtonTooltip(button as HTMLElement);
          this.hapticFeedback('medium');
        }, 500);
      });

      button.addEventListener('touchend', () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      });

      button.addEventListener('touchcancel', () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      });
    });
  }

  private setupTouchFeedback(): void {
    if (!this.container) return;

    // Add ripple effect on touch
    this.container.addEventListener('touchstart', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('control-btn') || target.classList.contains('stat-item')) {
        this.createRippleEffect(target, e.touches[0]);
      }
    });
  }

  private createRippleEffect(element: HTMLElement, touch: Touch): void {
    const rect = element.getBoundingClientRect();
    const ripple = document.createElement('div');
    const size = Math.max(rect.width, rect.height);
    const x = touch.clientX - rect.left - size / 2;
    const y = touch.clientY - rect.top - size / 2;

    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x}px;
      top: ${y}px;
      background: rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      transform: scale(0);
      animation: ripple 0.6s ease-out;
      pointer-events: none;
      z-index: 1;
    `;

    // Add ripple animation if not already present
    if (!document.querySelector('#ripple-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'ripple-animation-styles';
      style.textContent = `
        @keyframes ripple {
          to {
            transform: scale(2);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);

    setTimeout(() => {
      ripple.remove();
    }, 600);
  }

  private expandStats(): void {
    if (!this.container) return;
    this.container.classList.add('stats-expanded');
    this.showFeedback('📊 Stats expanded', 'info');
  }

  private minimizeStats(): void {
    if (!this.container) return;
    this.container.classList.remove('stats-expanded');
    this.showFeedback('📊 Stats minimized', 'info');
  }

  private showButtonTooltip(button: HTMLElement): void {
    const buttonText = button.querySelector('.btn-text')?.textContent || 'Action';
    const tooltip = document.createElement('div');

    tooltip.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 1000;
      margin-bottom: 8px;
      animation: tooltipFadeIn 0.2s ease;
    `;

    tooltip.textContent = buttonText;
    button.style.position = 'relative';
    button.appendChild(tooltip);

    setTimeout(() => {
      tooltip.remove();
    }, 2000);
  }

  private getStatusClass(): string {
    if (this.isRecording) return 'recording';
    if (this.isPaused) return 'paused';
    return 'idle';
  }

  private getStatusText(): string {
    if (this.isRecording) return 'Recording';
    if (this.isPaused) return 'Paused';
    return 'Ready';
  }

  private formatDistance(meters: number): string {
    const result = getFormattedDistance(meters, true); // Always use metric for now
    return result.formatted;
  }

  private formatDuration(milliseconds: number): string {
    return formatDuration(milliseconds);
  }

  private formatSpeed(metersPerSecond: number): string {
    return formatSpeed(metersPerSecond, true); // Always use metric for now
  }

  private formatPace(metersPerSecond: number): string {
    return formatPace(metersPerSecond, true); // Always use metric for now
  }

  protected async onDestroy(): Promise<void> {
    this.removeEventHandlers();
    this.stopRealTimeUpdates();
  }
}
