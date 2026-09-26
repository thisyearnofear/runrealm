/**
 * GameFi services initialization.
 *
 * Extracted from `initializeGameFiServices()`. All the async
 * post-construction setup that depends on config + injected
 * platform UI lives here. Errors are surfaced via toast but do
 * not abort the rest of the boot.
 */
import type { PlatformUI, Services } from './service-composer';

export interface GameFiBootstrapOptions {
  services: Services;
  platformUI: PlatformUI;
  gameMode: boolean;
}

export async function initializeGameFi(opts: GameFiBootstrapOptions): Promise<void> {
  const { services, platformUI, gameMode } = opts;

  try {
    await services.location.initialize();
    services.runTracking.setLocationService(services.location);
    await services.runTracking.initialize();
    await services.territory.initialize();
    // Sunprint Atlas semantic layer. WorldState subscribes before Orbis so
    // the director receives only canonical, privacy-preserving snapshots.
    await services.worldState.initialize();
    await services.orbisDirector.initialize();
    await services.enhancedRunControls.initialize();

    if (services.config.isWeb3Enabled()) {
      await (services.web3 as { initialize(): Promise<void> }).initialize();
      if (platformUI.walletWidget?.initialize) {
        await platformUI.walletWidget.initialize();
      }
      await services.crossChainService.initialize();
    }

    await services.ai.initializeService();
    await services.gamefiUI.initialize();
    await services.ghostRunnerService.initialize();

    // UX loop services: OS notifications for decay/race results and
    // GPS-verified Territory Walk visits. Both degrade gracefully.
    await services.notificationService.initialize();
    await services.territoryWalkService.initialize();

    // Phase 6: cross-chain anchor relayer. Degrades to a no-op unless
    // RUNREALM_CROSS_CHAIN_ANCHOR_ADDRESS is configured; start() only
    // begins polling when configured (operator/relayer context).
    await services.crossChainAnchorService.initialize();
    if (services.crossChainAnchorService.isConfigured()) {
      services.crossChainAnchorService.start();
    }

    if (platformUI.ghostManagement?.initialize) {
      await platformUI.ghostManagement.initialize(document.body);
    }

    if (platformUI.territoryDashboard) {
      console.log('Using platform-provided territory dashboard');
    } else {
      console.warn('Territory dashboard not provided by platform. GameFi mode will be limited.');
    }

    if (gameMode) {
      services.gamefiUI.enableGameFiMode();
    }
  } catch (error) {
    console.error('Failed to initialize GameFi services:', error);
    services.ui.showToast('Some GameFi features may not be available', {
      type: 'warning',
    });
  }
}
