/**
 * ConfidentialShieldWidget — Phase 5 UI surface for the Zama Protocol.
 *
 * Exposes the encrypted territory defense flow inside the existing widget
 * system: read your private defense score, boost it, or contest another
 * territory. All FHE work is delegated to `ConfidentialTerritoryService`
 * and `ZamaRelayer`. The "decrypt reveal" motion lives in
 * `confidential-shield-reveal.ts` (single source for shield choreography).
 */

import { revealAction, revealDecryptScore } from './confidential-shield-reveal';

interface ShieldServices {
  zamaSupport?: {
    chainSupportsZama(chainId: number): boolean;
  };
  confidentialTerritory?: {
    boostEncrypted(territoryId: string, amount: number): Promise<unknown>;
    contestEncrypted(territoryId: string, amount: number): Promise<unknown>;
    myDefenseCipher(territoryId: string): Promise<bigint | null>;
  };
  web3?: {
    getChainId(): Promise<number> | number;
    getSigner(): unknown;
  };
}

function getShieldServices(): ShieldServices {
  if (typeof window === 'undefined') return {};
  const services = (window as any).RunRealm?.services;
  if (!services) return {};
  return {
    zamaSupport: services.zamaSupport,
    confidentialTerritory: services.confidentialTerritory,
    web3: services.web3,
  };
}

export class ConfidentialShieldWidget {
  private widgetSystem: any;

  constructor(widgetSystem: any) {
    this.widgetSystem = widgetSystem;
  }

  register(): void {
    const services = getShieldServices();
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
    `;
  }

  private isZamaSupported(services: ShieldServices): boolean {
    const chainId = this.getCurrentChainId(services);
    if (!chainId || !services.zamaSupport) return false;
    return services.zamaSupport.chainSupportsZama(chainId);
  }

  private getCurrentChainId(services: ShieldServices): number | null {
    if (!services.web3) return null;
    const result = services.web3.getChainId();
    if (typeof result === 'number') return result;
    return null;
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

    const services = getShieldServices();
    try {
      const value = await services.confidentialTerritory?.myDefenseCipher(input.territoryId);
      if (value === null || value === undefined) {
        this.showOutput('No encrypted defense found for this territory.', 'warning');
        return;
      }
      await revealDecryptScore(output, value);
    } catch (err: any) {
      this.showOutput(`Read failed: ${err?.message || String(err)}`, 'error');
    }
  }

  private async boost(): Promise<void> {
    const input = this.getInputValues();
    if (!input) return;
    const output = document.getElementById('shield-output');
    if (!output) return;

    try {
      const services = getShieldServices();
      await services.confidentialTerritory?.boostEncrypted(input.territoryId, input.amount);
      await revealAction(output, {
        glyph: '🚀',
        title: 'Boost submitted',
        caption: 'Encrypted points added on Zama FHE · pending confirmation',
      });
    } catch (err: any) {
      this.showOutput(`Boost failed: ${err?.message || String(err)}`, 'error');
    }
  }

  private async contest(): Promise<void> {
    const input = this.getInputValues();
    if (!input) return;
    const output = document.getElementById('shield-output');
    if (!output) return;

    try {
      const services = getShieldServices();
      await services.confidentialTerritory?.contestEncrypted(input.territoryId, input.amount);
      await revealAction(output, {
        glyph: '⚔️',
        title: 'Contest submitted',
        caption: 'Encrypted strike sent on Zama FHE · pending confirmation',
      });
    } catch (err: any) {
      this.showOutput(`Contest failed: ${err?.message || String(err)}`, 'error');
    }
  }

  private showOutput(message: string, type: 'info' | 'success' | 'warning' | 'error'): void {
    const output = document.getElementById('shield-output');
    if (!output) return;
    output.className = `widget-output widget-output--${type}`;
    output.textContent = message;
  }
}
