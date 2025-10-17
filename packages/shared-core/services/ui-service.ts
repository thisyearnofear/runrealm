import { DOMService } from "./dom-service";
import { AnimationService } from "./animation-service";

export interface ToastOptions {
  type?: "info" | "success" | "warning" | "error" | "loading";
  duration?: number;
  showProgress?: boolean;
  contextual?: boolean;
  celebration?: boolean;
  haptic?: boolean;
  sound?: boolean;
  action?: {
    text: string;
    callback: () => void;
  };
}

export class UIService {
  private static instance: UIService;
  private domService: DOMService;
  private animationService: AnimationService;
  private toastContainer: HTMLElement | null = null;
  private celebrationEffects: HTMLElement[] = [];
  private contextualMessages = {
    aiRoute: [
      "🤖 AI is crafting your perfect route...",
      "🧠 Analyzing terrain and your preferences...",
      "🗺️ Finding the most scenic path for you...",
      "⚡ Optimizing route for maximum enjoyment..."
    ],
    walletConnect: [
      "🦊 Connecting to your wallet...",
      "🔐 Establishing secure connection...",
      "🌐 Syncing with blockchain...",
      "✨ Almost ready to go..."
    ],
    territoryLoad: [
      "🗺️ Loading nearby territories...",
      "🏆 Scanning for claimable areas...",
      "📍 Mapping your running realm...",
      "🌟 Discovering opportunities..."
    ],
    crossChain: [
      "🌐 Processing cross-chain magic...",
      "⚡ Bridging between networks...",
      "🔗 Synchronizing across chains...",
      "🚀 Universal contract working..."
    ]
  };

  private constructor() {
    this.domService = DOMService.getInstance();
    this.animationService = AnimationService.getInstance();
    this.createToastContainer();
  }

  static getInstance(): UIService {
    if (!UIService.instance) {
      UIService.instance = new UIService();
    }
    return UIService.instance;
  }

  private createToastContainer(): void {
    this.toastContainer = this.domService.createElement("div", {
      id: "toast-container",
      style: {
        position: "fixed",
        top: "20px",
        right: "20px",
        zIndex: "10000",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      },
    });
    document.body.appendChild(this.toastContainer);
  }

  public showToast(
    message: string,
    options: ToastOptions = {}
  ): void {
    // Enhanced contextual messages
    if (options.contextual && this.contextualMessages[message as keyof typeof this.contextualMessages]) {
      const messages = this.contextualMessages[message as keyof typeof this.contextualMessages];
      message = messages[Math.floor(Math.random() * messages.length)];
    }
    if (!this.toastContainer) return;

    const {
      type = "info",
      duration = 5000,
      showProgress = false,
      celebration = false,
      haptic = false,
      sound = false,
      action
    } = options;

    // Enhanced feedback effects
    if (haptic && 'vibrate' in navigator) {
      const patterns = {
        info: [50],
        success: [100, 50, 100],
        warning: [200],
        error: [300, 100, 300]
      };
      navigator.vibrate(patterns[type as keyof typeof patterns] || [50]);
    }

    if (sound) {
      this.playContextualSound(type);
    }

    const toast = this.domService.createElement("div", {
      className: `toast toast-${type} ${celebration ? 'celebrating' : ''}`,
      style: {
        maxWidth: "350px",
        padding: "16px 20px",
        borderRadius: "12px",
        boxShadow: this.getEnhancedShadow(type),
        display: "flex",
        alignItems: "center",
        gap: "12px",
        opacity: "0",
        transform: "translateX(100%)",
        transition: "all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        fontSize: "14px",
        fontWeight: "500",
        color: this.getEnhancedTextColor(type),
        background: this.getEnhancedBackground(type),
        border: `1px solid ${this.getToastBorderColor(type)}`,
        borderLeft: `4px solid ${this.getToastBorderColor(type)}`,
        backdropFilter: "blur(10px)",
      },
    });

    // Add progress bar if requested
    if (showProgress && type === 'loading') {
      const progressBar = this.domService.createElement("div", {
        className: "toast-progress",
        style: {
          position: "absolute",
          bottom: "0",
          left: "0",
          height: "3px",
          background: this.getToastBorderColor(type),
          borderRadius: "0 0 12px 12px",
          animation: "toastProgress 3s linear",
        },
      });
      toast.style.position = "relative";
      toast.appendChild(progressBar);
    }

    // Add icon based on type
    const icon = this.domService.createElement("div", {
      innerHTML: this.getToastIcon(type),
      style: {
        fontSize: "20px",
        flexShrink: "0",
      },
    });

    // Add message
    const messageEl = this.domService.createElement("div", {
      textContent: message,
      style: {
        flex: "1",
        wordBreak: "break-word",
      },
    });

    toast.appendChild(icon);
    toast.appendChild(messageEl);

    // Add action button if provided
    if (action) {
      const actionBtn = this.domService.createElement("button", {
        textContent: action.text,
        style: {
          background: "none",
          border: "none",
          color: this.getToastBorderColor(type),
          fontWeight: "bold",
          cursor: "pointer",
          padding: "4px 8px",
          borderRadius: "4px",
          flexShrink: "0",
        },
      });

      actionBtn.addEventListener("click", () => {
        action.callback();
        this.removeToast(toast);
      });

      toast.appendChild(actionBtn);
    }

    // Add close button
    const closeBtn = this.domService.createElement("button", {
      innerHTML: "×",
      style: {
        background: "none",
        border: "none",
        fontSize: "20px",
        cursor: "pointer",
        color: "#999",
        padding: "0",
        width: "24px",
        height: "24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: "0",
      },
    });

    closeBtn.addEventListener("click", () => {
      this.removeToast(toast);
    });

    toast.appendChild(closeBtn);
    this.toastContainer.appendChild(toast);

    // Enhanced animation in
    setTimeout(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(0)";
      
      // Add celebration effects if requested
      if (celebration) {
        this.createCelebrationEffect(toast);
      }
    }, 10);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(toast);
      }, duration);
    }
  }

  private getEnhancedBackground(type: string): string {
    switch (type) {
      case "success":
        return "linear-gradient(135deg, rgba(40, 167, 69, 0.1), rgba(32, 201, 151, 0.05))";
      case "warning":
        return "linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(253, 126, 20, 0.05))";
      case "error":
        return "linear-gradient(135deg, rgba(220, 53, 69, 0.1), rgba(231, 76, 60, 0.05))";
      case "loading":
        return "linear-gradient(135deg, rgba(0, 123, 255, 0.1), rgba(13, 202, 240, 0.05))";
      default:
        return "linear-gradient(135deg, rgba(23, 162, 184, 0.1), rgba(13, 202, 240, 0.05))";
    }
  }

  private getEnhancedTextColor(type: string): string {
    switch (type) {
      case "success":
        return "#ffffff";
      case "warning":
        return "#ffffff";
      case "error":
        return "#ffffff";
      case "loading":
        return "#ffffff";
      default:
        return "#ffffff";
    }
  }

  private getEnhancedShadow(type: string): string {
    const baseShallow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    switch (type) {
      case "success":
        return `${baseShallow}, 0 0 20px rgba(40, 167, 69, 0.2)`;
      case "warning":
        return `${baseShallow}, 0 0 20px rgba(255, 193, 7, 0.2)`;
      case "error":
        return `${baseShallow}, 0 0 20px rgba(220, 53, 69, 0.2)`;
      case "loading":
        return `${baseShallow}, 0 0 20px rgba(0, 123, 255, 0.2)`;
      default:
        return baseShallow;
    }
  }

  private getToastBorderColor(type: string): string {
    switch (type) {
      case "success":
        return "#00bd00";
      case "warning":
        return "#ffb300";
      case "error":
        return "#ff5252";
      default:
        return "#5f6368";
    }
  }

  private getToastIcon(type: string): string {
    switch (type) {
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      case "loading":
        return "⏳";
      default:
        return "ℹ️";
    }
  }

  private removeToast(toast: HTMLElement): void {
    if (!toast.parentElement) return;

    // Animate out
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";

    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 300);
  }

  /**
   * Enhanced loading message with context
   */
  public showContextualLoading(context: string): void {
    const message = this.getContextualMessage(context);
    this.showToast(message, {
      type: 'loading',
      duration: 0, // Don't auto-hide loading messages
      showProgress: true,
      contextual: true
    });
  }

  /**
   * Enhanced success message with celebration
   */
  public showContextualSuccess(context: string, data?: any): void {
    const message = this.getSuccessMessage(context, data);
    this.showToast(message, {
      type: 'success',
      duration: 5000,
      celebration: true,
      haptic: true,
      sound: true
    });
  }

  /**
   * Enhanced error message with helpful solutions
   */
  public showContextualError(context: string, originalError?: string): void {
    const errorInfo = this.getErrorMessage(context, originalError);
    this.showToast(errorInfo.message, {
      type: 'error',
      duration: 8000,
      haptic: true,
      sound: true,
      action: errorInfo.actionText ? {
        text: errorInfo.actionText,
        callback: () => console.log('Error action:', errorInfo.action)
      } : undefined
    });
  }

  private getContextualMessage(context: string): string {
    const messages = this.contextualMessages[context as keyof typeof this.contextualMessages] || [
      "⏳ Working on it...",
      "🔄 Processing your request...",
      "✨ Making magic happen..."
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private getSuccessMessage(context: string, data?: any): string {
    const successMessages = {
      territoryClaimedFirst: "🎉 First Territory Claimed! You're now a true RunRealm explorer!",
      territoryClaimed: `🏆 Territory Claimed! ${data?.territoryName || 'New territory'} is now part of your running realm.`,
      runCompleted: `💪 Run Completed! Great job covering ${data?.distance || 'some distance'} in ${data?.time || 'your time'}!`,
      aiRouteGenerated: `🤖 Perfect Route Found! AI crafted a ${data?.distance || 'custom'} route optimized for your goals.`,
      walletConnected: `🦊 Wallet Connected! Successfully connected ${data?.walletType || 'your wallet'}.`,
      crossChainSuccess: "🌐 Cross-Chain Success! Your transaction completed successfully across networks!"
    };
    return successMessages[context as keyof typeof successMessages] || "✅ Success! Operation completed successfully!";
  }

  private getErrorMessage(context: string, originalError?: string): { message: string; action?: string; actionText?: string } {
    const errorMessages = {
      aiServiceDown: {
        message: "🤖 AI Coach Taking a Break. Try manual route planning or check back in a few minutes.",
        action: "Try manual route planning",
        actionText: "Plan Manually"
      },
      walletNotFound: {
        message: "🦊 Wallet Not Detected. Install MetaMask or connect your preferred wallet to access GameFi features.",
        action: "Install MetaMask",
        actionText: "Get MetaMask"
      },
      locationDenied: {
        message: "📍 Location Access Needed. Enable location in your browser settings for territory features.",
        action: "Enable location access",
        actionText: "How to Enable"
      },
      networkError: {
        message: "🌐 Connection Issue. Check your internet connection and try again.",
        action: "Check connection and retry",
        actionText: "Retry"
      }
    };
    return errorMessages[context as keyof typeof errorMessages] || {
      message: originalError || "⚠️ Something went wrong. Please try again.",
      action: "Try again",
      actionText: "Retry"
    };
  }

  private playContextualSound(type: string): void {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const sounds = {
        success: { frequency: 800, duration: 200 },
        error: { frequency: 300, duration: 400 },
        warning: { frequency: 600, duration: 300 },
        info: { frequency: 600, duration: 150 },
        loading: { frequency: 500, duration: 100 }
      };

      const sound = sounds[type as keyof typeof sounds] || sounds.info;
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(sound.frequency, audioContext.currentTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + sound.duration / 1000);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + sound.duration / 1000);
    } catch (error) {
      console.debug('Audio context not supported:', error);
    }
  }

  private createCelebrationEffect(element: HTMLElement): void {
    const colors = ['#00ff00', '#00cc00', '#00ff88', '#ffffff', '#ffff00'];
    const particleCount = 15;

    for (let i = 0; i < particleCount; i++) {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        width: 6px;
        height: 6px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        border-radius: 50%;
        pointer-events: none;
        z-index: 10000;
        animation: celebrationFloat 1.5s ease-out forwards;
      `;

      const rect = element.getBoundingClientRect();
      particle.style.left = `${rect.left + rect.width / 2}px`;
      particle.style.top = `${rect.top + rect.height / 2}px`;

      document.body.appendChild(particle);
      this.celebrationEffects.push(particle);

      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
        const index = this.celebrationEffects.indexOf(particle);
        if (index > -1) {
          this.celebrationEffects.splice(index, 1);
        }
      }, 1500);
    }
  }

  public cleanup(): void {
    if (this.toastContainer && this.toastContainer.parentElement) {
      this.toastContainer.parentElement.removeChild(this.toastContainer);
    }
    
    // Clean up celebration effects
    this.celebrationEffects.forEach(effect => {
      if (effect.parentNode) {
        effect.parentNode.removeChild(effect);
      }
    });
    this.celebrationEffects = [];
  }
}