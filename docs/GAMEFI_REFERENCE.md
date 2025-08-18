# RunRealm GameFi Reference
## Complete GameFi Components, Web3 Integration & API Documentation

### 🎮 Overview

RunRealm's GameFi system transforms traditional running into an immersive Web3 gaming experience through territory claiming, AI coaching, and cross-chain NFT ownership. This reference covers all GameFi components, Web3 integrations, and API specifications.

---

## 🏗️ GameFi Architecture

### Core Components

```
GameFi System Architecture
├── GameFiUI (HUD & Visual Interface)
├── TerritoryDashboard (Territory Management)
├── Web3Service (Blockchain Integration)
├── AIService (Google Gemini Integration)
├── ZetaChainService (Universal Contracts)
└── GameService (GameFi Mechanics)
```

### Event-Driven Communication

```
RunRealmApp (Core) 
    ↕ Events
GameFiUI (HUD) ↔ TerritoryDashboard (Logic)
    ↕ Events         ↕ Events
AI Service     Web3 Service
```

---

## 🎨 GameFiUI Service

### Core Gaming Interface

The GameFiUI service provides the immersive gaming HUD overlay that transforms the running app into a gaming experience.

#### Key Features
- **Player Stats HUD**: Level, distance, territories owned, $REALM balance
- **Territory Preview Panel**: Interactive territory claiming interface
- **AI Coach**: Contextual guidance and route suggestions
- **Competition System**: Active territory battles display
- **Reward Notifications**: Animated achievement notifications
- **Map Legend**: Visual guide for territory status

#### Usage Example
```typescript
import { GameFiUI } from '../components/gamefi-ui';

// Initialize
const gamefiUI = GameFiUI.getInstance();
await gamefiUI.init();

// Enable GameFi mode
gamefiUI.enableGameFiMode();

// Update player stats
gamefiUI.updatePlayerStats({
  level: 5,
  totalDistance: 15000,
  territoriesOwned: 3,
  realmBalance: 250
});

// Show reward notification
gamefiUI.showRewardNotification('🎉 Territory claimed! +25 $REALM', 'success');

// Update AI coach message
gamefiUI.updateCoachMessage('Great run! You discovered a rare territory nearby.');
```

#### Event Integration
```typescript
// Listening for events
EventBus.on('run:pointAdded', (data) => gamefiUI.updateTerritoryPreview(data));
EventBus.on('web3:walletConnected', (data) => gamefiUI.enableWeb3Features(data));
EventBus.on('territory:claimed', (data) => gamefiUI.showClaimNotification(data));

// Emitting events
gamefiUI.emit('territory:claimRequested', { territoryId: 'abc123' });
gamefiUI.emit('ai:routeRequested', { location: { lat: 40.7128, lng: -74.0060 } });
gamefiUI.emit('ai:ghostRunnerRequested', { difficulty: 75 });
```

#### Visual Styling
```css
/* Cyberpunk/Gaming Theme */
.gamefi-overlay {
  background: linear-gradient(135deg, rgba(0, 255, 136, 0.1), rgba(0, 100, 255, 0.1));
  backdrop-filter: blur(10px);
  border: 1px solid rgba(0, 255, 136, 0.3);
  border-radius: 12px;
}

.player-stats {
  display: flex;
  gap: 15px;
  padding: 10px 15px;
  background: rgba(0, 0, 0, 0.7);
  border-radius: 8px;
}

.level {
  color: #00ff88;
  font-weight: bold;
  text-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
}
```

---

## 🗺️ Territory System

### Territory Generation

Territories are generated from running routes using geospatial hashing and difficulty calculation.

#### Territory Metadata Structure
```typescript
interface TerritoryMetadata {
  geohash: string;           // Unique geospatial identifier
  difficulty: number;        // 1-100 based on distance, elevation, landmarks
  distance: number;          // Route distance in meters
  landmarks: string[];       // Points of interest along route
  creator: string;           // Wallet address of creator
  timestamp: number;         // Creation timestamp
  chainId: number;          // Originating blockchain
  coordinates: LatLng[];    // Route coordinates
}
```

#### Territory Generation Process
```typescript
// In CurrentRun class
public generateTerritoryMetadata(): TerritoryMetadata {
  const geohash = this.calculateGeohash();
  const difficulty = this.calculateDifficulty();
  const landmarks = this.identifyLandmarks();
  
  return {
    geohash,
    difficulty,
    distance: this.getTotalDistance(),
    landmarks,
    creator: this.web3Service.getWalletAddress(),
    timestamp: Date.now(),
    chainId: this.web3Service.getChainId(),
    coordinates: this.getRouteCoordinates()
  };
}

private calculateDifficulty(): number {
  const distanceScore = Math.min(this.getTotalDistance() / 100, 50); // Max 50 points
  const elevationScore = this.getElevationGain() / 10; // 1 point per 10m elevation
  const landmarkScore = this.landmarks.length * 5; // 5 points per landmark
  
  return Math.min(distanceScore + elevationScore + landmarkScore, 100);
}
```

### Territory NFT Contract

#### Smart Contract Interface
```solidity
// TerritoryNFT.sol
contract TerritoryNFT is ERC721, Ownable {
    struct Territory {
        string geohash;
        uint256 difficulty;
        uint256 distance;
        string metadata;
        address creator;
        uint256 timestamp;
        uint256 chainId;
    }
    
    mapping(uint256 => Territory) public territories;
    mapping(string => uint256) public geohashToTokenId;
    
    function mintTerritory(
        string memory geohash,
        uint256 difficulty,
        string memory metadata
    ) external returns (uint256);
    
    function getTerritoryByGeohash(string memory geohash) 
        external view returns (Territory memory);
    
    function getTerritoriesByOwner(address owner) 
        external view returns (uint256[] memory);
}
```

#### Minting Process
```typescript
// Web3Service territory minting
public async mintTerritory(metadata: TerritoryMetadata): Promise<string> {
  try {
    const contract = this.getTerritoryContract();
    
    // Check if territory already exists
    const existing = await contract.geohashToTokenId(metadata.geohash);
    if (existing.gt(0)) {
      throw new Error('Territory already claimed');
    }
    
    // Mint new territory NFT
    const tx = await contract.mintTerritory(
      metadata.geohash,
      metadata.difficulty,
      JSON.stringify(metadata)
    );
    
    // Emit success event
    this.eventBus.emit('territory:minted', { 
      tokenId: metadata.geohash, 
      txHash: tx.hash 
    });
    
    return tx.hash;
  } catch (error) {
    this.handleError(error, 'territory minting');
    throw error;
  }
}
```

---

## 🤖 AI Integration

### Google Gemini AI Service

The AIService integrates Google's Gemini AI for route optimization, territory analysis, and ghost runner generation.

#### Core AI Features
```typescript
class AIService extends BaseService {
  // Route optimization
  async suggestRoute(
    location: LatLng, 
    goals: UserGoals
  ): Promise<RouteSuggestion> {
    const prompt = this.buildRoutePrompt(location, goals);
    const response = await this.gemini.generateContent(prompt);
    return this.parseRouteResponse(response);
  }

  // Territory analysis
  async analyzeTerritory(territory: Territory): Promise<TerritoryAnalysis> {
    const prompt = this.buildAnalysisPrompt(territory);
    const response = await this.gemini.generateContent(prompt);
    return this.parseAnalysisResponse(response);
  }

  // Ghost runner generation
  async generateCompetitor(difficulty: number): Promise<AIRunner> {
    const prompt = this.buildCompetitorPrompt(difficulty);
    const response = await this.gemini.generateContent(prompt);
    return this.parseCompetitorResponse(response);
  }
}
```

#### Route Suggestion Implementation
```typescript
private buildRoutePrompt(location: LatLng, goals: UserGoals): string {
  return `
    Generate an optimal running route from location ${location.lat}, ${location.lng}.
    
    User Goals:
    - Distance: ${goals.distance}m
    - Difficulty: ${goals.difficulty}/100
    - Interests: ${goals.interests.join(', ')}
    
    Consider:
    - Safety (well-lit, populated areas)
    - Scenic value (parks, waterfront, landmarks)
    - Terrain variety (hills, flat sections)
    - Points of interest along the route
    
    Return JSON format:
    {
      "route": [{"lat": number, "lng": number}],
      "distance": number,
      "difficulty": number,
      "highlights": string[],
      "safety_score": number,
      "scenic_score": number
    }
  `;
}
```

#### Ghost Runner System
```typescript
interface AIRunner {
  id: string;
  name: string;
  avatar: string;
  difficulty: number;
  pace: number; // minutes per km
  personality: string;
  catchphrases: string[];
  route: LatLng[];
  currentPosition: LatLng;
  progress: number; // 0-100%
}

// Ghost runner simulation
public simulateGhostRunner(runner: AIRunner, route: LatLng[]): void {
  const interval = setInterval(() => {
    runner.progress += (runner.pace / 60) * 0.1; // Update every 100ms
    runner.currentPosition = this.interpolatePosition(route, runner.progress);
    
    this.eventBus.emit('ghostRunner:positionUpdate', {
      runnerId: runner.id,
      position: runner.currentPosition,
      progress: runner.progress
    });
    
    if (runner.progress >= 100) {
      clearInterval(interval);
      this.eventBus.emit('ghostRunner:finished', { runnerId: runner.id });
    }
  }, 100);
}
```

---

## 🌐 Web3 Integration

### ZetaChain Universal Contracts

RunRealm uses ZetaChain's Universal Contract system for true cross-chain functionality.

#### Universal Contract Architecture
```solidity
// RunRealmUniversalContract.sol
contract RunRealmUniversalContract is UniversalContract {
    mapping(address => PlayerStats) public players;
    mapping(string => Territory) public territories;
    
    // Universal contract entry point
    function onCall(
        MessageContext calldata context,
        address zrc20,
        uint256 amount,
        bytes calldata message
    ) external override onlySystem {
        // Decode message to determine action
        (string memory action, bytes memory data) = abi.decode(message, (string, bytes));
        
        if (keccak256(bytes(action)) == keccak256("CLAIM_TERRITORY")) {
            _claimTerritory(context.senderEVM, data);
        } else if (keccak256(bytes(action)) == keccak256("STAKE_ON_TERRITORY")) {
            _stakeOnTerritory(context.senderEVM, zrc20, amount, data);
        }
    }
    
    function _claimTerritory(address player, bytes memory data) internal {
        // Territory claiming logic
        (string memory geohash, uint256 difficulty, string memory metadata) = 
            abi.decode(data, (string, uint256, string));
            
        // Mint territory NFT
        uint256 tokenId = _mintTerritory(player, geohash, difficulty, metadata);
        
        // Update player stats
        players[player].territoriesOwned++;
        players[player].totalDistance += difficulty * 100; // Approximate
        
        // Emit cross-chain event
        emit TerritoryClaimed(player, tokenId, geohash);
    }
}
```

#### Cross-Chain Territory Claiming
```typescript
// ZetaChainService implementation
class ZetaChainService extends BaseService {
  async claimTerritoryFromAnyChain(
    territory: TerritoryMetadata,
    sourceChain: number
  ): Promise<string> {
    // Encode territory data
    const data = ethers.utils.defaultAbiCoder.encode(
      ['string', 'uint256', 'string'],
      [territory.geohash, territory.difficulty, JSON.stringify(territory)]
    );
    
    // Encode universal contract message
    const message = ethers.utils.defaultAbiCoder.encode(
      ['string', 'bytes'],
      ['CLAIM_TERRITORY', data]
    );
    
    // Send cross-chain transaction
    const tx = await this.universalContract.onCall(
      { senderEVM: this.walletAddress },
      this.zrc20Address,
      0, // No payment required
      message
    );
    
    return tx.hash;
  }
}
```

### Multi-Chain Support

#### Supported Networks
```typescript
interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  blockExplorer: string;
  zrc20Address?: string; // ZetaChain wrapped token address
}

const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_KEY',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockExplorer: 'https://etherscan.io',
    zrc20Address: '0x...' // ZRC-20 ETH on ZetaChain
  },
  {
    chainId: 56,
    name: 'BNB Smart Chain',
    rpcUrl: 'https://bsc-dataseed.binance.org',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockExplorer: 'https://bscscan.com',
    zrc20Address: '0x...' // ZRC-20 BNB on ZetaChain
  },
  {
    chainId: 7001,
    name: 'ZetaChain Athens Testnet',
    rpcUrl: 'https://zetachain-athens-evm.blockpi.network/v1/rpc/public',
    nativeCurrency: { name: 'ZETA', symbol: 'ZETA', decimals: 18 },
    blockExplorer: 'https://zetachain-athens-3.blockscout.com'
  }
];
```

---

## 🎯 GameFi Mechanics

### Player Progression System

#### Player Stats Structure
```typescript
interface PlayerStats {
  level: number;
  experience: number;
  totalDistance: number;
  territoriesOwned: number;
  territoriesChallenged: number;
  realmBalance: number;
  achievements: Achievement[];
  rank: string;
  joinDate: number;
}

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlockedAt: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}
```

#### Level Calculation
```typescript
class GameService extends BaseService {
  calculateLevel(experience: number): number {
    // Exponential level curve: level = floor(sqrt(experience / 100))
    return Math.floor(Math.sqrt(experience / 100));
  }
  
  calculateExperienceForDistance(distance: number, difficulty: number): number {
    // Base XP: 1 XP per 10 meters
    const baseXP = distance / 10;
    
    // Difficulty multiplier: 1.0x to 2.0x
    const difficultyMultiplier = 1 + (difficulty / 100);
    
    return Math.floor(baseXP * difficultyMultiplier);
  }
  
  async awardExperience(playerId: string, distance: number, difficulty: number): Promise<void> {
    const xp = this.calculateExperienceForDistance(distance, difficulty);
    const player = await this.getPlayer(playerId);
    
    const oldLevel = this.calculateLevel(player.experience);
    player.experience += xp;
    const newLevel = this.calculateLevel(player.experience);
    
    if (newLevel > oldLevel) {
      this.eventBus.emit('player:levelUp', { 
        playerId, 
        oldLevel, 
        newLevel,
        rewardTokens: newLevel * 10 
      });
    }
    
    await this.savePlayer(player);
  }
}
```

### Token Economics

#### $REALM Token Distribution
```typescript
interface RewardCalculation {
  baseReward: number;      // Base tokens for completing route
  difficultyBonus: number; // Bonus based on route difficulty
  distanceBonus: number;   // Bonus based on distance covered
  firstClaimBonus: number; // Bonus for claiming new territory
  streakBonus: number;     // Bonus for consecutive days
  total: number;
}

class TokenService extends BaseService {
  calculateReward(
    distance: number, 
    difficulty: number, 
    isFirstClaim: boolean,
    streakDays: number
  ): RewardCalculation {
    const baseReward = 10; // 10 $REALM base
    const difficultyBonus = (difficulty / 100) * 20; // Up to 20 $REALM
    const distanceBonus = Math.min(distance / 1000, 10); // 1 $REALM per km, max 10
    const firstClaimBonus = isFirstClaim ? 25 : 0;
    const streakBonus = Math.min(streakDays * 2, 20); // 2 $REALM per day, max 20
    
    const total = baseReward + difficultyBonus + distanceBonus + firstClaimBonus + streakBonus;
    
    return {
      baseReward,
      difficultyBonus,
      distanceBonus,
      firstClaimBonus,
      streakBonus,
      total: Math.floor(total)
    };
  }
}
```

---

## 📱 Mobile GameFi Interface

### Touch-Optimized Controls

#### Mobile Action Bar Enhancement
```typescript
// Enhanced mobile controls for GameFi
private createGameFiMobileControls(): void {
  const controls = this.dom.createElement('div', {
    id: 'gamefi-mobile-controls',
    className: 'gamefi-mobile-controls',
    innerHTML: `
      <div class="control-row primary">
        <button class="gamefi-btn" data-action="claim-territory">
          <span class="icon">🏆</span>
          <span class="label">Claim</span>
        </button>
        <button class="gamefi-btn" data-action="ai-route">
          <span class="icon">🤖</span>
          <span class="label">AI Route</span>
        </button>
        <button class="gamefi-btn" data-action="ghost-runner">
          <span class="icon">👻</span>
          <span class="label">Ghost</span>
        </button>
      </div>
      <div class="control-row secondary">
        <button class="gamefi-btn" data-action="wallet">
          <span class="icon">👛</span>
          <span class="label">Wallet</span>
        </button>
        <button class="gamefi-btn" data-action="stats">
          <span class="icon">📊</span>
          <span class="label">Stats</span>
        </button>
        <button class="gamefi-btn" data-action="leaderboard">
          <span class="icon">🏅</span>
          <span class="label">Ranks</span>
        </button>
      </div>
    `,
    parent: document.body
  });
  
  // Add touch event handlers
  controls.addEventListener('touchstart', this.handleGameFiTouch.bind(this));
}
```

#### Haptic Feedback Integration
```typescript
// Haptic feedback for GameFi actions
private triggerHapticFeedback(type: 'light' | 'medium' | 'heavy'): void {
  if ('vibrate' in navigator) {
    const patterns = {
      light: [10],
      medium: [20],
      heavy: [30, 10, 30]
    };
    navigator.vibrate(patterns[type]);
  }
}

// Usage in GameFi actions
private async claimTerritory(): Promise<void> {
  this.triggerHapticFeedback('medium');
  // ... territory claiming logic
  this.triggerHapticFeedback('heavy'); // Success feedback
}
```

---

## 🔧 API Reference

### GameFiUI API
```typescript
interface GameFiUIAPI {
  // Initialization
  init(): Promise<void>;
  cleanup(): void;
  
  // Mode management
  enableGameFiMode(): void;
  disableGameFiMode(): void;
  isGameFiEnabled(): boolean;
  
  // Player stats
  updatePlayerStats(stats: PlayerStats): void;
  getPlayerStats(): PlayerStats;
  
  // Notifications
  showRewardNotification(message: string, type: NotificationType): void;
  showAchievementUnlocked(achievement: Achievement): void;
  
  // AI coach
  updateCoachMessage(message: string): void;
  showCoachTip(tip: string, duration?: number): void;
  
  // Territory management
  showTerritoryPreview(territory: TerritoryMetadata): void;
  hideTerritoryPreview(): void;
  
  // Events
  on(event: string, callback: Function): void;
  off(event: string, callback: Function): void;
  emit(event: string, data: any): void;
}
```

### Web3Service API
```typescript
interface Web3ServiceAPI {
  // Wallet management
  connectWallet(): Promise<string>;
  disconnectWallet(): void;
  getWalletAddress(): string | null;
  isConnected(): boolean;
  
  // Network management
  switchNetwork(chainId: number): Promise<void>;
  getChainId(): number;
  getSupportedChains(): ChainConfig[];
  
  // Contract interactions
  mintTerritory(metadata: TerritoryMetadata): Promise<string>;
  getTerritoriesByOwner(address: string): Promise<Territory[]>;
  getTokenBalance(address: string): Promise<number>;
  
  // Transaction management
  sendTransaction(tx: TransactionRequest): Promise<string>;
  waitForTransaction(txHash: string): Promise<TransactionReceipt>;
  
  // Events
  on(event: Web3Event, callback: Function): void;
  off(event: Web3Event, callback: Function): void;
}
```

### AIService API
```typescript
interface AIServiceAPI {
  // Route generation
  suggestRoute(location: LatLng, goals: UserGoals): Promise<RouteSuggestion>;
  optimizeRoute(route: LatLng[], preferences: RoutePreferences): Promise<LatLng[]>;
  
  // Territory analysis
  analyzeTerritory(territory: Territory): Promise<TerritoryAnalysis>;
  suggestImprovements(territory: Territory): Promise<string[]>;
  
  // Ghost runners
  generateCompetitor(difficulty: number): Promise<AIRunner>;
  simulateRun(runner: AIRunner, route: LatLng[]): void;
  
  // Coaching
  generateCoachingTip(playerStats: PlayerStats): Promise<string>;
  analyzePerformance(runs: RunHistory[]): Promise<PerformanceAnalysis>;
}
```

---

This comprehensive GameFi reference provides everything needed to understand, implement, and extend RunRealm's Web3 gaming features. The system transforms traditional running into an engaging blockchain gaming experience while maintaining clean architecture and excellent user experience.