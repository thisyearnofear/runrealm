import { BaseService } from '../core/base-service';
import { getFormattedDistance, formatSpeed, formatPace, formatDuration } from '../utils/distance-formatter';
/**
 * Enhanced run controls widget with real-time GPS tracking and territory detection
 */
export class EnhancedRunControls extends BaseService {
    constructor() {
        super();
        this.container = null;
        this.currentStats = null;
        this.isRecording = false;
        this.isPaused = false;
        this.startTime = 0;
        this.updateInterval = null;
        // Guards to avoid duplicate rendering and ensure idempotency
        this.widgetInitialized = false;
        this.standaloneActive = false;
        this.boundClickHandler = this.handleRunTrackerClick.bind(this);
    }
    async onInitialize() {
        this.setupEventListeners();
        // Don't create widget immediately - wait for MainUI to be ready
        this.safeEmit('service:initialized', { service: 'EnhancedRunControls', success: true });
    }
    /**
     * Initialize widget after MainUI is ready
     */
    initializeWidget() {
        console.log('EnhancedRunControls: Initializing widget...');
        this.createWidget();
        // Ensure event handlers are attached after widget creation
        setTimeout(() => {
            this.attachEventHandlers();
        }, 100);
    }
    getWidgetSystem() {
        return (window.runRealmApp?.mainUI?.widgetSystem ||
            window.RunRealm?.mainUI?.widgetSystem);
    }
    getUIService() {
        return (window.runRealmApp?.ui ||
            window.RunRealm?.ui ||
            window.UIService?.getInstance());
    }
    getMapService() {
        return window.RunRealm?.services?.mapService;
    }
    setupEventListeners() {
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
            const runTrackingService = window.RunRealm?.services?.runTracking;
            if (runTrackingService) {
                const currentRun = runTrackingService.getCurrentRun();
                if (currentRun) {
                    const mapService = this.getMapService();
                    if (mapService) {
                        mapService.drawRunTrail(currentRun.points);
                    }
                }
            }
        });
        this.subscribe('run:lap', (data) => {
            this.addLapToList(data.lap);
        });
        this.subscribe('territory:eligible', (data) => {
            this.showTerritoryEligibleNotification(data);
            // Add haptic feedback for territory eligibility
            this.hapticFeedback('heavy');
            const runTrackingService = window.RunRealm?.services?.runTracking;
            if (runTrackingService) {
                const currentRun = runTrackingService.getCurrentRun();
                if (currentRun) {
                    const mapService = this.getMapService();
                    if (mapService) {
                        mapService.drawTerritory(currentRun.points);
                    }
                }
            }
        });
        // Setup mobile-specific interactions
        this.setupMobileInteractions();
    }
    createWidget() {
        if (this.widgetInitialized)
            return;
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
            this.subscribe('widget:toggled', (data) => {
                if (data.widgetId === 'run-tracker') {
                    // Handle widget toggle
                }
            });
            this.widgetInitialized = true;
            this.standaloneActive = false;
            // Inject styles for the widget
            this.addWidgetStyles();
        }
        else {
            // Guard: avoid duplicate fallback rendering
            const alreadyPresent = document.getElementById('widget-run-tracker') ||
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
            setTimeout(() => {
                const widgetSystem = this.getWidgetSystem();
                if (widgetSystem && this.standaloneActive) {
                    // Migrate to widget system
                    this.createWidget();
                }
            }, 500);
        }
    }
    createStandaloneWidget() {
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
    _getWidgetBodyHTML(isStandalone) {
        const stats = this.currentStats;
        const distance = stats ? this.formatDistance(stats.distance) : '0.00 km';
        const duration = stats ? this.formatDuration(stats.duration) : '00:00';
        const speed = stats ? this.formatSpeed(stats.averageSpeed) : '0.0 km/h';
        const pace = stats ? this.formatPace(stats.averageSpeed) : '--:--';
        const isRunning = this.isRecording || this.isPaused;
        const distanceDisplay = isStandalone ? `<span class="stat-value" id="distance-display">${distance}</span>` : `<span class="stat-value">${distance}</span>`;
        const durationDisplay = isStandalone ? `<span class="stat-value" id="duration-display">${duration}</span>` : `<span class="stat-value">${duration}</span>`;
        const speedDisplay = isStandalone ? `<span class="stat-value" id="speed-display">${speed}</span>` : `<span class="stat-value">${speed}</span>`;
        const paceDisplay = isStandalone ? `<span class="stat-value" id="pace-display">${pace}</span>` : `<span class="stat-value">${pace}</span>`;
        return `
      <div class="run-stats">
        <div class="stat-group">
          <div class="stat-item primary">
            <span class="stat-label">Distance</span>
            ${distanceDisplay}
          </div>
          <div class="stat-item">
            <span class="stat-label">Time</span>
            ${durationDisplay}
          </div>
        </div>
        
        <div class="stat-group">
          <div class="stat-item">
            <span class="stat-label">Speed</span>
            ${speedDisplay}
          </div>
          <div class="stat-item">
            <span class="stat-label">Pace</span>
            ${paceDisplay}
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
        ${!isRunning ? `
          <div class="motivation-quote">
            <p class="quote-text"><em>"The miracle isn't that I finished. The miracle is that I had the courage to start."</em></p>
            <p class="quote-author">- John Bingham</p>
          </div>
        ` : ``}
      </div>

      <div id="run-splits-container" class="run-splits-container" style="display: none;">
        <h4>Lap Splits</h4>
        <ul id="splits-list"></ul>
      </div>

      <div class="run-controls">
        ${this.renderControlButtons()}
      </div>

      <div class="run-feedback" id="run-feedback"></div>
    `;
    }
    getWidgetContent() {
        return `
      <div class="run-status ${this.getStatusClass()}">
        ${this.getStatusText()}
      </div>
      ${this._getWidgetBodyHTML(false)}
    `;
    }
    renderWidget() {
        if (!this.container)
            return;
        this.container.innerHTML = `
      <div class="run-controls-header">
        <h3>🏃‍♂️ Run Tracker</h3>
        <div class="run-status ${this.getStatusClass()}">
          ${this.getStatusText()}
        </div>
      </div>
      ${this._getWidgetBodyHTML(true)}
    `;
    }
    renderControlButtons() {
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
        <button class="control-btn info" id="lap-run-btn">
          <span class="btn-icon">🚩</span>
          <span class="btn-text">Lap</span>
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
    attachEventHandlers() {
        // Use event delegation instead of direct element binding for reliability
        // Remove any existing handlers first to prevent duplication
        this.removeEventHandlers();
        // Use document-level event delegation for run tracker buttons
        document.addEventListener('click', this.boundClickHandler);
        console.log('Run tracker event handlers attached');
    }
    removeEventHandlers() {
        document.removeEventListener('click', this.boundClickHandler);
    }
    handleRunTrackerClick(event) {
        const target = event.target;
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
        }
        else if (target.matches('#pause-run-btn, #pause-run-btn *, .control-btn.warning') ||
            target.closest('#pause-run-btn')) {
            event.preventDefault();
            event.stopPropagation();
            this.pauseRun();
        }
        else if (target.matches('#resume-run-btn, #resume-run-btn *, .control-btn.primary') ||
            target.closest('#resume-run-btn')) {
            event.preventDefault();
            event.stopPropagation();
            this.resumeRun();
        }
        else if (target.matches('#stop-run-btn, #stop-run-btn *, .control-btn.success') ||
            target.closest('#stop-run-btn')) {
            event.preventDefault();
            event.stopPropagation();
            this.stopRun();
        }
        else if (target.matches('#cancel-run-btn, #cancel-run-btn *, .control-btn.danger') ||
            target.closest('#cancel-run-btn')) {
            event.preventDefault();
            event.stopPropagation();
            this.cancelRun();
        }
        else if (target.matches('#gps-check-btn, #gps-check-btn *, .control-btn.secondary') ||
            target.closest('#gps-check-btn')) {
            event.preventDefault();
            event.stopPropagation();
            this.checkGPS();
        }
        else if (target.matches('#lap-run-btn, #lap-run-btn *, .control-btn.info') ||
            target.closest('#lap-run-btn')) {
            event.preventDefault();
            event.stopPropagation();
            this.recordLap();
        }
    }
    recordLap() {
        this.safeEmit('run:lapRequested', {});
    }
    addLapToList(lap) {
        const splitsList = document.getElementById('splits-list');
        if (!splitsList)
            return;
        const lapElement = document.createElement('li');
        lapElement.innerHTML = `
      <span class="lap-number">Lap ${lap.lapNumber}</span>
      <span class="lap-distance">${this.formatDistance(lap.distance)}</span>
      <span class="lap-time">${this.formatDuration(lap.time)}</span>
    `;
        splitsList.appendChild(lapElement);
        // Scroll to the bottom of the list
        splitsList.scrollTop = splitsList.scrollHeight;
    }
    async startRun() {
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
        }
        catch (error) {
            console.error('EnhancedRunControls: Error starting run:', error);
            this.showFeedback(`❌ Failed to start run: ${error.message}`, 'error');
        }
    }
    pauseRun() {
        this.safeEmit('run:pauseRequested', {});
    }
    resumeRun() {
        this.safeEmit('run:resumeRequested', {});
    }
    stopRun() {
        if (this.currentStats && this.currentStats.distance < 100) {
            this.getUIService().showConfirmationModal('Short Run Detected', 'Your run is very short. Are you sure you want to finish?', '⏹️ Finish Run', '↩️ Continue', () => this.safeEmit('run:stopRequested', {}));
            return;
        }
        this.safeEmit('run:stopRequested', {});
    }
    cancelRun() {
        this.getUIService().showConfirmationModal('Cancel Run', 'Are you sure you want to cancel this run? All progress will be lost.', '❌ Cancel Run', '↩️ Keep Running', () => this.safeEmit('run:cancelRequested', {}), 'destructive');
    }
    async checkGPS() {
        try {
            this.showFeedback('📍 Checking GPS...', 'info');
            const available = await this.checkGPSAvailability();
            if (available) {
                this.showFeedback('✅ GPS is working correctly', 'success');
            }
            else {
                this.showFeedback('❌ GPS not available', 'error');
            }
        }
        catch (error) {
            this.showFeedback(`❌ GPS check failed: ${error.message}`, 'error');
        }
    }
    async checkGPSAvailability() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve(false);
                return;
            }
            navigator.geolocation.getCurrentPosition(() => resolve(true), () => resolve(false), { timeout: 5000, enableHighAccuracy: true });
        });
    }
    handleRunStarted(data) {
        this.isRecording = true;
        this.isPaused = false;
        this.startTime = Date.now();
        this.startRealTimeUpdates();
        this.updateDisplay();
        this.showFeedback('🏃‍♂️ Run started! GPS tracking active.', 'success');
        const splitsContainer = document.getElementById('run-splits-container');
        if (splitsContainer) {
            splitsContainer.style.display = 'block';
        }
        const mapService = this.getMapService();
        if (mapService) {
            mapService.clearRun();
        }
    }
    handleRunPaused(data) {
        this.isRecording = false;
        this.isPaused = true;
        this.stopRealTimeUpdates();
        this.updateDisplay();
        this.showFeedback('⏸️ Run paused', 'info');
    }
    handleRunResumed(data) {
        this.isRecording = true;
        this.isPaused = false;
        this.startRealTimeUpdates();
        this.updateDisplay();
        this.showFeedback('▶️ Run resumed', 'success');
    }
    handleRunCompleted(data) {
        this.isRecording = false;
        this.isPaused = false;
        this.stopRealTimeUpdates();
        this.updateDisplay();
        const distance = this.formatDistance(data.run.totalDistance);
        const duration = this.formatDuration(data.run.totalDuration);
        if (data.territoryEligible) {
            this.showFeedback(`🏆 Run completed! ${distance} in ${duration}. Territory eligible!`, 'success');
        }
        else {
            this.showFeedback(`✅ Run completed! ${distance} in ${duration}.`, 'success');
        }
        const splitsContainer = document.getElementById('run-splits-container');
        if (splitsContainer) {
            splitsContainer.style.display = 'none';
            const splitsList = splitsContainer.querySelector('#splits-list');
            if (splitsList) {
                splitsList.innerHTML = ''; // Clear splits
            }
        }
        const mapService = this.getMapService();
        if (mapService) {
            mapService.clearRun();
        }
    }
    handleRunCancelled(data) {
        this.isRecording = false;
        this.isPaused = false;
        this.currentStats = null;
        this.stopRealTimeUpdates();
        this.updateDisplay();
        this.showFeedback('❌ Run cancelled', 'warning');
        const splitsContainer = document.getElementById('run-splits-container');
        if (splitsContainer) {
            splitsContainer.style.display = 'none';
            const splitsList = splitsContainer.querySelector('#splits-list');
            if (splitsList) {
                splitsList.innerHTML = ''; // Clear splits
            }
        }
        const mapService = this.getMapService();
        if (mapService) {
            mapService.clearRun();
        }
    }
    updateStats(stats) {
        this.currentStats = stats;
        this.updateDisplay();
    }
    updateStatsDisplay() {
        if (!this.container || !this.currentStats)
            return;
        const distanceEl = this.container.querySelector('#distance-display');
        const durationEl = this.container.querySelector('#duration-display');
        const speedEl = this.container.querySelector('#speed-display');
        const paceEl = this.container.querySelector('#pace-display');
        if (distanceEl)
            distanceEl.textContent = this.formatDistance(this.currentStats.distance);
        if (durationEl)
            durationEl.textContent = this.formatDuration(this.currentStats.duration);
        if (speedEl)
            speedEl.textContent = this.formatSpeed(this.currentStats.averageSpeed);
        if (paceEl)
            paceEl.textContent = this.formatPace(this.currentStats.averageSpeed);
    }
    startRealTimeUpdates() {
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
    stopRealTimeUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }
    showPointAddedFeedback() {
        // Brief visual feedback when a GPS point is added
        const container = this.container?.querySelector('.run-stats');
        if (container) {
            container.classList.add('point-added');
            setTimeout(() => {
                container.classList.remove('point-added');
            }, 200);
        }
    }
    showTerritoryEligibleNotification(data) {
        this.showFeedback('🏆 Territory eligible! Complete your run to claim.', 'success');
        this.renderWidget(); // Re-render to show territory indicator
        // Add haptic feedback for territory eligibility
        this.hapticFeedback('heavy');
    }
    showFeedback(message, type) {
        const feedbackEl = this.container?.querySelector('#run-feedback');
        if (!feedbackEl)
            return;
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
            // Add celebration effect for success messages
            this.addSuccessCelebration();
        }
        else if (type === 'error') {
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
    /**
     * Add celebration effect for successful actions
     */
    addSuccessCelebration() {
        if (!this.container)
            return;
        // Add a subtle glow effect to the container
        this.container.style.boxShadow = '0 0 20px rgba(0, 255, 136, 0.4)';
        // Create floating particles for celebration
        const particleCount = 15;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'celebration-bubble';
            // Random position and size
            const size = Math.random() * 10 + 5;
            const posX = Math.random() * 100;
            const posY = Math.random() * 100;
            const delay = Math.random() * 0.5;
            const duration = Math.random() * 1 + 1;
            particle.style.cssText = `
        position: absolute;
        width: ${size}px;
        height: ${size}px;
        background: rgba(0, 255, 136, 0.6);
        border-radius: 50%;
        pointer-events: none;
        z-index: 100;
        left: ${posX}%;
        top: ${posY}%;
        animation: floatUp ${duration}s ease-in ${delay}s forwards;
        box-shadow: 0 0 8px rgba(0, 255, 136, 0.8);
      `;
            this.container.appendChild(particle);
            // Remove particle after animation
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, (duration + delay) * 1000);
        }
        // Remove glow effect after a short time
        setTimeout(() => {
            if (this.container) {
                this.container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)';
            }
        }, 1000);
    }
    getFeedbackIcon(type) {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        return icons[type] || icons.info;
    }
    hapticFeedback(type = 'light') {
        if (!navigator.vibrate)
            return;
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
    updateDisplay() {
        if (this.standaloneActive) {
            this.renderWidget();
        }
        else {
            // Update widget content through widget system
            const widgetSystem = this.getWidgetSystem();
            if (widgetSystem) {
                widgetSystem.updateWidget('run-tracker', this.getWidgetContent());
            }
        }
        this.updateStatsDisplay();
    }
    addWidgetStyles() {
        if (document.querySelector('#enhanced-run-controls-styles'))
            return;
        const style = document.createElement('style');
        style.id = 'enhanced-run-controls-styles';
        style.textContent = `
      .run-controls-widget {
        background: rgba(0, 0, 0, 0.9);
        border-radius: 12px;
        padding: 16px;
        color: white;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .run-stats {
        display: flex;
        flex-direction: column;
        gap: 12px;
        margin-bottom: 16px;
      }

      .stat-group {
        display: flex;
        gap: 16px;
      }

      .stat-item {
        flex: 1;
        text-align: center;
        padding: 8px;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.05);
      }

      .stat-label {
        display: block;
        font-size: 12px;
        opacity: 0.7;
        margin-bottom: 4px;
      }

      .stat-value {
        display: block;
        font-size: 18px;
        font-weight: 600;
        color: #00ff88;
      }

      .control-btn {
        padding: 12px 16px;
        border: none;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 4px;
      }

      .control-btn.primary {
        background: #00ff88;
        color: #000;
      }

      .control-btn.secondary {
        background: rgba(255, 255, 255, 0.1);
        color: white;
      }

      .control-btn.success {
        background: #4CAF50;
        color: white;
      }

      .control-btn.warning {
        background: #FF9800;
        color: white;
      }

      .control-btn.danger {
        background: #f44336;
        color: white;
      }

      .control-btn.info {
        background: #2196F3;
        color: white;
      }

      .run-feedback {
        margin-top: 12px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        opacity: 0;
        transition: opacity 0.3s ease;
      }

      .run-feedback.feedback-show {
        opacity: 1;
      }

      .run-feedback.success {
        background: rgba(76, 175, 80, 0.2);
        color: #4CAF50;
        border: 1px solid rgba(76, 175, 80, 0.3);
      }

      .run-feedback.error {
        background: rgba(244, 67, 54, 0.2);
        color: #f44336;
        border: 1px solid rgba(244, 67, 54, 0.3);
      }

      .run-feedback.warning {
        background: rgba(255, 152, 0, 0.2);
        color: #FF9800;
        border: 1px solid rgba(255, 152, 0, 0.3);
      }

      .run-feedback.info {
        background: rgba(33, 150, 243, 0.2);
        color: #2196F3;
        border: 1px solid rgba(33, 150, 243, 0.3);
      }

      @keyframes floatUp {
        0% {
          transform: translateY(0) scale(0);
          opacity: 1;
        }
        50% {
          transform: translateY(-20px) scale(1);
          opacity: 0.8;
        }
        100% {
          transform: translateY(-40px) scale(0);
          opacity: 0;
        }
      }

      @keyframes ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }

      @keyframes tooltipFadeIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(5px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
    `;
        document.head.appendChild(style);
    }
    /**
     * Setup mobile-specific interactions and gestures
     */
    setupMobileInteractions() {
        if (!this.isMobile())
            return;
        // Add swipe gestures for mobile
        this.setupSwipeGestures();
        // Add long press interactions
        this.setupLongPressActions();
        // Add visual feedback for touch
        this.setupTouchFeedback();
    }
    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            window.innerWidth <= 768;
    }
    setupSwipeGestures() {
        if (!this.container)
            return;
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
    setupLongPressActions() {
        if (!this.container)
            return;
        const buttons = this.container.querySelectorAll('.control-btn');
        buttons.forEach(button => {
            let pressTimer = null;
            button.addEventListener('touchstart', () => {
                pressTimer = window.setTimeout(() => {
                    this.showButtonTooltip(button);
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
    setupTouchFeedback() {
        if (!this.container)
            return;
        // Add ripple effect on touch
        this.container.addEventListener('touchstart', (e) => {
            const target = e.target;
            if (target.classList.contains('control-btn') || target.classList.contains('stat-item')) {
                this.createRippleEffect(target, e.touches[0]);
            }
        });
    }
    createRippleEffect(element, touch) {
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
        element.style.position = 'relative';
        element.style.overflow = 'hidden';
        element.appendChild(ripple);
        setTimeout(() => {
            ripple.remove();
        }, 600);
    }
    expandStats() {
        if (!this.container)
            return;
        this.container.classList.add('stats-expanded');
        this.showFeedback('📊 Stats expanded', 'info');
    }
    minimizeStats() {
        if (!this.container)
            return;
        this.container.classList.remove('stats-expanded');
        this.showFeedback('📊 Stats minimized', 'info');
    }
    showButtonTooltip(button) {
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
    getStatusClass() {
        if (this.isRecording)
            return 'recording';
        if (this.isPaused)
            return 'paused';
        return 'idle';
    }
    getStatusText() {
        if (this.isRecording)
            return 'Recording';
        if (this.isPaused)
            return 'Paused';
        return 'Ready';
    }
    formatDistance(meters) {
        const result = getFormattedDistance(meters, true); // Always use metric for now
        return result.formatted;
    }
    formatDuration(milliseconds) {
        return formatDuration(milliseconds);
    }
    formatSpeed(metersPerSecond) {
        return formatSpeed(metersPerSecond, true); // Always use metric for now
    }
    formatPace(metersPerSecond) {
        return formatPace(metersPerSecond, true); // Always use metric for now
    }
    async onDestroy() {
        this.removeEventHandlers();
        this.stopRealTimeUpdates();
    }
    // Test method for celebration effects (development only)
    testCelebration() {
        if (process.env.NODE_ENV === 'development') {
            this.showFeedback('Test celebration!', 'success');
        }
    }
}
