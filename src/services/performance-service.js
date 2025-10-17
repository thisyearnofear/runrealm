// Performance optimization service
export class PerformanceService {
    constructor() {
        this.observers = new Map();
        this.metrics = new Map();
        this.initializePerformanceMonitoring();
    }
    static getInstance() {
        if (!PerformanceService.instance) {
            PerformanceService.instance = new PerformanceService();
        }
        return PerformanceService.instance;
    }
    initializePerformanceMonitoring() {
        // Monitor Core Web Vitals
        this.observeWebVitals();
        // Monitor custom metrics
        this.observeCustomMetrics();
        // Setup memory monitoring
        this.setupMemoryMonitoring();
    }
    observeWebVitals() {
        try {
            // Largest Contentful Paint
            const lcpObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                const lastEntry = entries[entries.length - 1];
                this.metrics.set('LCP', lastEntry.startTime);
            });
            lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
            this.observers.set('lcp', lcpObserver);
            // First Input Delay
            const fidObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    this.metrics.set('FID', entry.processingStart - entry.startTime);
                });
            });
            fidObserver.observe({ entryTypes: ['first-input'] });
            this.observers.set('fid', fidObserver);
            // Cumulative Layout Shift
            let clsValue = 0;
            const clsObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach((entry) => {
                    if (!entry.hadRecentInput) {
                        clsValue += entry.value;
                        this.metrics.set('CLS', clsValue);
                    }
                });
            });
            clsObserver.observe({ entryTypes: ['layout-shift'] });
            this.observers.set('cls', clsObserver);
        }
        catch (error) {
            console.warn('Performance monitoring not supported:', error);
        }
    }
    observeCustomMetrics() {
        // Time to Interactive
        this.measureTimeToInteractive();
        // Bundle size metrics
        this.measureBundleMetrics();
    }
    measureTimeToInteractive() {
        const startTime = performance.now();
        // Measure when the app becomes interactive
        const checkInteractive = () => {
            if (document.readyState === 'complete') {
                const tti = performance.now() - startTime;
                this.metrics.set('TTI', tti);
            }
            else {
                requestAnimationFrame(checkInteractive);
            }
        };
        checkInteractive();
    }
    measureBundleMetrics() {
        // Measure resource loading times
        window.addEventListener('load', () => {
            const resources = performance.getEntriesByType('resource');
            let totalSize = 0;
            let jsSize = 0;
            let cssSize = 0;
            resources.forEach((resource) => {
                if (resource.transferSize) {
                    totalSize += resource.transferSize;
                    if (resource.name.endsWith('.js')) {
                        jsSize += resource.transferSize;
                    }
                    else if (resource.name.endsWith('.css')) {
                        cssSize += resource.transferSize;
                    }
                }
            });
            this.metrics.set('totalBundleSize', totalSize);
            this.metrics.set('jsBundleSize', jsSize);
            this.metrics.set('cssBundleSize', cssSize);
        });
    }
    setupMemoryMonitoring() {
        // Monitor memory usage if available
        if ('memory' in performance) {
            setInterval(() => {
                const memory = performance.memory;
                this.metrics.set('memoryUsed', memory.usedJSHeapSize);
                this.metrics.set('memoryLimit', memory.jsHeapSizeLimit);
            }, 30000); // Check every 30 seconds
        }
    }
    // Debounce utility for performance
    debounce(func, wait) {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    // Throttle utility for performance
    throttle(func, limit) {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    // Lazy loading utility
    lazyLoad(loader, condition = () => true) {
        return new Promise((resolve, reject) => {
            if (condition()) {
                loader().then(resolve).catch(reject);
            }
            else {
                // Wait for condition to be true
                const checkCondition = () => {
                    if (condition()) {
                        loader().then(resolve).catch(reject);
                    }
                    else {
                        requestAnimationFrame(checkCondition);
                    }
                };
                checkCondition();
            }
        });
    }
    // Preload critical resources
    preloadResource(url, type = 'script') {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = url;
        switch (type) {
            case 'script':
                link.as = 'script';
                break;
            case 'style':
                link.as = 'style';
                break;
            case 'image':
                link.as = 'image';
                break;
        }
        document.head.appendChild(link);
    }
    // Optimize images
    optimizeImage(img) {
        // Add loading="lazy" for images below the fold
        const rect = img.getBoundingClientRect();
        if (rect.top > window.innerHeight) {
            img.loading = 'lazy';
        }
        // Use appropriate image format
        if ('loading' in HTMLImageElement.prototype) {
            img.loading = 'lazy';
        }
    }
    // Bundle splitting helpers - removed unimplemented chunk loading
    // Dynamic imports are handled by webpack automatically
    // Performance metrics reporting
    getMetrics() {
        return Object.fromEntries(this.metrics);
    }
    reportMetrics() {
        const metrics = this.getMetrics();
        // Log metrics in development
        if (process.env.NODE_ENV === 'development') {
            console.table(metrics);
        }
        // Send to analytics in production
        if (process.env.NODE_ENV === 'production') {
            this.sendToAnalytics(metrics);
        }
    }
    sendToAnalytics(metrics) {
        // Send metrics to your analytics service
        // This is a placeholder implementation
        try {
            // Example: Google Analytics 4
            if (typeof gtag !== 'undefined') {
                Object.entries(metrics).forEach(([name, value]) => {
                    gtag('event', 'performance_metric', {
                        metric_name: name,
                        metric_value: value
                    });
                });
            }
        }
        catch (error) {
            console.warn('Failed to send metrics to analytics:', error);
        }
    }
    // Memory cleanup
    cleanup() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
        this.metrics.clear();
    }
    // Performance budget checker
    checkPerformanceBudget() {
        const violations = [];
        const metrics = this.getMetrics();
        // Define performance budgets
        const budgets = {
            LCP: 2500, // 2.5 seconds
            FID: 100, // 100ms
            CLS: 0.1, // 0.1
            TTI: 3500, // 3.5 seconds
            jsBundleSize: 500000, // 500KB
            totalBundleSize: 1000000 // 1MB
        };
        Object.entries(budgets).forEach(([metric, budget]) => {
            const value = metrics[metric];
            if (value && value > budget) {
                violations.push(`${metric}: ${value} exceeds budget of ${budget}`);
            }
        });
        return {
            passed: violations.length === 0,
            violations
        };
    }
}
