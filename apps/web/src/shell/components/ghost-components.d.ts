declare module './ghost-management.js' {
  import { BaseService } from '@runrealm/shared-core/core/base-service';
  export class GhostManagement extends BaseService {
    constructor();
    initialize(parentElement?: HTMLElement): Promise<void>;
    toggle(): void;
  }
}

declare module './ghost-button.js' {
  import { GhostManagement } from './ghost-management.js';
  export class GhostButton {
    constructor(ghostManagement: GhostManagement);
    initialize(parentElement?: HTMLElement): void;
  }
}

// Re-export declarations for consumers outside this directory (e.g. the
// bootstrap entry point imports from ../shell/components/*.js).
declare module '../shell/components/ghost-management.js' {
  export { GhostManagement } from './ghost-management.js';
}

declare module '../shell/components/ghost-button.js' {
  export { GhostButton } from './ghost-button.js';
}


