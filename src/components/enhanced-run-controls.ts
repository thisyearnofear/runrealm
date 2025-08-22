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

  constructor() {
    super('EnhancedRunControls');
  }

  protected async onInitialize(): Promise<void> {
    this.setupEventListeners();
    this.createWidget();
    this.safeEmit('service:initialized', { service: 'EnhancedRunControls', success: true });
  }

  private setupEventListeners(): void {
    // Listen for run tracking events
    this.subscribe('run:started', (data) => {
      this.handleRunStarted(data);
    });

    this.subscribe('run:paused', (data) => {
      this.handleRunPaused(data);
    });

    this.subscribe('run:resumed', (data) => {
      this.handleRunResumed(data);
    });

    this.subscribe('run:completed', (data) => {
      this.handleRunCompleted(data);
    });

    this.subscribe('run:cancelled', (data) => {
      this.handleRunCancelled(data);
    });

    this.subscribe('run:statsUpdated', (data) => {
      this.updateStats(data.stats);
    });

    this.subscribe('run:pointAdded', (data) => {
      this.updateStats(data.stats);
      this.showPointAddedFeedback();
    });

    this.subscribe('territory:eligible', (data) => {
      this.showTerritoryEligibleNotification(data);
    });
  }

  private createWidget(): void {
    // Find or create widget container
    this.container = document.getElementById('enhanced-run-controls');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'enhanced-run-controls';
      this.container.className = 'run-controls-widget';
      document.body.appendChild(this.container);
    }

    this.renderWidget();
    this.attachEventHandlers();
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
          <div class="territory-indicator">
            <span class="territory-icon">🏆</span>
            <span class="territory-text">Territory Eligible!</span>
          </div>
        ` : ''}
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
    if (!this.container) return;

    // Start run
    const startBtn = this.container.querySelector('#start-run-btn');
    startBtn?.addEventListener('click', () => this.startRun());

    // Pause run
    const pauseBtn = this.container.querySelector('#pause-run-btn');
    pauseBtn?.addEventListener('click', () => this.pauseRun());

    // Resume run
    const resumeBtn = this.container.querySelector('#resume-run-btn');
    resumeBtn?.addEventListener('click', () => this.resumeRun());

    // Stop run
    const stopBtn = this.container.querySelector('#stop-run-btn');
    stopBtn?.addEventListener('click', () => this.stopRun());

    // Cancel run
    const cancelBtn = this.container.querySelector('#cancel-run-btn');
    cancelBtn?.addEventListener('click', () => this.cancelRun());

    // GPS check
    const gpsBtn = this.container.querySelector('#gps-check-btn');
    gpsBtn?.addEventListener('click', () => this.checkGPS());
  }

  private async startRun(): Promise<void> {
    try {
      this.showFeedback('🚀 Starting run...', 'info');
      
      // Check GPS availability first
      const hasGPS = await this.checkGPSAvailability();
      if (!hasGPS) {
        this.showFeedback('❌ GPS not available. Please enable location services.', 'error');
        return;
      }

      this.safeEmit('run:startRequested', {});
      
    } catch (error) {
      this.showFeedback(`❌ Failed to start run: ${error.message}`, 'error');
    }
  }

  private pauseRun(): void {
    this.safeEmit('run:pauseRequested', {});
  }

  private resumeRun(): void {
    this.safeEmit('run:resumeRequested', {});
  }

  private stopRun(): void {
    if (this.currentStats && this.currentStats.distance < 100) {
      const confirmed = confirm('Your run is very short. Are you sure you want to finish?');
      if (!confirmed) return;
    }

    this.safeEmit('run:stopRequested', {});
  }

  private cancelRun(): void {
    const confirmed = confirm('Are you sure you want to cancel this run? All progress will be lost.');
    if (confirmed) {
      this.safeEmit('run:cancelRequested', {});
    }
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
    this.renderWidget();
    this.showFeedback('🏃‍♂️ Run started! GPS tracking active.', 'success');
  }

  private handleRunPaused(data: any): void {
    this.isRecording = false;
    this.isPaused = true;
    this.stopRealTimeUpdates();
    this.renderWidget();
    this.showFeedback('⏸️ Run paused', 'info');
  }

  private handleRunResumed(data: any): void {
    this.isRecording = true;
    this.isPaused = false;
    this.startRealTimeUpdates();
    this.renderWidget();
    this.showFeedback('▶️ Run resumed', 'success');
  }

  private handleRunCompleted(data: { run: RunSession; territoryEligible: boolean }): void {
    this.isRecording = false;
    this.isPaused = false;
    this.stopRealTimeUpdates();
    this.renderWidget();
    
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
    this.renderWidget();
    this.showFeedback('❌ Run cancelled', 'warning');
  }

  private updateStats(stats: RunStats): void {
    this.currentStats = stats;
    this.updateStatsDisplay();
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
  }

  private showFeedback(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    const feedbackEl = this.container?.querySelector('#run-feedback');
    if (!feedbackEl) return;

    feedbackEl.className = `run-feedback ${type}`;
    feedbackEl.textContent = message;

    // Auto-hide after 3 seconds
    setTimeout(() => {
      feedbackEl.textContent = '';
      feedbackEl.className = 'run-feedback';
    }, 3000);
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
}
