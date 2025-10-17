import { BaseService } from "../core/base-service";
/**
 * CrossChainDemoComponent - Demonstrates cross-chain functionality for the Google Buildathon
 * This component provides a visual demonstration of how cross-chain operations work
 */
export class CrossChainDemoComponent extends BaseService {
    constructor() {
        super();
        this.container = null;
    }
    async initialize(containerId = "cross-chain-demo") {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.warn("CrossChainDemoComponent: Container not found");
            return;
        }
        // EventBus is already available from BaseService
        this.render();
        this.setupEventListeners();
    }
    render() {
        if (!this.container)
            return;
        this.container.innerHTML = `
      <div class="cross-chain-demo">
        <div class="demo-header">
          <h2>⛓️ Cross-Chain Demo</h2>
          <p>Demonstrating ZetaChain's Universal Contract capabilities</p>
        </div>
        
        <div class="demo-content">
          <div class="chain-selector">
            <h3>Select Origin Chain</h3>
            <div class="chain-options">
              <button class="chain-btn" data-chain="1">Ethereum</button>
              <button class="chain-btn" data-chain="56">BSC</button>
              <button class="chain-btn" data-chain="137">Polygon</button>
              <button class="chain-btn" data-chain="43114">Avalanche</button>
              <button class="chain-btn" data-chain="8453">Base</button>
              <button class="chain-btn" data-chain="42161">Arbitrum</button>
            </div>
          </div>
          
          <div class="demo-steps">
            <h3>Demo Steps</h3>
            <ol>
              <li>Connect wallet to selected chain</li>
              <li>Claim territory cross-chain</li>
              <li>Watch transaction propagate to ZetaChain</li>
              <li>View territory on ZetaChain</li>
            </ol>
          </div>
          
          <div class="demo-controls">
            <button class="demo-btn primary" id="start-demo">
              🚀 Start Cross-Chain Demo
            </button>
            <button class="demo-btn" id="show-api-demo">
              📚 Show API Usage
            </button>
          </div>
          
          <div class="demo-status" id="demo-status" style="display: none;">
            <div class="status-indicator">
              <span class="status-icon" id="demo-status-icon">🟡</span>
              <span class="status-text" id="demo-status-text">Initializing demo...</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" id="demo-progress-fill"></div>
            </div>
          </div>
          
          <div class="demo-results" id="demo-results" style="display: none;">
            <h3>Demo Results</h3>
            <div class="result-item">
              <span class="result-label">Transaction Hash:</span>
              <span class="result-value" id="tx-hash">-</span>
            </div>
            <div class="result-item">
              <span class="result-label">Origin Chain:</span>
              <span class="result-value" id="origin-chain">-</span>
            </div>
            <div class="result-item">
              <span class="result-label">Target Chain:</span>
              <span class="result-value" id="target-chain">ZetaChain Testnet</span>
            </div>
            <div class="result-item">
              <span class="result-label">Gas Paid:</span>
              <span class="result-value" id="gas-paid">On Origin Chain</span>
            </div>
          </div>
        </div>
      </div>
    `;
    }
    setupEventListeners() {
        // Chain selection buttons
        const chainButtons = this.container?.querySelectorAll(".chain-btn");
        chainButtons?.forEach(button => {
            button.addEventListener("click", (e) => {
                const target = e.target;
                const chainId = parseInt(target.dataset.chain || "1");
                this.selectChain(chainId);
            });
        });
        // Demo start button
        const startDemoBtn = document.getElementById("start-demo");
        if (startDemoBtn) {
            startDemoBtn.addEventListener("click", () => {
                this.startDemo();
            });
        }
        // API demo button
        const showApiDemoBtn = document.getElementById("show-api-demo");
        if (showApiDemoBtn) {
            showApiDemoBtn.addEventListener("click", () => {
                this.showApiDemo();
            });
        }
        // Listen for cross-chain events
        if (this.eventBus) {
            this.eventBus.on("crosschain:territoryClaimInitiated", (data) => {
                this.updateDemoStatus("🟡", "Cross-chain claim initiated...", 30);
            });
            this.eventBus.on("web3:crossChainTerritoryClaimed", (data) => {
                this.updateDemoStatus("✅", "Territory claimed successfully!", 100);
                this.showDemoResults(data);
            });
            this.eventBus.on("crosschain:territoryClaimFailed", (data) => {
                this.updateDemoStatus("❌", `Claim failed: ${data.error}`, 100);
            });
        }
    }
    selectChain(chainId) {
        // Update UI to show selected chain
        const chainButtons = this.container?.querySelectorAll(".chain-btn");
        chainButtons?.forEach(button => {
            button.classList.remove("selected");
            const htmlButton = button;
            if (parseInt(htmlButton.dataset.chain || "1") === chainId) {
                button.classList.add("selected");
            }
        });
        console.log(`CrossChainDemoComponent: Selected chain ${chainId}`);
    }
    async startDemo() {
        console.log("CrossChainDemoComponent: Starting cross-chain demo");
        // Show status indicator
        const statusEl = document.getElementById("demo-status");
        if (statusEl) {
            statusEl.style.display = "block";
        }
        this.updateDemoStatus("🟡", "Initializing cross-chain claim...", 10);
        // Get services
        const services = window.RunRealm?.services;
        const web3Service = services?.web3;
        const crossChainService = services?.crossChain;
        // Check if wallet is connected
        if (!web3Service?.isConnected()) {
            this.updateDemoStatus("❌", "Please connect your wallet first", 100);
            // Show wallet connection UI
            if (services?.walletWidget) {
                services.walletWidget.showWalletModal();
            }
            return;
        }
        // Get wallet info
        const wallet = web3Service.getCurrentWallet();
        if (!wallet) {
            this.updateDemoStatus("❌", "Wallet not available", 100);
            return;
        }
        this.updateDemoStatus("🟡", "Preparing territory data...", 20);
        // Create mock territory data
        const mockTerritoryData = {
            geohash: "u4pruydqqvj",
            difficulty: 75,
            distance: 5000,
            landmarks: ["Central Park", "Fountain"],
            originChainId: wallet.chainId,
            originAddress: wallet.address
        };
        this.updateDemoStatus("🟡", "Sending cross-chain message...", 40);
        // Emit cross-chain claim event
        if (this.eventBus) {
            this.eventBus.emit("crosschain:territoryClaimRequested", {
                territoryData: mockTerritoryData,
                targetChainId: 7001 // ZetaChain testnet
            });
        }
        // Simulate processing time
        setTimeout(() => {
            this.updateDemoStatus("🟡", "Waiting for cross-chain confirmation...", 70);
            // Simulate successful claim after delay
            setTimeout(() => {
                if (this.eventBus) {
                    this.eventBus.emit("web3:crossChainTerritoryClaimed", {
                        hash: `0x${Math.random().toString(16).substring(2, 10)}`,
                        geohash: mockTerritoryData.geohash,
                        originChainId: mockTerritoryData.originChainId
                    });
                }
            }, 2000);
        }, 1500);
    }
    showApiDemo() {
        // Show API usage demonstration
        const apiDemo = `
ZetaChain Gateway API Usage Examples:

1. Cross-chain messaging:
   const tx = await zetaClient.gateway.sendMessage({
     signer: walletSigner,
     destinationChainId: 7001,
     destinationAddress: '0x...contractAddress...',
     message: encodedData,
     gasLimit: 500000
   });

2. Cross-chain token transfer:
   const tx = await zetaClient.gateway.sendToken({
     signer: walletSigner,
     destinationChainId: 7001,
     destinationAddress: '0x...recipientAddress...',
     amount: ethers.parseEther('1.0'),
     gasLimit: 500000
   });

3. Cross-chain contract call:
   const tx = await zetaClient.gateway.callContract({
     signer: walletSigner,
     destinationChainId: 7001,
     destinationAddress: '0x...contractAddress...',
     data: contractCallData,
     gasLimit: 500000
   });
    `;
        alert(apiDemo);
        console.log(apiDemo);
    }
    updateDemoStatus(icon, text, progress) {
        const statusIconEl = document.getElementById("demo-status-icon");
        const statusTextEl = document.getElementById("demo-status-text");
        const progressFillEl = document.getElementById("demo-progress-fill");
        if (statusIconEl)
            statusIconEl.textContent = icon;
        if (statusTextEl)
            statusTextEl.textContent = text;
        if (progressFillEl)
            progressFillEl.style.width = `${progress}%`;
    }
    showDemoResults(data) {
        const resultsEl = document.getElementById("demo-results");
        if (resultsEl) {
            resultsEl.style.display = "block";
        }
        // Update result values
        const txHashEl = document.getElementById("tx-hash");
        const originChainEl = document.getElementById("origin-chain");
        if (txHashEl)
            txHashEl.textContent = data.hash || "0x...";
        if (originChainEl) {
            const chainNames = {
                1: "Ethereum",
                56: "Binance Smart Chain",
                137: "Polygon",
                43114: "Avalanche",
                8453: "Base",
                42161: "Arbitrum"
            };
            originChainEl.textContent = chainNames[data.originChainId] || `Chain ${data.originChainId}`;
        }
    }
    cleanup() {
        super.cleanup();
    }
}
