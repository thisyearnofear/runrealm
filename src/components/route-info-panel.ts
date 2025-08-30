import { DOMService } from "../services/dom-service";
import { EventBus } from "../core/event-bus";

export class RouteInfoPanel {
  private static instance: RouteInfoPanel;
  private domService: DOMService;
  private eventBus: EventBus;
  private panelElement: HTMLElement | null = null;
  private isVisible: boolean = false;

  private constructor() {
    this.domService = DOMService.getInstance();
    this.eventBus = EventBus.getInstance();
    this.setupEventListeners();
  }

  static getInstance(): RouteInfoPanel {
    if (!RouteInfoPanel.instance) {
      RouteInfoPanel.instance = new RouteInfoPanel();
    }
    return RouteInfoPanel.instance;
  }

  private setupEventListeners(): void {
    // Listen for AI route ready events
    this.eventBus.on('ai:routeReady', (data: any) => {
      this.showRouteInfo(data);
    });

    // Listen for route clear events
    this.eventBus.on('ai:routeClear', () => {
      this.hide();
    });

    // Listen for route failed events
    this.eventBus.on('ai:routeFailed', (data: any) => {
      this.showErrorMessage(data.message);
    });
  }

  public initialize(): void {
    this.createPanel();
  }

  private createPanel(): void {
    this.panelElement = this.domService.createElement('div', {
      id: 'route-info-panel',
      className: 'route-info-panel',
      style: {
        position: 'absolute',
        top: '20px',
        right: '20px',
        width: '300px',
        maxHeight: '80vh',
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        zIndex: '1000',
        padding: '20px',
        display: 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: 'sans-serif'
      }
    });

    // Add close button
    const closeBtn = this.domService.createElement('button', {
      innerHTML: '×',
      style: {
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'none',
        border: 'none',
        fontSize: '24px',
        cursor: 'pointer',
        color: '#666',
        width: '30px',
        height: '30px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }
    });

    closeBtn.addEventListener('click', () => {
      this.hide();
    });

    this.panelElement.appendChild(closeBtn);

    // Add content container
    const contentContainer = this.domService.createElement('div', {
      id: 'route-info-content',
      style: {
        overflowY: 'auto',
        paddingRight: '10px'
      }
    });

    this.panelElement.appendChild(contentContainer);
    document.body.appendChild(this.panelElement);
  }

  private showRouteInfo(data: any): void {
    if (!this.panelElement) return;

    const contentContainer = this.panelElement.querySelector('#route-info-content');
    if (!contentContainer) return;

    // Clear previous content
    contentContainer.innerHTML = '';

    // Add title
    const title = this.domService.createElement('h2', {
      textContent: 'AI Suggested Route',
      style: {
        margin: '0 0 15px 0',
        color: '#333',
        fontSize: '20px',
        fontWeight: 'bold'
      }
    });
    contentContainer.appendChild(title);

    // Add route summary
    const summary = this.domService.createElement('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '20px',
        gap: '10px'
      }
    });

    const distanceBox = this.domService.createElement('div', {
      innerHTML: `
        <div style="font-size: 14px; color: #666;">Distance</div>
        <div style="font-size: 20px; font-weight: bold; color: #00bd00;">
          ${(data.distance / 1000).toFixed(2)} km
        </div>
      `,
      style: {
        textAlign: 'center',
        padding: '10px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        flex: '1'
      }
    });

    const difficultyBox = this.domService.createElement('div', {
      innerHTML: `
        <div style="font-size: 14px; color: #666;">Difficulty</div>
        <div style="font-size: 20px; font-weight: bold; color: #00bd00;">
          ${data.difficulty}/100
        </div>
      `,
      style: {
        textAlign: 'center',
        padding: '10px',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px',
        flex: '1'
      }
    });

    summary.appendChild(distanceBox);
    summary.appendChild(difficultyBox);
    contentContainer.appendChild(summary);

    // Add reasoning
    if (data.reasoning) {
      const reasoningTitle = this.domService.createElement('h3', {
        textContent: 'Route Strategy',
        style: {
          margin: '0 0 10px 0',
          color: '#333',
          fontSize: '16px'
        }
      });

      const reasoningContent = this.domService.createElement('p', {
        textContent: data.reasoning,
        style: {
          margin: '0 0 20px 0',
          color: '#666',
          fontSize: '14px',
          lineHeight: '1.5'
        }
      });

      contentContainer.appendChild(reasoningTitle);
      contentContainer.appendChild(reasoningContent);
    }

    // Add waypoints if available
    if (data.waypoints && data.waypoints.length > 0) {
      const waypointsTitle = this.domService.createElement('h3', {
        textContent: 'Strategic Waypoints',
        style: {
          margin: '0 0 10px 0',
          color: '#333',
          fontSize: '16px'
        }
      });

      const waypointsList = this.domService.createElement('ul', {
        style: {
          margin: '0 0 20px 0',
          padding: '0',
          listStyle: 'none'
        }
      });

      data.waypoints.forEach((wp: any) => {
        const waypointItem = this.domService.createElement('li', {
          innerHTML: `
            <div style="display: flex; align-items: center; margin-bottom: 10px;">
              <div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${
                wp.type === 'territory_claim' ? '#ff0000' :
                wp.type === 'rest_stop' ? '#0000ff' :
                wp.type === 'landmark' ? '#ffff00' :
                wp.type === 'strategic' ? '#ff00ff' : '#00ffff'
              }; margin-right: 10px;"></div>
              <div>
                <div style="font-weight: bold; color: #333;">${wp.name}</div>
                <div style="font-size: 12px; color: #666;">${wp.type.replace('_', ' ')}</div>
              </div>
            </div>
            ${wp.description ? `<div style="font-size: 13px; color: #666; margin-left: 30px; margin-bottom: 10px;">${wp.description}</div>` : ''}
          `
        });
        waypointsList.appendChild(waypointItem);
      });

      contentContainer.appendChild(waypointsTitle);
      contentContainer.appendChild(waypointsList);
    }

    // Add action buttons
    const actions = this.domService.createElement('div', {
      style: {
        display: 'flex',
        gap: '10px',
        marginTop: 'auto'
      }
    });

    const startBtn = this.domService.createElement('button', {
      textContent: 'Start Run',
      style: {
        flex: '1',
        padding: '12px',
        backgroundColor: '#00bd00',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px'
      }
    });

    startBtn.addEventListener('click', () => {
      this.eventBus.emit('run:startRequested', {});
      this.hide();
    });

    const saveBtn = this.domService.createElement('button', {
      textContent: 'Save Route',
      style: {
        flex: '1',
        padding: '12px',
        backgroundColor: '#f5f5f5',
        color: '#333',
        border: '1px solid #ddd',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px'
      }
    });

    actions.appendChild(startBtn);
    actions.appendChild(saveBtn);
    contentContainer.appendChild(actions);

    // Show the panel with animation
    this.show();
  }

  private showErrorMessage(message: string): void {
    if (!this.panelElement) return;

    const contentContainer = this.panelElement.querySelector('#route-info-content');
    if (!contentContainer) return;

    // Clear previous content
    contentContainer.innerHTML = '';

    // Add error message
    const errorTitle = this.domService.createElement('h2', {
      textContent: 'Route Generation Failed',
      style: {
        margin: '0 0 15px 0',
        color: '#ff0000',
        fontSize: '20px',
        fontWeight: 'bold'
      }
    });

    const errorMessage = this.domService.createElement('p', {
      textContent: message,
      style: {
        margin: '0 0 20px 0',
        color: '#666',
        fontSize: '14px',
        lineHeight: '1.5'
      }
    });

    const retryBtn = this.domService.createElement('button', {
      textContent: 'Try Again',
      style: {
        padding: '12px',
        backgroundColor: '#00bd00',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px',
        width: '100%'
      }
    });

    retryBtn.addEventListener('click', () => {
      this.eventBus.emit('ai:routeRequested', {});
      this.hide();
    });

    contentContainer.appendChild(errorTitle);
    contentContainer.appendChild(errorMessage);
    contentContainer.appendChild(retryBtn);

    // Show the panel
    this.show();
  }

  private show(): void {
    if (!this.panelElement) return;

    this.panelElement.style.display = 'flex';
    this.isVisible = true;

    // Add slide-in animation
    this.panelElement.style.opacity = '0';
    this.panelElement.style.transform = 'translateX(20px)';

    setTimeout(() => {
      if (this.panelElement) {
        this.panelElement.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        this.panelElement.style.opacity = '1';
        this.panelElement.style.transform = 'translateX(0)';
      }
    }, 10);
  }

  public hide(): void {
    if (!this.panelElement || !this.isVisible) return;

    this.panelElement.style.opacity = '0';
    this.panelElement.style.transform = 'translateX(20px)';

    setTimeout(() => {
      if (this.panelElement) {
        this.panelElement.style.display = 'none';
        this.isVisible = false;
      }
    }, 300);
  }
}