/**
 * AnimationService - Centralized animation management for UI components
 * Provides consistent, performant animations across the application
 */

import { BaseService } from '../core/base-service';

export interface AnimationOptions {
  duration?: number;
  easing?: string;
  delay?: number;
  iterations?: number;
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
}

export class AnimationService extends BaseService {
  private animationMap: Map<string, Animation> = new Map();

  protected async onInitialize(): Promise<void> {
    this.safeEmit('service:initialized', { service: 'AnimationService', success: true });
  }

  /**
   * Animate an element with keyframes
   */
  public animate(
    element: HTMLElement,
    keyframes: Keyframe[],
    options: AnimationOptions = {}
  ): Promise<Animation> {
    const defaultOptions: AnimationOptions = {
      duration: 300,
      easing: 'ease-in-out',
      delay: 0,
      iterations: 1,
      direction: 'normal'
    };

    const animationOptions = { ...defaultOptions, ...options };
    
    return new Promise((resolve) => {
      const animation = element.animate(keyframes, animationOptions);
      
      // Store animation reference
      const animationId = this.generateAnimationId();
      this.animationMap.set(animationId, animation);
      
      animation.onfinish = () => {
        this.animationMap.delete(animationId);
        resolve(animation);
      };
      
      animation.oncancel = () => {
        this.animationMap.delete(animationId);
        resolve(animation);
      };
    });
  }

  /**
   * Fade in an element
   */
  public fadeIn(element: HTMLElement, duration: number = 300): Promise<Animation> {
    return this.animate(
      element,
      [
        { opacity: '0', transform: 'translateY(-10px)' },
        { opacity: '1', transform: 'translateY(0)' }
      ],
      { duration, easing: 'ease-out' }
    );
  }

  /**
   * Fade out an element
   */
  public fadeOut(element: HTMLElement, duration: number = 300): Promise<Animation> {
    return this.animate(
      element,
      [
        { opacity: '1', transform: 'translateY(0)' },
        { opacity: '0', transform: 'translateY(-10px)' }
      ],
      { duration, easing: 'ease-in' }
    );
  }

  /**
   * Slide in from left
   */
  public slideInLeft(element: HTMLElement, duration: number = 300): Promise<Animation> {
    return this.animate(
      element,
      [
        { transform: 'translateX(-100%)', opacity: '0' },
        { transform: 'translateX(0)', opacity: '1' }
      ],
      { duration, easing: 'ease-out' }
    );
  }

  /**
   * Slide in from right
   */
  public slideInRight(element: HTMLElement, duration: number = 300): Promise<Animation> {
    return this.animate(
      element,
      [
        { transform: 'translateX(100%)', opacity: '0' },
        { transform: 'translateX(0)', opacity: '1' }
      ],
      { duration, easing: 'ease-out' }
    );
  }

  /**
   * Bounce effect for attention
   */
  public bounce(element: HTMLElement, duration: number = 600): Promise<Animation> {
    return this.animate(
      element,
      [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1.05)', offset: 0.3 },
        { transform: 'scale(0.95)', offset: 0.6 },
        { transform: 'scale(1)', offset: 1 }
      ],
      { duration, easing: 'ease-in-out' }
    );
  }

  /**
   * Shake effect for errors
   */
  public shake(element: HTMLElement, duration: number = 500): Promise<Animation> {
    return this.animate(
      element,
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(-5px)', offset: 0.1 },
        { transform: 'translateX(5px)', offset: 0.2 },
        { transform: 'translateX(-5px)', offset: 0.3 },
        { transform: 'translateX(5px)', offset: 0.4 },
        { transform: 'translateX(-5px)', offset: 0.5 },
        { transform: 'translateX(5px)', offset: 0.6 },
        { transform: 'translateX(0)', offset: 0.7 }
      ],
      { duration, easing: 'ease-in-out' }
    );
  }

  /**
   * Cancel all animations for an element
   */
  public cancelAnimations(element: HTMLElement): void {
    const animations = element.getAnimations();
    animations.forEach(animation => {
      animation.cancel();
    });
  }

  /**
   * Cancel a specific animation by ID
   */
  public cancelAnimation(animationId: string): void {
    const animation = this.animationMap.get(animationId);
    if (animation) {
      animation.cancel();
      this.animationMap.delete(animationId);
    }
  }

  /**
   * Generate unique animation ID
   */
  private generateAnimationId(): string {
    return `animation_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  }

  /**
   * Stagger animations for a group of elements
   */
  public staggerAnimations(
    elements: HTMLElement[],
    animationFn: (element: HTMLElement) => Promise<Animation>,
    delay: number = 50
  ): Promise<Animation[]> {
    const promises: Promise<Animation>[] = [];
    
    elements.forEach((element, index) => {
      const promise = new Promise<Animation>(resolve => {
        setTimeout(() => {
          animationFn(element).then(resolve);
        }, index * delay);
      });
      
      promises.push(promise);
    });
    
    return Promise.all(promises);
  }
}