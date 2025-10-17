// Interface for platform-specific UI initialization
export interface UIInitializer {
  initialize(): Promise<void>;
  cleanup(): void;
}

// Interface for the main UI component
export interface MainUI extends UIInitializer {
  initialize(): Promise<void>;
  cleanup(): void;
  showWalletModal?(): void;
}

// Interface for wallet widget
export interface WalletWidget extends UIInitializer {
  initialize(): Promise<void>;
  cleanup(): void;
  showWalletModal?(): void;
  getCurrentWallet?(): any;
}

// Interface for territory dashboard
export interface TerritoryDashboard extends UIInitializer {
  initialize(container: HTMLElement): void;
  cleanup(): void;
}