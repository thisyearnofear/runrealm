/**
 * SoundService - Centralized sound management
 * Provides consistent audio feedback across the application
 */

import { BaseService } from '../core/base-service';

export class SoundService extends BaseService {
  private static instance: SoundService;
  private audioContext: AudioContext | null = null;
  private isEnabled: boolean = true;
  private volume: number = 0.5;

  private constructor() {
    super();
    // Check if sound is enabled in preferences
    try {
      const savedPreference = localStorage.getItem('runrealm_sound_enabled');
      this.isEnabled = savedPreference ? JSON.parse(savedPreference) : true;

      const savedVolume = localStorage.getItem('runrealm_sound_volume');
      this.volume = savedVolume ? parseFloat(savedVolume) : 0.5;
    } catch (_e) {
      // Default to enabled if there's an error
      this.isEnabled = true;
    }
  }

  static getInstance(): SoundService {
    if (!SoundService.instance) {
      SoundService.instance = new SoundService();
    }
    return SoundService.instance;
  }

  public async initialize(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // Create audio context on first user interaction
      // This is required by most browsers for autoplay policies
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
    } catch (error) {
      console.warn('SoundService: Failed to initialize audio context:', error);
    }
  }

  /**
   * Play a success sound
   */
  public playSuccessSound(): void {
    if (!this.isEnabled || !this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.05); // E5
      oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.1); // G5

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        this.volume * 0.3,
        this.audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.3);
    } catch (error) {
      console.warn('SoundService: Failed to play success sound:', error);
    }
  }

  /**
   * Play high-dopamine Deed Reveal / Territory Claim sound (Cyanotype exposure chime)
   */
  public playDeedRevealSound(rarity: 'common' | 'rare' | 'epic' | 'legendary' = 'common'): void {
    if (!this.isEnabled || !this.audioContext) return;

    try {
      const now = this.audioContext.currentTime;
      // Musical chord frequencies by rarity (Lydian / Pentatonic shimmer)
      const chords: Record<string, number[]> = {
        common: [261.63, 329.63, 392.0, 523.25], // C Major
        rare: [329.63, 392.0, 493.88, 659.25], // E Minor / G
        epic: [349.23, 440.0, 523.25, 698.46, 880.0], // F Major / A Lydian
        legendary: [261.63, 392.0, 523.25, 659.25, 783.99, 1046.5], // Majestic Pentatonic shimmer
      };

      const notes = chords[rarity] || chords.common;

      notes.forEach((freq, idx) => {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.type = rarity === 'legendary' || rarity === 'epic' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(this.volume * 0.25, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.8);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.85);
      });
    } catch (error) {
      console.warn('SoundService: Failed to play deed reveal sound:', error);
    }
  }

  /**
   * Play proximity radar pulse (for relics or nearby territory boundaries)
   */
  public playProximityPulse(urgency: number = 0.5): void {
    if (!this.isEnabled || !this.audioContext) return;

    try {
      const now = this.audioContext.currentTime;
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      // Pitch increases with urgency (500Hz to 1200Hz)
      const freq = 500 + urgency * 700;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.volume * 0.15, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.start(now);
      osc.stop(now + 0.13);
    } catch (error) {
      console.warn('SoundService: Failed to play proximity pulse:', error);
    }
  }

  /**
   * Play an error sound
   */
  public playErrorSound(): void {
    if (!this.isEnabled || !this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(110, this.audioContext.currentTime); // A2

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        this.volume * 0.2,
        this.audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.5);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.5);
    } catch (error) {
      console.warn('SoundService: Failed to play error sound:', error);
    }
  }

  /**
   * Play a notification sound
   */
  public playNotificationSound(): void {
    if (!this.isEnabled || !this.audioContext) return;

    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, this.audioContext.currentTime); // A5

      gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(
        this.volume * 0.1,
        this.audioContext.currentTime + 0.01
      );
      gainNode.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.2);

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.2);
    } catch (error) {
      console.warn('SoundService: Failed to play notification sound:', error);
    }
  }

  /**
   * Play a route generated sound
   */
  public playRouteGeneratedSound(): void {
    if (!this.isEnabled || !this.audioContext) return;

    try {
      // Play a pleasant ascending melody
      const now = this.audioContext.currentTime;

      for (let i = 0; i < 4; i++) {
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(261.63 + i * 175, now + i * 0.15); // C4, ~F4, ~A4, ~C5

        gainNode.gain.setValueAtTime(0, now + i * 0.15);
        gainNode.gain.linearRampToValueAtTime(this.volume * 0.2, now + i * 0.15 + 0.01);
        gainNode.gain.linearRampToValueAtTime(0, now + i * 0.15 + 0.14);

        oscillator.start(now + i * 0.15);
        oscillator.stop(now + i * 0.15 + 0.15);
      }
    } catch (error) {
      console.warn('SoundService: Failed to play route generated sound:', error);
    }
  }

  /**
   * Toggle sound on/off
   */
  public toggleSound(): void {
    this.isEnabled = !this.isEnabled;
    try {
      localStorage.setItem('runrealm_sound_enabled', JSON.stringify(this.isEnabled));
    } catch (_e) {
      // Ignore storage errors
    }

    // Play a sound to confirm the change
    if (this.isEnabled) {
      this.playNotificationSound();
    }
  }

  /**
   * Set volume level (0.0 to 1.0)
   */
  public setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    try {
      localStorage.setItem('runrealm_sound_volume', this.volume.toString());
    } catch (_e) {
      // Ignore storage errors
    }
  }

  /**
   * Check if sound is enabled
   */
  public isSoundEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get current volume level
   */
  public getVolume(): number {
    return this.volume;
  }

  protected async onInitialize(): Promise<void> {
    // Initialize audio context on first user interaction
    const handleFirstInteraction = () => {
      this.initialize();
      document.removeEventListener('click', handleFirstInteraction);
      document.removeEventListener('touchstart', handleFirstInteraction);
    };

    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('touchstart', handleFirstInteraction);

    this.safeEmit('service:initialized', { service: 'SoundService', success: true });
  }
}
