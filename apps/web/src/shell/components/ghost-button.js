import { DOMService } from '@runrealm/shared-core/services/dom-service';

export class GhostButton {
  constructor(ghostManagement) {
    this.ghostManagement = ghostManagement;
    this.domService = DOMService.getInstance();
    this.button = null;
  }

  initialize(parentElement) {
    this.button = this.domService.createElement('button', {
      className: 'ghost-button',
      innerHTML: '👻',
      title: 'Ghost Runners',
    });

    this.button.addEventListener('click', () => {
      this.ghostManagement.toggle();
    });

    parentElement.appendChild(this.button);
  }
}
