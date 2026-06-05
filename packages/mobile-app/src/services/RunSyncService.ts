/**
 * RunSyncService
 *
 * Offline-first queue that pushes completed RunSession objects to the backend
 * for territory validation. Runs are persisted in AsyncStorage with a status
 * field; uploads run with exponential backoff. The mobile app remains the
 * authoritative recorder; the server only validates and writes to chain.
 *
 * Status: SCAFFOLD. The /api/runs endpoint on the server is a stub that
 * acknowledges receipt; chain submission still flows through the existing
 * web app territory-service. See server.js for the receiver.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RunSession } from '@runrealm/shared-core/services/run-tracking-service';

type QueueEntry = {
  run: RunSession;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
};

const QUEUE_KEY = 'runrealm_run_upload_queue';
const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 5_000;

export interface RunSyncConfig {
  apiBaseUrl: string;
  getAuthToken?: () => Promise<string | null>;
}

export class RunSyncService {
  private flushing = false;

  constructor(private readonly config: RunSyncConfig) {}

  /**
   * Enqueue a completed run for upload. Returns immediately; the queue is
   * processed asynchronously and survives app restarts.
   */
  async enqueue(run: RunSession): Promise<void> {
    const queue = await this.readQueue();
    if (queue.find((e) => e.run.id === run.id)) return;
    queue.push({ run, status: 'pending', attempts: 0 });
    await this.writeQueue(queue);
    void this.flush();
  }

  /**
   * Attempt to upload all pending entries. Safe to call from app foreground
   * events, network reconnect handlers, or a periodic timer.
   */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      const queue = await this.readQueue();
      let mutated = false;
      for (const entry of queue) {
        if (entry.status === 'uploaded') continue;
        if (entry.attempts >= MAX_ATTEMPTS && entry.status === 'failed') continue;
        if (
          entry.lastAttemptAt &&
          Date.now() - entry.lastAttemptAt < this.backoff(entry.attempts)
        ) {
          continue;
        }
        entry.status = 'uploading';
        entry.attempts += 1;
        entry.lastAttemptAt = Date.now();
        mutated = true;
        try {
          await this.upload(entry.run);
          entry.status = 'uploaded';
          entry.lastError = undefined;
        } catch (e) {
          entry.status = entry.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
          entry.lastError = e instanceof Error ? e.message : String(e);
        }
      }
      if (mutated) {
        const trimmed = queue.filter(
          (e) => e.status !== 'uploaded' || Date.now() - (e.lastAttemptAt ?? 0) < 60_000
        );
        await this.writeQueue(trimmed);
      }
    } finally {
      this.flushing = false;
    }
  }

  async pendingCount(): Promise<number> {
    const queue = await this.readQueue();
    return queue.filter((e) => e.status === 'pending' || e.status === 'failed').length;
  }

  private async upload(run: RunSession): Promise<void> {
    const token = this.config.getAuthToken ? await this.config.getAuthToken() : null;
    const res = await fetch(`${this.config.apiBaseUrl}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ run }),
    });
    if (!res.ok) {
      throw new Error(`upload failed: ${res.status} ${res.statusText}`);
    }
  }

  private backoff(attempts: number): number {
    return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), 5 * 60_000);
  }

  private async readQueue(): Promise<QueueEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private async writeQueue(queue: QueueEntry[]): Promise<void> {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }
}
