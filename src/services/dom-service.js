// Centralized DOM management with caching and performance optimization
export class DOMService {
    constructor() {
        this.elementCache = new Map();
        this.observers = new Map();
        this.setupPerformanceOptimizations();
    }
    static getInstance() {
        if (!DOMService.instance) {
            DOMService.instance = new DOMService();
        }
        return DOMService.instance;
    }
    setupPerformanceOptimizations() {
        // Batch DOM updates using requestAnimationFrame
        this.batchedUpdates = this.createBatchedUpdater();
    }
    createBatchedUpdater() {
        let pending = false;
        const callbacks = [];
        return (callback) => {
            callbacks.push(callback);
            if (!pending) {
                pending = true;
                requestAnimationFrame(() => {
                    const toExecute = callbacks.splice(0);
                    toExecute.forEach(cb => cb());
                    pending = false;
                });
            }
        };
    }
    // Cached element retrieval
    getElement(id) {
        if (this.elementCache.has(id)) {
            return this.elementCache.get(id);
        }
        const element = document.getElementById(id);
        if (element) {
            this.elementCache.set(id, element);
        }
        return element;
    }
    // Batch DOM updates for performance
    batchUpdate(callback) {
        this.batchedUpdates(callback);
    }
    // Safe element manipulation with error handling
    updateElement(id, updates) {
        try {
            const element = this.getElement(id);
            if (!element)
                return false;
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
        }
        catch (error) {
            console.error(`Error updating element ${id}:`, error);
            return false;
        }
    }
    // Event delegation for better performance
    delegate(container, selector, event, handler) {
        const containerElement = typeof container === 'string'
            ? this.getElement(container)
            : container;
        if (!containerElement) {
            console.warn(`Container not found: ${container}`);
            return () => { };
        }
        const delegatedHandler = (e) => {
            const target = e.target.closest(selector);
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
    observe(elementId, callback, options = { childList: true, subtree: true }) {
        const element = this.getElement(elementId);
        if (!element)
            return () => { };
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
    createElement(tagName, options = {}) {
        const element = document.createElement(tagName);
        if (options.id)
            element.id = options.id;
        if (options.className)
            element.className = options.className;
        if (options.textContent)
            element.textContent = options.textContent;
        if (options.innerHTML)
            element.innerHTML = options.innerHTML;
        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }
        if (options.style) {
            Object.assign(element.style, options.style);
        }
        if (options.parent) {
            const parent = typeof options.parent === 'string'
                ? this.getElement(options.parent)
                : options.parent;
            parent?.appendChild(element);
        }
        return element;
    }
    // Cleanup method
    cleanup() {
        this.elementCache.clear();
        this.observers.forEach(observer => observer.disconnect());
        this.observers.clear();
    }
    // Utility methods
    addClass(elementId, className) {
        const element = this.getElement(elementId);
        if (element) {
            element.classList.add(className);
            return true;
        }
        return false;
    }
    removeClass(elementId, className) {
        const element = this.getElement(elementId);
        if (element) {
            element.classList.remove(className);
            return true;
        }
        return false;
    }
    toggleClass(elementId, className) {
        const element = this.getElement(elementId);
        if (element) {
            element.classList.toggle(className);
            return true;
        }
        return false;
    }
    show(elementId) {
        return this.removeClass(elementId, 'hidden');
    }
    hide(elementId) {
        return this.addClass(elementId, 'hidden');
    }
}
