# RunRealm Development Guide
## Complete Setup, Architecture & Implementation Reference

### 🎯 Overview

RunRealm transforms a traditional running app into a cutting-edge Web3 GameFi platform using ZetaChain Universal Contracts, Google Gemini AI, and immersive gaming mechanics. This guide covers the complete development workflow from setup to implementation.

---

## 🛠️ Environment Setup

### Prerequisites

1. **Mapbox Access Token** - Get one at: https://account.mapbox.com/access-tokens/
2. **Google Generative AI API Key** - Get one at: https://aistudio.google.com/app/apikey
3. **Node.js 18+** and **npm**

### Configuration Setup

```bash
# 1. Copy example files
cp .env.example .env
cp src/appsettings.secrets.example.ts src/appsettings.secrets.ts

# 2. Edit with your actual API keys
# In .env:
MAPBOX_ACCESS_TOKEN=your_actual_mapbox_token
GOOGLE_GEMINI_API_KEY=your_actual_google_ai_key

# In src/appsettings.secrets.ts:
export const MAPBOX_ACCESS_TOKEN = 'your_actual_mapbox_token';
export const GOOGLE_GEMINI_API_KEY = 'your_actual_google_ai_key';
```

### Quick Start

```bash
# Install dependencies
npm install

# Compile smart contracts
npm run contracts:compile

# Start development server
npm run dev

# Open http://localhost:8080
```

---

## 🏗️ Architecture Overview

### Core Philosophy: ENHANCE, DON'T REPLACE

RunRealm achieves **90% code reuse** by extending existing services rather than creating new ones:

- **Existing Services**: BaseService pattern ready for extension
- **EventBus System**: Perfect for Web3 event integration  
- **Modular UIService**: Easy to extend with GameFi components
- **Clean CurrentRun Model**: Ideal for territory NFT generation
- **Mobile-First Design**: Essential for Web3 gaming

### Service Architecture

```
RunRealmApp (Core Application)
├── ConfigService (Extended with Web3 config)
├── EventBus (Enhanced with blockchain events)
├── UIService (Extended with GameFi components)
├── Web3Service (New - blockchain interactions)
├── AIService (New - Google Gemini integration)
├── GameService (New - GameFi mechanics)
└── ZetaChainService (New - Universal Contracts)
```

### Data Flow

```
User Action → EventBus → Service Layer → Blockchain/AI → UI Update
```

---

## 📊 Current Codebase Analysis

### ✅ Strengths to Leverage

1. **Excellent Service Architecture**: BaseService pattern ready for extension
2. **Robust EventBus System**: Perfect for Web3 event integration
3. **Modular UIService**: Easy to extend with GameFi components
4. **Clean CurrentRun Model**: Ideal for territory NFT generation
5. **Mobile-First Design**: Essential for Web3 gaming

### 🔄 Enhancement Strategy

**Key Files to Extend**:
- `src/core/app-config.ts` - Add Web3 configuration
- `src/core/event-bus.ts` - Add blockchain events
- `src/services/ui-service.ts` - Add GameFi UI components
- `src/current-run.ts` - Add territory generation
- `src/core/run-realm-app.ts` - Integrate Web3 services

---

## 🎮 Implementation Plan

### Phase 1: Smart Contract Foundation (Priority 1)

#### 1.1 Deploy Smart Contracts
```bash
# Deploy to ZetaChain testnet
npm run contracts:deploy:testnet

# Verify contracts
npm run contracts:verify
```

#### 1.2 Update Configuration
```typescript
// Extend src/core/app-config.ts
interface AppConfig {
  // Existing properties...
  web3?: {
    enabled: boolean;
    zetachain: {
      rpcUrl: string;
      chainId: number;
      contracts: {
        territoryNFT: string;
        realmToken: string;
        universalManager: string;
      };
    };
    ai: {
      geminiApiKey: string;
      enabled: boolean;
    };
  };
}
```

### Phase 2: Core Service Extensions (Priority 2)

#### 2.1 Enhance CurrentRun for Territory Generation
```typescript
// Modify src/current-run.ts
export class CurrentRun {
  // Existing properties...
  public territoryMetadata?: TerritoryMetadata;

  public generateTerritoryHash(): string {
    // Generate geohash from route coordinates
  }

  public calculateTerritoryDifficulty(): number {
    // Use existing distance calculation + elevation data
  }

  public extractLandmarks(): string[] {
    // Use existing geocoding service integration
  }
}
```

#### 2.2 Extend EventBus for Web3 Events
```typescript
// Add to src/core/event-bus.ts
interface AppEvents {
  // Existing events...
  'web3:walletConnected': { address: string; chainId: number };
  'web3:networkChanged': { chainId: number };
  'territory:generated': { metadata: TerritoryMetadata };
  'territory:minted': { tokenId: string; txHash: string };
  'ai:routeGenerated': { route: AIRoute; confidence: number };
  'game:rewardEarned': { amount: number; reason: string };
}
```

#### 2.3 Enhance UIService with Web3 Components
```typescript
// Modify src/services/ui-service.ts
export class UIService {
  // Existing methods...

  public showWalletConnection(): void {
    // Use existing modal/toast system
  }

  public showTerritoryPreview(metadata: TerritoryMetadata): void {
    // Extend existing toast system
  }

  public showTransactionStatus(txHash: string, type: string): void {
    // Use existing toast with Web3 styling
  }
}
```

### Phase 3: AI Integration (Priority 3)

#### 3.1 Enhance Existing AIService
```typescript
// Modify src/services/ai-service.ts
class AIService extends BaseService {
  async suggestRoute(location: LatLng, goals: UserGoals): Promise<Route>;
  async analyzeTerritory(territory: Territory): Promise<Analysis>;
  async generateCompetitor(difficulty: number): Promise<AIRunner>;
}
```

#### 3.2 Integrate AI with Map Service
```typescript
// Add to src/core/run-realm-app.ts
private async handleMapClick(e: mapboxgl.MapMouseEvent): Promise<void> {
  // Existing click handling...
  
  if (this.gameMode && this.ai.isAIEnabled()) {
    const suggestions = await this.ai.suggestRoute(
      { lat: e.lngLat.lat, lng: e.lngLat.lng },
      { distance: 2000, difficulty: 50 }
    );
    this.visualizeAIRoute(suggestions.suggestedRoute);
  }
}
```

### Phase 4: Web3 Service Integration (Priority 4)

#### 4.1 Integrate Web3Service
```typescript
// Modify src/core/run-realm-app.ts
export class RunRealmApp {
  private web3: Web3Service;

  private async initializeGameFiServices(): Promise<void> {
    if (this.config.getWeb3Config()?.enabled) {
      await this.web3.init();
      this.setupWeb3EventHandlers();
    }
  }

  private async addPointToRun(lngLat: LngLat): Promise<void> {
    // Existing point addition logic...

    if (this.gameMode && this.currentRun) {
      const territoryMetadata = this.currentRun.generateTerritoryMetadata();
      this.eventBus.emit('territory:generated', { metadata: territoryMetadata });
      
      if (this.shouldAutoMintTerritory()) {
        await this.mintTerritoryNFT(territoryMetadata);
      }
    }
  }
}
```

#### 4.2 Contract Interaction Layer
```typescript
class Web3Service extends BaseService {
  public async mintTerritory(metadata: TerritoryMetadata): Promise<string> {
    try {
      const contract = this.getTerritoryContract();
      const tx = await contract.mintTerritory(
        metadata.geohash,
        metadata.difficulty,
        JSON.stringify(metadata)
      );
      
      this.safeEmit('territory:minted', { tokenId: metadata.geohash, txHash: tx.hash });
      return tx.hash;
    } catch (error) {
      this.handleError(error, 'territory minting');
      throw error;
    }
  }
}
```

### Phase 5: UI Enhancement (Priority 5)

#### 5.1 Extend Mobile Action Bar
```typescript
// Enhance src/services/ui-service.ts
private createMobileActionBar(): void {
  const actionBar = this.dom.createElement('div', {
    id: 'mobile-action-bar',
    className: 'mobile-action-bar',
    innerHTML: `
      <!-- Existing buttons... -->
      <button class="mobile-action-btn secondary" data-action="undo">↶</button>
      <button class="mobile-action-btn primary" data-action="add">📍</button>
      
      ${this.isWeb3Enabled() ? `
        <button class="mobile-action-btn web3" data-action="wallet" title="Wallet">👛</button>
        <button class="mobile-action-btn web3" data-action="mint" title="Mint Territory">🏆</button>
      ` : ''}
      
      <button class="mobile-action-btn secondary" data-action="clear">🗑️</button>
    `,
    parent: document.body
  });
}
```

#### 5.2 Add GameFi Visual Elements
```typescript
private addGameFiOverlay(): void {
  const overlay = this.dom.createElement('div', {
    id: 'gamefi-hud',
    className: 'gamefi-overlay',
    innerHTML: `
      <div class="player-stats">
        <span class="level">Lv. 1</span>
        <span class="realm-tokens">0 $REALM</span>
        <span class="territories">0 Territories</span>
      </div>
      <div class="ai-coach" id="ai-suggestions"></div>
    `,
    parent: document.body
  });
}
```

---

## 📦 Dependencies Management

### Essential Dependencies Only
```json
{
  "dependencies": {
    // Existing dependencies remain...
    
    // Add minimal Web3 dependencies
    "ethers": "^6.7.1",
    "@zetachain/protocol-contracts": "^7.0.0",
    "@google/generative-ai": "^0.1.3"
  }
}
```

### Bundle Optimization
- **Lazy Loading**: Load Web3 services only when game mode enabled
- **Code Splitting**: Separate Web3 bundle from core app
- **Tree Shaking**: Import only used functions from libraries

---

## 🧪 Testing Strategy

### Extend Existing Test Patterns
```typescript
// Add to existing current-run.spec.ts
describe('CurrentRun Territory Generation', () => {
  it('should generate valid territory metadata', () => {
    const run = new CurrentRun(mockRunStart);
    run.addSegment(mockSegment);
    
    const metadata = run.generateTerritoryMetadata();
    expect(metadata.geohash).toBeDefined();
    expect(metadata.difficulty).toBeGreaterThan(0);
  });
});
```

### Test Commands
```bash
# TypeScript type checking
npm run typecheck

# Run all tests
npm test

# Build test
npm run build
```

---

## 🚀 Implementation Timeline

### Week 1: Foundation
- **Day 1-2**: Deploy and verify smart contracts
- **Day 3-4**: Extend ConfigService and EventBus
- **Day 5**: Enhance CurrentRun with territory generation

### Week 2: Core Integration  
- **Day 6-8**: Integrate Web3Service with existing app flow
- **Day 9-10**: Enhance AIService and integrate with map
- **Day 11**: Add basic GameFi UI elements

### Week 3: Polish & Testing
- **Day 12-14**: UI/UX enhancements and mobile optimization
- **Day 15-16**: Integration testing and bug fixes
- **Day 17**: Performance optimization and deployment

---

## ✅ Success Metrics

### Code Quality Preservation
- **Bundle Size**: <+200KB increase from Web3 dependencies  
- **Performance**: <2s additional load time for Web3 features
- **Test Coverage**: Maintain existing coverage % for all modified files
- **TypeScript**: Zero new `any` types, full type safety

### Feature Completeness
- **Smart Contracts**: Deployed and verified on testnet
- **Territory Generation**: Working from existing route system  
- **AI Integration**: Route suggestions integrated with map
- **Web3 Integration**: Wallet connection and NFT minting functional
- **Mobile Experience**: All features work smoothly on mobile

---

## 🎯 Key Implementation Principles

1. **Enhance Existing Code**: Every new feature extends an existing service or component
2. **Maintain Patterns**: Follow established architecture patterns consistently  
3. **Progressive Loading**: Web3 features load only when needed
4. **Error Boundaries**: Web3 failures don't break core app functionality
5. **Performance First**: Optimize for mobile and low-bandwidth scenarios
6. **User-Centric**: Features should feel natural, not tacked-on

---

## 🆘 Troubleshooting

### Common Issues

**Map Not Loading**:
- Verify Mapbox access token is correct
- Check token permissions and expiration

**AI Features Not Working**:
- Verify Google AI API key is correct
- Check API usage quotas

**Environment Variables Not Loading**:
- Check file locations and syntax
- Verify variable names match exactly

### Debug Mode
```typescript
// Enable debug logging
localStorage.setItem('runrealm_debug', 'true');
```

---

This development guide ensures RunRealm becomes a cutting-edge Web3 gaming app while preserving the excellent foundation of the existing RunMap codebase. The transformation enhances rather than replaces, resulting in clean, maintainable, performant code that delivers on the full GameFi vision.