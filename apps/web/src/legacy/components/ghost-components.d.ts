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


