import { ChainHelper } from "../utils/chain-helper";
import { EventBus } from "../core/event-bus";
/**
 * CrossChainWidget - UI component for cross-chain messaging and interactions
 * CLEAN: Clear separation of concerns with explicit dependencies
 * MODULAR: Composable, testable, independent module
 */
export class CrossChainWidget {
    constructor() {
        this.container = null;
        this.crossChainService = null;
        this.web3Service = null;
        this.contractService = null;
        this.activityLog = [];
        this.eventBus = EventBus.getInstance();
        this.initializeServices();
    }
    initializeServices() {
        // Get services from global registry
        const services = window.RunRealm?.services;
        if (services) {
            this.crossChainService = services.crossChain;
            this.web3Service = services.web3;
            this.contractService = services.contractService;
        }
    }
    async initialize(containerId = "cross-chain-widget") {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn("CrossChainWidget: Container not found");
            return;
        }
        this.render();
        this.setupEventListeners();
        this.setupServiceListeners();
    }
    render() {
        if (!this.container)
            return;
        this.container.innerHTML = `
      <div class="cross-chain-widget">
        <div class="widget-header">
          <h3>⛓️ Cross-Chain Interactions</h3>
          <button class="refresh-btn" id="cross-chain-refresh">🔄</button>
        </div>
        
        <div class="widget-content">
          <div class="chain-info">
            <div class="current-chain">
              <span class="label">Current Chain:</span>
              <span class="value" id="current-chain-name">Not connected</span>
            </div>
            
            <div class="supported-chains">
              <span class="label">Supported Chains:</span>
              <div class="chains-list" id="supported-chains-list"></div>
            </div>
          </div>
          
          <div class="cross-chain-actions">
            <button class="action-btn primary" id="claim-cross-chain-territory" disabled>
              🌍 Claim Territory Cross-Chain
            </button>
            
            <button class="action-btn" id="view-cross-chain-history" disabled>
              📜 View Cross-Chain History
            </button>
          </div>
          
          <div class="cross-chain-activity">
            <div class="section-header">
              <h4>Recent Activity</h4>
              <span class="activity-count" id="activity-count">0</span>
            </div>
            <div class="activity-list" id="activity-list">
              <div class="no-activity">No cross-chain activity yet</div>
            </div>
          </div>
          
          <div class="cross-chain-status" id="cross-chain-status" style="display: none;">
            <div class="status-indicator">
              <span class="status-icon" id="status-icon">🟡</span>
              <span class="status-text" id="status-text">Processing cross-chain request...</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
          </div>
        </div>
      </div>
    `;
        this.updateChainInfo();
        this.updateSupportedChains();
        this.updateActivityList();
    }
    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById("cross-chain-refresh");
        if (refreshBtn) {
            refreshBtn.addEventListener("click", () => {
                this.updateChainInfo();
                this.updateSupportedChains();
            });
        }
        // Claim cross-chain territory button
        const claimBtn = document.getElementById("claim-cross-chain-territory");
        if (claimBtn) {
            claimBtn.addEventListener("click", () => {
                this.handleClaimCrossChainTerritory();
            });
        }
        // View cross-chain history button
        const historyBtn = document.getElementById("view-cross-chain-history");
        if (historyBtn) {
            historyBtn.addEventListener("click", () => {
                this.handleViewCrossChainHistory();
            });
        }
    }
    setupServiceListeners() {
        if (!this.eventBus)
            return;
        // Listen for wallet connection events
        this.eventBus.on("web3:walletConnected", () => {
            this.updateChainInfo();
            this.updateSupportedChains();
            this.enableActions();
        });
        // Listen for cross-chain events
        this.eventBus.on("crosschain:messageSent", (data) => {
            this.showStatus("Message sent to cross-chain network", "success");
            this.logActivity({
                type: "messageSent",
                timestamp: Date.now(),
                data
            });
        });
        this.eventBus.on("crosschain:territoryClaimInitiated", (data) => {
            this.showStatus("Cross-chain territory claim initiated", "processing");
            this.logActivity({
                type: "claimInitiated",
                timestamp: Date.now(),
                data
            });
        });
        this.eventBus.on("crosschain:territoryClaimFailed", (data) => {
            this.showStatus("Cross-chain territory claim failed: " + data.error, "error");
            this.logActivity({
                type: "claimFailed",
                timestamp: Date.now(),
                data
            });
        });
        this.eventBus.on("web3:crossChainTerritoryClaimed", (data) => {
            this.showStatus("Territory claimed successfully on ZetaChain!", "success");
            this.logActivity({
                type: "claimSuccess",
                timestamp: Date.now(),
                data
            });
        });
        this.eventBus.on("web3:crossChainTerritoryClaimFailed", (data) => {
            this.showStatus("Territory claim failed: " + data.error, "error");
            this.logActivity({
                type: "claimFailed",
                timestamp: Date.now(),
                data
            });
        });
        this.eventBus.on("crosschain:messageReceived", (data) => {
            this.logActivity({
                type: "messageReceived",
                timestamp: Date.now(),
                data
            });
        });
        this.eventBus.on("crosschain:territoryUpdated", (data) => {
            this.logActivity({
                type: "territoryUpdated",
                timestamp: Date.now(),
                data
            });
        });
    }
    logActivity(activity) {
        // Add to activity log
        this.activityLog.unshift(activity);
        // Keep only the last 10 activities
        if (this.activityLog.length > 10) {
            this.activityLog.pop();
        }
        // Update UI
        this.updateActivityList();
        this.updateActivityCount();
    }
    updateActivityList() {
        const activityListEl = document.getElementById("activity-list");
        if (!activityListEl)
            return;
        if (this.activityLog.length === 0) {
            activityListEl.innerHTML = `<div class="no-activity">No cross-chain activity yet</div>`;
            return;
        }
        const activityHtml = this.activityLog
            .slice(0, 5) // Show only the last 5 activities
            .map(activity => {
            const time = new Date(activity.timestamp).toLocaleTimeString();
            let icon = "ℹ️";
            let text = "Unknown activity";
            switch (activity.type) {
                case "messageSent":
                    icon = "📤";
                    text = `Message sent to chain ${activity.data.targetChainId}`;
                    break;
                case "claimInitiated":
                    icon = "🚀";
                    text = `Territory claim initiated`;
                    break;
                case "claimSuccess":
                    icon = "✅";
                    text = `Territory claimed successfully`;
                    break;
                case "claimFailed":
                    icon = "❌";
                    text = `Territory claim failed`;
                    break;
                case "messageReceived":
                    icon = "📥";
                    text = `Message received from chain ${activity.data.message.sourceChainId}`;
                    break;
                case "territoryUpdated":
                    icon = "🔄";
                    text = `Territory updated from chain ${activity.data.sourceChainId}`;
                    break;
            }
            return `
          <div class="activity-item">
            <span class="activity-icon">${icon}</span>
            <span class="activity-text">${text}</span>
            <span class="activity-time">${time}</span>
          </div>
        `;
        })
            .join("");
        activityListEl.innerHTML = activityHtml;
    }
    updateActivityCount() {
        const countEl = document.getElementById("activity-count");
        if (countEl) {
            countEl.textContent = this.activityLog.length.toString();
        }
    }
    updateChainInfo() {
        const chainNameEl = document.getElementById("current-chain-name");
        if (!chainNameEl)
            return;
        if (this.web3Service && this.web3Service.isConnected()) {
            const wallet = this.web3Service.getCurrentWallet();
            if (wallet) {
                const chainName = this.getCrossChainService()?.getChainName(wallet.chainId) ||
                    `Unknown Chain (${wallet.chainId})`;
                chainNameEl.textContent = chainName;
                chainNameEl.className = "value chain-" + wallet.chainId;
            }
            else {
                chainNameEl.textContent = "Not connected";
            }
        }
        else {
            chainNameEl.textContent = "Not connected";
        }
    }
    updateSupportedChains() {
        const chainsListEl = document.getElementById("supported-chains-list");
        if (!chainsListEl)
            return;
        const crossChainService = this.getCrossChainService();
        if (!crossChainService) {
            chainsListEl.innerHTML = "<span class='chain-tag'>Cross-chain service not available</span>";
            return;
        }
        const supportedChains = crossChainService.getSupportedChains();
        chainsListEl.innerHTML = supportedChains
            .map((chainId) => {
            const chainName = ChainHelper.getSimpleName(chainId);
            const gasEstimate = ChainHelper.getGasEstimate(chainId);
            const recommended = ChainHelper.shouldRecommendChain(chainId);
            return `<span class="chain-tag chain-${chainId} ${recommended ? 'recommended' : ''}" title="${chainName} - Gas: ${gasEstimate}">
          ${chainName} ${recommended ? '⭐' : ''}
        </span>`;
        })
            .join(" ");
    }
    enableActions() {
        const claimBtn = document.getElementById("claim-cross-chain-territory");
        const historyBtn = document.getElementById("view-cross-chain-history");
        if (claimBtn)
            claimBtn.disabled = false;
        if (historyBtn)
            historyBtn.disabled = false;
    }
    disableActions() {
        const claimBtn = document.getElementById("claim-cross-chain-territory");
        const historyBtn = document.getElementById("view-cross-chain-history");
        if (claimBtn)
            claimBtn.disabled = true;
        if (historyBtn)
            historyBtn.disabled = true;
    }
    async handleClaimCrossChainTerritory() {
        try {
            // Check if we have a territory to claim
            const territoryService = window.RunRealm?.services?.territory;
            if (!territoryService) {
                throw new Error("Territory service not available");
            }
            // Get the current run/territory to claim
            // In a real implementation, this would get the actual territory data
            const mockTerritoryData = {
                geohash: "u4pruydqqvj",
                difficulty: 75,
                distance: 5000,
                landmarks: ["Central Park", "Fountain"],
                originChainId: this.web3Service?.getCurrentWallet()?.chainId || 1,
                originAddress: this.web3Service?.getCurrentWallet()?.address || ""
            };
            // Request cross-chain territory claim
            this.eventBus?.emit("crosschain:territoryClaimRequested", {
                territoryData: mockTerritoryData,
                targetChainId: 7001 // ZetaChain testnet
            });
            this.showStatus("Initiating cross-chain territory claim...", "processing");
        }
        catch (error) {
            console.error("CrossChainWidget: Failed to claim territory:", error);
            this.showStatus("Failed to initiate cross-chain claim: " + error.message, "error");
        }
    }
    handleViewCrossChainHistory() {
        // In a real implementation, this would show the cross-chain history
        alert("Cross-chain history view would open here");
    }
    showStatus(message, type) {
        const statusEl = document.getElementById("cross-chain-status");
        const statusIconEl = document.getElementById("status-icon");
        const statusTextEl = document.getElementById("status-text");
        const progressFillEl = document.getElementById("progress-fill");
        if (!statusEl || !statusIconEl || !statusTextEl || !progressFillEl)
            return;
        // Set status text
        statusTextEl.textContent = message;
        // Set status icon and progress based on type
        switch (type) {
            case "success":
                statusIconEl.textContent = "✅";
                statusEl.className = "cross-chain-status success";
                progressFillEl.style.width = "100%";
                progressFillEl.className = "progress-fill success";
                break;
            case "error":
                statusIconEl.textContent = "❌";
                statusEl.className = "cross-chain-status error";
                progressFillEl.style.width = "100%";
                progressFillEl.className = "progress-fill error";
                break;
            case "processing":
                statusIconEl.textContent = "🟡";
                statusEl.className = "cross-chain-status processing";
                progressFillEl.style.width = "50%";
                progressFillEl.className = "progress-fill processing";
                break;
            default:
                statusIconEl.textContent = "ℹ️";
                statusEl.className = "cross-chain-status info";
                progressFillEl.style.width = "100%";
                progressFillEl.className = "progress-fill info";
        }
        // Show status
        statusEl.style.display = "block";
        // Hide status after delay for success/error messages
        if (type === "success" || type === "error") {
            setTimeout(() => {
                statusEl.style.display = "none";
            }, 5000);
        }
    }
    getCrossChainService() {
        // Try to get from services registry first
        if (this.crossChainService) {
            return this.crossChainService;
        }
        // Fallback to global registry
        return window.RunRealm?.services?.crossChain;
    }
    cleanup() {
        // Clean up event listeners
        const refreshBtn = document.getElementById("cross-chain-refresh");
        if (refreshBtn) {
            refreshBtn.removeEventListener("click", () => { });
        }
        const claimBtn = document.getElementById("claim-cross-chain-territory");
        if (claimBtn) {
            claimBtn.removeEventListener("click", () => { });
        }
        const historyBtn = document.getElementById("view-cross-chain-history");
        if (historyBtn) {
            historyBtn.removeEventListener("click", () => { });
        }
        // Cleanup event listeners
        // No parent cleanup needed
    }
}
