export declare class DOMService {
    private static instance;
    private elementCache;
    private observers;
    private constructor();
    static getInstance(): DOMService;
    private setupPerformanceOptimizations;
    private batchedUpdates;
    private createBatchedUpdater;
    getElement<T extends HTMLElement = HTMLElement>(id: string): T | null;
    batchUpdate(callback: () => void): void;
    updateElement(id: string, updates: Partial<{
        textContent: string;
        innerHTML: string;
        className: string;
        style: Partial<CSSStyleDeclaration>;
        attributes: Record<string, string>;
    }>): boolean;
    delegate(container: string | HTMLElement, selector: string, event: string, handler: (e: Event, target: HTMLElement) => void): () => void;
    observe(elementId: string, callback: (mutations: MutationRecord[]) => void, options?: MutationObserverInit): () => void;
    createElement<K extends keyof HTMLElementTagNameMap>(tagName: K, options?: {
        id?: string;
        className?: string;
        textContent?: string;
        innerHTML?: string;
        attributes?: Record<string, string>;
        style?: Partial<CSSStyleDeclaration>;
        parent?: HTMLElement | string;
    }): HTMLElementTagNameMap[K];
    cleanup(): void;
    addClass(elementId: string, className: string): boolean;
    removeClass(elementId: string, className: string): boolean;
    toggleClass(elementId: string, className: string): boolean;
    show(elementId: string): boolean;
    hide(elementId: string): boolean;
}
