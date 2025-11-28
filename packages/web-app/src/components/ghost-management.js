import { BaseService } from '@runrealm/shared-core/core/base-service';
import { GhostRunnerService } from '@runrealm/shared-core/services/ghost-runner-service';
import { TerritoryService } from '@runrealm/shared-core/services/territory-service';
import { DOMService } from '@runrealm/shared-core/services/dom-service';

export class GhostManagement extends BaseService {
  constructor() {
    super();
    this.container = null;
    this.ghostService = GhostRunnerService.getInstance();
    this.territoryService = TerritoryService.getInstance();
    this.domService = DOMService.getInstance();
    this.selectedGhost = null;
  }

  async initialize(parentElement) {
    this.createContainer(parentElement);
    this.setupEventListeners();
    this.render();
  }

  createContainer(parent) {
    this.container = this.domService.createElement('div', {
      className: 'ghost-management hidden',
      innerHTML: `
        <div class="ghost-header">
          <h2>👻 Ghost Runners</h2>
          <div class="realm-balance">
            <span class="realm-icon">💎</span>
            <span class="balance-amount">0</span> $REALM
          </div>
          <button class="close-btn">×</button>
        </div>
        <div class="ghost-content">
          <div class="ghost-list"></div>
          <div class="ghost-details hidden"></div>
        </div>
      `
    });
    parent.appendChild(this.container);
  }

  setupEventListeners() {
    this.subscribe('ghost:unlocked', () => this.render());
    this.subscribe('ghost:upgraded', () => this.render());
    this.subscribe('ghost:deployed', () => this.render());
    this.subscribe('realm:earned', () => this.updateBalance());

    // Listen for dashboard events
    this.subscribe('ui:showGhostManagement', () => this.show());
    this.subscribe('ghost:deployRequested', (data) => {
      if (data.territoryId) {
        // Direct deployment from dashboard
        this.deployGhostToTerritory(data.ghostId, data.territoryId);
      } else {
        // Show ghost details for manual deployment
        this.show();
        this.showGhostDetails(data.ghostId);
      }
    });

    this.domService.delegate(this.container, '.close-btn', 'click', () => this.hide());
    this.domService.delegate(this.container, '.ghost-card', 'click', (e) => {
      const id = e.currentTarget.dataset.ghostId;
      this.showGhostDetails(id);
    });
  }

  render() {
    const ghosts = this.ghostService.getGhosts();
    const listEl = this.container.querySelector('.ghost-list');

    if (ghosts.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>🏃 Complete runs to unlock ghost runners!</p>
          <small>Your first ghost unlocks after completing onboarding</small>
        </div>
      `;
      return;
    }

    listEl.innerHTML = ghosts.map(g => `
      <div class="ghost-card" data-ghost-id="${g.id}">
        <div class="ghost-avatar">${g.avatar || '👻'}</div>
        <div class="ghost-info">
          <div class="ghost-name">${g.name}</div>
          <div class="ghost-type">${this.formatType(g.type)} • Level ${g.level}</div>
          <div class="ghost-stats">
            <span>⚡ ${this.formatPace(g.pace)}/km</span>
            <span>🏃 ${g.totalRuns} runs</span>
          </div>
        </div>
        <div class="ghost-status">
          ${this.getGhostStatus(g)}
        </div>
      </div>
    `).join('');

    this.updateBalance();
  }

  showGhostDetails(ghostId) {
    const ghost = this.ghostService.getGhost(ghostId);
    if (!ghost) return;

    this.selectedGhost = ghost;
    const detailsEl = this.container.querySelector('.ghost-details');
    const territories = this.territoryService.getClaimedTerritories();
    const vulnerableTerritories = territories.filter(t =>
      t.defenseStatus === 'vulnerable' || t.defenseStatus === 'moderate'
    );

    detailsEl.innerHTML = `
      <div class="ghost-detail-header">
        <button class="back-btn">← Back</button>
        <h3>${ghost.name}</h3>
      </div>
      <div class="ghost-detail-content">
        <div class="ghost-stats-detail">
          <div class="stat">
            <label>Type</label>
            <value>${this.formatType(ghost.type)}</value>
          </div>
          <div class="stat">
            <label>Level</label>
            <value>${ghost.level}/5</value>
          </div>
          <div class="stat">
            <label>Pace</label>
            <value>${this.formatPace(ghost.pace)}/km</value>
          </div>
          <div class="stat">
            <label>Win Rate</label>
            <value>${ghost.winRate}%</value>
          </div>
        </div>
        
        <div class="ghost-backstory">
          <p>${ghost.backstory}</p>
          <p class="special-ability">✨ ${ghost.specialAbility}</p>
        </div>

        <div class="ghost-actions">
          ${ghost.level < 5 ? `
            <button class="upgrade-btn" data-cost="${ghost.upgradeCost}">
              Upgrade to Level ${ghost.level + 1} (${ghost.upgradeCost} $REALM)
            </button>
          ` : '<div class="max-level">⭐ Max Level</div>'}
          
          ${this.getGhostStatus(ghost) === 'Ready' ? `
            <div class="deploy-section">
              <label>Deploy to Territory:</label>
              <select class="territory-select">
                <option value="">Select territory...</option>
                ${vulnerableTerritories.map(t => `
                  <option value="${t.id}">
                    ${t.metadata.name} (${t.defenseStatus})
                  </option>
                `).join('')}
              </select>
              <button class="deploy-btn" data-cost="${ghost.deployCost}">
                Deploy (${ghost.deployCost} $REALM)
              </button>
            </div>
          ` : `<div class="cooldown">⏱️ ${this.getCooldownText(ghost)}</div>`}
        </div>
      </div>
    `;

    detailsEl.classList.remove('hidden');
    this.container.querySelector('.ghost-list').classList.add('hidden');

    this.domService.delegate(detailsEl, '.back-btn', 'click', () => this.hideDetails());
    this.domService.delegate(detailsEl, '.upgrade-btn', 'click', () => this.upgradeGhost(ghostId));
    this.domService.delegate(detailsEl, '.deploy-btn', 'click', () => this.deployGhost(ghostId));
  }

  hideDetails() {
    this.container.querySelector('.ghost-details').classList.add('hidden');
    this.container.querySelector('.ghost-list').classList.remove('hidden');
    this.selectedGhost = null;
  }

  async upgradeGhost(ghostId) {
    try {
      await this.ghostService.upgradeGhost(ghostId);
      this.showGhostDetails(ghostId);
    } catch (error) {
      alert(error.message);
    }
  }

  async deployGhost(ghostId) {
    const territoryId = this.container.querySelector('.territory-select').value;
    if (!territoryId) {
      alert('Please select a territory');
      return;
    }

    await this.deployGhostToTerritory(ghostId, territoryId);
  }

  async deployGhostToTerritory(ghostId, territoryId) {
    try {
      await this.ghostService.deployGhost(ghostId, territoryId);
      this.territoryService.updateTerritoryActivity(territoryId, 50); // +50 points

      this.safeEmit('ui:toast', {
        message: '👻 Ghost deployed successfully!',
        type: 'success'
      });

      this.hideDetails();
      this.render();
    } catch (error) {
      this.safeEmit('ui:toast', {
        message: `❌ ${error.message}`,
        type: 'error'
      });
    }
  }

  updateBalance() {
    const balance = this.ghostService.getRealmBalance();
    const el = this.container.querySelector('.balance-amount');
    if (el) el.textContent = balance.toFixed(0);
  }

  getGhostStatus(ghost) {
    if (!ghost.cooldownUntil || ghost.cooldownUntil < new Date()) {
      return 'Ready';
    }
    return 'Cooldown';
  }

  getCooldownText(ghost) {
    if (!ghost.cooldownUntil) return '';
    const hours = Math.ceil((ghost.cooldownUntil - new Date()) / (1000 * 60 * 60));
    return `Ready in ${hours}h`;
  }

  formatType(type) {
    const types = {
      sprinter: '⚡ Sprinter',
      endurance: '🏃 Endurance',
      hill: '⛰️ Hill Climber',
      allrounder: '🌟 All-Rounder'
    };
    return types[type] || type;
  }

  formatPace(pace) {
    const minPerKm = (pace * 1000) / 60;
    const min = Math.floor(minPerKm);
    const sec = Math.round((minPerKm - min) * 60);
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  show() {
    this.container?.classList.remove('hidden');
    this.render();
  }

  hide() {
    this.container?.classList.add('hidden');
    this.hideDetails();
  }

  toggle() {
    if (this.container?.classList.contains('hidden')) {
      this.show();
    } else {
      this.hide();
    }
  }
}
