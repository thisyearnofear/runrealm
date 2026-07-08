/**
 * GPS Permission Modal - Full-screen, mobile-optimized GPS request
 */
export class GPSPermissionModal {
  private modalElement: HTMLElement | null = null;
  private onEnable: (() => void) | null = null;
  private onDismiss: (() => void) | null = null;

  /**
   * Show GPS permission modal
   */
  show(onEnable: () => void, onDismiss?: () => void): void {
    this.onEnable = onEnable;
    this.onDismiss = onDismiss || (() => {});

    this.createModal();
    this.attachEventListeners();

    document.body.appendChild(this.modalElement!);

    requestAnimationFrame(() => {
      this.modalElement?.classList.add('visible');
    });
  }

  /**
   * Hide and remove the modal
   */
  hide(): void {
    if (!this.modalElement) return;

    this.modalElement.classList.remove('visible');

    setTimeout(() => {
      this.modalElement?.remove();
      this.modalElement = null;
    }, 300);
  }

  /**
   * Create modal DOM structure
   */
  private createModal(): void {
    this.modalElement = document.createElement('div');
    this.modalElement.className = 'gps-permission-modal';
    this.modalElement.innerHTML = `
      <div class="gps-modal-backdrop"></div>
      <div class="gps-modal-content">
        <div class="gps-modal-header">
          <button class="gps-modal-close" aria-label="Close">×</button>
        </div>
        
        <div class="gps-modal-body">
          <div class="gps-modal-icon">📍</div>
          
          <h2 class="gps-modal-title">Enable GPS</h2>
          
          <p class="gps-modal-description">
            To track your location accurately and discover nearby territories, RunRealm needs GPS access.
          </p>
          
          <div class="gps-modal-benefits">
            <div class="benefit-item">
              <span class="benefit-icon">🎯</span>
              <span class="benefit-text">Accurate tracking</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">🗺️</span>
              <span class="benefit-text">Claim territories</span>
            </div>
            <div class="benefit-item">
              <span class="benefit-icon">⚡</span>
              <span class="benefit-text">Real-time updates</span>
            </div>
          </div>
          
          <p class="gps-modal-note">
            Your location is only used while RunRealm is active.
          </p>
        </div>
        
        <div class="gps-modal-actions">
          <button class="gps-btn-enable" id="gps-modal-enable">
            <span class="btn-icon">📍</span>
            <span class="btn-text">Enable GPS</span>
          </button>
          <button class="gps-btn-later" id="gps-modal-dismiss">
            <span class="btn-text">Ask Me Later</span>
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to modal buttons
   */
  private attachEventListeners(): void {
    if (!this.modalElement) return;

    const enableBtn = this.modalElement.querySelector('#gps-modal-enable') as HTMLButtonElement;
    const dismissBtn = this.modalElement.querySelector('#gps-modal-dismiss') as HTMLButtonElement;
    const closeBtn = this.modalElement.querySelector('.gps-modal-close') as HTMLButtonElement;
    const backdrop = this.modalElement.querySelector('.gps-modal-backdrop') as HTMLElement;

    enableBtn?.addEventListener('click', () => {
      this.hide();
      this.onEnable?.();
    });

    dismissBtn?.addEventListener('click', () => {
      this.hide();
      this.onDismiss?.();
    });

    closeBtn?.addEventListener('click', () => {
      this.hide();
      this.onDismiss?.();
    });

    backdrop?.addEventListener('click', () => {
      this.hide();
      this.onDismiss?.();
    });
  }
}
