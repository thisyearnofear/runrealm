/**
 * TerritoryDashboard - Vanilla TypeScript implementation
 * Gamified interface for territory management with AI integration
 */
import { AIService } from '../services/ai-service';
import { Web3Service } from '../services/web3-service';
import { EventBus } from '../core/event-bus';
import { DOMService } from '../services/dom-service';
export class TerritoryDashboard {
    constructor() {
        this.container = null;
        this.territoryService = null;
        this.isVisible = false;
        this.territories = [];
        this.playerStats = {
            realmBalance: 0,
            territoriesOwned: 0,
            totalDistance: 0,
            level: 1,
            experience: 0,
            achievements: []
        };
        this.eventBus = EventBus.getInstance();
        this.aiService = AIService.getInstance();
        this.web3Service = Web3Service.getInstance();
        this.domService = DOMService.getInstance();
        this.setupEventListeners();
    }
    static getInstance() {
        if (!TerritoryDashboard.instance) {
            TerritoryDashboard.instance = new TerritoryDashboard();
        }
        return TerritoryDashboard.instance;
    }
    initialize(parentElement) {
        this.container = this.domService.createElement('div', {
            id: 'territory-dashboard',
            className: 'territory-dashboard hidden',
            parent: parentElement
        });
        // Get TerritoryService from global registry
        this.territoryService = this.getTerritoryService();
        // Load existing territories
        this.loadTerritories();
        this.render();
    }
    setupEventListeners() {
        // Real TerritoryService events
        this.eventBus.on('territory:eligible', (data) => {
            this.handleTerritoryEligible(data);
        });
        this.eventBus.on('territory:claimed', (data) => {
            this.handleTerritoryUpdate(data);
        });
        this.eventBus.on('territory:preview', (data) => {
            this.handleTerritoryPreview(data);
        });
        this.eventBus.on('territory:nearbyUpdated', (data) => {
            this.handleNearbyTerritories(data);
        });
        this.eventBus.on('web3:walletConnected', (data) => {
            this.updateWalletStatus(data);
        });
        this.eventBus.on('game:rewardEarned', (data) => {
            this.updateRewards(data);
        });
    }
    render() {
        if (!this.container)
            return;
        this.container.innerHTML = `
      <div class="dashboard-header">
        <h2>Territory Command</h2>
        <button id="dashboard-close" class="close-btn">&times;</button>
      </div>

      <div class="dashboard-content">
        <div class="player-stats-section">
          ${this.renderPlayerStats()}
        </div>

        <div class="territories-section">
          <h3>Your Territories</h3>
          <div id="territories-list">
            ${this.renderTerritories()}
          </div>
        </div>

        <div class="actions-section">
          <h3>Actions</h3>
          <div class="action-buttons">
            <button id="claim-territory-btn" class="action-btn primary">
              Claim Territory
            </button>
            <button id="ai-route-btn" class="action-btn secondary">
              AI Route Suggestion
            </button>
            <button id="territory-analysis-btn" class="action-btn secondary">
              Territory Analysis
            </button>
          </div>
        </div>

        <div class="ai-insights-section">
          <h3>AI Insights</h3>
          <div id="ai-insights" class="insights-content">
            <p class="placeholder">Connect your wallet and start running to get AI-powered territory insights!</p>
          </div>
        </div>
      </div>
    `;
        this.setupInteractions();
    }
    renderPlayerStats() {
        return `
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">${this.playerStats.realmBalance.toFixed(2)}</div>
          <div class="stat-label">$REALM Balance</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${this.playerStats.territoriesOwned}</div>
          <div class="stat-label">Territories Owned</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${(this.playerStats.totalDistance / 1000).toFixed(1)}km</div>
          <div class="stat-label">Total Distance</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">Level ${this.playerStats.level}</div>
          <div class="stat-label">${this.playerStats.experience} XP</div>
        </div>
      </div>
    `;
    }
    renderTerritories() {
        if (this.territories.length === 0) {
            return '<p class="no-territories">No territories claimed yet. Start running to claim your first territory!</p>';
        }
        return this.territories.map(territory => `
      <div class="territory-card ${territory.rarity}">
        <div class="territory-header">
          <h4>${territory.metadata.name}</h4>
          <span class="rarity-badge ${territory.rarity}">${territory.rarity.toUpperCase()}</span>
        </div>
        <div class="territory-info">
          <p>${territory.metadata.description}</p>
          <div class="territory-stats">
            <div class="territory-score">
              <span class="score-value">${this.calculateTerritoryValue(territory)}</span>
              <span class="score-label">Territory Value</span>
            </div>
            <span>Difficulty: ${territory.difficulty}/100</span>
            <span>Reward: ${territory.estimatedReward} $REALM</span>
          </div>
          <div class="cross-chain-info">
            <span class="origin-chain">🌐 Origin: ${territory.originChain}</span>
            ${territory.crossChainHistory.length > 0 ?
            `<span class="cross-chain-badge">⚡ ${territory.crossChainHistory.length} Cross-Chain Transfer${territory.crossChainHistory.length > 1 ? 's' : ''}</span>` :
            '<span class="native-badge">🏠 Native Territory</span>'}
          </div>
          <div class="territory-landmarks">
            ${territory.landmarks.map(landmark => `<span class="landmark-tag">${landmark}</span>`).join('')}
          </div>
        </div>
        <div class="territory-actions">
          <button class="analyze-btn" data-geohash="${territory.geohash}">Analyze</button>
          <button class="visit-btn" data-geohash="${territory.geohash}">Visit</button>
        </div>
      </div>
    `).join('');
    }
    setupInteractions() {
        if (!this.container)
            return;
        // Close button
        const closeBtn = this.container.querySelector('#dashboard-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }
        // Action buttons - claim button removed as claiming is now handled by TerritoryService
        const aiRouteBtn = this.container.querySelector('#ai-route-btn');
        if (aiRouteBtn) {
            aiRouteBtn.addEventListener('click', () => this.requestAIRoute());
        }
        const analysisBtn = this.container.querySelector('#territory-analysis-btn');
        if (analysisBtn) {
            analysisBtn.addEventListener('click', () => this.requestTerritoryAnalysis());
        }
        // Territory-specific actions
        this.container.addEventListener('click', (e) => {
            const target = e.target;
            if (target.classList.contains('analyze-btn')) {
                const geohash = target.getAttribute('data-geohash');
                if (geohash)
                    this.analyzeTerritoryDetail(geohash);
            }
            if (target.classList.contains('visit-btn')) {
                const geohash = target.getAttribute('data-geohash');
                if (geohash)
                    this.visitTerritory(geohash);
            }
        });
    }
    requestAIRoute() {
        this.eventBus.emit('ai:routeRequested', {
            distance: 2000,
            difficulty: 50,
            goals: ['exploration', 'territory']
        });
    }
    requestTerritoryAnalysis() {
        if (this.territories.length === 0) {
            this.updateAIInsights('No territories to analyze. Claim your first territory by going for a run!');
            return;
        }
        this.updateAIInsights('Analyzing your territories... This may take a moment.');
        // Analyze the most recent territory
        const latestTerritory = this.territories[this.territories.length - 1];
        this.analyzeTerritoryDetail(latestTerritory.geohash);
    }
    async analyzeTerritoryDetail(geohash) {
        try {
            const territory = this.territories.find(t => t.geohash === geohash);
            if (!territory)
                return;
            const analysis = await this.aiService.analyzeTerritory(geohash, {
                distance: territory.estimatedReward * 10, // Mock calculation
                difficulty: territory.difficulty,
                landmarks: territory.landmarks,
                elevation: 50 // Mock elevation
            });
            this.updateAIInsights(`
        <h4>Analysis for ${territory.metadata.name}</h4>
        <div class="analysis-scores">
          <div class="score">Strategic Value: ${analysis.value}/100</div>
          <div class="score">Rarity: ${analysis.rarity}/100</div>
          <div class="score">Competition: ${analysis.competition}/100</div>
        </div>
        <div class="recommendations">
          <h5>Recommendations:</h5>
          <ul>
            ${analysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>
      `);
        }
        catch (error) {
            this.updateAIInsights('Failed to analyze territory. Please try again later.');
            console.error('Territory analysis error:', error);
        }
    }
    visitTerritory(geohash) {
        // Emit event to center map on territory
        this.eventBus.emit('map:focusTerritory', { geohash });
    }
    updateAIInsights(content) {
        const insightsElement = this.container?.querySelector('#ai-insights');
        if (insightsElement) {
            insightsElement.innerHTML = content;
        }
    }
    /**
     * Get TerritoryService from global registry
     */
    getTerritoryService() {
        const services = window.RunRealm?.services;
        return services?.TerritoryService || null;
    }
    /**
     * Load territories from TerritoryService
     */
    loadTerritories() {
        if (this.territoryService) {
            this.territories = this.territoryService.getClaimedTerritories();
            this.playerStats.territoriesOwned = this.territories.length;
        }
    }
    /**
     * Handle territory eligible event from TerritoryService
     */
    handleTerritoryEligible(data) {
        // Show territory eligibility notification
        this.updateAIInsights(`
      <div class="territory-eligible">
        <h4>🏆 Territory Eligible!</h4>
        <p>Your run qualifies for territory claiming.</p>
        <div class="territory-preview">
          <strong>${data.territory.metadata.name}</strong><br>
          Difficulty: ${data.territory.metadata.difficulty}/100<br>
          Rarity: ${data.territory.metadata.rarity}<br>
          Estimated Reward: ${data.territory.metadata.estimatedReward} REALM
        </div>
        <p><em>Territory claiming is now handled automatically by the TerritoryService during fitness activity import.</em></p>
      </div>
    `);
    }
    /**
     * Handle territory preview event
     */
    handleTerritoryPreview(data) {
        // Update the display with territory preview
        this.updateDisplay();
    }
    /**
     * Handle nearby territories update
     */
    handleNearbyTerritories(data) {
        if (data.territories && data.territories.length > 0) {
            const nearest = data.closest;
            this.updateAIInsights(`
        <div class="nearby-territory">
          <h4>📍 Nearby Territory</h4>
          <p><strong>${nearest.territory.metadata.name}</strong></p>
          <p>Distance: ${Math.round(nearest.distance)}m ${nearest.direction}</p>
          <p>Owner: ${nearest.territory.owner || 'Unclaimed'}</p>
        </div>
      `);
        }
    }
    handleTerritoryUpdate(data) {
        // Territory was successfully claimed
        if (data.territory) {
            const existingIndex = this.territories.findIndex(t => t.id === data.territory.id);
            if (existingIndex >= 0) {
                this.territories[existingIndex] = data.territory;
            }
            else {
                this.territories.push(data.territory);
            }
            this.playerStats.territoriesOwned = this.territories.length;
            this.updateDisplay();
            // Show success notification
            this.updateAIInsights(`
        <div class="territory-claimed">
          <h4>🎉 Territory Claimed!</h4>
          <p><strong>${data.territory.metadata.name}</strong> is now yours!</p>
          <p>Transaction: ${data.transactionHash?.substring(0, 10)}...</p>
        </div>
      `);
        }
    }
    calculateRarity() {
        const rand = Math.random();
        if (rand < 0.05)
            return 'legendary';
        if (rand < 0.15)
            return 'epic';
        if (rand < 0.35)
            return 'rare';
        return 'common';
    }
    getChainName(chainId) {
        const chainNames = {
            1: 'Ethereum Mainnet',
            137: 'Polygon',
            56: 'BSC',
            7001: 'ZetaChain Athens',
            8453: 'Base',
            42161: 'Arbitrum'
        };
        return chainNames[chainId] || `Chain ${chainId}`;
    }
    updateWalletStatus(data) {
        // Update player stats when wallet connects
        this.playerStats.realmBalance = data.balance || 0;
        this.updateDisplay();
    }
    updateRewards(data) {
        this.playerStats.realmBalance += data.amount;
        this.playerStats.experience += data.amount * 10;
        // Level up logic
        const newLevel = Math.floor(this.playerStats.experience / 1000) + 1;
        if (newLevel > this.playerStats.level) {
            this.playerStats.level = newLevel;
            this.eventBus.emit('game:levelUp', { newLevel, player: 'current' });
        }
        this.updateDisplay();
    }
    updateDisplay() {
        if (!this.container)
            return;
        const statsSection = this.container.querySelector('.player-stats-section');
        if (statsSection) {
            statsSection.innerHTML = this.renderPlayerStats();
        }
        const territoriesList = this.container.querySelector('#territories-list');
        if (territoriesList) {
            territoriesList.innerHTML = this.renderTerritories();
        }
    }
    show() {
        if (this.container) {
            this.container.classList.remove('hidden');
            this.isVisible = true;
        }
    }
    hide() {
        if (this.container) {
            this.container.classList.add('hidden');
            this.isVisible = false;
        }
    }
    toggle() {
        if (this.isVisible) {
            this.hide();
        }
        else {
            this.show();
        }
    }
    updatePlayerStats(stats) {
        Object.assign(this.playerStats, stats);
        this.updateDisplay();
    }
    addTerritory(territory) {
        this.territories.push(territory);
        this.playerStats.territoriesOwned = this.territories.length;
        this.updateDisplay();
    }
    calculateTerritoryValue(territory) {
        let score = territory.estimatedReward;
        // Rarity multiplier
        const rarityMultiplier = {
            'common': 1,
            'uncommon': 1.5,
            'rare': 2,
            'epic': 3,
            'legendary': 5
        }[territory.rarity] || 1;
        // Cross-chain bonus
        const crossChainBonus = territory.crossChainHistory.length * 0.2;
        // Landmark bonus
        const landmarkBonus = territory.landmarks.length * 0.1;
        return Math.round(score * rarityMultiplier * (1 + crossChainBonus + landmarkBonus));
    }
    getTerritories() {
        return [...this.territories];
    }
    getPlayerStats() {
        return { ...this.playerStats };
    }
    cleanup() {
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.territories = [];
        this.isVisible = false;
    }
}
export default TerritoryDashboard;
