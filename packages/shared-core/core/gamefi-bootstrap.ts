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

    if (platformUI.ghostManagement?.initialize) {
      await platformUI.ghostManagement.initialize(document.body);
    }
    if (platformUI.ghostButton?.initialize) {
      platformUI.ghostButton.initialize(document.body);
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
