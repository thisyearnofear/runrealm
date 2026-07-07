/**
 * Service composition for RunRealm.
 *
 * Replaces the inline `initializeServices()` + `registerGlobalServices()`
 * that used to live in `run-realm-app.ts`. Pure factory — no side effects
 * beyond the (window as any).RunRealm.services namespace registration
 * that other widgets (vanilla-DOM and React shell) still read from.
 *
 * Order of construction matches the original (dependency-first):
 *   config, eventBus → preferences, ui, dom → location, web3, ai,
 *   game, contractService, territory, territoryToggle, runTracking,
 *   progression, onboarding, navigation, animation, sound,
 *   aiOrchestrator, crossChain, crossChainDemo, mapService,
 *   externalFitness, ghostRunner, enhancedRunControls, gamefiUI,
 *   geocodingService, routeInfoPanel.
 *
 * Token-dependent services (geocoding, route info) get a separate
 * call so the mapbox access token can be loaded from runtime first.
 */

import { ConfidentialContractService } from '@runrealm/shared-blockchain/services/confidential-contract-service';
import { ContractService } from '@runrealm/shared-blockchain/services/contract-service';
import { CrossChainService } from '@runrealm/shared-blockchain/services/cross-chain-service';
import { CrossChainDemoComponent } from '../components/cross-chain-demo';
import { EnhancedRunControls } from '../components/enhanced-run-controls';
import { GameFiUI } from '../components/gamefi-ui';
import { RouteInfoPanel } from '../components/route-info-panel';
import { RunProgressFeedback } from '../components/run-progress-feedback';
import { TerritoryToggle } from '../components/territory-toggle';
import { AIOrchestrator } from '../services/ai-orchestrator';
import { AIService } from '../services/ai-service';
import { AnimationService } from '../services/animation-service';
import { DOMService } from '../services/dom-service';
import { ExternalFitnessService } from '../services/external-fitness-service';
import { GameService } from '../services/game-service';
import { GeocodingService } from '../services/geocoding-service';
import { GhostRunnerService } from '../services/ghost-runner-service';
import { HapticsService } from '../services/haptics-service';
import { LocationService } from '../services/location-service';
import { MapService } from '../services/map-service';
import { NavigationService } from '../services/navigation-service';
import { OnboardingService } from '../services/onboarding-service';
import { PreferenceService } from '../services/preference-service';
import { ProgressionService } from '../services/progression-service';
import { ReplayService } from '../services/replay-service';
import { RunTrackingService } from '../services/run-tracking-service';
import { SoundService } from '../services/sound-service';
import { TerritoryService } from '../services/territory-service';
import { UIService } from '../services/ui-service';
import { Web3Service } from '../services/web3-service';
import {
  MainUI as MainUIInterface,
  TerritoryDashboard as TerritoryDashboardInterface,
  WalletWidget as WalletWidgetInterface,
} from '../types/ui-interfaces';
import { ConfigService } from './app-config';
import { EventBus } from './event-bus';

export interface Services {
  config: ConfigService;
  eventBus: EventBus;
  preferenceService: PreferenceService;
  ui: UIService;
  dom: DOMService;
  location: LocationService;
  runTracking: RunTrackingService;
  web3: Web3Service;
  ai: AIService;
  game: GameService;
  contractService: ContractService;
  confidentialContractService: ConfidentialContractService;
  territory: TerritoryService;
  territoryToggle: TerritoryToggle;
  runProgressFeedback: RunProgressFeedback;
  progression: ProgressionService;
  onboarding: OnboardingService;
  navigation: NavigationService;
  animation: AnimationService;
  sound: SoundService;
  aiOrchestrator: AIOrchestrator;
  crossChainService: CrossChainService;
  crossChainDemo: CrossChainDemoComponent;
  mapService: MapService;
  externalFitnessService: ExternalFitnessService;
  ghostRunnerService: GhostRunnerService;
  enhancedRunControls: EnhancedRunControls;
  gamefiUI: GameFiUI;
  haptics: HapticsService;
  replay: ReplayService;
}

export interface TokenDependentServices {
  geocodingService: GeocodingService;
  routeInfoPanel: RouteInfoPanel;
}

export function createServices(): Services {
  const config = ConfigService.getInstance();
  const eventBus = EventBus.getInstance();
  const preferenceService = new PreferenceService();
  const ui = UIService.getInstance();
  const location = new LocationService();
  const web3 = Web3Service.getInstance();
  const ai = AIService.getInstance();
  const game = new GameService();
  const contractService = new ContractService(web3);
  const confidentialContractService = new ConfidentialContractService(web3);
  const territory = TerritoryService.getInstance();
  const territoryToggle = new TerritoryToggle();
  const runProgressFeedback = new RunProgressFeedback();
  const dom = DOMService.getInstance();
  const progression = ProgressionService.getInstance();
  const runTracking = new RunTrackingService();
  const onboarding = OnboardingService.getInstance();
  const navigation = NavigationService.getInstance();
  const animation = AnimationService.getInstance();
  const sound = SoundService.getInstance();
  const aiOrchestrator = AIOrchestrator.getInstance();
  const crossChainService = new CrossChainService();
  const crossChainDemo = new CrossChainDemoComponent();
  const mapService = new MapService();
  const externalFitnessService = new ExternalFitnessService();
  const ghostRunnerService = GhostRunnerService.getInstance();
  const enhancedRunControls = new EnhancedRunControls();
  const gamefiUI = GameFiUI.getInstance();
  const haptics = HapticsService.getInstance();
  const replay = ReplayService.getInstance();

  return {
    config,
    eventBus,
    preferenceService,
    ui,
    dom,
    location,
    runTracking,
    web3,
    ai,
    game,
    contractService,
    confidentialContractService,
    territory,
    territoryToggle,
    runProgressFeedback,
    progression,
    onboarding,
    navigation,
    animation,
    sound,
    aiOrchestrator,
    crossChainService,
    crossChainDemo,
    mapService,
    externalFitnessService,
    ghostRunnerService,
    enhancedRunControls,
    gamefiUI,
    haptics,
    replay,
  };
}

export function createTokenDependentServices(config: ConfigService): TokenDependentServices {
  const geocodingService = new GeocodingService(config.getConfig().mapbox.accessToken);
  const routeInfoPanel = RouteInfoPanel.getInstance();
  routeInfoPanel.initialize();
  return { geocodingService, routeInfoPanel };
}

export interface PlatformUI {
  mainUI?: MainUIInterface;
  walletWidget?: WalletWidgetInterface;
  territoryDashboard?: TerritoryDashboardInterface;
  ghostManagement?: { initialize(container: HTMLElement): Promise<void> | void };
  ghostButton?: { initialize(container: HTMLElement): void };
}

export function registerGlobalServices(services: Services, platformUI: PlatformUI = {}): void {
  if (typeof window === 'undefined') return;

  // biome-ignore lint/suspicious/noExplicitAny: dev/debug global namespace used by vanilla widgets
  const w = window as any;
  w.RunRealm = w.RunRealm ?? {};
  w.RunRealm.services = {
    config: services.config,
    eventBus: services.eventBus,
    preferenceService: services.preferenceService,
    ui: services.ui,
    dom: services.dom,
    location: services.location,
    runTracking: services.runTracking,
    territory: services.territory,
    enhancedRunControls: services.enhancedRunControls,
    gamefiUI: services.gamefiUI,
    web3: services.web3,
    ai: services.ai,
    crossChain: services.crossChainService,
    externalFitness: services.externalFitnessService,
    ghostRunnerService: services.ghostRunnerService,
    ghostManagement: platformUI.ghostManagement,
    animation: services.animation,
    navigation: services.navigation,
    onboarding: services.onboarding,
    progression: services.progression,
    game: services.game,
    contractService: services.contractService,
    // Phase 5 — registered with PascalCase to match
    // `ConfidentialTerritoryService.getSiblingService(
    // 'ConfidentialContractService')`. The other services in this
    // registry use camelCase keys; the PascalCase here is
    // intentional and matches the consumer's lookup convention.
    ConfidentialContractService: services.confidentialContractService,
    mapService: services.mapService,
  };
}
