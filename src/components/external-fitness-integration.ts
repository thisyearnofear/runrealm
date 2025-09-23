import { BaseService } from "../core/base-service";
import { ExternalActivity } from "../services/run-tracking-service";
import { ExternalFitnessService } from "../services/external-fitness-service";

export class ExternalFitnessIntegration extends BaseService {
  private container: HTMLElement;
  private isVisible = false;
  private fitnessService: ExternalFitnessService;
  private currentPage = 1;

  constructor(container: HTMLElement) {
    super();
    this.container = container;
    this.fitnessService = new ExternalFitnessService();
    this.render();
    this.setupEventListeners();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="fitness-portal" style="display: none;">
        <div class="portal-backdrop"></div>
        <div class="portal-content">
          <div class="portal-header">
            <div class="portal-title">
              <span class="portal-icon">🌟</span>
              <h3>Claim Your Past Runs</h3>
              <p>Transform past adventures into NFT territories</p>
            </div>
            <button class="portal-close">×</button>
          </div>
          
          <div class="connection-grid">
            <div class="service-card strava" data-source="strava">
              <div class="service-icon">🏃</div>
              <div class="service-info">
                <h4>Strava</h4>
                <p>Import your running history</p>
              </div>
              <div class="service-status">Connect</div>
            </div>
            
            <div class="service-card coming-soon">
              <div class="service-icon">⌚</div>
              <div class="service-info">
                <h4>Garmin</h4>
                <p>Coming soon</p>
              </div>
              <div class="service-status">Soon</div>
            </div>
          </div>
          
          <div class="activities-realm" style="display: none;">
            <div class="realm-header">
              <h4>🏆 Claimable Territories</h4>
              <p>Select runs to mint as NFT territories</p>
            </div>
            <div class="activities-grid"></div>
            <div class="load-more-container">
              <button class="load-more-btn widget-button secondary">Load More</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const portal = this.container.querySelector('.fitness-portal') as HTMLElement;
    const closeBtn = portal.querySelector('.portal-close') as HTMLButtonElement;
    const stravaCard = portal.querySelector('.service-card.strava') as HTMLElement;
    const loadMoreBtn = portal.querySelector('.load-more-btn') as HTMLButtonElement;

    closeBtn.addEventListener('click', () => this.hide());
    stravaCard.addEventListener('click', () => this.connectStrava());
    loadMoreBtn.addEventListener('click', () => this.loadMoreActivities());

    // Listen for fitness service events
    this.eventBus.on('fitness:connected', (event) => {
      this.onServiceConnected(event.source);
    });

    this.eventBus.on('fitness:connectionFailed', (event) => {
      this.onConnectionFailed(event.source, event.error);
    });

    this.eventBus.on('fitness:activities', (event) => {
      this.displayActivities(event.activities);
    });
  }

  public show(): void {
    const portal = this.container.querySelector('.fitness-portal') as HTMLElement;
    portal.style.display = 'flex';
    
    // Animate in
    requestAnimationFrame(() => {
      portal.classList.add('portal-active');
    });
    
    this.isVisible = true;
  }

  public hide(): void {
    const portal = this.container.querySelector('.fitness-portal') as HTMLElement;
    portal.classList.remove('portal-active');
    
    setTimeout(() => {
      portal.style.display = 'none';
    }, 300);
    
    this.isVisible = false;
  }

  private async connectStrava(): Promise<void> {
    const stravaCard = this.container.querySelector('.service-card.strava') as HTMLElement;
    const status = stravaCard.querySelector('.service-status') as HTMLElement;
    
    status.textContent = 'Connecting...';
    stravaCard.classList.add('connecting');

    try {
      const authUrl = this.fitnessService.initiateStravaAuth();
      
      // Open OAuth window
      const authWindow = window.open(
        authUrl, 
        'strava-auth', 
        'width=600,height=600,scrollbars=yes,resizable=yes'
      );
      
      if (!authWindow) {
        throw new Error('Unable to open authentication window. Please allow popups.');
      }
      
      // Monitor for successful authentication
      const pollTimer = setInterval(() => {
        try {
          if (authWindow.closed) {
            clearInterval(pollTimer);
            // Check if authentication was successful
            if (this.fitnessService.isConnected('strava')) {
              this.onServiceConnected('strava');
            } else {
              status.textContent = 'Connect';
              stravaCard.classList.remove('connecting');
            }
          }
        } catch (error) {
          // Ignore cross-origin errors
        }
      }, 1000);
      
    } catch (error) {
      console.error('Failed to connect Strava:', error);
      status.textContent = 'Failed';
      stravaCard.classList.remove('connecting');
      
      // Show user-friendly error
      this.showError(error instanceof Error ? error.message : 'Connection failed');
    }
  }

  private onConnectionFailed(source: string, error: string): void {
    const serviceCard = this.container.querySelector(`.service-card.${source}`) as HTMLElement;
    const status = serviceCard.querySelector('.service-status') as HTMLElement;
    
    serviceCard.classList.remove('connecting');
    status.textContent = 'Failed';
    
    this.showError(`Failed to connect to ${source}: ${error}`);
  }

  private onServiceConnected(source: string): void {
    const serviceCard = this.container.querySelector(`.service-card.${source}`) as HTMLElement;
    const status = serviceCard.querySelector('.service-status') as HTMLElement;
    
    serviceCard.classList.remove('connecting');
    serviceCard.classList.add('connected');
    status.textContent = '✓ Connected';

    this.loadRecentActivities(source, 1);
  }

  private async loadRecentActivities(source: string, page: number): Promise<void> {
    try {
      if (source === 'strava') {
        const activities = await this.fitnessService.getStravaActivities(page, 8);
        this.displayActivities(activities);
      }
    } catch (error) {
      console.error('Failed to load activities:', error);
      this.showError('Failed to load activities');
    }
  }

  private loadMoreActivities(): void {
    this.currentPage++;
    this.loadRecentActivities('strava', this.currentPage);
  }

  private displayActivities(activities: ExternalActivity[]): void {
    const activitiesRealm = this.container.querySelector('.activities-realm') as HTMLElement;
    const grid = activitiesRealm.querySelector('.activities-grid') as HTMLElement;
    const loadMoreBtn = this.container.querySelector('.load-more-btn') as HTMLButtonElement;

    if (activities.length === 0 && this.currentPage > 1) {
      loadMoreBtn.textContent = "No more activities";
      loadMoreBtn.disabled = true;
      return;
    }

    const activitiesHtml = activities.map(activity => `
      <div class="activity-card" data-activity-id="${activity.id}">
        <div class="activity-header">
          <div class="activity-icon">🏃‍♂️</div>
          <div class="activity-meta">
            <div class="activity-name">${activity.name}</div>
            <div class="activity-date">${new Date(activity.startTime).toLocaleDateString()}</div>
          </div>
        </div>
        
        <div class="activity-stats">
          <div class="stat">
            <span class="stat-value">${(activity.distance / 1000).toFixed(1)}</span>
            <span class="stat-label">km</span>
          </div>
          <div class="stat">
            <span class="stat-value">${Math.floor(activity.duration / 60000)}</span>
            <span class="stat-label">min</span>
          </div>
        </div>
        
        <div class="territory-preview">
          <div class="territory-rarity">Epic Territory</div>
          <div class="territory-reward">~${Math.floor(activity.distance / 100)} REALM</div>
        </div>
        
        <button class="preview-btn" data-activity='${JSON.stringify(activity)}'>
          <span class="btn-icon">🗺️</span>
          <span class="btn-text">Preview & Claim</span>
        </button>
        
        <button class="claim-btn" data-activity='${JSON.stringify(activity)}' style="display: none;">
          <span class="btn-icon">⚡</span>
          <span class="btn-text">Claim Territory</span>
        </button>
      </div>
    `).join('');

    grid.insertAdjacentHTML('beforeend', activitiesHtml);

    // Add preview listeners
    grid.querySelectorAll('.preview-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const activityData = (e.target as HTMLElement).closest('.preview-btn')?.getAttribute('data-activity');
        if (activityData) {
          this.previewTerritoryForActivity(JSON.parse(activityData));
        }
      });
    });

    // Add hover listeners for map highlighting
    grid.querySelectorAll('.activity-card').forEach(card => {
      card.addEventListener('mouseover', async (e) => {
        const activityData = (e.currentTarget as HTMLElement).querySelector('.preview-btn')?.getAttribute('data-activity');
        if (activityData) {
          const activity = JSON.parse(activityData);
          const mapService = this.getService('MapService');
          const runTrackingService = this.getService('RunTrackingService');
          if (mapService && runTrackingService && activity.polyline) {
            const points = await runTrackingService.decodePolylineToPoints(activity.polyline);
            mapService.highlightActivity(points);
          }
        }
      });

      card.addEventListener('mouseout', () => {
        const mapService = this.getService('MapService');
        if (mapService) {
          mapService.clearActivityHighlight();
        }
      });
    });

    activitiesRealm.style.display = 'block';
  }

  private async previewTerritoryForActivity(activity: ExternalActivity): Promise<void> {
    const runTrackingService = this.getService('RunTrackingService');
    const mapService = this.getService('MapService');

    if (!runTrackingService || !mapService) return;

    const previewBtn = this.container.querySelector(`[data-activity-id="${activity.id}"] .preview-btn`) as HTMLElement;
    const btnText = previewBtn.querySelector('.btn-text') as HTMLElement;
    const btnIcon = previewBtn.querySelector('.btn-icon') as HTMLElement;
    
    // Animate preview process
    btnIcon.textContent = '🔄';
    btnText.textContent = 'Loading...';
    previewBtn.classList.add('loading');

    try {
      // Import activity to generate run session and territory data
      const runSession = await runTrackingService.importExternalActivity(activity);
      
      if (runSession.territoryEligible && runSession.geohash) {
        // Create territory preview data
        const territoryPreview = {
          geohash: runSession.geohash,
          bounds: {
            center: runSession.points[0], // Use first point as center
            radius: Math.max(runSession.totalDistance / 4, 100) // Dynamic radius based on run distance
          },
          isAvailable: true, // Assume available for preview
          metadata: {
            difficulty: Math.floor((runSession.totalDistance / 1000) * 10), // Rough difficulty calculation
            rarity: runSession.totalDistance > 10000 ? 'Epic' : runSession.totalDistance > 5000 ? 'Rare' : 'Common',
            estimatedReward: Math.floor(runSession.totalDistance / 100)
          }
        };

        // Add territory preview to map
        mapService.addTerritoryPreview(territoryPreview);
        
        // Focus map on territory
        if (runSession.points.length > 0) {
          const centerPoint = runSession.points[Math.floor(runSession.points.length / 2)];
          mapService.focusOnLocation(centerPoint.lat, centerPoint.lng, 14);
        }

        // Update button states
        btnIcon.textContent = '✅';
        btnText.textContent = 'Territory Previewed';
        previewBtn.classList.remove('loading');
        previewBtn.classList.add('previewed');
        
        // Show claim confirmation
        this.showTerritoryClaimConfirmation(activity, territoryPreview);
        
        // Emit territory preview event
         this.safeEmit('territory:preview', {
           territory: territoryPreview,
           bounds: territoryPreview.bounds,
           metadata: territoryPreview.metadata
         });
        
      } else {
        btnIcon.textContent = '❌';
        btnText.textContent = 'Not Eligible';
        previewBtn.classList.remove('loading');
        previewBtn.setAttribute('disabled', 'true');
        previewBtn.setAttribute('title', 'This run is not eligible for territory claiming. Runs must be at least 500m and start and end in a similar location.');
      }
    } catch (error) {
      console.error('Failed to preview territory:', error);
      btnIcon.textContent = '❌';
      btnText.textContent = 'Preview Failed';
      previewBtn.classList.remove('loading');
    }
  }

  private showSuccessAnimation(button: HTMLElement): void {
    // Create sparkle effect
    const sparkles = document.createElement('div');
    sparkles.className = 'success-sparkles';
    sparkles.innerHTML = '✨✨✨';
    
    button.parentElement?.appendChild(sparkles);
    
    setTimeout(() => sparkles.remove(), 2000);
  }

  private showError(message: string): void {
    const errorContainer = this.container.querySelector('.portal-content');
    if (!errorContainer) return;

    const errorDiv = document.createElement('div');
    errorDiv.className = 'fitness-error-persistent';
    errorDiv.innerHTML = `
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-message">${message}</span>
        <button class="close-error">×</button>
      </div>
    `;
    
    errorContainer.prepend(errorDiv);
    
    const closeBtn = errorDiv.querySelector('.close-error');
    closeBtn?.addEventListener('click', () => {
      errorDiv.remove();
    });
  }
  private getService(serviceName: string): any {
    const services = (window as any).RunRealm?.services;
    return services?.[serviceName];
  }

  /**
   * Show territory claim confirmation dialog
   */
  private showTerritoryClaimConfirmation(activity: any, territoryPreview: any): void {
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'territory-claim-modal modal-overlay';
    confirmDialog.innerHTML = `
      <div class="territory-claim-dialog">
        <div class="modal-header">
          <h3>🗺️ Claim Territory</h3>
          <button class="close-modal" id="close-claim-modal">×</button>
        </div>
        
        <div class="territory-claim-content">
          <div class="territory-info">
            <h4>${activity.name}</h4>
            <div class="territory-stats">
              <div class="stat">
                <span class="label">Distance:</span>
                <span class="value">${(activity.distance / 1000).toFixed(2)} km</span>
              </div>
              <div class="stat">
                <span class="label">Difficulty:</span>
                <span class="value">${territoryPreview.metadata.difficulty}/100</span>
              </div>
              <div class="stat">
                <span class="label">Rarity:</span>
                <span class="value">${territoryPreview.metadata.rarity}</span>
              </div>
              <div class="stat">
                <span class="label">Estimated Reward:</span>
                <span class="value">${territoryPreview.metadata.estimatedReward} REALM</span>
              </div>
            </div>
          </div>
          
          <div class="claim-actions">
            <button class="cancel-btn" id="cancel-claim">Cancel</button>
            <button class="confirm-claim-btn" id="confirm-claim">
              <span class="btn-icon">⚡</span>
              <span class="btn-text">Claim Territory</span>
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(confirmDialog);
    
    // Setup event handlers
    const closeBtn = confirmDialog.querySelector('#close-claim-modal');
    const cancelBtn = confirmDialog.querySelector('#cancel-claim');
    const confirmBtn = confirmDialog.querySelector('#confirm-claim');
    
    const closeDialog = () => {
      document.body.removeChild(confirmDialog);
    };
    
    closeBtn?.addEventListener('click', closeDialog);
    cancelBtn?.addEventListener('click', closeDialog);
    
    confirmBtn?.addEventListener('click', async () => {
      try {
        const confirmBtnElement = confirmBtn as HTMLButtonElement;
        const btnIcon = confirmBtnElement.querySelector('.btn-icon');
        const btnText = confirmBtnElement.querySelector('.btn-text');
        
        // Update button state
        if (btnIcon) btnIcon.textContent = '⏳';
        if (btnText) btnText.textContent = 'Claiming...';
        confirmBtnElement.disabled = true;
        
        // Get territory service and claim territory
        const territoryService = this.getService('TerritoryService');
        if (territoryService) {
          const runTrackingService = this.getService('RunTrackingService');
          const runSession = await runTrackingService.importExternalActivity(activity);
          const result = await territoryService.claimTerritoryFromExternalActivity(runSession);
          
          if (result.success) {
            this.safeEmit('territory:claimed', {
              territory: result.territory,
              transactionHash: result.transactionHash,
              source: activity.source
            });
            
            // Update UI to show success
            if (btnIcon) btnIcon.textContent = '✅';
            if (btnText) btnText.textContent = 'Claimed!';
            
            setTimeout(closeDialog, 2000);
          } else {
            throw new Error(result.error || 'Failed to claim territory');
          }
        } else {
          throw new Error('Territory service not available');
        }
      } catch (error) {
        console.error('Territory claim failed:', error);
        const confirmBtnElement = confirmBtn as HTMLButtonElement;
        const btnIcon = confirmBtnElement.querySelector('.btn-icon');
        const btnText = confirmBtnElement.querySelector('.btn-text');
        
        if (btnIcon) btnIcon.textContent = '❌';
        if (btnText) btnText.textContent = 'Failed';
        
        setTimeout(() => {
          if (btnIcon) btnIcon.textContent = '⚡';
          if (btnText) btnText.textContent = 'Claim Territory';
          confirmBtnElement.disabled = false;
        }, 3000);
      }
    });
    
    // Close on backdrop click
    confirmDialog.addEventListener('click', (e) => {
      if (e.target === confirmDialog) {
        closeDialog();
      }
    });
  }

  /**
   * Override BaseService initialize method
   */
  protected async onInitialize(): Promise<void> {
    await this.fitnessService.initialize();
    
    // Check if already connected
    const status = this.fitnessService.getConnectionStatus();
    if (status.strava) {
      this.onServiceConnected('strava');
    }
  }
}
