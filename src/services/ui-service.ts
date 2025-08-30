import { DOMService } from "./dom-service";
import { AnimationService } from "./animation-service";

export interface ToastOptions {
  type?: "info" | "success" | "warning" | "error";
  duration?: number;
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
    if (!this.toastContainer) return;

    const {
      type = "info",
      duration = 5000,
      action
    } = options;

    const toast = this.domService.createElement("div", {
      className: `toast toast-${type}`,
      style: {
        maxWidth: "350px",
        padding: "16px 20px",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        opacity: "0",
        transform: "translateX(100%)",
        transition: "all 0.3s ease",
        fontFamily: "sans-serif",
        fontSize: "14px",
        fontWeight: "500",
        color: "#333",
        backgroundColor: this.getToastBackgroundColor(type),
        borderLeft: `4px solid ${this.getToastBorderColor(type)}`,
      },
    });

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

    // Animate in
    setTimeout(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(0)";
    }, 10);

    // Auto remove after duration
    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(toast);
      }, duration);
    }
  }

  private getToastBackgroundColor(type: string): string {
    switch (type) {
      case "success":
        return "#e6f4ea";
      case "warning":
        return "#fef7e0";
      case "error":
        return "#fce8e6";
      default:
        return "#f0f4f8";
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

  public cleanup(): void {
    if (this.toastContainer && this.toastContainer.parentElement) {
      this.toastContainer.parentElement.removeChild(this.toastContainer);
    }
  }
}