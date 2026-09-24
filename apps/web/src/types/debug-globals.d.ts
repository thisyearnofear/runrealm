/**
 * Ambient types for RunRealm's runtime globals.
 *
 * `window.RunRealm` is a debug bag that the app instance is assigned to and
 * `RunRealmApp.exposeGlobals()` patches at runtime; `window.runRealmApp` is the
 * app instance itself. Declaring them once here keeps shell code free of
 * `(window as any)` casts while staying honest about the fact that every member
 * only exists after initialization (hence: everything optional).
 */

import type { RunRealmApp } from '@runrealm/shared-core/core/run-realm-app';
import type { Root } from 'react-dom/client';

/** The slice of the runtime service registry that shell code actually reads. */
export interface RunRealmServiceRegistry {
  /** Wallet/chain access. */
  web3?: {
    isConnected(): boolean;
    getCurrentWallet(): { address: string; chainId: number };
    getChainId(): Promise<number> | number;
    getSigner(): unknown;
  };
  /** ZetaChain cross-chain demo surface. */
  crossChain?: {
    getChainName(chainId: number): string;
    demonstrateZetaChainAPI(): void;
  };
  eventBus?: { emit(event: string, payload: unknown): void };
  /** Phase 5 encrypted-contract wiring, initialized during boot. */
  ConfidentialContractService?: { initialize(): Promise<void> | void };
  /** GPS run-tracking controls widget. */
  enhancedRunControls?: { initializeWidget(): void };
  /** Territory walk flow. */
  territoryWalkService?: { startWalk(territoryId: string): void };
  /** Zama FHE support probes. */
  zamaSupport?: { chainSupportsZama(chainId: number): boolean };
  /** Encrypted territory operations. */
  confidentialTerritory?: {
    boostEncrypted(territoryId: string, amount: number): Promise<unknown>;
    contestEncrypted(territoryId: string, amount: number): Promise<unknown>;
    myDefenseCipher(territoryId: string): Promise<bigint | null>;
  };
}

/** Shape of the legacy debug bag at `window.RunRealm`. */
export interface RunRealmDebugGlobal {
  services?: RunRealmServiceRegistry;
  /** Patched on by `exposeGlobals()`; only surfaced through dev tooling. */
  mainUI?: {
    walletWidget?: { showWalletModal(): void };
  };
}

/** EIP-1193-ish provider injected by browser wallets. */
export interface InjectedEthereumProvider {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  request?(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

declare global {
  interface Window {
    /** Dev-only React root bridging the legacy wallet modal. */
    reactWalletRoot?: Root;
    /** App instance handle; also read by legacy widgets on unload. */
    runRealmApp?: RunRealmApp;
    /** Legacy debug bag (see RunRealmDebugGlobal). */
    RunRealm?: RunRealmDebugGlobal;
    /** Dev console helper (development only). */
    debugWidgets?: () => unknown;
    /** Buildathon demo helper (development only). */
    demoCrossChainFunctionality?: () => Promise<void>;
    /** Browser-injected wallet provider. */
    ethereum?: InjectedEthereumProvider;
    /** iOS Safari haptic bridge, when present. */
    hapticFeedback?: (type: string) => void;
  }
}
