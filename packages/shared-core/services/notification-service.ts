import { GAME_RULES } from '../config/game-rules';
import { BaseService } from '../core/base-service';
import { ghostLostNeedsWalkLine, ghostNeedsWalkLine } from '../utils/atlas-voice';
import { decayDigestFor } from '../utils/shield-presentation';
import { openVersioned } from '../utils/versioned-store';
import { GhostRunnerService, type GhostTrainingState } from './ghost-runner-service';

const DECAY_SUMMARY_KEY = 'runrealm_last_decay_summary';
const DAY_MS = 24 * 60 * 60 * 1000;

interface TerritoryLike {
  id?: string;
  geohash?: string;
  activityPoints?: number;
  defenseStatus?: 'strong' | 'moderate' | 'vulnerable' | 'claimable';
}

/**
 * Web-notification bridge for the "come back tomorrow" loop.
 *
 * The 23 hours between runs are dead time for the game; this service
 * turns territory decay, claim results, ghost races, and walk
 * verifications into OS-level notifications so the map keeps playing
 * after the tab closes. All browser APIs are feature-detected — the
 * service degrades to a no-op where notifications don't exist.
 */
export class NotificationService extends BaseService {
  private static instance: NotificationService;
  private permission: NotificationPermission | 'unsupported' = 'default';

  private constructor() {
    super();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  protected async onInitialize(): Promise<void> {
    this.detectPermission();
    this.setupEventListeners();
    this.showDecaySummary();
    this.safeEmit('service:initialized', {
      service: 'NotificationService',
      success: true,
    });
  }

  private detectPermission(): void {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.permission = 'unsupported';
      return;
    }
    this.permission = Notification.permission;
  }

  private static readonly PROMPTED_KEY = 'runrealm_notif_prompted';

  /**
   * Ask for notification permission exactly once, on the first claim.
   * The claim click supplies the required user gesture; the
   * localStorage guard means an explicit deny is never re-prompted.
   */
  private async maybePromptOnceAfterClaim(): Promise<void> {
    if (this.permission !== 'default') return;
    try {
      if (localStorage.getItem(NotificationService.PROMPTED_KEY)) return;
      localStorage.setItem(NotificationService.PROMPTED_KEY, '1');
    } catch {
      return; // storage unavailable — skip the prompt rather than nag
    }
    await this.requestPermission();
  }

  getPermission(): NotificationPermission | 'unsupported' {
    return this.permission;
  }

  /**
   * Ask the user for notification permission. Must be called from a
   * user gesture (button click) on most browsers.
   */
  async requestPermission(): Promise<boolean> {
    this.detectPermission();
    if (this.permission === 'unsupported') return false;
    if (this.permission === 'granted') return true;
    try {
      const result = await Notification.requestPermission();
      this.permission = result;
      return result === 'granted';
    } catch (error) {
      console.warn('NotificationService: permission request failed:', error);
      return false;
    }
  }

  /**
   * Show a local notification. Falls back to an event-bus toast when
   * permission is missing so the message is never silently dropped.
   * `action` rides the notification click: a click on a notification is a
   * user gesture, so it may start flows (GPS prompts, permission asks) a
   * plain toast button could not. The fallback toast therefore stays
   * button-less — a button that only dead-ends is worse than none.
   */
  notify(
    title: string,
    body: string,
    tag?: string,
    action?: { text: string; callback: () => void }
  ): void {
    if (this.permission !== 'granted') {
      this.safeEmit('ui:toast', { message: `${title} — ${body}`, type: 'info', duration: 5000 });
      return;
    }
    try {
      const notification = new Notification(title, {
        body,
        tag,
        icon: '/apple-touch-icon-180x180.png',
        badge: '/apple-touch-icon-180x180.png',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
        if (action) {
          action.callback();
          return;
        }
        // Reopening focuses the map; open the dashboard territories tab
        // so context is one tap away.
        this.safeEmit('dashboard:open', { widgetId: 'territories' });
      };
    } catch (error) {
      console.warn('NotificationService: failed to show notification:', error);
    }
  }

  private setupEventListeners(): void {
    // One-time permission prompt: the first successful claim is a
    // high-intent moment ("this game talks to me"), and browsers
    // require the request to ride a user gesture — which a claim
    // always is. Only asked once, ever (localStorage guard), and only
    // while still in 'default' (never re-nags after an explicit deny).
    this.subscribe('territory:claimed', () => {
      void this.maybePromptOnceAfterClaim();
    });

    this.subscribe(
      'territory:vulnerable',
      (data: { territory: TerritoryLike & { name?: string } }) => {
        const territory = data.territory;
        const name = territory?.name ?? territory?.geohash ?? 'a territory';
        // Desk→runner conversion: when the fading ground has a ghost on
        // watch whose training bonus is still banked (or already lapsed),
        // the honest line names the walk as the rescue instead of a run —
        // that is the one defense the desk manager can do from a chair.
        const onWatch = territory?.id ? this.ghostHoldingTraining(territory.id) : null;
        if (territory?.id && onWatch) {
          this.maybeNudgeWalk(
            { territoryId: territory.id, territoryName: name, ghostName: onWatch.name },
            'vulnerable'
          );
          return;
        }
        this.notify(
          '🛡️ Territory under threat',
          `${name} defenses are fading. Run it again to hold your land.`,
          `vulnerable-${territory?.id}`
        );
      }
    );

    this.subscribe('territory:claimed', () => {
      this.notify('🏴 Territory claimed', 'New ground secured. Defend it by running.', 'claim');
    });

    this.subscribe(
      'ghost:raceCompleted',
      (data: {
        ghostId: string;
        ghostName: string;
        territoryId: string;
        territoryName?: string;
        ghostScore: number;
        userScore: number;
        winner: 'ghost' | 'user';
      }) => {
        const outcome =
          data.winner === 'user'
            ? `Your run held the line (${data.userScore} vs ${data.ghostScore}).`
            : `${data.ghostName} took it (${data.ghostScore} vs ${data.userScore}).`;
        this.notify('👻 Ghost race result', outcome, 'ghost-race');
        // Desk→runner conversion: a managed ghost lost, so the manager's
        // attachment has somewhere to go — a GPS-verified walk (+walkPoints)
        // on the same territory. Walking counts; running is optional.
        // Throttled per territory per day next to the decay summary, so a
        // losing streak reads as one invitation, not a nag.
        if (data.winner === 'user') this.maybeNudgeWalk(data, 'loss');
      }
    );

    this.subscribe(
      'territoryWalk:completed',
      (data: { pointsAwarded: number; distanceMeters: number }) => {
        this.notify(
          '🚶 Territory Walk verified',
          `+${data.pointsAwarded} defense points from ${Math.round(data.distanceMeters)}m away.`,
          'walk'
        );
      }
    );
  }

  private static readonly WALK_NUDGE_PREFIX = 'runrealm_walk_nudge_';

  /**
   * The ghost posted to this territory holding an unspent desk-training
   * bonus — banked and fresh, or banked but expired (the manager trained,
   * then never raced: the walking-off signal). `null` when no ghost is on
   * that ground or nothing is banked. Reads through the registry; a
   * missing ghost service means no nudge, never a throw.
   */
  private ghostHoldingTraining(territoryId: string): { id: string; name: string } | null {
    try {
      const ghosts = this.getSiblingService('ghostRunnerService') as
        | GhostRunnerService
        | {
            getGhosts?: () => Array<{
              id: string;
              name: string;
              lastDeployedTerritory: string | null;
            }>;
            getGhostTraining?: (id: string) => GhostTrainingState | undefined;
          }
        | null;
      const posted = ghosts?.getGhosts?.().find((g) => g.lastDeployedTerritory === territoryId);
      if (!posted) return null;
      const training = ghosts?.getGhostTraining?.(posted.id);
      return training ? { id: posted.id, name: posted.name } : null;
    } catch {
      return null;
    }
  }

  /**
   * The desk→runner invitation: the rescue a manager can actually do —
   * a GPS-verified walk on ground they are attached to. Fired from two
   * places: a managed ghost lost its race, and a ghost-defended territory
   * drifted vulnerable while its training bonus sat unspent. One nudge per
   * territory per day across both triggers (localStorage guard), so a
   * losing streak reads as one invitation, not a nag. The invitation carries
   * a one-tap "Walk there" action that deep-links into the Territory Walk —
   * honest about distance, since the walk service verifies GPS on arrival.
   * Silent in private mode.
   */
  private maybeNudgeWalk(
    data: { territoryId: string; territoryName?: string; ghostName: string },
    kind: 'loss' | 'vulnerable'
  ): void {
    try {
      const key = NotificationService.WALK_NUDGE_PREFIX + data.territoryId;
      const last = Number(localStorage.getItem(key) ?? 0);
      if (Date.now() - last < DAY_MS) return;
      const line =
        kind === 'loss'
          ? ghostLostNeedsWalkLine(
              data.ghostName,
              data.territoryName ?? data.territoryId,
              GAME_RULES.economy.walkPoints
            )
          : ghostNeedsWalkLine(
              data.ghostName,
              data.territoryName ?? data.territoryId,
              GAME_RULES.economy.walkPoints
            );
      this.notify(line.title, line.body, `walk-nudge-${data.territoryId}`, {
        // One-tap rescue: the same `territoryWalk:startRequested` event the
        // dashboard and return-card walk buttons use, not a direct service
        // call — one path for every walk start. The walk service answers
        // honestly (GPS-verified +150 within arrival radius, a plain readable
        // reason when not), so the tap can never fake a defense. Only the
        // granted-permission path gets the button: a notification click is a
        // user gesture, which is what the GPS prompt needs to appear.
        text: 'Walk there',
        callback: () =>
          this.safeEmit('territoryWalk:startRequested', { territoryId: data.territoryId }),
      });
      localStorage.setItem(key, String(Date.now()));
    } catch {
      // Storage unavailable — skip silently.
    }
  }

  /**
   * Once per day, surface the weakest territory as a re-entry prompt:
   * "Your territory at X lost N points today." Only fires when there
   * is actually something decaying worth reporting.
   */
  private showDecaySummary(): void {
    try {
      const last = Number(localStorage.getItem(DECAY_SUMMARY_KEY) ?? 0);
      if (Date.now() - last < DAY_MS) return;

      const raw = localStorage.getItem('runrealm_claimed_territories');
      if (!raw) return;
      // Territories ship in a versioned envelope (v2); legacy bare
      // arrays are adopted by the same open path. Anything degraded to
      // fresh means there is nothing worth nagging about.
      const opened = openVersioned<Array<TerritoryLike & { name?: string }>>(raw, {
        floor: 1,
        head: 2,
        steps: [
          {
            toVersion: 1,
            note: 'base territory array',
            migrate: (v) => v as Array<TerritoryLike & { name?: string }>,
            validate: (v) => {
              if (!Array.isArray(v)) throw new RangeError('territories: expected an array');
              return v as Array<TerritoryLike & { name?: string }>;
            },
          },
          {
            toVersion: 2,
            note: 'defense-state backfill (pass-through for readers)',
            migrate: (v) => v as Array<TerritoryLike & { name?: string }>,
            validate: (v) => {
              if (!Array.isArray(v)) throw new RangeError('territories: expected an array');
              return v as Array<TerritoryLike & { name?: string }>;
            },
          },
        ],
        fresh: () => [],
      });
      const territories = opened.state;
      if (territories.length === 0) return;

      const weakest = territories.reduce((min, t) =>
        (t.activityPoints ?? 500) < (min.activityPoints ?? 500) ? t : min
      );
      const points = weakest.activityPoints ?? 500;

      // Silence by default; nudge while slipping, escalate when falling.
      // Both tiers share the once-a-day throttle below.
      const name = weakest.name ?? weakest.geohash ?? 'one of your territories';
      const digest = decayDigestFor(points, name);
      if (!digest) return;
      this.notify(digest.title, digest.body, 'decay-summary');
      localStorage.setItem(DECAY_SUMMARY_KEY, String(Date.now()));
    } catch {
      // Storage unavailable (private mode) — skip silently.
    }
  }
}
