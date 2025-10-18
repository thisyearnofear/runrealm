// Export core services
export * from './services/territory-service';
export * from './services/location-service';
export * from './services/run-tracking-service';
export * from './services/game-service';
export * from './services/progression-service';
export * from './services/ai-service';
export * from './services/ai-orchestrator';
export * from './services/map-service';
export * from './services/dom-service';
export * from './services/user-context-service';
export * from './services/external-fitness-service';
export * from './services/animation-service';
// Note: contract-service and cross-chain-service are in shared-blockchain package
export * from './services/navigation-service';
export * from './services/onboarding-service';
export * from './services/route-state-service';
export * from './services/sound-service';
export * from './services/ui-service';
export * from './services/web3-service';
export * from './services/preference-service';
export * from './services/achievement-service';
// export * from './services/next-segment-service'; // Removed - legacy/unused in mobile
export * from './services/geocoding-service';

// Export core infrastructure
export * from './core/base-service';
export * from './core/event-bus';
export * from './core/app-config';
export * from './core/run-realm-app';

// Export shared components
export * from './components/widget-system'; // Used by web app
export * from './components/mobile-widget-service';
export * from './components/touch-gesture-service';
// export * from './components/enhanced-onboarding'; // Legacy - not used by either app
// export * from './components/gamefi-ui'; // Legacy - not used by either app
export * from './components/territory-toggle';
export * from './components/run-progress-feedback';
export * from './components/enhanced-run-controls'; // Used by web app RunRealmApp
export * from './components/route-info-panel';
export * from './components/cross-chain-demo';
// Note: status-indicator, transaction-status, visibility-service, widget-state-service removed (legacy/unused)

// Export types
export * from './types/ui-interfaces';