// Centralized DOM management with caching and performance optimization
export class DOMService {
  private static instance: DOMService;
  private elementCache: Map<string, HTMLElement> = new Map();
  private observers: Map<string, MutationObserver> = new Map();

  private constructor() {
    this.setupPerformanceOptimizations();
  }

  static getInstance(): DOMService {
    if (!DOMService.instance) {
      DOMService.instance = new DOMService();
    }
    return DOMService.instance;
  }

  private setupPerformanceOptimizations(): void {
    // Batch DOM updates using requestAnimationFrame
    this.batchedUpdates = this.createBatchedUpdater();
  }

  private batchedUpdates: (callback: () => void) => void;

  private createBatchedUpdater(): (callback: () => void) => void {
    let pending = false;
    const callbacks: (() => void)[] = [];

    return (callback: () => void) => {
      callbacks.push(callback);
      if (!pending) {
        pending = true;
        requestAnimationFrame(() => {
          const toExecute = callbacks.splice(0);
          toExecute.forEach((cb) => {
            cb();
          });
          pending = false;
        });
      }
    };
  }

  // Cached element retrieval
  getElement<T extends HTMLElement = HTMLElement>(id: string): T | null {
    if (this.elementCache.has(id)) {
      return this.elementCache.get(id) as T;
    }

    const element = document.getElementById(id) as T;
    if (element) {
      this.elementCache.set(id, element);
    }
    return element;
  }

  // Batch DOM updates for performance
  batchUpdate(callback: () => void): void {
    this.batchedUpdates(callback);
  }

  // Safe element manipulation with error handling
  updateElement(
    id: string,
    updates: Partial<{
      textContent: string;
      innerHTML: string;
      className: string;
      style: Partial<CSSStyleDeclaration>;
      attributes: Record<string, string>;
    }>
  ): boolean {
    try {
      const element = this.getElement(id);
      if (!element) return false;

      this.batchUpdate(() => {
        if (updates.textContent !== undefined) {
          element.textContent = updates.textContent;
        }
        if (updates.innerHTML !== undefined) {
          element.innerHTML = updates.innerHTML;
        }
        if (updates.className !== undefined) {
          element.className = updates.className;
        }
        if (updates.style) {
          Object.assign(element.style, updates.style);
        }
        if (updates.attributes) {
          Object.entries(updates.attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
          });
        }
      });

      return true;
    } catch (error) {
      console.error(`Error updating element ${id}:`, error);
      return false;
    }
  }

  // Event delegation for better performance
  delegate(
    container: string | HTMLElement,
    selector: string,
    event: string,
    handler: (e: Event, target: HTMLElement) => void
  ): () => void {
    const containerElement = typeof container === 'string' ? this.getElement(container) : container;

    if (!containerElement) {
      console.warn(`Container not found: ${container}`);
      return () => {};
    }

    const delegatedHandler = (e: Event) => {
      const target = (e.target as HTMLElement).closest(selector) as HTMLElement;
      if (target && containerElement.contains(target)) {
        handler(e, target);
      }
    };

    containerElement.addEventListener(event, delegatedHandler);

    // Return cleanup function
    return () => {
      containerElement.removeEventListener(event, delegatedHandler);
    };
  }

  // Observe element changes
  observe(
    elementId: string,
    callback: (mutations: MutationRecord[]) => void,
    options: MutationObserverInit = { childList: true, subtree: true }
  ): () => void {
    const element = this.getElement(elementId);
    if (!element) return () => {};

    const observer = new MutationObserver(callback);
    observer.observe(element, options);

    const observerId = `${elementId}_${Date.now()}`;
    this.observers.set(observerId, observer);

    return () => {
      observer.disconnect();
      this.observers.delete(observerId);
    };
  }

  // Create elements with proper typing
  createElement<K extends keyof HTMLElementTagNameMap>(
    tagName: K,
    options: {
      id?: string;
      className?: string;
      textContent?: string;
      innerHTML?: string;
      attributes?: Record<string, string>;
      style?: Partial<CSSStyleDeclaration>;
      parent?: HTMLElement | string;
    } = {}
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tagName);

    if (options.id) element.id = options.id;
    if (options.className) element.className = options.className;
    if (options.textContent) element.textContent = options.textContent;
    if (options.innerHTML) element.innerHTML = options.innerHTML;

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
      });
    }

    if (options.style) {
      Object.assign(element.style, options.style);
    }

    if (options.parent) {
      const parent =
        typeof options.parent === 'string' ? this.getElement(options.parent) : options.parent;
      parent?.appendChild(element);
    }

    return element;
  }

  // Cleanup method
  cleanup(): void {
    this.elementCache.clear();
    this.observers.forEach((observer) => {
      observer.disconnect();
    });
    this.observers.clear();
  }

  // Utility methods
  addClass(elementId: string, className: string): boolean {
    const element = this.getElement(elementId);
    if (element) {
      element.classList.add(className);
      return true;
    }
    return false;
  }

  removeClass(elementId: string, className: string): boolean {
    const element = this.getElement(elementId);
    if (element) {
      element.classList.remove(className);
      return true;
    }
    return false;
  }

  toggleClass(elementId: string, className: string): boolean {
    const element = this.getElement(elementId);
    if (element) {
      element.classList.toggle(className);
      return true;
    }
    return false;
  }

  show(elementId: string): boolean {
    return this.removeClass(elementId, 'hidden');
  }

  hide(elementId: string): boolean {
    return this.addClass(elementId, 'hidden');
  }
}
