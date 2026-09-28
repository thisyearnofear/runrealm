/**
 * ConfidentialShieldWidget — Phase 5 UI surface for the Zama Protocol.
 *
 * Exposes the encrypted territory defense flow inside the existing widget
 * system: read your private defense score, boost it, or contest another
 * territory. All FHE work is delegated to `ConfidentialTerritoryService`
 * and `ZamaRelayer`. The "decrypt reveal" motion lives in
 * `confidential-shield-reveal.ts` (single source for shield choreography).
 */

import type { WidgetSystem } from '@runrealm/shared-core/components/widget-system';
import type { RunRealmServiceRegistry } from '../../types/debug-globals';
import { revealAction, revealDecryptScore } from './confidential-shield-reveal';

export class ConfidentialShieldWidget {
  private widgetSystem: WidgetSystem;
  private services: RunRealmServiceRegistry;

  /**
   * `services` is injected, not read from `window.RunRealm`.
   *
   * The read looked harmless but was not: `register()` runs during MainUI
   * construction, and the global registry is populated by a later step in
   * boot. Whether the widget rendered as "supported" therefore depended on
   * boot ordering — and when it lost that race it rendered as *unsupported*
   * rather than failing, which is a silent wrong answer on a security
   * surface. An explicit dependency either arrives or does not.
   */
  constructor(widgetSystem: WidgetSystem, services: RunRealmServiceRegistry = {}) {
    this.widgetSystem = widgetSystem;
    this.services = services;
  }

  register(): void {
    const services = this.services;
    const isSupported = this.isZamaSupported(services);

    this.widgetSystem.registerWidget({
      id: 'confidential-shield',
      title: 'Confidential Shield',
      icon: '🛡️',
      position: 'bottom-right',
      minimized: true,
      priority: 8,
      content: this.renderContent(isSupported),
    });

    if (typeof document !== 'undefined') {
      document.body.addEventListener('click', this.handleClick.bind(this));
    }
  }

  private renderContent(isSupported: boolean): string {
    if (!isSupported) {
      return `
        <div class="widget-stat">
          <span class="widget-stat-label">Confidential Shield</span>
          <span class="widget-stat-value">Unavailable on this chain</span>
        </div>
        <p class="widget-help-text">Switch to Ethereum Sepolia to use FHE territory defense.</p>
      `;
    }

    return `
      <div class="widget-stat">
        <span class="widget-stat-label">Confidential Shield</span>
        <span class="widget-stat-value" id="shield-status">Ready</span>
      </div>

      <div class="widget-form">
        <label class="widget-label" for="shield-territory-id">Territory ID</label>
        <input class="widget-input" id="shield-territory-id" type="text" placeholder="e.g. 42" />

        <label class="widget-label" for="shield-amount">Amount</label>
        <input class="widget-input" id="shield-amount" type="number" min="1" max="10000" value="100" />
      </div>

      <div class="widget-buttons">
        <button class="widget-button" id="shield-read-btn" title="Decrypt and read your defense score">
          <span class="btn-icon">👁️</span>
          <span class="btn-text">Read Defense</span>
        </button>
        <button class="widget-button" id="shield-boost-btn" title="Encrypt and add activity points">
          <span class="btn-icon">🚀</span>
          <span class="btn-text">Boost</span>
        </button>
        <button class="widget-button secondary" id="shield-contest-btn" title="Contest this territory">
          <span class="btn-icon">⚔️</span>
          <span class="btn-text">Contest</span>
        </button>
      </div>

      <div class="widget-output" id="shield-output" aria-live="polite"></div>

      <details class="shield-legend">
        <summary>What rivals see</summary>
        <ul>
          <li>🛡️ <strong>Your shielded ground</strong> — exact defense visible only to you. Read it any time.</li>
          <li>🌫️ <strong>Rival silhouettes</strong> — their scores stay encrypted. You see presence, never points.</li>
          <li>⚔️ <strong>Contests reveal win/loss only</strong> — both sides' scores stay secret.</li>
        </ul>
      </details>
    `;
  }

  private isZamaSupported(services: RunRealmServiceRegistry): boolean {
    const chainId = this.getCurrentChainId(services);
    if (!chainId || !services.zamaSupport) return false;
    return services.zamaSupport.chainSupportsZama(chainId);
  }

  private getCurrentChainId(services: RunRealmServiceRegistry): number | null {
    if (!services.web3) return null;
    // Web3Service exposes chain via the connected wallet snapshot — there is
    // no getChainId(). When disconnected, treat as unsupported (null).
    try {
      const wallet = services.web3.getCurrentWallet?.();
      const chainId = wallet?.chainId;
      return typeof chainId === 'number' && Number.isFinite(chainId) ? chainId : null;
    } catch {
      return null;
    }
  }

  private handleClick(e: Event): void {
    const target = e.target as HTMLElement;
    const id = target.id || target.closest('button')?.id;
    if (!id) return;

    if (id === 'shield-read-btn') {
      void this.readDefense();
    } else if (id === 'shield-boost-btn') {
      void this.boost();
    } else if (id === 'shield-contest-btn') {
      void this.contest();
    }
  }

  private getInputValues(): { territoryId: string; amount: number } | null {
    const territoryInput = document.getElementById(
      'shield-territory-id'
    ) as HTMLInputElement | null;
    const amountInput = document.getElementById('shield-amount') as HTMLInputElement | null;
    const territoryId = territoryInput?.value.trim();
    const amount = Number(amountInput?.value);

    if (!territoryId || Number.isNaN(amount) || amount <= 0) {
      this.showOutput('Enter a valid territory ID and positive amount.', 'error');
      return null;
    }

    return { territoryId, amount };
  }

  private async readDefense(): Promise<void> {
    const input = this.getInputValues();
    if (!input) return;
    const output = document.getElementById('shield-output');
    if (!output) return;

    const services = this.services;
    try {
      const value = await services.confidentialTerritory?.myDefenseCipher(input.territoryId);
      if (value === null || value === undefined) {
        this.showOutput('No encrypted defense found for this territory.', 'warning');
        return;
      }
      await revealDecryptScore(output, value);
    } catch (err) {
      this.showOutput(`Read failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  private async boost(): Promise<void> {
    const input = this.getInputValues();
    if (!input) return;
    const output = document.getElementById('shield-output');
    if (!output) return;

    try {
      await this.services.confidentialTerritory?.boostEncrypted(input.territoryId, input.amount);
      await revealAction(output, {
        glyph: '🚀',
        title: 'Boost submitted',
        caption: 'Encrypted points added on Zama FHE · pending confirmation',
      });
    } catch (err) {
      this.showOutput(`Boost failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  private async contest(): Promise<void> {
    const input = this.getInputValues();
    if (!input) return;
    const output = document.getElementById('shield-output');
    if (!output) return;

    try {
      await this.services.confidentialTerritory?.contestEncrypted(input.territoryId, input.amount);
      await revealAction(output, {
        glyph: '⚔️',
        title: 'Contest submitted',
        caption: 'Encrypted strike sent on Zama FHE · pending confirmation',
      });
    } catch (err) {
      this.showOutput(
        `Contest failed: ${err instanceof Error ? err.message : String(err)}`,
        'error'
      );
    }
  }

  private showOutput(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    const output = document.getElementById('shield-output');
    if (!output) return;
    output.className = `widget-output widget-output--${type}`;
    output.textContent = message;
  }
}
