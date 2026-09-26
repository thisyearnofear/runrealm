/**
 * SunprintDeedModal - High-Dopamine Collectible Territory Deed Reveal
 *
 * Inspired by collectible card reveals (GoCollect/Pokemon GO) adapted into
 * RunRealm's signature "Sunprint Atlas" cyanotype cartography.
 * Triggered on territory claim or when inspecting collected territory deeds.
 */

import { BaseService } from '../core/base-service';
import { DOMService } from '../services/dom-service';
import { SoundService } from '../services/sound-service';
import { Territory } from '../services/territory-service';

export interface DeedData {
  territory: Territory;
  transactionHash?: string;
  isCrossChain?: boolean;
}

export interface SunprintDeedModalOptions {
  /**
   * When true (default), the modal automatically shows on `territory:claimed`
   * events. Set to false when the caller wants manual control over when the
   * reveal appears (e.g. only after run-completed).
   */
  autoShowOnClaim?: boolean;
}

export class SunprintDeedModal extends BaseService {
  private domService: DOMService;
  private soundService: SoundService;
  private activeModal: HTMLElement | null = null;
  private escKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private readonly autoShowOnClaim: boolean;

  constructor(domService?: DOMService, options?: SunprintDeedModalOptions) {
    super();
    this.domService = domService || new DOMService();
    this.soundService = SoundService.getInstance();
    this.autoShowOnClaim = options?.autoShowOnClaim ?? true;
  }

  protected async onInitialize(): Promise<void> {
    this.injectStyles();

    // Listen for territory claim events to trigger the celebratory reveal
    if (this.autoShowOnClaim) {
      this.subscribe(
        'territory:claimed',
        (data: { territory: Territory; transactionHash?: string; isCrossChain?: boolean }) => {
          if (data && data.territory) {
            this.showDeed({
              territory: data.territory,
              transactionHash: data.transactionHash,
              isCrossChain: data.isCrossChain,
            });
          }
        }
      );
    }

    // Listen for direct UI inspection requests (e.g. from Dashboard binder)
    this.subscribe(
      'ui:showDeedModal',
      (data: { territory: Territory; transactionHash?: string }) => {
        if (data && data.territory) {
          this.showDeed({
            territory: data.territory,
            transactionHash: data.transactionHash,
          });
        }
      }
    );

    this.safeEmit('service:initialized', { service: 'SunprintDeedModal', success: true });
  }

  /**
   * Display the full-screen celebratory deed reveal modal
   */
  public showDeed(data: DeedData): void {
    if (typeof document === 'undefined') return;

    // Remove any existing active deed modal
    this.closeDeed();

    // Standalone callers may not have awaited initialize(), so keep styling
    // idempotent but guaranteed at reveal time.
    this.injectStyles();

    const territory = data.territory;
    const rarity = (territory.rarity || territory.metadata?.rarity || 'common').toLowerCase() as
      | 'common'
      | 'rare'
      | 'epic'
      | 'legendary';

    // Play tactile feedback & thematic audio
    this.triggerHaptics(rarity);
    this.soundService.playDeedRevealSound(rarity);

    // Create modal DOM
    const modal = this.renderModal(data, rarity);
    document.body.appendChild(modal);
    this.activeModal = modal;

    // Setup ESC dismiss handler
    this.escKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeDeed();
      }
    };
    window.addEventListener('keydown', this.escKeyHandler);
  }

  /**
   * Dismiss the deed modal
   */
  public closeDeed(): void {
    if (this.activeModal) {
      this.activeModal.classList.add('closing');
      setTimeout(() => {
        if (this.activeModal && this.activeModal.parentNode) {
          this.activeModal.parentNode.removeChild(this.activeModal);
        }
        this.activeModal = null;
      }, 250);
    }

    if (this.escKeyHandler) {
      window.removeEventListener('keydown', this.escKeyHandler);
      this.escKeyHandler = null;
    }
  }

  private triggerHaptics(rarity: string): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        if (rarity === 'legendary') {
          navigator.vibrate([100, 40, 100, 40, 250]);
        } else if (rarity === 'epic') {
          navigator.vibrate([80, 50, 180]);
        } else {
          navigator.vibrate([60, 40, 120]);
        }
      } catch (_e) {
        // Ignore vibration errors if browser restricts
      }
    }
  }

  private renderModal(
    data: DeedData,
    rarity: 'common' | 'rare' | 'epic' | 'legendary'
  ): HTMLElement {
    const { territory, transactionHash } = data;
    const name =
      territory.metadata?.name || `Sector ${territory.geohash?.substring(0, 7) || 'Alpha'}`;
    const h3Cell = territory.geohash || territory.id || '8928308280fffff';
    const distanceKm = territory.runData?.distance
      ? (territory.runData.distance / 1000).toFixed(2)
      : '1.85';
    const estReward = territory.estimatedReward || territory.metadata?.estimatedReward || 50;
    const dailyYield = (estReward * 0.15).toFixed(1);
    const difficulty = territory.metadata?.difficulty || 45;
    const dateFormatted = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const modal = document.createElement('div');
    modal.className = `sunprint-deed-overlay rarity-${rarity}`;

    modal.innerHTML = `
      <div class="sunprint-deed-backdrop" data-action="close"></div>
      
      <div class="sunprint-deed-card">
        <!-- Blueprint Corner Crosshairs -->
        <span class="crosshair tl">+</span>
        <span class="crosshair tr">+</span>
        <span class="crosshair bl">+</span>
        <span class="crosshair br">+</span>

        <!-- Developing Shimmer Layer -->
        <div class="chemical-wash-sweep"></div>

        <!-- Header Registry Bar -->
        <div class="deed-header">
          <div class="deed-registry-tag">RUNREALM CADASTRAL REGISTER • ARCHIVE NO. ${h3Cell.slice(-6).toUpperCase()}</div>
          <button class="deed-close-btn" data-action="close" aria-label="Close">✕</button>
        </div>

        <!-- Rarity Seal / Foil Wax Badge -->
        <div class="deed-seal-container">
          <div class="deed-seal ${rarity}">
            <div class="seal-inner">
              <span class="seal-star">★</span>
              <span class="seal-text">${rarity.toUpperCase()} DEED</span>
              <span class="seal-star">★</span>
            </div>
            <div class="seal-foil-shine"></div>
          </div>
        </div>

        <!-- Territory Title & Coordinates -->
        <div class="deed-title-block">
          <div class="deed-subline">OFFICIAL RECORD OF RECLAIMED GROUND</div>
          <h2 class="deed-name">${name}</h2>
          <div class="deed-coordinates">
            <span class="coord-item"><span class="label">H3 CELL:</span> <code>${h3Cell}</code></span>
            <span class="coord-item"><span class="label">DATE:</span> ${dateFormatted}</span>
          </div>
        </div>

        <!-- Hexagonal Cadastral Cartogram Preview -->
        <div class="deed-map-preview">
          <svg class="hex-cadastral-svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="cadastralGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="var(--deed-accent)" stop-opacity="0.3" />
                <stop offset="100%" stop-color="var(--deed-accent)" stop-opacity="0.05" />
              </linearGradient>
            </defs>
            <!-- Background Lattice Grid -->
            <path d="M 20 80 L 50 25 L 110 25 L 140 80 L 110 135 L 50 135 Z" fill="url(#cadastralGrad)" stroke="var(--deed-accent)" stroke-width="1.5" stroke-dasharray="3,3" />
            <path d="M 60 80 L 80 45 L 120 45 L 140 80 L 120 115 L 80 115 Z" fill="rgba(242, 165, 65, 0.15)" stroke="var(--deed-accent)" stroke-width="2" />
            <!-- Central Hex Territory Core -->
            <polygon points="100,50 126,65 126,95 100,110 74,95 74,65" fill="var(--deed-accent)" fill-opacity="0.4" stroke="var(--deed-accent)" stroke-width="2.5" />
            <circle cx="100" cy="80" r="4" fill="#f8f4e8" />
            <text x="100" y="85" text-anchor="middle" font-family="monospace" font-size="8" fill="#f8f4e8" dy="25">CLAIMED H3 RES 9</text>
          </svg>
          <div class="cadastral-label">LATENT CADASTRE SECURED VIA GPS VERIFICATION</div>
        </div>

        <!-- Telemetry & Reward Metric Strip -->
        <div class="deed-stats-grid">
          <div class="deed-stat-box">
            <span class="stat-glyph">🏃</span>
            <div class="stat-content">
              <span class="stat-label">EXPEDITION</span>
              <span class="stat-val">${distanceKm} km</span>
            </div>
          </div>

          <div class="deed-stat-box highlight">
            <span class="stat-glyph">💎</span>
            <div class="stat-content">
              <span class="stat-label">REWARD UNLOCKED</span>
              <span class="stat-val">+${estReward} $REALM</span>
            </div>
          </div>

          <div class="deed-stat-box">
            <span class="stat-glyph">🛡️</span>
            <div class="stat-content">
              <span class="stat-label">DAILY YIELD</span>
              <span class="stat-val">${dailyYield} $R/day</span>
            </div>
          </div>

          <div class="deed-stat-box">
            <span class="stat-glyph">⚡</span>
            <div class="stat-content">
              <span class="stat-label">DIFFICULTY</span>
              <span class="stat-val">${difficulty}/100</span>
            </div>
          </div>
        </div>

        <!-- On-Chain Proof Pill -->
        <div class="deed-proof-bar">
          <span class="proof-icon">⛓️</span>
          <span class="proof-status">${transactionHash ? `TX: ${transactionHash.substring(0, 10)}...${transactionHash.slice(-6)}` : 'SECURED IN LOCAL RUN ATLAS'}</span>
          <span class="proof-guard">GUARD: GHOST DEFENDER ELIGIBLE</span>
        </div>

        <!-- Interactive Actions -->
        <div class="deed-actions">
          <button class="deed-btn secondary" data-action="share">
            <span class="btn-icon">📤</span> Share Deed
          </button>
          <button class="deed-btn primary" data-action="inspect">
            <span class="btn-icon">🗺️</span> Inspect on Map
          </button>
        </div>
      </div>
    `;

    // Event delegation on modal elements
    modal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');

      if (action === 'close') {
        this.closeDeed();
      } else if (action === 'inspect') {
        this.closeDeed();
        if (territory.geohash) {
          this.safeEmit('dashboard:showTerritoryOnMap', { territoryId: territory.geohash });
        }
      } else if (action === 'share') {
        this.handleShare(name, h3Cell, distanceKm, estReward, rarity);
      }
    });

    return modal;
  }

  private handleShare(
    name: string,
    h3Cell: string,
    distanceKm: string,
    reward: number,
    rarity: string
  ): void {
    const text = `🏴 I just captured the ${rarity.toUpperCase()} territory "${name}" (${distanceKm}km) on @RunRealm! Unlocked +${reward} $REALM tokens. #RunRealm #GameFi #Solana #ZetaChain`;

    if (navigator.share) {
      navigator
        .share({
          title: `RunRealm Deed: ${name}`,
          text: text,
          url: window.location.origin,
        })
        .catch(() => {
          this.copyToClipboard(text);
        });
    } else {
      this.copyToClipboard(text);
    }
  }

  private copyToClipboard(text: string): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.safeEmit('ui:toast', {
          message: '📋 Deed details copied to clipboard!',
          type: 'success',
          duration: 3000,
        });
      });
    }
  }

  private injectStyles(): void {
    if (typeof document === 'undefined') return;
    if (document.querySelector('#sunprint-deed-styles')) return;

    this.domService.createElement('style', {
      id: 'sunprint-deed-styles',
      textContent: `
        /* Overlay Backdrop */
        .sunprint-deed-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          animation: deedFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          --deed-navy: #0d2b3e;
          --deed-raised: #173d52;
          --deed-chalk: #f8f4e8;
          --deed-bone: #f3ead8;
          --deed-ink: #102633;
          --deed-accent: #4fae8b; /* Default Common Verdigris */
          --deed-glow: rgba(79, 174, 139, 0.3);
        }

        .sunprint-deed-overlay.rarity-rare {
          --deed-accent: #63b3c8;
          --deed-glow: rgba(99, 179, 200, 0.4);
        }

        .sunprint-deed-overlay.rarity-epic {
          --deed-accent: #a855f7;
          --deed-glow: rgba(168, 85, 247, 0.45);
        }

        .sunprint-deed-overlay.rarity-legendary {
          --deed-accent: #f2a541;
          --deed-glow: rgba(242, 165, 65, 0.55);
        }

        .sunprint-deed-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(8, 22, 33, 0.85);
          backdrop-filter: blur(14px);
        }

        /* Deed Card (Physical Cyanotype Paper Aesthetic) */
        .sunprint-deed-card {
          position: relative;
          width: 100%;
          max-width: 440px;
          background: linear-gradient(165deg, #103248 0%, #0d2b3e 60%, #071a26 100%);
          border: 2px solid var(--deed-accent);
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.7), 0 0 40px var(--deed-glow);
          color: var(--deed-chalk);
          font-family: -apple-system, BlinkMacSystemFont, "Geist", "Segoe UI", Roboto, sans-serif;
          overflow: hidden;
          animation: deedPaperEmerge 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2) forwards;
          transform-origin: center;
        }

        /* Registration Crosshairs */
        .sunprint-deed-card .crosshair {
          position: absolute;
          font-size: 14px;
          color: var(--deed-accent);
          opacity: 0.6;
          user-select: none;
        }
        .sunprint-deed-card .crosshair.tl { top: 8px; left: 8px; }
        .sunprint-deed-card .crosshair.tr { top: 8px; right: 8px; }
        .sunprint-deed-card .crosshair.bl { bottom: 8px; left: 8px; }
        .sunprint-deed-card .crosshair.br { bottom: 8px; right: 8px; }

        /* Chemical Wash Sweep (Photographic exposure effect) */
        .chemical-wash-sweep {
          position: absolute;
          top: -100%;
          left: -100%;
          width: 300%;
          height: 300%;
          background: linear-gradient(135deg, transparent 40%, rgba(255, 255, 255, 0.15) 50%, transparent 60%);
          animation: exposureSweep 1.2s ease-out forwards;
          pointer-events: none;
        }

        /* Header */
        .deed-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.12);
          padding-bottom: 10px;
          margin-bottom: 16px;
        }

        .deed-registry-tag {
          font-family: monospace;
          font-size: 10px;
          letter-spacing: 0.1em;
          color: var(--deed-accent);
          font-weight: 600;
        }

        .deed-close-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 18px;
          cursor: pointer;
          padding: 4px;
          transition: color 0.15s ease;
        }
        .deed-close-btn:hover {
          color: #fff;
        }

        /* Rarity Wax Seal / Foil Badge */
        .deed-seal-container {
          display: flex;
          justify-content: center;
          margin-bottom: 14px;
        }

        .deed-seal {
          position: relative;
          padding: 6px 18px;
          border-radius: 999px;
          border: 1.5px solid var(--deed-accent);
          background: rgba(13, 43, 62, 0.9);
          box-shadow: 0 0 16px var(--deed-glow);
          overflow: hidden;
        }

        .seal-inner {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          color: var(--deed-accent);
        }

        .seal-foil-shine {
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
          transform: translateX(-100%);
          animation: foilShimmer 2.5s infinite;
        }

        /* Title block */
        .deed-title-block {
          text-align: center;
          margin-bottom: 16px;
        }

        .deed-subline {
          font-size: 10px;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          color: rgba(243, 234, 216, 0.7);
          margin-bottom: 4px;
        }

        .deed-name {
          margin: 0;
          font-size: 24px;
          font-family: "Fraunces", Georgia, serif;
          font-weight: 700;
          color: #f8f4e8;
          line-height: 1.2;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }

        .deed-coordinates {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-top: 8px;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.65);
        }

        .deed-coordinates code {
          background: rgba(0, 0, 0, 0.3);
          padding: 2px 6px;
          border-radius: 4px;
          color: var(--deed-accent);
          font-size: 10px;
        }

        /* Hex Map Preview */
        .deed-map-preview {
          position: relative;
          background: radial-gradient(circle at center, rgba(13, 43, 62, 0.8) 0%, rgba(7, 26, 38, 0.95) 100%);
          border: 1px dashed rgba(255, 255, 255, 0.18);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 18px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .hex-cadastral-svg {
          width: 100%;
          max-height: 120px;
          filter: drop-shadow(0 0 10px var(--deed-glow));
        }

        .cadastral-label {
          font-size: 9px;
          font-family: monospace;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.08em;
          margin-top: 6px;
        }

        /* Telemetry Stats Grid */
        .deed-stats-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 16px;
        }

        .deed-stat-box {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 6px;
          padding: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .deed-stat-box.highlight {
          border-color: var(--deed-accent);
          background: rgba(255, 255, 255, 0.07);
        }

        .stat-glyph {
          font-size: 18px;
        }

        .stat-content {
          display: flex;
          flex-direction: column;
        }

        .stat-label {
          font-size: 9px;
          letter-spacing: 0.05em;
          color: rgba(243, 234, 216, 0.6);
        }

        .stat-val {
          font-size: 14px;
          font-weight: 700;
          color: #f8f4e8;
        }

        .highlight .stat-val {
          color: var(--deed-accent);
        }

        /* Proof Bar */
        .deed-proof-bar {
          background: rgba(0, 0, 0, 0.35);
          border-radius: 6px;
          padding: 8px 12px;
          font-family: monospace;
          font-size: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 20px;
        }

        .proof-guard {
          color: var(--deed-accent);
          font-weight: 600;
        }

        /* Actions */
        .deed-actions {
          display: flex;
          gap: 12px;
        }

        .deed-btn {
          flex: 1;
          padding: 12px 16px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.2s ease;
          border: none;
        }

        .deed-btn.primary {
          background: var(--deed-accent);
          color: var(--deed-ink);
          box-shadow: 0 4px 14px var(--deed-glow);
        }

        .deed-btn.primary:hover {
          transform: translateY(-1px);
          filter: brightness(1.1);
        }

        .deed-btn.secondary {
          background: rgba(255, 255, 255, 0.08);
          color: var(--deed-chalk);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .deed-btn.secondary:hover {
          background: rgba(255, 255, 255, 0.14);
          transform: translateY(-1px);
        }

        /* Keyframes */
        @keyframes deedFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes deedPaperEmerge {
          0% {
            opacity: 0;
            transform: scale(0.85) translateY(20px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes exposureSweep {
          0% { transform: translateY(-100%) rotate(45deg); opacity: 1; }
          100% { transform: translateY(100%) rotate(45deg); opacity: 0; }
        }

        @keyframes foilShimmer {
          0% { transform: translateX(-150%); }
          50%, 100% { transform: translateX(150%); }
        }

        .sunprint-deed-overlay.closing {
          animation: deedFadeOut 0.2s ease forwards;
        }

        @keyframes deedFadeOut {
          to { opacity: 0; transform: scale(0.95); }
        }
      `,
    });
  }
}
