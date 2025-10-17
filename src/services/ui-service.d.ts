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
export declare class UIService {
    private static instance;
    private domService;
    private animationService;
    private toastContainer;
    private celebrationEffects;
    private contextualMessages;
    private constructor();
    static getInstance(): UIService;
    private createToastContainer;
    showToast(message: string, options?: ToastOptions): void;
    private getEnhancedBackground;
    private getEnhancedTextColor;
    private getEnhancedShadow;
    private getToastBorderColor;
    private getToastIcon;
    private removeToast;
    /**
     * Enhanced loading message with context
     */
    showContextualLoading(context: string): void;
    /**
     * Enhanced success message with celebration
     */
    showContextualSuccess(context: string, data?: any): void;
    /**
     * Enhanced error message with helpful solutions
     */
    showContextualError(context: string, originalError?: string): void;
    private getContextualMessage;
    private getSuccessMessage;
    private getErrorMessage;
    private playContextualSound;
    private createCelebrationEffect;
    cleanup(): void;
}
