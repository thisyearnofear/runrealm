declare module './ghost-management.js' {
  import { BaseService } from '@runrealm/shared-core/core/base-service';
  export class GhostManagement extends BaseService {
    constructor();
    initialize(parentElement?: HTMLElement): Promise<void>;
    toggle(): void;
  }
}

declare module '../shell/components/ghost-management.js' {
  export { GhostManagement } from './ghost-management.js';
}


