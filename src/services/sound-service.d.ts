/**
 * SoundService - Centralized sound management
 * Provides consistent audio feedback across the application
 */
import { BaseService } from '../core/base-service';
export declare class SoundService extends BaseService {
    private static instance;
    private audioContext;
    private isEnabled;
    private volume;
    private constructor();
    static getInstance(): SoundService;
    initialize(): Promise<void>;
    /**
     * Play a success sound
     */
    playSuccessSound(): void;
    /**
     * Play an error sound
     */
    playErrorSound(): void;
    /**
     * Play a notification sound
     */
    playNotificationSound(): void;
    /**
     * Play a route generated sound
     */
    playRouteGeneratedSound(): void;
    /**
     * Toggle sound on/off
     */
    toggleSound(): void;
    /**
     * Set volume level (0.0 to 1.0)
     */
    setVolume(volume: number): void;
    /**
     * Check if sound is enabled
     */
    isSoundEnabled(): boolean;
    /**
     * Get current volume level
     */
    getVolume(): number;
    protected onInitialize(): Promise<void>;
}
