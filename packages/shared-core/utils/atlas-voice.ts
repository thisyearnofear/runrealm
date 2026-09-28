/**
 * Atlas Voice — the game's single source of written warmth.
 *
 * RunRealm's metaphor is cartographic (docs/design-improvement-plan.md):
 * a run exposes the world, a claim develops the realm, a decaying cell
 * overexposes. Copy has to live in that world, not in a fitness dashboard.
 * Every user-facing line that narrates state — loading, milestones, returns,
 * ceremony, errors — comes from here so the voice stays one voice.
 *
 * House rules for anything added to these banks:
 * - Warm and playful. Address the runner. Small jokes are welcome; scolding
 *   is not. Never blame the runner for a failure.
 * - About the atlas: paper, light, ground, film, survey, weather, distance.
 * - Short. Toasts live on a phone: aim for 60 characters, hard cap ~120.
 * - Never the banned register: neon, glow, pulse, crypto, optimize, synergy,
 *   "successfully", "failed to", "dashboard".
 * - Every error says what happens next. Nothing dead-ends.
 * - Deterministic: `pickLine` hashes its key, so the same moment always reads
 *   the same way (no Math.random, and therefore testable).
 */

import { seedFromString } from './seeded-rng';

/** Hard cap for a single narrated line — toasts must not become paragraphs. */
export const VOICE_MAX_LINE = 140;

/**
 * The register we are steering away from: generic dashboard/neon language the
 * design contract bans. Exported so tests (and reviewers) can hold new copy to
 * the same rule instead of trusting memory.
 */
export const VOICE_BANNED_TERMS = [
  'neon',
  'glow',
  'pulse',
  'crypto card',
  'optimize',
  'optimizing',
  'synergy',
  'successfully',
  'failed to',
  'dashboard',
  'loading',
  'error:',
] as const;

/**
 * Deterministic pick. The same `key` always selects the same line, so a moment
 * reads identically on every device (and in tests). Give the key the state that
 * makes the moment unique — `km:4:steady`, `return:2d:3`.
 */
export function pickLine<T>(items: readonly T[], key: string): T {
  if (items.length === 0) throw new Error('pickLine: empty line bank');
  return items[seedFromString(key) % items.length] as T;
}

// ─────────────────────────────────────────────────────────────
// Working lines — what the app says while it is busy.
// Keys are the UIService contextual-message keys, so the loading
// bank and the toast bank can never drift apart.
// ─────────────────────────────────────────────────────────────

export const WORKING_LINES = {
  aiRoute: [
    'Reading the ground between here and where you want to be.',
    'Drawing a line across the map. No promises about hills.',
    'Looking for a route that is worth the paper it is drawn on.',
    'Plotting something scenic enough to be worth the effort.',
  ],
  walletConnect: [
    'Opening the ledger — just the handshake, not your history.',
    'Waking the wallet up. One moment.',
    'Checking your keys, quietly.',
    'Knocking on the door of your wallet.',
  ],
  territoryLoad: [
    'Unrolling the local map.',
    'Walking the survey — seeing who has been here.',
    'Counting the claims around you.',
    'Reading the ground you are standing on.',
  ],
  crossChain: [
    'Carrying the deed across the bridge.',
    'One network is talking to another. Politely.',
    'Anchoring the claim where it can be found from both sides.',
  ],
} as const;

/** A working line for one of the `WORKING_LINES` banks. */
export function workingLine(key: keyof typeof WORKING_LINES, salt = ''): string {
  return pickLine(WORKING_LINES[key], `working:${key}:${salt}`);
}

// ─────────────────────────────────────────────────────────────
// The run — settle in, keep going, come home.
// ─────────────────────────────────────────────────────────────

export type PaceFeel = 'brisk' | 'steady' | 'easy';

/** Pace feel in seconds per kilometre. Non-judgemental by design: nothing
 *  here calls a runner slow. */
export function paceFeel(secondsPerKm: number): PaceFeel {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return 'steady';
  if (secondsPerKm < 330) return 'brisk';
  if (secondsPerKm < 420) return 'steady';
  return 'easy';
}

export interface MilestoneContext {
  /** Whole kilometres completed. */
  km: number;
  /** Seconds per kilometre, or 0 when unknown. */
  paceSecPerKm?: number;
}

type Template = (ctx: MilestoneContext) => string;

/** One line per band, so the thousandth kilometre doesn't read like the first. */
const MILESTONE_BANDS: Record<MilestoneBand, readonly Template[]> = {
  tenPlus: [
    (c) => `${c.km} km. This is a proper expedition now.`,
    (c) => `${c.km} km — the distance that ends up in someone else's ghost run.`,
    (c) => `${c.km} km. Whoever races your ghost next has no idea what is waiting.`,
  ],
  sevenToNine: [
    (c) => `${c.km} km. You have outlasted the good ideas and the bad ones.`,
    (c) => `${c.km} km — deeper water, and you are still swimming.`,
    (c) => `${c.km} km. Most of what you can see is yours now.`,
  ],
  fourToSix: [
    (c) => `${c.km} km. This is the part most people never see.`,
    (c) => `${c.km} km — the horizon has stopped arguing with you.`,
    (c) => `${c.km} km, and the ground behind you keeps developing.`,
  ],
  twoToThree: [
    (c) => `${c.km} km traced, and the light is holding steady.`,
    (c) => `${c.km} km. Your legs and the map have reached an understanding.`,
    (c) => `${c.km} km in — everything after this is a gift.`,
  ],
  one: [
    (c) => `${c.km} km down. The first line is always the bravest.`,
    (c) => `${c.km} km on the paper. The atlas is paying attention now.`,
    (c) => `${c.km} km — enough to change the shape of the morning.`,
  ],
};

type MilestoneBand = 'one' | 'twoToThree' | 'fourToSix' | 'sevenToNine' | 'tenPlus';

/** Band lookup by whole kilometres. Named keys beat array indexing here: no
 *  possibly-missing element to guard, and the thresholds read top-down. */
function milestoneBand(km: number): MilestoneBand {
  if (km >= 10) return 'tenPlus';
  if (km >= 7) return 'sevenToNine';
  if (km >= 4) return 'fourToSix';
  if (km >= 2) return 'twoToThree';
  return 'one';
}

const PACE_ASIDES: Record<PaceFeel, readonly Template[]> = {
  brisk: [
    () => 'Moving like weather.',
    () => 'Quick enough that the map has to hurry to keep up.',
    () => 'Something in the legs has decided today is a good day.',
  ],
  steady: [
    () => 'Holding a rhythm the map can read.',
    () => 'Settled, and still going.',
    () => 'Steady is the whole trick.',
  ],
  easy: [
    () => 'Unhurried. Unbothered.',
    () => 'Taking the morning at your own pace.',
    () => 'Slow miles still develop ground.',
  ],
};

/**
 * The line shown when a whole kilometre lands. Pace flavour is withheld from
 * every second kilometre so the voice reads as a companion dropping in, not a
 * stopwatch that won't stop talking.
 */
export function milestoneLine(ctx: MilestoneContext): string {
  const km = Math.max(1, Math.floor(ctx.km));
  const band = MILESTONE_BANDS[milestoneBand(km)];
  const base = pickLine(band, `km:${km}:${paceFeel(ctx.paceSecPerKm ?? 0)}`)({ ...ctx, km });
  if (km % 2 !== 0) return base;
  const aside = pickLine(PACE_ASIDES[paceFeel(ctx.paceSecPerKm ?? 0)], `aside:${km}`);
  return `${base} ${aside({ ...ctx, km })}`;
}

/** Settling-in line for the first moments of a run. */
export function runStartLine(opts: { firstEver?: boolean } = {}): string {
  if (opts.firstEver) {
    return pickLine(
      [
        'Your first exposure. There is no wrong way to do this.',
        'Nothing is expected of you today except walking out of the door.',
      ],
      'run:start:first'
    );
  }
  return pickLine(
    [
      'Paper ready. Take the first step when you are.',
      'The map is open and the light is on your side. Off you go.',
      'Starting the exposure. Nothing here but you and the ground.',
    ],
    'run:start'
  );
}

export interface RunCompleteContext {
  distanceLabel: string;
  /** '' when the clock is unknown — the line then drops the time clause. */
  durationLabel: string;
  /** Territories developed by this run, if any. */
  developedCount?: number;
}

/** '5.02 km in 27 min', or just the distance when no honest duration exists. */
function distanceAndTime(ctx: RunCompleteContext): string {
  return ctx.durationLabel ? `${ctx.distanceLabel} in ${ctx.durationLabel}` : ctx.distanceLabel;
}

/** Wind-down line once a run is filed. */
export function runCompleteLine(ctx: RunCompleteContext): string {
  const travelled = distanceAndTime(ctx);
  const bank = ctx.developedCount
    ? [
        `${travelled}, and ${ctx.developedCount} new ground developed. The realm is measurably bigger.`,
        `${travelled}, and ${ctx.developedCount} cells settled into verdigris. Sit down.`,
      ]
    : [
        `${travelled}. The ground remembers even the unclaimed miles.`,
        `${travelled}. Go and eat something ridiculous.`,
        `${travelled}. Filed under: yours.`,
      ];
  return pickLine(bank, `run:done:${ctx.distanceLabel}:${ctx.developedCount ?? 0}`);
}

// ─────────────────────────────────────────────────────────────
// Territory — nearby, developing, overexposed.
// ─────────────────────────────────────────────────────────────

export type TerritoryFeel = 'owned' | 'vulnerable' | 'claimable' | 'unknown';

/** One short line for ground you are standing near. */
export function nearbyTerritoryLine(opts: {
  name: string;
  meters: number;
  feel: TerritoryFeel;
}): string {
  const m = Math.max(0, Math.round(opts.meters));
  const bank: Record<TerritoryFeel, readonly string[]> = {
    owned: [
      `You are ${m} m from ${opts.name} — still yours, still holding.`,
      `${opts.name} is ${m} m away. Nothing needed from you. Just saying hello.`,
    ],
    vulnerable: [
      `${opts.name} is ${m} m away and looking thin. A short detour would settle it.`,
      `${m} m to ${opts.name}, which has drifted into overexposure.`,
    ],
    claimable: [
      `Nobody owns the ground ${m} m away. Just saying.`,
      `${opts.name} is ${m} m off and still unclaimed.`,
    ],
    unknown: [`${m} m to ${opts.name}.`],
  };
  return pickLine(bank[opts.feel], `nearby:${opts.name}:${m}:${opts.feel}`);
}

/** Announced when a claim's defense state changes. */
export function defenseChangedLine(opts: { name: string; feel: TerritoryFeel }): string {
  switch (opts.feel) {
    case 'vulnerable':
      return pickLine(
        [
          `${opts.name} has drifted into overexposure. One more outing would settle it.`,
          `${opts.name} is fading. It is not lost — it just needs feet.`,
        ],
        `def:vuln:${opts.name}`
      );
    case 'owned':
      return pickLine(
        [`${opts.name} has settled into verdigris. Good.`, `${opts.name} is holding again.`],
        `def:owned:${opts.name}`
      );
    case 'claimable':
      return `${opts.name} is unclaimed ground with your name half on it.`;
    default:
      return `${opts.name} changed state. The map will show it.`;
  }
}

// ─────────────────────────────────────────────────────────────
// Coming back — the cosiest moment the game has.
// ─────────────────────────────────────────────────────────────

/**
 * Human phrasing for how long someone was gone. Deliberately coarse — the
 * card is a welcome, not a stopwatch. Returns a fragment ('3 days') that the
 * return lines drop straight into a sentence.
 */
export function formatAbsence(absenceMs: number): string {
  if (!Number.isFinite(absenceMs) || absenceMs <= 0) return 'a moment';
  const hours = absenceMs / (60 * 60 * 1000);
  if (hours < 0.75) return 'a moment';
  if (hours < 20) return 'a few hours';
  const days = Math.round(hours / 24);
  if (days <= 1) return 'a day';
  if (days < 8) return `${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks <= 1) return 'a week';
  if (weeks < 5) return `${weeks} weeks`;
  return 'a while';
}

/** Greeting for a return. `absenceLabel` is pre-formatted ('3 days'). */
export function returnGreeting(absenceLabel: string, salt = ''): string {
  return pickLine(
    [
      `Back after ${absenceLabel}. The atlas kept your seat.`,
      `You were gone ${absenceLabel}. It is good to have you on the ground again.`,
      `${absenceLabel} away — nothing here was urgent, and it is all still yours.`,
    ],
    `return:greet:${absenceLabel}:${salt}`
  );
}

/** What happened to the realm while the runner was away. */
export function returnSummary(opts: { crossings: number; developedCount?: number }): string {
  const count = Math.max(0, Math.floor(opts.crossings));
  const claimWord = count === 1 ? 'claim' : 'claims';
  const cellWord = count === 1 ? 'cell' : 'cells';
  const needs = count === 1 ? 'needs' : 'need';
  const bank = [
    `${count} of your ${claimWord} got thin while you were out.`,
    `${count} ${claimWord} ${needs} a look — nothing dramatic, just attention.`,
    `The realm moved on without you: ${count} ${cellWord} overexposed.`,
  ];
  const base = pickLine(bank, `return:summary:${count}`);
  if (!opts.developedCount) return base;
  const heldWord = opts.developedCount === 1 ? 'claim' : 'claims';
  return `${base} ${opts.developedCount} ${heldWord} held firm the whole time.`;
}

/** Nothing happened — which is a fine thing to be told. */
export function returnQuiet(absenceLabel: string): string {
  return pickLine(
    [
      `${absenceLabel} away and the realm is exactly as you left it.`,
      `Everything held while you were gone. Quiet is a good outcome.`,
    ],
    `return:quiet:${absenceLabel}`
  );
}

// ─────────────────────────────────────────────────────────────
// Ceremony — the moments worth stopping for.
// ─────────────────────────────────────────────────────────────

export function levelUpLine(level: number): string {
  return pickLine(
    [
      `Level ${level}. The atlas has more room for you now.`,
      `Level ${level} — you are getting better at this, and the map agrees.`,
      `Level ${level}. New ground is within reach.`,
    ],
    `level:${level}`
  );
}

/** Ground is claimable but the run has to finish first. */
export function claimReadyLine(): string {
  return pickLine(
    [
      'Ground ready to claim — finish the run and it is yours.',
      'This is claimable ground. A little further and it is on the map for good.',
    ],
    'claim:ready'
  );
}

export function challengeCompleteLine(title: string): string {
  return pickLine(
    [
      `${title} done. It was on the list for a reason.`,
      `${title} complete — the list is shorter than it was.`,
    ],
    `challenge:${title}`
  );
}

export function achievementLine(name: string): string {
  return pickLine(
    [
      `${name} unlocked. That one was earned in daylight.`,
      `${name} — pinned to the corner of your map.`,
      `${name}. Nobody handed you that.`,
    ],
    `achv:${name}`
  );
}

// ─────────────────────────────────────────────────────────────
// The ledger — rewards, staking, tending ground, and the ghost.
// These are all 'quiet paperwork' moments: warm, but never shouty.
// ─────────────────────────────────────────────────────────────

/** Whatever is not on the map yet. `what` keeps the sentence specific. */
export function notOnChainLine(what: 'boost' | 'contest' | 'reads'): string {
  const action = what === 'reads' ? 'read what it holds' : what;
  return pickLine(
    [
      `That claim is still only on paper. Finish a run there first, then you can ${action}.`,
      `Nothing to ${action} yet — this ground has not been claimed on chain.`,
    ],
    `onchain:${what}`
  );
}

/** A claim the service was asked about but cannot find. Never a raw 'not found'. */
export function claimMissingLine(): string {
  return pickLine(
    ['That claim is not on your map. It may have moved on without you.'],
    'claim:missing'
  );
}

/** A claim just landed. The first of many, as far as the map is concerned. */
export function claimTakenLine(): string {
  return pickLine(
    [
      'That ground is yours now — drawn on the map for good.',
      'Filed and yours. The deed is on the map.',
    ],
    'claim:taken'
  );
}

/** Location trouble. Never a wall of jargon, never the runner's fault. */
export function locationTroubleLine(kind: 'unavailable' | 'timeout'): string {
  if (kind === 'timeout') {
    return pickLine(
      ['Location took its time and gave up. Ask again and it usually answers.'],
      'loc:timeout'
    );
  }
  return pickLine(
    ['The atlas cannot place you right now. Step into the open and try once more.'],
    'loc:unavailable'
  );
}

/** Bringing runs in from an outside service. */
export function syncFailedLine(source: string): string {
  return pickLine(
    [
      `${source} did not answer, so nothing was brought over. Your runs are safe where they are.`,
      `Could not reach ${source}. Nothing is lost — worth another try in a moment.`,
    ],
    `sync:fail:${source}`
  );
}

/** Tending a claim — the daily activity boost. */
export function boostUsedTodayLine(): string {
  return pickLine(
    [
      'This ground has had its attention today. It takes more after midnight UTC.',
      'Already tended today — the next feeding is after midnight UTC.',
    ],
    'boost:used'
  );
}

export function boostConfirmedLine(points: number): string {
  return pickLine(
    [`Ground tended. +${points} to its hold.`, `Fed and firm — +${points} defense on that claim.`],
    `boost:ok:${points}`
  );
}

/** The chain refused the boost, or the call threw. Say what survived. */
export function boostFailedLine(): string {
  return pickLine(
    [
      'The boost did not take. Your REALM stayed in the wallet and the claim is unchanged.',
      'That one did not land. Nothing was spent, and the ground is as it was.',
    ],
    'boost:fail'
  );
}

/** Rewards — claiming and staking read as filing, not as a transaction log. */
export function claimingLine(): string {
  return pickLine(['Filing your rewards.'], 'rewards:claiming');
}

export function claimedLine(amount: string): string {
  return pickLine(
    [`${amount} REALM filed with the rest.`, `${amount} REALM added to your ledger.`],
    `rewards:claimed:${amount}`
  );
}

export function unstakingLine(): string {
  return pickLine(['Drawing your stake back in.'], 'rewards:unstaking');
}

export function unstakedLine(amount: string, rewards: string): string {
  return pickLine(
    [
      `${amount} REALM is back in the wallet, with ${rewards} along for the ride.`,
      `${amount} REALM returned — and ${rewards} of rewards came with it.`,
    ],
    `rewards:unstaked:${amount}:${rewards}`
  );
}

export function nothingToClaimLine(): string {
  return pickLine(
    ['Nothing filed up yet. Claims earn while they sit, so it will fill in.'],
    'rewards:empty'
  );
}

export function nothingStakedLine(): string {
  return pickLine(
    ['Nothing staked just now — stake a claim and it starts working.'],
    'rewards:unstaked:empty'
  );
}

/** Ledger actions that fell over. Both say the money did not move. */
export function ledgerFailedLine(kind: 'claim' | 'unstake'): string {
  const verb = kind === 'claim' ? 'claim' : 'withdrawal';
  return pickLine(
    [
      `The ${verb} did not go through. Nothing moved out of the wallet — worth another go.`,
      `That ${verb} stopped short. Everything is where it was, and you can retry.`,
    ],
    `rewards:fail:${kind}`
  );
}

/** Showing or tucking the game widgets away. */
export function widgetModeLine(visible: boolean): string {
  return visible
    ? pickLine(['Widgets are laid out on the map now.'], 'widgets:on')
    : pickLine(['Widgets tucked away — just the map from here.'], 'widgets:off');
}

/** A ghost runner filed against one of your claims. */
export function ghostDeployedLine(): string {
  return pickLine(
    [
      'Ghost posted. It will hold that ground while you are elsewhere.',
      'Your ghost is on watch — that claim defends itself now.',
    ],
    'ghost:deployed'
  );
}

export function ghostDeployFailedLine(): string {
  return pickLine(
    ['The ghost did not take the post. Your claim is untouched — try again.'],
    'ghost:failed'
  );
}

/** A route finished drawing. */
export function routeReadyLine(): string {
  return pickLine(['Route drawn. Press start when you are ready to walk it.'], 'route:ready');
}

/** A race replay that does not recompute is refused rather than faked. */
export function replayRefusedLine(): string {
  return pickLine(
    ['This replay does not recompute, so we will not pretend it happened.'],
    'replay:refused'
  );
}

/** A shared replay link that did not decode. Not the runner's fault. */
export function replayLinkBadLine(): string {
  return pickLine(
    [
      'That replay link did not open. Nothing is broken — ask for it again and it will come through.',
    ],
    'replay:link'
  );
}

/** The last onboarding card. */
export function onboardingWelcomeLine(): string {
  return pickLine(
    ['That is the tour. The map is yours — walk out the door and it starts filling in.'],
    'onboarding:welcome'
  );
}

/**
 * A run the device was still holding when the runner came back. The first
 * rule is that it must not read as a finished run: the runner did not close
 * this one, so it earns no claim, and the copy must not imply otherwise. The
 * second is that it must not read as a failure either — the work happened,
 * the phone simply went away mid-stride.
 */
export function runRecoveredLine(distanceLabel: string, durationLabel: string): string {
  return pickLine(
    [
      `Last time out we got ${distanceLabel} in ${durationLabel} before the phone ran out of road. Kept, and still yours.`,
      `There is an unfinished run from before — ${distanceLabel} over ${durationLabel}. The map kept it.`,
    ],
    `run:recovered:${distanceLabel}`
  );
}

/** The runner chooses to file the interrupted run or let it go. */
export function runRecoveredActionLine(): string {
  return pickLine(['Keep it', 'Save this run'], 'run:recovered:action');
}

export function runRecoveredDiscardLine(): string {
  return pickLine(['Let it go', 'Start fresh'], 'run:recovered:discard');
}

/** A recovered run cannot be claimed — it was never closed. */
export function runRecoveredNoClaimLine(): string {
  return pickLine(
    ['That one was never closed, so it does not develop ground. Close a run and it will.'],
    'run:recovered:no-claim'
  );
}

/** Nothing was waiting to be recovered, said plainly and without fuss. */
export function runRecoveredNoneLine(): string {
  return pickLine(['No unfinished run to pick up. Fresh map.'], 'run:recovered:none');
}

// ─────────────────────────────────────────────────────────────
// The phone. Same voice, no emoji, nothing shouting.
// ─────────────────────────────────────────────────────────────

/**
 * Section and screen titles, without the emoji the old build hung on them.
 * Emoji in a title reads as decoration; a title should just name the place.
 */
export const MOBILE_TITLES = {
  ghosts: 'Ghost runners',
  coach: 'Coach',
  route: 'Suggested route',
  claim: 'Claim this ground',
  profile: 'Your record',
  settings: 'Settings',
  history: 'Run history',
  dashboard: 'Your survey',
  stats: 'Your figures',
  currentRun: 'This run',
  activity: 'Recent ground',
  territories: 'Territories',
  wallet: 'Wallet',
  challenges: 'Challenges',
  insights: 'Coach notes',
  achievements: 'Achievements',
  units: 'Units',
  notifications: 'Notifications',
  fitness: 'Fitness link',
  about: 'About',
  map: 'Map',
} as const;

export function mobileTitle(kind: keyof typeof MOBILE_TITLES): string {
  return MOBILE_TITLES[kind];
}

/** The mobile tour — four cards, same promise as the web one. */
export const MOBILE_ONBOARDING = [
  {
    id: 'mobile-welcome',
    title: 'Welcome to the realm',
    description: 'Run, and the world around you starts to show itself.',
  },
  {
    id: 'mobile-gps',
    title: 'Finding you',
    description: 'Location is a one-time ask. It is what lets the map draw itself.',
  },
  {
    id: 'mobile-first-run',
    title: 'Your first run',
    description: 'Press start and go. A loop is usually enough to trace your first claim.',
  },
  {
    id: 'mobile-territories',
    title: 'Ground you develop',
    description: 'A claim is a deed — yours to develop, and yours to defend.',
  },
] as const;

/** A wallet that is mid-handshake. */
export function walletConnectingLine(): string {
  return pickLine(
    ['Opening the ledger. One moment.', 'Checking your keys, quietly.'],
    'wallet:connecting'
  );
}

export function walletConnectFailedLine(): string {
  return pickLine(
    ['The wallet did not answer. Nothing moved — worth another go.'],
    'wallet:connect-failed'
  );
}

/** A ghost spent REALM and got stronger. */
export function ghostUpgradedLine(level: number): string {
  return pickLine(
    [
      `The ghost came back sharper — level ${level} now.`,
      `Level ${level}. It moves a little lighter on its feet.`,
    ],
    `ghost:upgraded:${level}`
  );
}

export function ghostUpgradeFailedLine(): string {
  return pickLine(
    ['The upgrade did not take. Your balance is unchanged — try again when you like.'],
    'ghost:upgrade-failed'
  );
}

/** The ghost roster could not be read. */
export function ghostRosterFailedLine(): string {
  return pickLine(
    ['The ghost roster would not open. Pull to try again — nothing is lost.'],
    'ghost:roster-failed'
  );
}

/** No claim is fading, so there is no post worth filing. */
export function noPostWorthTakingLine(): string {
  return pickLine(
    ['Nothing of yours is fading right now, so there is no post to fill.'],
    'ghost:no-post'
  );
}

/** Strava and friends. */
export function stravaLinkedLine(): string {
  return pickLine(['Strava is linked. Your runs will walk over on their own.'], 'strava:linked');
}

export function stravaLinkFailedLine(): string {
  return pickLine(
    ['Strava did not link up. Nothing was shared — try again when you are ready.'],
    'strava:link-failed'
  );
}

/** The coach on the run screen, and the route it would draw for you. */
export function coachQuietLine(): string {
  return pickLine(
    [
      'The coach has nothing to say. That is usually a good sign.',
      'Nothing to add from the coach this time.',
    ],
    'coach:quiet'
  );
}

export function coachTroubleLine(): string {
  return pickLine(
    ['The coach is out of earshot for a moment. The run is unaffected.'],
    'coach:trouble'
  );
}

export function routeSearchLine(): string {
  return pickLine(
    [
      'Reading the ground between here and where you want to be.',
      'Looking for a line worth the paper it is drawn on.',
    ],
    'route:search'
  );
}

export function routeSearchFailedLine(): string {
  return pickLine(
    ['No line came back this time. Your position is fine — try again in a moment.'],
    'route:search-failed'
  );
}

/** A run finished but the device could not file it yet. */
export function runNotFiledLine(): string {
  return pickLine(
    ['The run is finished, but the device would not file it. It is safe here and will catch up.'],
    'run:not-filed'
  );
}

export function trackingStartFailedLine(): string {
  return pickLine(
    ['The run would not start. Location is the usual reason — worth a look in settings.'],
    'tracking:start-failed'
  );
}

export function trackingStopFailedLine(): string {
  return pickLine(
    ['Stopping was awkward, but the run is still on the device. Nothing was lost.'],
    'tracking:stop-failed'
  );
}

/** The claim sheet, from preview to signed. */
export function claimNeedsWalletLine(): string {
  return pickLine(
    ['A wallet is needed to hold a deed. Connect one and the claim is a tap away.'],
    'claim:needs-wallet'
  );
}

export function claimConfirmPromptLine(): string {
  return pickLine(['Confirm in your wallet and the ground becomes yours.'], 'claim:confirm-prompt');
}

export function claimFiledLine(name: string): string {
  return pickLine(
    [`${name} is yours. It will need walking to keep it bright.`],
    `claim:filed:${name}`
  );
}

/** A run long enough to trace a claim. */
export function claimEligibleLine(): string {
  return pickLine(['Enough ground to claim. The deed is ready when you are.'], 'claim:eligible');
}

/** Claims within reach of where the runner is standing. */
export function nearbyClaimsCountLine(count: number): string {
  return count === 1 ? 'One claim within reach.' : `${count} claims within reach.`;
}

/** A challenge reward landed. `type` is whatever the challenge calls it. */
export function challengeRewardLine(amount: number, type: string): string {
  return pickLine(
    [`Collected — ${amount} ${type.toUpperCase()} is yours.`],
    `challenge:reward:${amount}:${type}`
  );
}

/** A challenge reward did not land. The work still counts. */
export function challengeRewardFailedLine(): string {
  return pickLine(
    ['The reward did not arrive. The work still counts — it will be there next time.'],
    'challenge:reward-failed'
  );
}

// ─────────────────────────────────────────────────────────────
// Ugh — failures. Never a dead end, never the runner's fault.
// ─────────────────────────────────────────────────────────────

export type ErrorKind =
  | 'routeFailed'
  | 'walletFailed'
  | 'locationMissing'
  | 'claimFailed'
  | 'offline'
  | 'generic';

export interface ErrorCopy {
  message: string;
  /** Suggested button label; the caller attaches the actual recovery. */
  action?: string;
}

const ERRORS: Record<ErrorKind, ErrorCopy> = {
  routeFailed: {
    message: 'That route would not draw. Shall we try another line?',
    action: 'Try another line',
  },
  walletFailed: {
    message: 'The wallet did not answer. It does that sometimes — nothing was lost.',
    action: 'Try again',
  },
  locationMissing: {
    message: 'The atlas cannot place you without location. It is a one-time ask.',
    action: 'Allow location',
  },
  claimFailed: {
    message: 'The claim did not go through. Your run is safe and nothing was spent.',
    action: 'Try the claim again',
  },
  offline: {
    message: 'No signal out here. The run is safe on the device — it will file itself later.',
  },
  generic: {
    message: 'Something on our side went sideways. Worth another go in a moment.',
    action: 'Try again',
  },
};

export function errorCopy(kind: ErrorKind): ErrorCopy {
  return ERRORS[kind];
}

// ─────────────────────────────────────────────────────────────
// Empty states and the next move.
// ─────────────────────────────────────────────────────────────

export type EmptySurface = 'leaderboard' | 'fog' | 'dashboard' | 'claims';

const EMPTY_STATES: Record<EmptySurface, readonly string[]> = {
  leaderboard: [
    'No runs on the board yet. Yours would be the first.',
    'The board is empty and entirely up for grabs.',
  ],
  fog: ['Nobody has claimed this stretch yet. It is all still open country.'],
  dashboard: ['Nothing filed yet. Walk out the door and the map will start filling in.'],
  claims: ['No claims yet. One good run is usually enough for the first one.'],
};

export function emptyStateLine(surface: EmptySurface, salt = ''): string {
  return pickLine(EMPTY_STATES[surface], `empty:${surface}:${salt}`);
}

export type NextActionKind =
  | 'start-run'
  | 'claim-ground'
  | 'defend-territory'
  | 'walk-territory'
  | 'connect-wallet'
  | 'connect-location';

/** The single most useful thing the runner could do right now, in one line. */
export function nextActionHint(kind: NextActionKind, detail?: string): string {
  switch (kind) {
    case 'start-run':
      return pickLine(
        ['Ready when you are — the map is already open.', 'One tap and the exposure starts.'],
        `next:${kind}`
      );
    case 'claim-ground':
      return detail
        ? `You just traced ${detail}. Claim it before someone else does.`
        : 'You have ground ready to claim.';
    case 'defend-territory':
      return detail
        ? `${detail} is losing ground. An easy run would fix it.`
        : 'One of your claims is fading.';
    case 'walk-territory':
      return detail
        ? `You are close to ${detail} — walking in tops it up for today.`
        : 'A territory walk is available nearby.';
    case 'connect-wallet':
      return 'Connect a wallet to claim the ground you trace.';
    case 'connect-location':
      return 'Let the atlas find you and the map fills in around you.';
    default:
      return 'The map is open.';
  }
}
