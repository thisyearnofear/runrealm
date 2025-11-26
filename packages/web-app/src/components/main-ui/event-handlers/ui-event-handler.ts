import { DOMService } from "@runrealm/shared-core/services/dom-service";
import { LocationService } from "@runrealm/shared-core/services/location-service";
import { UIService } from "@runrealm/shared-core/services/ui-service";
import { WalletWidget } from "../../wallet-widget";
import { WidgetSystem } from "@runrealm/shared-core/components/widget-system";
import { WidgetCreator } from "../widget-managers/widget-creator";
import { Web3Service } from "@runrealm/shared-core/services/web3-service";
import { RouteStateService } from "@runrealm/shared-core/services/route-state-service";
import { EventBus } from "@runrealm/shared-core/core/event-bus";

/**
 * EventHandler - Handles all UI event handling logic
 */
export class EventHandler {
  private domService: DOMService;
  private locationService: LocationService;
  private uiService: UIService;
  private walletWidget: WalletWidget;
  private widgetSystem: WidgetSystem;
  private widgetCreator: WidgetCreator;
  private web3Service: Web3Service;
  private routeStateService: RouteStateService;
  private eventSubscribers: Array<(event: string, data?: any) => void> = [];
  private eventListeners: Array<() => void> = [];
  private eventCallbacks: Map<string, Array<(data?: any) => void>> = new Map();

  constructor(
    domService: DOMService,
    locationService: LocationService,
    walletWidget: WalletWidget,
    uiService: UIService,
    widgetSystem: WidgetSystem,
    widgetCreator: WidgetCreator | null, // Allow null initially
    web3Service: Web3Service,
  ) {
    this.domService = domService;
    this.locationService = locationService;
    this.walletWidget = walletWidget;
    this.uiService = uiService;
    this.widgetSystem = widgetSystem;
    this.widgetCreator = widgetCreator!;
    this.web3Service = web3Service;
    this.routeStateService = RouteStateService.getInstance();
  }

  setWidgetCreator(widgetCreator: WidgetCreator) {
    this.widgetCreator = widgetCreator;
  }

  // Event system methods
  subscribe(event: string, callback: (data?: any) => void): void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, []);
    }
    this.eventCallbacks.get(event)?.push(callback);
  }

  protected safeEmit(event: string, data?: any): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }

  /**
   * Setup event handlers for the main UI
   */
  setupEventHandlers(): void {
    // Header buttons
    this.domService.delegate(document.body, "#location-btn", "click", () => {
      this.locationService.showLocationModal();
      this.trackUserAction("location_button_clicked");
    });

    this.domService.delegate(document.body, "#wallet-btn", "click", () => {
      this.walletWidget.showWalletModal();
      this.trackUserAction("wallet_button_clicked");
    });

    // Action panel
    this.domService.delegate(document.body, "#panel-toggle", "click", () => {
      this.toggleActionPanel();
    });

    // Floating action button
    this.domService.delegate(document.body, "#fab-main", "click", () => {
      this.toggleFabMenu();
    });

    this.domService.delegate(document.body, ".fab-option", "click", (event) => {
      const action = (event.target as HTMLElement).dataset.action;
      this.handleFabAction(action!);
    });

    this.domService.delegate(
      document.body,
      ".import-activities-btn",
      "click",
      () => {
        this.showExternalFitnessIntegration();
        this.trackUserAction("import_activities_clicked");
      },
    );

    this.domService.delegate(
      document.body,
      "#set-location-btn",
      "click",
      () => {
        this.locationService.getCurrentLocation();
      },
    );

    this.domService.delegate(
      document.body,
      "#search-location-btn",
      "click",
      () => {
        this.locationService.showLocationModal();
      },
    );

    this.domService.delegate(
      document.body,
      "#connect-wallet-btn",
      "click",
      () => {
        this.walletWidget.showWalletModal();
      },
    );

    // Centralized UI action routing with enhanced UX
    this.domService.delegate(
      document.body,
      "[data-action]",
      "click",
      async (event) => {
        console.log(
          "MainUI: Click detected on element with data-action:",
          event.target,
        );

        const target = (event.target as HTMLElement).closest(
          "[data-action]",
        ) as HTMLElement | null;
        if (!target) {
          console.log("MainUI: No data-action target found");
          return;
        }

        const action = target.getAttribute("data-action");
        const payloadAttr = target.getAttribute("data-payload");
        let payload: any = undefined;
        if (payloadAttr) {
          try {
            payload = JSON.parse(payloadAttr);
          } catch {
            payload = undefined;
          }
        }

        // Add immediate visual feedback
        this.addButtonFeedback(target);

        // Show loading state for AI actions
        if (action?.startsWith("ai.")) {
          this.showAILoadingState(action, target);
        }

        console.log(
          "MainUI: Dispatching action:",
          action,
          "with payload:",
          payload,
        );

        try {
          const { ActionRouter } = await import(
            "@runrealm/shared-core/ui/action-router"
          );
          ActionRouter.dispatch(action as any, payload);
        } catch (err) {
          console.error("Failed to dispatch UI action", action, err);
          this.hideAILoadingState();
        }
      },
    );

    // Listen for service events
    this.subscribe("location:changed", (locationInfo) => {
      // This will be handled by the status manager
    });

    // Listen for GPS status updates from actual location usage
    this.subscribe("location:updated" as any, (data: any) => {
      // This will be handled by the status manager
    });

    this.subscribe("location:error" as any, () => {
      // This will be handled by the status manager
    });

    // Check GPS status when it actually matters
    this.subscribe("run:startRequested" as any, () => {
      // This will be handled by the status manager
    });

    // GPS button clicks should update status
    this.domService.delegate(
      document.body,
      "#set-location-btn",
      "click",
      () => {
        // This will be handled by the status manager
      },
    );

    // Manual GPS status refresh
    this.domService.delegate(
      document.body,
      "#refresh-status-btn",
      "click",
      () => {
        // This will be handled by the status manager
      },
    );

    // Monitor network status changes
    window.addEventListener("online", () => {
      // This will be handled by the status manager
    });

    window.addEventListener("offline", () => {
      // This will be handled by the status manager
    });

    this.subscribe("web3:walletConnected", (walletInfo) => {
      // This will be handled by the status manager
    });

    // GameFiUI -> MainUI integration events
    this.subscribe("ui:gamefiEnabled", () => {
      // Ensure GameFi widgets are present (idempotent if already created)
    });

    this.subscribe("ui:territoryPreview", (data) => {
      // Update territory-info widget with preview details
      this.widgetCreator.updateTerritoryWidget(data);
    });

    this.subscribe("web3:walletDisconnected", () => {
      // This will be handled by the status manager
    });

    // AI route events -> render planned route and update widget
    this.subscribe("ai:routeReady", (data) => {
      try {
        const coordinates = data.waypoints?.map((p) => [p.lng, p.lat]) || [];
        const geojson = {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates },
        };
        this.safeEmit("run:plannedRouteChanged", { geojson });

        const km = (data.totalDistance || 0) / 1000;
        const etaMin = data.estimatedTime
          ? Math.round(data.estimatedTime / 60)
          : undefined;
        const diffLabel =
          typeof data.difficulty === "number"
            ? data.difficulty < 33
              ? "Easy"
              : data.difficulty < 67
                ? "Medium"
                : "Hard"
            : "—";
        const statsHtml = `
          <div class="widget-stat"><span class="widget-stat-label">Planned Distance</span><span class="widget-stat-value">${km.toFixed(
            2,
          )} km</span></div>
          <div class="widget-stat"><span class="widget-stat-label">Difficulty</span><span class="widget-stat-value">${diffLabel}</span></div>
          ${
            etaMin !== undefined
              ? `<div class="widget-stat"><span class="widget-stat-label">ETA</span><span class="widget-stat-value">~${etaMin} min</span></div>`
              : ""
          }
          <div class="widget-buttons">
            <button class="widget-button" id="start-run-btn">▶️ Start Run</button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>👻 Start Ghost Runner</button>
          </div>`;

        this.widgetSystem.updateWidget("territory-info", statsHtml);
        const w = this.widgetSystem.getWidget("territory-info");
        if (w && w.minimized) this.widgetSystem.toggleWidget("territory-info");
      } catch (e) {
        console.error("Failed to render planned route", e);
      }
    });

    this.subscribe("ai:routeFailed", (data: { message: string }) => {
      const errorMessage = data?.message || "Unknown error occurred";
      this.uiService.showToast("🤖 AI route failed", { type: "error" });
      const tip = `<div class="widget-tip">🤖 Could not generate a route. ${
        errorMessage.includes("API key")
          ? "Please check your AI configuration."
          : "Try again in a moment or adjust your goals."
      }</div>`;
      this.widgetSystem.updateWidget("territory-info", tip);
    });

    // Handle AI service initialization errors
    this.subscribe(
      "service:error",
      (data: { service: string; context: string; error: string }) => {
        if (data.service === "AIService") {
          console.log("MainUI: AI Service error:", data.error);
          this.hideAILoadingState();

          // Show user-friendly error in AI coach widget
          const widget = this.widgetSystem.getWidget("ai-coach");
          if (widget) {
            const errorHtml = `
            <div class="widget-tip error animate-in">
              🤖 AI service unavailable
              <br><small>Check your API configuration or try again later.</small>
            </div>
            <div class="widget-buttons">
              <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
                📍 Suggest Route
              </button>
              <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
                👻 Ghost Runner
              </button>
            </div>
          `;
            this.widgetSystem.updateWidget("ai-coach", errorHtml);
          }
        }
      },
    );

    // Handle AI service events
    this.subscribe(
      "ai:ghostRunnerGenerated",
      (data: {
        runner: any;
        difficulty: number;
        success?: boolean;
        fallback?: boolean;
      }) => {
        console.log("MainUI: Ghost runner generated:", data.runner.name);
        const widget = this.widgetSystem.getWidget("ai-coach");
        if (widget) {
          const fallbackText = data.fallback ? " (Fallback)" : "";
          const successHtml = `
          <div class="widget-tip success animate-in">
            👻 ${data.runner.name}${fallbackText} is ready to race!
            <br><small>Difficulty: ${data.difficulty}% • ${
              data.runner.specialAbility
            }</small>
            <br><small class="ghost-backstory">${data.runner.backstory}</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Suggest Route
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":${Math.min(
              data.difficulty + 10,
              100,
            )}}'>
              👻 Harder Ghost
            </button>
            <button class="widget-button tertiary" onclick="this.closest('.widget').querySelector('.widget-tip').classList.toggle('expanded')">
              📜 Details
            </button>
          </div>
        `;
          this.widgetSystem.updateWidget("ai-coach", successHtml, {
            success: true,
          });

          // Add celebration effect
          this.addCelebrationEffect();
          this.triggerHapticFeedback("medium");
        }
      },
    );

    this.subscribe(
      "ai:ghostRunnerFailed" as any,
      (data: { message: string }) => {
        console.log("MainUI: Ghost runner generation failed:", data.message);
        this.hideAILoadingState();
        const widget = this.widgetSystem.getWidget("ai-coach");
        if (widget) {
          const errorHtml = `
          <div class="widget-tip error animate-in">
            👻 Ghost runner creation failed: ${data.message}
            <br><small>Try again or check your AI configuration.</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Suggest Route
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
              👻 Try Again
            </button>
          </div>
        `;
          this.widgetSystem.updateWidget("ai-coach", errorHtml);
        }
      },
    );

    // Handle route generation success
    this.subscribe(
      "ai:routeReady" as any,
      (data: {
        route: any;
        distance: number;
        duration: number;
        waypoints?: any[];
        totalDistance?: number;
        difficulty?: number;
        estimatedTime?: number;
      }) => {
        console.log("MainUI: Route generated successfully:", data);
        this.hideAILoadingState();
        const widget = this.widgetSystem.getWidget("ai-coach");
        if (widget) {
          const waypointSummary =
            data.waypoints && data.waypoints.length > 0
              ? `${data.waypoints.length} strategic waypoints`
              : `${data.waypoints ? data.waypoints.length : 0} waypoints`;

          const successHtml = `
          <div class="widget-tip success animate-in">
            📍 Perfect route found! ${waypointSummary}, ${Math.round(
              data.distance,
            )}m
            <br><small>Difficulty: ${
              data.difficulty || 50
            }% • Territory opportunities along route</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button primary" data-action="ai.showRoute" data-payload='{"coordinates":${JSON.stringify(
              data.route,
            )}}'>
              🗺️ Show on Map
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":${
              data.difficulty || 50
            }}'>
              👻 Add Ghost
            </button>
            <button class="widget-button tertiary" onclick="this.closest('.widget').querySelector('.widget-tip').classList.toggle('expanded')">
              📜 Details
            </button>
          </div>
        `;
          this.widgetSystem.updateWidget("ai-coach", successHtml, {
            success: true,
          });

          // Add celebration effect
          this.addCelebrationEffect();
          this.triggerHapticFeedback("medium");
        }
      },
    );

    // Handle route generation failure
    this.subscribe("ai:routeFailed", (data: { message: string }) => {
      console.log("MainUI: Route generation failed:", data.message);
      this.hideAILoadingState();
      const widget = this.widgetSystem.getWidget("ai-coach");
      if (widget) {
        const errorHtml = `
          <div class="widget-tip error animate-in">
            📍 Route generation failed: ${data.message}
            <br><small>Try adjusting your goals or check your connection.</small>
          </div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Try Again
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
              👻 Ghost Runner
            </button>
          </div>
        `;
        this.widgetSystem.updateWidget("ai-coach", errorHtml);
      }
    });

    // Handle service errors
    this.subscribe(
      "service:error",
      (data: { service: string; context: string; error: string }) => {
        if (data.service === "AIService") {
          console.log("MainUI: AI Service error:", data.error);
          const widget = this.widgetSystem.getWidget("ai-coach");
          if (widget) {
            let errorMessage = "Service temporarily unavailable";
            if (data.error.includes("API key")) {
              errorMessage = "API key not configured properly";
            } else if (data.error.includes("disabled")) {
              errorMessage = "AI features are disabled";
            } else if (data.error.includes("connection")) {
              errorMessage = "Cannot connect to AI service";
            }

            const errorHtml = `
            <div class="widget-tip error">
              🤖 AI Service Issue: ${errorMessage}
              <br><small>Context: ${data.context}</small>
              <br><small>Try using fallback features or check your configuration.</small>
            </div>
            <div class="widget-buttons">
              <button class="widget-button secondary" onclick="location.reload()">
                🔄 Reload App
              </button>
            </div>
          `;
            this.widgetSystem.updateWidget("ai-coach", errorHtml);
          }
        }
      },
    );
  }

  /**
   * Listen for route state changes to update widgets
   */
  setupRouteStateListeners(): void {
    // Listen for route state changes to update widgets
    this.subscribe(
      "route:stateChanged",
      (data: { routeId: string; routeData: any; isActive: boolean }) => {
        if (data.isActive) {
          // Update territory-info widget with route details
          const km =
            (data.routeData.totalDistance || data.routeData.distance || 0) /
            1000;
          const etaMin = data.routeData.estimatedTime
            ? Math.round(data.routeData.estimatedTime / 60)
            : undefined;
          const diffLabel =
            typeof data.routeData.difficulty === "number"
              ? data.routeData.difficulty < 33
                ? "Easy"
                : data.routeData.difficulty < 67
                  ? "Medium"
                  : "Hard"
              : "—";

          const statsHtml = `
          <div class="widget-stat"><span class="widget-stat-label">Planned Distance</span><span class="widget-stat-value">${km.toFixed(
            2,
          )} km</span></div>
          <div class="widget-stat"><span class="widget-stat-label">Difficulty</span><span class="widget-stat-value">${diffLabel}</span></div>
          ${
            etaMin !== undefined
              ? `<div class="widget-stat"><span class="widget-stat-label">ETA</span><span class="widget-stat-value">~${etaMin} min</span></div>`
              : ""
          }
          <div class="widget-tip success">
            🎉 Route ready! Click "Start Run" to begin.
          </div>
          <div class="widget-buttons">
            <button class="widget-button primary" data-action="ai.startRun" data-payload='{"coordinates":${JSON.stringify(
              data.routeData.coordinates,
            )}, "distance": ${
              data.routeData.totalDistance || data.routeData.distance
            }}'>
              ▶️ Start Run
            </button>
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":${
              data.routeData.difficulty || 50
            }}'>
              👻 Start Ghost Runner
            </button>
          </div>`;

          this.widgetSystem.updateWidget("territory-info", statsHtml);
          const w = this.widgetSystem.getWidget("territory-info");
          if (w && w.minimized)
            this.widgetSystem.toggleWidget("territory-info");
        }
      },
    );

    // Listen for route cleared events
    this.subscribe("route:cleared", () => {
      // Reset territory-info widget to default state
      const defaultHtml = `
        <div class="widget-tip">
          🗺️ Click on the map to preview territories
        </div>
        <div class="widget-buttons">
          <button class="widget-button" id="claim-territory-btn" disabled>
            ⚡ Claim Territory
          </button>
          <button class="widget-button secondary" id="analyze-btn">
            🤖 AI Analysis
          </button>
        </div>
      `;
      this.widgetSystem.updateWidget("territory-info", defaultHtml);
    });
  }

  // Settings widget event handlers
  setupSettingsEventHandlers(): void {
    // Wire actions
    this.domService.delegate(
      document.body,
      "#restart-onboarding-widget",
      "click",
      async () => {
        console.log("MainUI: Restarting onboarding...");

        // Add visual feedback
        const button = document.getElementById("restart-onboarding-widget");
        if (button) {
          const originalText = button.textContent;
          button.textContent = "🔄 Starting...";
          button.style.opacity = "0.6";

          setTimeout(() => {
            button.textContent = originalText;
            button.style.opacity = "1";
          }, 1000);
        }

        // Use enhanced onboarding restart method
        // This will be handled by the UI effects module
      },
    );

    // GameFi toggle from settings
    this.domService.delegate(
      document.body,
      "#gamefi-toggle-widget",
      "click",
      (e) => {
        const target = e.target as HTMLElement;
        const isEnabled =
          localStorage.getItem("runrealm_gamefi_enabled") === "true";
        const newState = !isEnabled;

        localStorage.setItem("runrealm_gamefi_enabled", String(newState));
        EventBus.getInstance().emit("gamefi:toggled", { enabled: newState });

        // Update button visual state
        target.classList.toggle("active", newState);
        target.textContent = newState ? "Disable GameFi" : "Enable GameFi";

        this.uiService.showToast(
          newState ? "GameFi features enabled" : "GameFi features disabled",
          { type: "info" },
        );
      },
    );

    // Widget visibility toggles
    this.domService.delegate(
      document.body,
      "#toggle-location",
      "change",
      (e) => {
        const target = e.target as HTMLInputElement;
        EventBus.getInstance().emit("visibility:changed", {
          elementId: "widget-location-info",
          visible: target.checked,
        });
      },
    );

    this.domService.delegate(document.body, "#toggle-wallet", "change", (e) => {
      const target = e.target as HTMLInputElement;
      EventBus.getInstance().emit("visibility:changed", {
        elementId: "widget-wallet-info",
        visible: target.checked,
      });
    });

    // Rewards visibility preference toggle
    this.domService.delegate(
      document.body,
      "#toggle-rewards-hide-until-connected",
      "change",
      (e) => {
        const target = e.target as HTMLInputElement;
        // Store preference: checked means hide until connected
        localStorage.setItem(
          "runrealm_rewards_hide_until_connected",
          target.checked ? "true" : "false",
        );
        // Notify rewards UI to react immediately
        this.safeEmit("rewards:settingsChanged" as any, {});
        // Update settings widget to reflect any state change
        // this.widgetSystem.updateWidget("settings", this.getSettingsContent());
      },
    );
  }

  private toggleActionPanel(): void {
    const panel = document.getElementById("action-panel");
    if (panel) {
      panel.classList.toggle("collapsed");
    }
  }

  private toggleFabMenu(): void {
    const menu = document.getElementById("fab-menu");
    if (menu) {
      menu.style.display = menu.style.display === "none" ? "flex" : "none";
    }
  }

  private handleFabAction(action: string): void {
    switch (action) {
      case "location":
        this.locationService.showLocationModal();
        break;
      case "wallet":
        this.walletWidget.showWalletModal();
        break;
      case "help":
        // This will be handled by the UI effects module
        break;
    }
    this.toggleFabMenu(); // Close menu after action
  }

  private trackUserAction(action: string): void {
    // Analytics tracking
    console.log(`User action: ${action}`);
  }

  // Helper methods to maintain compatibility
  private subscribe(event: string, callback: (data?: any) => void): void {
    // Subscribe to service events using the base service pattern
    // This would connect to the actual event system
    if ((this as any).addEventListener) {
      (this as any).addEventListener(event, callback);
    }
  }

  private safeEmit(event: string, data?: any): void {
    // Emit service events using the base service pattern
    // This would connect to the actual event system
    if ((this as any).dispatchEvent) {
      const eventObj = new CustomEvent(event, { detail: data });
      (this as any).dispatchEvent(eventObj);
    }
  }

  private addButtonFeedback(button: HTMLElement): void {
    // This will be handled by the UI effects module
  }

  private showAILoadingState(action: string, button: HTMLElement): void {
    // This will be handled by the UI effects module
  }

  private hideAILoadingState(): void {
    // This will be handled by the UI effects module
  }

  private addCelebrationEffect(): void {
    // This will be handled by the UI effects module
  }

  private triggerHapticFeedback(
    type: "light" | "medium" | "heavy" = "light",
  ): void {
    // This will be handled by the UI effects module
  }

  private showExternalFitnessIntegration(): void {
    // This will be handled by the UI effects module
  }
}
