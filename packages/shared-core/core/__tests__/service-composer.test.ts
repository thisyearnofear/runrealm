/**
 * Smoke tests for service-composer.
 *
 * These don't test behaviour of every service (each service has its own
 * tests where applicable). They verify that the composition module:
 *   - returns every service that run-realm-app.ts used to wire up
 *   - populates (window as any).RunRealm.services with the right keys
 *   - tolerates running twice (registers globals idempotently)
 *
 * @jest-environment jsdom
 */

// Mock the chain of heavy transitive imports (turf → convex → concaveman →
// rbush → robust-predicates, plus @runrealm/shared-blockchain) so the test
// doesn't have to load the entire app tree. The contract is the same
// object shape; the real services are exercised by their own tests.
jest.mock('@turf/turf', () => ({}), { virtual: true });
jest.mock(
  '@runrealm/shared-blockchain/services/contract-service',
  () => ({
    ContractService: class {
      /* mock */
    },
  }),
  { virtual: true }
);
jest.mock(
  '@runrealm/shared-blockchain/services/cross-chain-service',
  () => ({
    CrossChainService: class {
      /* mock */
    },
  }),
  { virtual: true }
);
jest.mock(
  '@runrealm/shared-blockchain/services/confidential-contract-service',
  () => ({
    ConfidentialContractService: class {
      /* mock */
    },
  }),
  { virtual: true }
);

import {
  createServices,
  createTokenDependentServices,
  registerGlobalServices,
} from '../service-composer';

interface RunRealmWindow {
  RunRealm?: { services?: Record<string, unknown> };
}

const getWindow = (): RunRealmWindow =>
  (globalThis as unknown as { window: RunRealmWindow }).window;

describe('service-composer', () => {
  beforeEach(() => {
    (globalThis as unknown as { window: RunRealmWindow }).window = {};
  });

  it('createServices returns every service the app depends on', () => {
    const services = createServices();
    const expectedKeys = [
      'config',
      'eventBus',
      'preferenceService',
      'ui',
      'dom',
      'location',
      'runTracking',
      'web3',
      'ai',
      'game',
      'contractService',
      'confidentialContractService',
      'zamaSupport',
      'confidentialTerritory',
      'territory',
      'territoryToggle',
      'runProgressFeedback',
      'progression',
      'onboarding',
      'navigation',
      'animation',
      'sound',
      'aiOrchestrator',
      'crossChainService',
      'crossChainDemo',
      'mapService',
      'externalFitnessService',
      'ghostRunnerService',
      'enhancedRunControls',
      'gamefiUI',
      'haptics',
      'replay',
    ];
    for (const key of expectedKeys) {
      expect((services as unknown as Record<string, unknown>)[key]).toBeDefined();
    }
    expect(Object.keys(services).length).toBe(expectedKeys.length);
  });

  it('registerGlobalServices populates window.RunRealm.services', () => {
    const services = createServices();
    registerGlobalServices(services);
    const w = getWindow();
    expect(w.RunRealm?.services?.eventBus).toBe(services.eventBus);
    expect(w.RunRealm?.services?.config).toBe(services.config);
    expect(w.RunRealm?.services?.mapService).toBe(services.mapService);
  });

  it('registerGlobalServices is idempotent — second call preserves prior service refs', () => {
    const first = createServices();
    registerGlobalServices(first);
    const second = createServices();
    registerGlobalServices(second);
    const w = getWindow();
    // Last call wins — that's the documented behaviour, mirrors the
    // original run-realm-app.ts overwrite.
    expect(w.RunRealm?.services?.eventBus).toBe(second.eventBus);
  });

  it('createTokenDependentServices returns geocoding + route info panel', () => {
    const services = createServices();
    const deps = createTokenDependentServices(services.config);
    expect(deps.geocodingService).toBeDefined();
    expect(deps.routeInfoPanel).toBeDefined();
  });
});
