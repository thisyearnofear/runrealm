export declare class PerformanceService {
    private static instance;
    private observers;
    private metrics;
    private constructor();
    static getInstance(): PerformanceService;
    private initializePerformanceMonitoring;
    private observeWebVitals;
    private observeCustomMetrics;
    private measureTimeToInteractive;
    private measureBundleMetrics;
    private setupMemoryMonitoring;
    debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void;
    throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void;
    lazyLoad<T>(loader: () => Promise<T>, condition?: () => boolean): Promise<T>;
    preloadResource(url: string, type?: 'script' | 'style' | 'image'): void;
    optimizeImage(img: HTMLImageElement): void;
    getMetrics(): Record<string, number>;
    reportMetrics(): void;
    private sendToAnalytics;
    cleanup(): void;
    checkPerformanceBudget(): {
        passed: boolean;
        violations: string[];
    };
}
