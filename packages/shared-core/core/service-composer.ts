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
 *   aiOrchestrator, crossChain, mapService,
 *   externalFitness, ghostRunner, enhancedRunControls, gamefiUI,
 *   geocodingService, routeInfoPanel.
 *
 * Token-dependent services (geocoding, route info) get a separate
 * call so the mapbox access token can be loaded from runtime first.
 */

import { ConfidentialContractService } from '@runrealm/shared-blockchain/services/confidential-contract-service';
import { ContractService } from '@runrealm/shared-blockchain/services/contract-service';
import { CrossChainAnchorService } from '@runrealm/shared-blockchain/services/cross-chain-anchor-service';
import { CrossChainService } from '@runrealm/shared-blockchain/services/cross-chain-service';
import { RivalTerritoryService } from '@runrealm/shared-blockchain/services/rival-territory-service';
import { ZamaSupportService } from '@runrealm/shared-blockchain/services/zama-support';
import { EnhancedRunControls } from '../components/enhanced-run-controls';
import { GameFiUI } from '../components/gamefi-ui';
import { RouteInfoPanel } from '../components/route-info-panel';
import { RunProgressFeedback } from '../components/run-progress-feedback';
import { TerritoryToggle } from '../components/territory-toggle';
import { AccountService } from '../services/account-service';
import { AIOrchestrator } from '../services/ai-orchestrator';
import { AIService } from '../services/ai-service';
import { AnimationService } from '../services/animation-service';
import { AttestationService } from '../services/attestation-service';
import { BountyService } from '../services/bounty-service';
import { ConfidentialTerritoryService } from '../services/confidential-territory-service';
import { DOMService } from '../services/dom-service';
import { ExternalFitnessService } from '../services/external-fitness-service';
import { GameService } from '../services/game-service';
import { GeocodingService } from '../services/geocoding-service';
import { GhostRunnerService } from '../services/ghost-runner-service';
import { HapticsService } from '../services/haptics-service';
import { LocationService } from '../services/location-service';
import { MapService } from '../services/map-service';
import { NavigationService } from '../services/navigation-service';
import { NotificationService } from '../services/notification-service';
import { OnboardingService } from '../services/onboarding-service';
import { OrbisDirector } from '../services/orbis-director';
import { PreferenceService } from '../services/preference-service';
import { ProgressionService } from '../services/progression-service';
import { ReplayService } from '../services/replay-service';
import { RunTrackingService } from '../services/run-tracking-service';
import { ScreenWakeService } from '../services/screen-wake-service';
import { SoundService } from '../services/sound-service';
import { TerritoryService } from '../services/territory-service';
import { TerritoryWalkService } from '../services/territory-walk-service';
import { UIService } from '../services/ui-service';
import { Web3Service } from '../services/web3-service';
import { WorldStateService } from '../services/world-state-service';
import {
  MainUI as MainUIInterface,
  TerritoryDashboard as TerritoryDashboardInterface,
  WalletWidget as WalletWidgetInterface,
} from '../types/ui-interfaces';
import { ConfigService } from './app-config';
import { EventBus } from './event-bus';
import { registerServiceRegistry } from './service-registry';

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
  zamaSupport: ZamaSupportService;
  confidentialTerritory: ConfidentialTerritoryService;
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
  mapService: MapService;
  externalFitnessService: ExternalFitnessService;
  ghostRunnerService: GhostRunnerService;
  bountyService: BountyService;
  accountService: AccountService;
  attestationService: AttestationService;
  enhancedRunControls: EnhancedRunControls;
  gamefiUI: GameFiUI;
  haptics: HapticsService;
  replay: ReplayService;
  notificationService: NotificationService;
  territoryWalkService: TerritoryWalkService;
  crossChainAnchorService: CrossChainAnchorService;
  rivalTerritoryService: RivalTerritoryService;
  worldState: WorldStateService;
  orbisDirector: OrbisDirector;
  screenWake: ScreenWakeService;
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
  const zamaSupport = ZamaSupportService.getInstance();
  const confidentialTerritory = ConfidentialTerritoryService.getInstance();
  confidentialTerritory.setZamaSupport(zamaSupport);
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
  const mapService = new MapService();
  const externalFitnessService = new ExternalFitnessService();
  const ghostRunnerService = GhostRunnerService.getInstance();
  const bountyService = BountyService.getInstance();
  const accountService = AccountService.getInstance();
  const attestationService = AttestationService.getInstance();
  const enhancedRunControls = new EnhancedRunControls();
  const gamefiUI = GameFiUI.getInstance();
  const haptics = HapticsService.getInstance();
  const replay = ReplayService.getInstance();
  const notificationService = NotificationService.getInstance();
  const territoryWalkService = TerritoryWalkService.getInstance();
  const crossChainAnchorService = CrossChainAnchorService.getInstance();
  const rivalTerritoryService = RivalTerritoryService.getInstance();
  const worldState = WorldStateService.getInstance();
  const orbisDirector = OrbisDirector.getInstance();
  const screenWake = ScreenWakeService.getInstance();

  // The AI service needs somewhere to ask "where is the runner?" when it
  // generates a route. It used to reach through `window.RunRealm` for this,
  // and two of the three names it looked for were never assigned by
  // anything — so the only reason it worked at all was a third global set
  // during boot. The device position is available right here, so wire it
  // here. `RunRealmApp` re-supplies the source after the map boots to add
  // the map centre, which cannot exist yet at this point.
  ai.setLocationSource({
    getCurrentLocation: () => location.getCurrentLocation(),
  });

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
    zamaSupport,
    confidentialTerritory,
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
    mapService,
    externalFitnessService,
    ghostRunnerService,
    bountyService,
    accountService,
    attestationService,
    enhancedRunControls,
    gamefiUI,
    haptics,
    replay,
    notificationService,
    territoryWalkService,
    crossChainAnchorService,
    rivalTerritoryService,
    worldState,
    orbisDirector,
    screenWake,
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
}

/**
 * Build the service graph and publish it twice: once to the module registry
 * that services resolve siblings through, and once to `window.RunRealm` for
 * the console.
 *
 * The window half is a DEBUG HANDLE, not a wiring mechanism. It is
 * genuinely useful — `window.RunRealm.services.territory` in a console on a
 * live deployment is how you answer "is the map actually empty, or did
 * nothing render?" without shipping a build — so it stays, in every
 * environment, in production.
 *
 * No application code may read it. Consumers take their dependencies as
 * constructor arguments, or resolve siblings through
 * `core/service-registry`, which works the same in a browser, under SSR and
 * in the mobile app. `scripts/check/no-window-runrealm.mjs` fails the build
 * if a read creeps back, so this stays a handle rather than drifting into a
 * dependency.
 */
export function registerGlobalServices(services: Services, platformUI: PlatformUI = {}): void {
  const registry = {
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
    zamaSupport: services.zamaSupport,
    confidentialTerritory: services.confidentialTerritory,
    account: services.accountService,
    attestation: services.attestationService,
    mapService: services.mapService,
    notificationService: services.notificationService,
    territoryWalkService: services.territoryWalkService,
    crossChainAnchorService: services.crossChainAnchorService,
    worldState: services.worldState,
    orbisDirector: services.orbisDirector,
  };

  // The registry services actually read. Published first and unconditionally:
  // it has to work under SSR and in the mobile app, not only in a browser.
  registerServiceRegistry(registry);

  if (typeof window === 'undefined') return;

  // biome-ignore lint/suspicious/noExplicitAny: dev/debug global namespace used by vanilla widgets
  const w = window as any;
  w.RunRealm = w.RunRealm ?? {};
  // The same object, mirrored. Reading it is a debug affordance; writing to
  // it from page script is not a supported way to change behaviour.
  w.RunRealm.services = registry;
}
