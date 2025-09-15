import { BaseService } from "../core/base-service";
import { ExternalActivity } from "../services/run-tracking-service";

export class ExternalFitnessIntegration extends BaseService {
  private container: HTMLElement;
  private isVisible = false;

  constructor(container: HTMLElement) {
    super();
    this.container = container;
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
              <h3>Import Your Legendary Runs</h3>
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
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    const portal = this.container.querySelector('.fitness-portal') as HTMLElement;
    const closeBtn = portal.querySelector('.portal-close') as HTMLButtonElement;
    const stravaCard = portal.querySelector('.service-card.strava') as HTMLElement;

    closeBtn.addEventListener('click', () => this.hide());
    stravaCard.addEventListener('click', () => this.connectStrava());

    // Listen for fitness service events
    this.addEventListener('fitness:connected', (event: any) => {
      this.onServiceConnected(event.detail.source);
    });

    this.addEventListener('fitness:activities', (event: any) => {
      this.displayActivities(event.detail.activities);
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
    const fitnessService = this.getService('ExternalFitnessService');
    if (!fitnessService) return;

    const stravaCard = this.container.querySelector('.service-card.strava') as HTMLElement;
    const status = stravaCard.querySelector('.service-status') as HTMLElement;
    
    status.textContent = 'Connecting...';
    stravaCard.classList.add('connecting');

    try {
      const authUrl = fitnessService.initiateStravaAuth();
      window.open(authUrl, '_blank', 'width=600,height=600');
    } catch (error) {
      console.error('Failed to connect Strava:', error);
      status.textContent = 'Failed';
      stravaCard.classList.remove('connecting');
    }
  }

  private onServiceConnected(source: string): void {
    const serviceCard = this.container.querySelector(`.service-card.${source}`) as HTMLElement;
    const status = serviceCard.querySelector('.service-status') as HTMLElement;
    
    serviceCard.classList.remove('connecting');
    serviceCard.classList.add('connected');
    status.textContent = '✓ Connected';

    this.loadRecentActivities(source);
  }

  private async loadRecentActivities(source: string): Promise<void> {
    const fitnessService = this.getService('ExternalFitnessService');
    if (!fitnessService) return;

    try {
      const activities = await fitnessService.getStravaActivities(8);
      this.displayActivities(activities);
    } catch (error) {
      console.error('Failed to load activities:', error);
    }
  }

  private displayActivities(activities: ExternalActivity[]): void {
    const activitiesRealm = this.container.querySelector('.activities-realm') as HTMLElement;
    const grid = activitiesRealm.querySelector('.activities-grid') as HTMLElement;

    grid.innerHTML = activities.map(activity => `
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
        
        <button class="claim-btn" data-activity='${JSON.stringify(activity)}'>
          <span class="btn-icon">⚡</span>
          <span class="btn-text">Claim Territory</span>
        </button>
      </div>
    `).join('');

    // Add claim listeners
    grid.querySelectorAll('.claim-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const activityData = (e.target as HTMLElement).closest('.claim-btn')?.dataset.activity;
        if (activityData) {
          this.importActivity(JSON.parse(activityData));
        }
      });
    });

    activitiesRealm.style.display = 'block';
  }

  private async importActivity(activity: ExternalActivity): Promise<void> {
    const runTrackingService = this.getService('RunTrackingService');
    const territoryService = this.getService('TerritoryService');

    if (!runTrackingService || !territoryService) return;

    const claimBtn = this.container.querySelector(`[data-activity-id="${activity.id}"] .claim-btn`) as HTMLElement;
    const btnText = claimBtn.querySelector('.btn-text') as HTMLElement;
    const btnIcon = claimBtn.querySelector('.btn-icon') as HTMLElement;
    
    // Animate claiming process
    btnIcon.textContent = '⚡';
    btnText.textContent = 'Minting...';
    claimBtn.classList.add('claiming');

    try {
      const runSession = await runTrackingService.importExternalActivity(activity);
      
      if (runSession.territoryEligible) {
        const result = await territoryService.claimTerritoryFromExternalActivity(runSession);
        
        if (result.success) {
          btnIcon.textContent = '✅';
          btnText.textContent = 'Territory Claimed!';
          claimBtn.classList.remove('claiming');
          claimBtn.classList.add('claimed');
          
          this.safeEmit('territory:claimed', { 
            territoryId: result.territoryId,
            source: activity.source 
          });
          
          // Show success animation
          this.showSuccessAnimation(claimBtn);
          
          setTimeout(() => this.hide(), 2000);
        } else {
          throw new Error(result.error);
        }
      } else {
        throw new Error('Activity not eligible for territory claiming');
      }
    } catch (error) {
      console.error('Failed to import activity:', error);
      btnIcon.textContent = '❌';
      btnText.textContent = 'Failed';
      claimBtn.classList.remove('claiming');
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

  private getService(serviceName: string): any {
    const services = (window as any).RunRealm?.services;
    return services?.[serviceName];
  }
}
