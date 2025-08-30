/**
 * AIOrchestrator - Centralized AI request management
 * Provides smooth, reliable, and performant AI interactions
 */

import { EventBus } from '../core/event-bus';
import { UIService } from './ui-service';
import { SoundService } from './sound-service';

export interface AIRequestOptions {
  timeout?: number;
  retries?: number;
  cache?: boolean;
  cacheTTL?: number; // in milliseconds
}

export interface AIRequestStatus {
  id: string;
  type: 'route' | 'ghostRunner' | 'territoryAnalysis';
  status: 'pending' | 'processing' | 'success' | 'error' | 'cancelled';
  progress: number;
  timestamp: number;
  error?: string;
}

export class AIOrchestrator {
  private static instance: AIOrchestrator;
  private eventBus: EventBus;
  private uiService: UIService;
  private soundService: SoundService;
  private activeRequests: Map<string, AIRequestStatus> = new Map();
  private requestCache: Map<string, { data: any; timestamp: number }> = new Map();
  
  private constructor() {
    this.eventBus = EventBus.getInstance();
    this.uiService = UIService.getInstance();
    this.soundService = SoundService.getInstance();
    this.setupEventListeners();
  }

  static getInstance(): AIOrchestrator {
    if (!AIOrchestrator.instance) {
      AIOrchestrator.instance = new AIOrchestrator();
    }
    return AIOrchestrator.instance;
  }

  private setupEventListeners(): void {
    // Listen for AI service events to update request status
    this.eventBus.on('ai:routeRequested', (data) => {
      this.updateRequestStatus(data.requestId, 'processing', 30);
    });

    this.eventBus.on('ai:routeReady', (data) => {
      this.updateRequestStatus(data.requestId, 'success', 100);
      this.soundService.playRouteGeneratedSound();
    });

    this.eventBus.on('ai:routeFailed', (data) => {
      this.updateRequestStatus(data.requestId, 'error', 0, data.message);
      this.soundService.playErrorSound();
    });

    this.eventBus.on('ai:ghostRunnerRequested', (data) => {
      this.updateRequestStatus(data.requestId, 'processing', 20);
    });

    this.eventBus.on('ai:ghostRunnerGenerated', (data) => {
      this.updateRequestStatus(data.requestId, 'success', 100);
      this.soundService.playSuccessSound();
    });

    this.eventBus.on('ai:ghostRunnerFailed', (data) => {
      this.updateRequestStatus(data.requestId, 'error', 0, data.message);
      this.soundService.playErrorSound();
    });
  }

  /**
   * Request an AI-generated route with enhanced UX
   */
  public async requestRoute(
    params: any,
    options: AIRequestOptions = {}
  ): Promise<void> {
    const requestId = this.generateRequestId('route');
    const defaultOptions: AIRequestOptions = {
      timeout: 30000,
      retries: 2,
      cache: true,
      cacheTTL: 300000 // 5 minutes
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    // Check cache first
    if (mergedOptions.cache) {
      const cached = this.checkCache(`route_${JSON.stringify(params)}`, mergedOptions.cacheTTL!);
      if (cached) {
        this.eventBus.emit('ai:routeReady', { ...cached, requestId });
        return;
      }
    }
    
    // Create request status
    this.createRequestStatus(requestId, 'route', 'pending', 0);
    
    // Show loading toast
    const loadingToast = this.uiService.showToast('🤖 Generating your route...', {
      type: 'info',
      duration: 0 // Don't auto-hide
    });
    
    try {
      // Add request ID to params
      const requestParams = { ...params, requestId };
      
      // Emit request with timeout
      await this.emitWithTimeout('ai:routeRequested', requestParams, mergedOptions.timeout!);
      
      // Update UI when processing starts
      this.eventBus.on(`${requestId}:progress`, (data) => {
        this.updateRequestStatus(requestId, 'processing', data.progress);
        // Update toast with progress
        this.uiService.showToast(`🤖 Generating your route... (${data.progress}%)`, {
          type: 'info',
          duration: 0
        });
      });
      
    } catch (error) {
      this.handleRequestError(requestId, 'route', error.message);
      this.uiService.showToast(`Route generation failed: ${error.message}`, {
        type: 'error',
        action: {
          text: 'Retry',
          callback: () => {
            this.requestRoute(params, options);
          }
        }
      });
    }
  }

  /**
   * Request a ghost runner with enhanced UX
   */
  public async requestGhostRunner(
    params: any,
    options: AIRequestOptions = {}
  ): Promise<void> {
    const requestId = this.generateRequestId('ghostRunner');
    const defaultOptions: AIRequestOptions = {
      timeout: 20000,
      retries: 2,
      cache: true,
      cacheTTL: 300000 // 5 minutes
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    
    // Check cache first
    if (mergedOptions.cache) {
      const cached = this.checkCache(`ghost_${JSON.stringify(params)}`, mergedOptions.cacheTTL!);
      if (cached) {
        this.eventBus.emit('ai:ghostRunnerGenerated', { ...cached, requestId });
        return;
      }
    }
    
    // Create request status
    this.createRequestStatus(requestId, 'ghostRunner', 'pending', 0);
    
    // Show loading toast
    this.uiService.showToast('👻 Summoning your ghost runner...', {
      type: 'info',
      duration: 0 // Don't auto-hide
    });
    
    try {
      // Add request ID to params
      const requestParams = { ...params, requestId };
      
      // Emit request with timeout
      await this.emitWithTimeout('ai:ghostRunnerRequested', requestParams, mergedOptions.timeout!);
      
    } catch (error) {
      this.handleRequestError(requestId, 'ghostRunner', error.message);
      this.uiService.showToast(`Ghost runner summoning failed: ${error.message}`, {
        type: 'error',
        action: {
          text: 'Retry',
          callback: () => {
            this.requestGhostRunner(params, options);
          }
        }
      });
    }
  }

  /**
   * Cancel an active AI request
   */
  public cancelRequest(requestId: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      this.updateRequestStatus(requestId, 'cancelled', 0);
      this.eventBus.emit(`${requestId}:cancelled`, { requestId });
    }
  }

  /**
   * Get status of all active requests
   */
  public getActiveRequests(): AIRequestStatus[] {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Clear request cache
   */
  public clearCache(): void {
    this.requestCache.clear();
  }

  private generateRequestId(type: string): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private createRequestStatus(
    id: string,
    type: 'route' | 'ghostRunner' | 'territoryAnalysis',
    status: 'pending' | 'processing' | 'success' | 'error' | 'cancelled',
    progress: number,
    error?: string
  ): void {
    const requestStatus: AIRequestStatus = {
      id,
      type,
      status,
      progress,
      timestamp: Date.now(),
      error
    };
    
    this.activeRequests.set(id, requestStatus);
    this.eventBus.emit('ai:requestStatusChanged', requestStatus);
  }

  private updateRequestStatus(
    id: string,
    status: 'pending' | 'processing' | 'success' | 'error' | 'cancelled',
    progress: number,
    error?: string
  ): void {
    const request = this.activeRequests.get(id);
    if (request) {
      request.status = status;
      request.progress = progress;
      if (error) {
        request.error = error;
      }
      request.timestamp = Date.now();
      
      this.activeRequests.set(id, request);
      this.eventBus.emit('ai:requestStatusChanged', request);
      
      // Cache successful responses
      if (status === 'success') {
        // We'd need to capture the actual response data to cache it
        // This would require modifying how we emit events
      }
      
      // Remove completed requests after a delay
      if (status === 'success' || status === 'error' || status === 'cancelled') {
        setTimeout(() => {
          this.activeRequests.delete(id);
          this.eventBus.emit('ai:requestStatusChanged', { id, status: 'removed' });
        }, 30000); // Remove after 30 seconds
      }
    }
  }

  private checkCache(key: string, ttl: number): any | null {
    const cached = this.requestCache.get(key);
    if (cached) {
      const now = Date.now();
      if (now - cached.timestamp < ttl) {
        return cached.data;
      } else {
        this.requestCache.delete(key);
      }
    }
    return null;
  }

  private async emitWithTimeout(
    event: string,
    data: any,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Set up timeout
      const timer = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeout);
      
      // Set up success listener
      const successListener = () => {
        clearTimeout(timer);
        resolve();
      };
      
      // Set up error listener
      const errorListener = (errorData: any) => {
        clearTimeout(timer);
        reject(new Error(errorData.message || 'Request failed'));
      };
      
      // Listen for success or error events
      this.eventBus.once(`${data.requestId}:success`, successListener);
      this.eventBus.once(`${data.requestId}:error`, errorListener);
      
      // Emit the request
      this.eventBus.emit(event, data);
    });
  }

  private handleRequestError(
    requestId: string,
    type: string,
    errorMessage: string
  ): void {
    this.updateRequestStatus(requestId, 'error', 0, errorMessage);
    
    // Play error sound
    this.soundService.playErrorSound();
    
    // Log error for debugging
    console.error(`AI Orchestrator: ${type} request failed`, {
      requestId,
      error: errorMessage
    });
  }
}