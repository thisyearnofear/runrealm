import { UIService } from "@runrealm/shared-core/services/ui-service";
import { DOMService } from "@runrealm/shared-core/services/dom-service";
import { EnhancedOnboarding } from "@runrealm/shared-core/components/enhanced-onboarding";
import { AccessibilityEnhancer } from "@runrealm/shared-core/components/accessibility-enhancer";
import { AnimationService } from "@runrealm/shared-core/services/animation-service";
import { WidgetSystem } from "@runrealm/shared-core/components/widget-system";
import { ExternalFitnessIntegration } from "@runrealm/shared-core/components/external-fitness-integration";

/**
 * UIEffectsManager - Handles UI effects, animations, onboarding, and accessibility
 */
export class UIEffectsManager {
  private uiService: UIService;
  private domService: DOMService;
  private animationService: AnimationService;
  private widgetSystem: WidgetSystem;
  private enhancedOnboarding!: EnhancedOnboarding;
  private accessibilityEnhancer!: AccessibilityEnhancer;
  private externalFitnessIntegration: ExternalFitnessIntegration | null = null;

  constructor(
    uiService: UIService,
    domService: DOMService,
    animationService: AnimationService,
    widgetSystem: WidgetSystem
  ) {
    this.uiService = uiService;
    this.domService = domService;
    this.animationService = animationService;
    this.widgetSystem = widgetSystem;
  }

  /**
   * Initialize onboarding and accessibility components
   */
  async initialize(): Promise<void> {
    // Initialize enhanced onboarding
    this.enhancedOnboarding = new EnhancedOnboarding(
      this.domService,
      this.animationService,
      this.uiService,
      {
        showProgress: true,
        allowSkip: true,
        autoAdvance: false,
        hapticFeedback: true,
      }
    );
    await this.enhancedOnboarding.initialize();
    console.log("UIEffectsManager: Enhanced onboarding initialized");

    // Initialize accessibility enhancer
    this.accessibilityEnhancer = new AccessibilityEnhancer(this.domService, {
      enableKeyboardNavigation: true,
      enableScreenReaderSupport: true,
      enableHighContrastMode: true,
      enableFocusIndicators: true,
      announceChanges: true,
    });
    await this.accessibilityEnhancer.initialize();
    console.log("UIEffectsManager: Accessibility enhancer initialized");
  }

  /**
   * Show welcome experience for new users
   */
  showWelcomeExperience(): void {
    // Check if user is new or wants to see onboarding
    const isNewUser = !localStorage.getItem("runrealm_welcomed");
    const urlParams = new URLSearchParams(window.location.search);
    const forceOnboarding =
      urlParams.get("onboarding") === "true" ||
      urlParams.get("onboarding") === "reset";

    if (isNewUser || forceOnboarding) {
      setTimeout(() => {
        this.enhancedOnboarding.startOnboarding();
        if (isNewUser) {
          localStorage.setItem("runrealm_welcomed", "true");
        }
      }, 1500);
    }
  }

  /**
   * Show welcome tooltips to guide new users
   */
  showWelcomeTooltips(): void {
    const tooltips = [
      {
        target: "#location-btn",
        message: "Set your location to see nearby territories",
        position: "bottom",
      },
      {
        target: "#gamefi-toggle",
        message: "Enable GameFi mode to earn rewards and claim territories",
        position: "bottom",
      },
      {
        target: "#action-panel",
        message: "Use these controls to plan and track your runs",
        position: "left",
      },
    ];

    this.showTooltipSequence(tooltips);
  }

  /**
   * Show sequential tooltips without overlays
   */
  private showTooltipSequence(tooltips: any[]): void {
    // Implementation for showing sequential tooltips
    // This would create and animate tooltip elements
  }

  /**
   * Show help modal
   */
  showHelpModal(): void {
    // Implementation for help modal
  }

  /**
   * Show external fitness integration panel
   */
  showExternalFitnessIntegration(): void {
    if (!this.externalFitnessIntegration) {
      // Create container if it doesn't exist
      let container = document.getElementById('external-fitness-container');
      if (!container) {
        container = this.domService.createElement('div', {
          id: 'external-fitness-container',
          parent: document.body
        });
      }

      this.externalFitnessIntegration = new ExternalFitnessIntegration(container);
    }

    this.externalFitnessIntegration.show();
  }

  /**
   * Add immediate visual feedback to button clicks
   */
  addButtonFeedback(button: HTMLElement): void {
    // Visual feedback
    button.style.transform = "scale(0.95)";
    button.style.transition = "transform 0.1s ease";

    // Haptic feedback for mobile
    this.triggerHapticFeedback("light");

    setTimeout(() => {
      button.style.transform = "scale(1)";
    }, 100);
  }

  /**
   * Trigger haptic feedback on supported devices
   */
  triggerHapticFeedback(
    type: "light" | "medium" | "heavy" = "light"
  ): void {
    try {
      // Modern browsers with Vibration API
      if ("vibrate" in navigator) {
        const patterns = {
          light: [10],
          medium: [20],
          heavy: [30],
        };
        navigator.vibrate(patterns[type]);
      }

      // iOS Safari haptic feedback (if available)
      if ("hapticFeedback" in window) {
        (window as any).hapticFeedback(type);
      }
    } catch (error) {
      // Haptic feedback not supported, silently continue
    }
  }

  /**
   * Show loading state for AI actions
   */
  showAILoadingState(action: string, button: HTMLElement): void {
    const widget = this.widgetSystem.getWidget("ai-coach");
    if (!widget) return;

    const actionName = action === "ai.requestRoute" ? "route" : "ghost runner";
    const loadingHtml = `
      <div class="widget-tip widget-loading">
        🤖 Generating ${actionName}...
        <br><small>This may take a few seconds</small>
        <div class="loading-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="widget-buttons">
        <button class="widget-button" disabled style="opacity: 0.6; cursor: not-allowed;">
          📍 Suggest Route
        </button>
        <button class="widget-button secondary" disabled style="opacity: 0.6; cursor: not-allowed;">
          👻 Ghost Runner
        </button>
      </div>
    `;

    this.widgetSystem.updateWidget("ai-coach", loadingHtml);

    // Set a timeout to clear loading state if no response comes back
    setTimeout(() => {
      this.clearStuckLoadingState();
    }, 10000); // 10 second timeout
  }

  /**
   * Hide loading state
   */
  hideAILoadingState(): void {
    const widget = this.widgetSystem.getWidget("ai-coach");
    if (!widget) return;

    // Don't restore content here - let the success/error handlers manage it
  }

  /**
   * Clear stuck loading state and restore default AI coach content
   */
  clearStuckLoadingState(): void {
    const widget = this.widgetSystem.getWidget("ai-coach");
    if (!widget) return;

    // Check if still showing loading state
    const widgetElement = this.widgetSystem.getWidgetElement("ai-coach");
    const content = widgetElement?.innerHTML || "";
    if (content.includes("widget-loading")) {
      console.log("UIEffectsManager: Clearing stuck AI loading state");
      const errorHtml = `
        <div class="widget-tip error">
          🤖 Request timed out
          <br><small>Please try again or check your connection.</small>
        </div>
        <div class="widget-section">
          <div class="widget-section-title">🧭 Route Planning</div>
          <div class="widget-buttons">
            <button class="widget-button" data-action="ai.requestRoute" data-payload='{"goals":["exploration"]}'>
              📍 Suggest Route
            </button>
          </div>
        </div>
        <div class="widget-section">
          <div class="widget-section-title">👻 Ghost Runner</div>
          <div class="widget-buttons">
            <button class="widget-button secondary" data-action="ai.requestGhostRunner" data-payload='{"difficulty":50}'>
              👻 Summon Ghost
            </button>
          </div>
        </div>
      `;
      this.widgetSystem.updateWidget("ai-coach", errorHtml);
    }
  }

  /**
   * Add celebration effect for successful AI actions
   */
  addCelebrationEffect(): void {
    const widget = this.widgetSystem.getWidget("ai-coach");
    if (!widget) {
      console.warn("UIEffectsManager: AI coach widget not found for celebration");
      return;
    }

    const widgetElement = this.widgetSystem.getWidgetElement("ai-coach");
    if (!widgetElement) {
      console.warn("UIEffectsManager: AI coach widget element not found for celebration");
      return;
    }

    if (!widgetElement.classList) {
      console.warn("UIEffectsManager: Widget element invalid for celebration");
      return;
    }

    // Prevent multiple celebrations
    if (widgetElement.classList.contains("celebrating")) return;

    // Add celebration class
    widgetElement.classList.add("celebrating");

    // Use requestAnimationFrame for better performance
    requestAnimationFrame(() => {
      // Create floating particles
      const particleCount = window.innerWidth < 768 ? 3 : 6; // Fewer particles on mobile
      for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement("div");
        particle.className = "celebration-particle";
        particle.style.cssText = `
          position: absolute;
          width: 6px;
          height: 6px;
          background: linear-gradient(45deg, #00ff00, #00aa00);
          border-radius: 50%;
          pointer-events: none;
          z-index: 1000;
          left: ${Math.random() * 100}%;
          top: 50%;
          animation: celebrationFloat 1.5s ease-out forwards;
        `;

        widgetElement.appendChild(particle);

        // Remove particle after animation
        setTimeout(() => {
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
        }, 1500);
      }
    });

    // Remove celebration class after animation
    setTimeout(() => {
      if (widgetElement && widgetElement.classList) {
        widgetElement.classList.remove("celebrating");
      }
    }, 1500);
  }

  /**
   * Toggle GameFi mode
   */
  toggleGameFiMode(isGameFiMode: boolean, updateGameFiToggle: (enabled: boolean) => void, widgetCreator: any): boolean {
    const newMode = !isGameFiMode;
    console.log(`UIEffectsManager: Toggling GameFi mode to: ${newMode}`);

    if (newMode) {
      // Enable GameFi mode with widgets
      document.body.classList.add("gamefi-mode");
      widgetCreator.createGameFiWidgets();
      updateGameFiToggle(true);
      this.uiService.showToast("🎮 GameFi enabled", { type: "success" });
      console.log(
        "UIEffectsManager: GameFi widgets created:",
        // Debug for widget system
      );
    } else {
      // Disable GameFi mode and remove widgets
      document.body.classList.remove("gamefi-mode");
      widgetCreator.removeGameFiWidgets();
      updateGameFiToggle(false);
      this.uiService.showToast("🎮 GameFi disabled", { type: "info" });
      console.log("UIEffectsManager: GameFi widgets removed");
    }
    
    return newMode;
  }

  // Getters for services that need to be accessed externally
  getOnboarding(): EnhancedOnboarding {
    return this.enhancedOnboarding;
  }

  getAccessibilityEnhancer(): AccessibilityEnhancer {
    return this.accessibilityEnhancer;
  }
}