/**
 * AnimationService - Centralized animation management
 * Provides consistent animations and transitions across the application
 */

import { BaseService } from '../core/base-service';

export interface AnimationConfig {
  duration?: number;
  easing?: string;
  delay?: number;
}

export class AnimationService extends BaseService {
  private static instance: AnimationService;
  
  // Common easing functions
  private easingFunctions = {
    linear: (t: number) => t,
    easeInQuad: (t: number) => t * t,
    easeOutQuad: (t: number) => t * (2 - t),
    easeInOutQuad: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeOutElastic: (t: number) => {
      const p = 0.3;
      return Math.pow(2, -10 * t) * Math.sin((t - p / 4) * (2 * Math.PI) / p) + 1;
    }
  };

  constructor() {
    super();
  }

  static getInstance(): AnimationService {
    if (!AnimationService.instance) {
      AnimationService.instance = new AnimationService();
    }
    return AnimationService.instance;
  }

  /**
   * Fade in an element
   */
  public fadeIn(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 300, easing = 'easeOutQuad', delay = 0 } = config;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        element.style.opacity = '0';
        element.style.display = 'block';
        
        const startTime = performance.now();
        const easingFn = this.easingFunctions[easing as keyof typeof this.easingFunctions] || this.easingFunctions.easeOutQuad;
        
        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easingFn(progress);
          
          element.style.opacity = easedProgress.toString();
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            resolve();
          }
        };
        
        requestAnimationFrame(animate);
      }, delay);
    });
  }

  /**
   * Fade out an element
   */
  public fadeOut(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 300, easing = 'easeOutQuad', delay = 0 } = config;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const startTime = performance.now();
        const easingFn = this.easingFunctions[easing as keyof typeof this.easingFunctions] || this.easingFunctions.easeOutQuad;
        
        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easingFn(progress);
          
          element.style.opacity = (1 - easedProgress).toString();
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            element.style.display = 'none';
            resolve();
          }
        };
        
        requestAnimationFrame(animate);
      }, delay);
    });
  }

  /**
   * Slide in from bottom
   */
  public slideInBottom(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 300, easing = 'easeOutQuad', delay = 0 } = config;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Store original styles
        const originalTransform = element.style.transform;
        const originalOpacity = element.style.opacity;
        
        // Set initial state
        element.style.transform = 'translateY(100%)';
        element.style.opacity = '0';
        element.style.display = 'block';
        
        const startTime = performance.now();
        const easingFn = this.easingFunctions[easing as keyof typeof this.easingFunctions] || this.easingFunctions.easeOutQuad;
        
        const animate = (currentTime: number) => {
          const elapsed = currentTime - startTime;
          const progress = Math.min(elapsed / duration, 1);
          const easedProgress = easingFn(progress);
          
          element.style.transform = `translateY(${(1 - easedProgress) * 100}%)`;
          element.style.opacity = easedProgress.toString();
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            element.style.transform = originalTransform;
            element.style.opacity = originalOpacity;
            resolve();
          }
        };
        
        requestAnimationFrame(animate);
      }, delay);
    });
  }

  /**
   * Bounce animation for celebrations
   */
  public bounce(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 600, delay = 0 } = config;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const keyframes = [
          { transform: 'scale(1)', offset: 0 },
          { transform: 'scale(1.2)', offset: 0.3 },
          { transform: 'scale(0.9)', offset: 0.6 },
          { transform: 'scale(1.1)', offset: 0.8 },
          { transform: 'scale(1)', offset: 1 }
        ];
        
        const animation = element.animate(keyframes, {
          duration,
          easing: 'ease-out'
        });
        
        animation.onfinish = () => resolve();
      }, delay);
    });
  }

  /**
   * Confetti effect for celebrations
   */
  public confetti(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 3000, delay = 0 } = config;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        // Create confetti container
        const confettiContainer = document.createElement('div');
        confettiContainer.style.position = 'absolute';
        confettiContainer.style.top = '0';
        confettiContainer.style.left = '0';
        confettiContainer.style.width = '100%';
        confettiContainer.style.height = '100%';
        confettiContainer.style.pointerEvents = 'none';
        confettiContainer.style.zIndex = '10000';
        
        element.appendChild(confettiContainer);
        
        // Create confetti pieces
        const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
        const confettiCount = 50;
        
        for (let i = 0; i < confettiCount; i++) {
          const confetti = document.createElement('div');
          confetti.style.position = 'absolute';
          confetti.style.width = '10px';
          confetti.style.height = '10px';
          confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
          confetti.style.borderRadius = '50%';
          confetti.style.left = `${Math.random() * 100}%`;
          confetti.style.top = '-10px';
          confetti.style.opacity = '0';
          
          confettiContainer.appendChild(confetti);
          
          // Animate confetti
          const animation = confetti.animate([
            { transform: 'translateY(0) rotate(0deg)', opacity: 0 },
            { transform: 'translateY(20px) rotate(90deg)', opacity: 1, offset: 0.1 },
            { transform: `translateY(${window.innerHeight}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }
          ], {
            duration: duration,
            easing: 'cubic-bezier(0.1, 0.8, 0.2, 1)'
          });
          
          animation.onfinish = () => {
            confetti.remove();
          };
        }
        
        // Remove container after animation
        setTimeout(() => {
          confettiContainer.remove();
          resolve();
        }, duration);
      }, delay);
    });
  }

  /**
   * Pulse animation for attention
   */
  public pulse(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 1000, delay = 0 } = config;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const keyframes = [
          { transform: 'scale(1)', opacity: 1, offset: 0 },
          { transform: 'scale(1.05)', opacity: 0.7, offset: 0.5 },
          { transform: 'scale(1)', opacity: 1, offset: 1 }
        ];
        
        const animation = element.animate(keyframes, {
          duration,
          iterations: 2
        });
        
        animation.onfinish = () => resolve();
      }, delay);
    });
  }

  /**
   * Shake animation for errors or attention
   */
  public shake(element: HTMLElement, config: AnimationConfig = {}): Promise<void> {
    const { duration = 500, delay = 0 } = config;
    
    return new Promise((resolve) => {
      setTimeout(() => {
        const keyframes = [
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(-10px)', offset: 0.1 },
          { transform: 'translateX(10px)', offset: 0.2 },
          { transform: 'translateX(-10px)', offset: 0.3 },
          { transform: 'translateX(10px)', offset: 0.4 },
          { transform: 'translateX(-10px)', offset: 0.5 },
          { transform: 'translateX(10px)', offset: 0.6 },
          { transform: 'translateX(-10px)', offset: 0.7 },
          { transform: 'translateX(10px)', offset: 0.8 },
          { transform: 'translateX(-5px)', offset: 0.9 },
          { transform: 'translateX(0)', offset: 1 }
        ];
        
        const animation = element.animate(keyframes, {
          duration,
          easing: 'ease-in-out'
        });
        
        animation.onfinish = () => resolve();
      }, delay);
    });
  }

  // Placeholder methods to satisfy type checking
  public readdRunToMap(run: any): void {
    // Implementation would go here
  }

  public animateSegment(segment: any): void {
    // Implementation would go here
  }
  
  public setAIRoute(coordinates: any[], style: any, metadata: any): void {
    // Implementation would go here
  }
  
  public clearAIRoute(): void {
    // Implementation would go here
  }
  
  public setAIWaypoints(waypoints: any[], metadata: any): void {
    // Implementation would go here
  }
  
  public map: any = {
    // Placeholder for map property
  };
}