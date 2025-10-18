// Performance optimization service

// Declare gtag globally
declare const gtag: (...args: any[]) => void;

export class PerformanceService {
  private static instance: PerformanceService;
  private observers: Map<string, PerformanceObserver> = new Map();
  private metrics: Map<string, number> = new Map();

  private constructor() {
    this.initializePerformanceMonitoring();
  }

  static getInstance(): PerformanceService {
    if (!PerformanceService.instance) {
      PerformanceService.instance = new PerformanceService();
    }
    return PerformanceService.instance;
  }

  private initializePerformanceMonitoring(): void {
    // Monitor Core Web Vitals
    this.observeWebVitals();
    
    // Monitor custom metrics
    this.observeCustomMetrics();
    
    // Setup memory monitoring
    this.setupMemoryMonitoring();
  }

  private observeWebVitals(): void {
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
        entries.forEach((entry: any) => {
          this.metrics.set('FID', entry.processingStart - entry.startTime);
        });
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
      this.observers.set('fid', fidObserver);

      // Cumulative Layout Shift
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry: any) => {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
            this.metrics.set('CLS', clsValue);
          }
        });
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.set('cls', clsObserver);

    } catch (error) {
      console.warn('Performance monitoring not supported:', error);
    }
  }

  private observeCustomMetrics(): void {
    // Time to Interactive
    this.measureTimeToInteractive();
    
    // Bundle size metrics
    this.measureBundleMetrics();
  }

  private measureTimeToInteractive(): void {
    const startTime = performance.now();
    
    // Measure when the app becomes interactive
    const checkInteractive = () => {
      if (document.readyState === 'complete') {
        const tti = performance.now() - startTime;
        this.metrics.set('TTI', tti);
      } else {
        requestAnimationFrame(checkInteractive);
      }
    };
    
    checkInteractive();
  }

  private measureBundleMetrics(): void {
    // Measure resource loading times
    window.addEventListener('load', () => {
      const resources = performance.getEntriesByType('resource');
      
      let totalSize = 0;
      let jsSize = 0;
      let cssSize = 0;
      
      resources.forEach((resource: any) => {
        if (resource.transferSize) {
          totalSize += resource.transferSize;
          
          if (resource.name.endsWith('.js')) {
            jsSize += resource.transferSize;
          } else if (resource.name.endsWith('.css')) {
            cssSize += resource.transferSize;
          }
        }
      });
      
      this.metrics.set('totalBundleSize', totalSize);
      this.metrics.set('jsBundleSize', jsSize);
      this.metrics.set('cssBundleSize', cssSize);
    });
  }

  private setupMemoryMonitoring(): void {
    // Monitor memory usage if available
    if ('memory' in performance) {
      setInterval(() => {
        const memory = (performance as any).memory;
        this.metrics.set('memoryUsed', memory.usedJSHeapSize);
        this.metrics.set('memoryLimit', memory.jsHeapSizeLimit);
      }, 30000); // Check every 30 seconds
    }
  }

  // Debounce utility for performance
  debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: number | NodeJS.Timeout;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeout as any);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Throttle utility for performance
  throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Lazy loading utility
  lazyLoad<T>(
    loader: () => Promise<T>,
    condition: () => boolean = () => true
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (condition()) {
        loader().then(resolve).catch(reject);
      } else {
        // Wait for condition to be true
        const checkCondition = () => {
          if (condition()) {
            loader().then(resolve).catch(reject);
          } else {
            requestAnimationFrame(checkCondition);
          }
        };
        checkCondition();
      }
    });
  }

  // Preload critical resources
  preloadResource(url: string, type: 'script' | 'style' | 'image' = 'script'): void {
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
  optimizeImage(img: HTMLImageElement): void {
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
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  reportMetrics(): void {
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

  private sendToAnalytics(metrics: Record<string, number>): void {
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
    } catch (error) {
      console.warn('Failed to send metrics to analytics:', error);
    }
  }

  // Memory cleanup
  cleanup(): void {
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
    this.metrics.clear();
  }

  // Performance budget checker
  checkPerformanceBudget(): {
    passed: boolean;
    violations: string[];
  } {
    const violations: string[] = [];
    const metrics = this.getMetrics();

    // Define performance budgets
    const budgets = {
      LCP: 2500, // 2.5 seconds
      FID: 100,  // 100ms
      CLS: 0.1,  // 0.1
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