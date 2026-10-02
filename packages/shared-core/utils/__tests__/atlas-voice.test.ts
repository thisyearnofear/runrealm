/**
 * Atlas Voice — the copy contract.
 *
 * These tests exist so the voice can't quietly rot back into dashboard
 * language: every line any bank can produce is swept and held to the same
 * rules (length, register, punctuation), and the vocabulary list from
 * docs/design-improvement-plan.md is enforced mechanically rather than by
 * memory.
 */
import {
  achievementLine,
  boostConfirmedLine,
  boostFailedLine,
  boostUsedTodayLine,
  challengeCompleteLine,
  challengeRewardFailedLine,
  challengeRewardLine,
  claimConfirmPromptLine,
  claimEligibleLine,
  claimedLine,
  claimFiledLine,
  claimingLine,
  claimMissingLine,
  claimNeedsWalletLine,
  claimReadyLine,
  claimTakenLine,
  coachQuietLine,
  coachTroubleLine,
  defenseChangedLine,
  type ErrorKind,
  emptyStateLine,
  errorCopy,
  formatAbsence,
  ghostDeployedLine,
  ghostDeployFailedLine,
  ghostRosterFailedLine,
  ghostUpgradedLine,
  ghostUpgradeFailedLine,
  LEGACY_ONBOARDING_STEPS,
  ledgerFailedLine,
  levelUpLine,
  locationTroubleLine,
  MOBILE_ONBOARDING,
  MOBILE_TITLES,
  milestoneLine,
  mobileTitle,
  type NextActionKind,
  nearbyClaimsCountLine,
  nearbyTerritoryLine,
  nextActionHint,
  noPostWorthTakingLine,
  nothingStakedLine,
  nothingToClaimLine,
  notOnChainLine,
  onboardingWelcomeLine,
  paceFeel,
  pickLine,
  replayLinkBadLine,
  replayRefusedLine,
  returnGreeting,
  returnQuiet,
  returnSummary,
  routeReadyLine,
  routeSearchFailedLine,
  routeSearchLine,
  runCompleteLine,
  runNotFiledLine,
  runStartLine,
  stravaLinkedLine,
  stravaLinkFailedLine,
  syncFailedLine,
  type TerritoryFeel,
  trackingStartFailedLine,
  trackingStopFailedLine,
  unstakedLine,
  unstakingLine,
  VOICE_BANNED_TERMS,
  VOICE_MAX_LINE,
  WORKING_LINES,
  walletConnectFailedLine,
  walletConnectingLine,
  widgetModeLine,
  workingLine,
} from '../atlas-voice';

const PACES = [270, 360, 480];
const FEELS: TerritoryFeel[] = ['owned', 'vulnerable', 'claimable', 'unknown'];
const WORKING_KEYS = Object.keys(WORKING_LINES) as Array<keyof typeof WORKING_LINES>;
const ERROR_KINDS: ErrorKind[] = [
  'routeFailed',
  'walletFailed',
  'locationMissing',
  'claimFailed',
  'offline',
  'generic',
];
const NEXT_ACTIONS: NextActionKind[] = [
  'start-run',
  'claim-ground',
  'defend-territory',
  'walk-territory',
  'connect-wallet',
  'connect-location',
];

/** Every line the voice can currently produce, with the inputs that made it. */
function sweep(): Array<{ source: string; line: string }> {
  const out: Array<{ source: string; line: string }> = [];

  for (const key of WORKING_KEYS) {
    for (const salt of ['', 'a', 'b']) {
      out.push({ source: `working:${key}`, line: workingLine(key, salt) });
    }
  }
  for (let km = 1; km <= 20; km++) {
    for (const pace of PACES) {
      out.push({
        source: `milestone:${km}@${pace}`,
        line: milestoneLine({ km, paceSecPerKm: pace }),
      });
    }
  }
  out.push({ source: 'runStart', line: runStartLine() });
  out.push({ source: 'runStart:first', line: runStartLine({ firstEver: true }) });
  out.push({
    source: 'runComplete',
    line: runCompleteLine({ distanceLabel: '5.02 km', durationLabel: '27 min' }),
  });
  out.push({
    source: 'runComplete:developed',
    line: runCompleteLine({
      distanceLabel: '5.02 km',
      durationLabel: '27 min',
      developedCount: 2,
    }),
  });
  for (const feel of FEELS) {
    out.push({
      source: `nearby:${feel}`,
      line: nearbyTerritoryLine({ name: 'Harbour Cell', meters: 240, feel }),
    });
    out.push({
      source: `defense:${feel}`,
      line: defenseChangedLine({ name: 'Harbour Cell', feel }),
    });
  }
  for (const absence of ['a day', '3 days', 'a fortnight']) {
    out.push({ source: 'returnGreeting', line: returnGreeting(absence) });
    out.push({ source: 'returnQuiet', line: returnQuiet(absence) });
  }
  out.push({ source: 'returnSummary', line: returnSummary({ crossings: 2 }) });
  out.push({
    source: 'returnSummary:held',
    line: returnSummary({ crossings: 2, developedCount: 3 }),
  });
  for (let level = 2; level <= 12; level++) {
    out.push({ source: `level:${level}`, line: levelUpLine(level) });
  }
  out.push({ source: 'achievement', line: achievementLine('First Steps') });
  for (const kind of ERROR_KINDS) {
    out.push({ source: `error:${kind}`, line: errorCopy(kind).message });
  }
  for (const surface of ['leaderboard', 'fog', 'dashboard', 'claims'] as const) {
    out.push({ source: `empty:${surface}`, line: emptyStateLine(surface) });
  }
  for (const kind of NEXT_ACTIONS) {
    out.push({ source: `next:${kind}`, line: nextActionHint(kind) });
    out.push({ source: `next:${kind}:detail`, line: nextActionHint(kind, 'Harbour Cell') });
  }
  // The ledger and the moments added by the warmth pass's copy sweep.
  for (const what of ['boost', 'contest', 'reads'] as const) {
    out.push({ source: `onchain:${what}`, line: notOnChainLine(what) });
  }
  out.push({ source: 'claim:missing', line: claimMissingLine() });
  out.push({ source: 'claim:taken', line: claimTakenLine() });
  for (const kind of ['unavailable', 'timeout'] as const) {
    out.push({ source: `loc:${kind}`, line: locationTroubleLine(kind) });
  }
  for (const source of ['Strava', 'Garmin']) {
    out.push({ source: `sync:${source}`, line: syncFailedLine(source) });
  }
  out.push({ source: 'boost:used', line: boostUsedTodayLine() });
  for (const points of [50, 100, 250]) {
    out.push({ source: `boost:ok:${points}`, line: boostConfirmedLine(points) });
  }
  out.push({ source: 'boost:fail', line: boostFailedLine() });
  out.push({ source: 'rewards:claiming', line: claimingLine() });
  out.push({ source: 'rewards:claimed', line: claimedLine('12.50') });
  out.push({ source: 'rewards:unstaking', line: unstakingLine() });
  out.push({ source: 'rewards:unstaked', line: unstakedLine('4.20', '0.81') });
  out.push({ source: 'rewards:empty', line: nothingToClaimLine() });
  out.push({ source: 'rewards:nostake', line: nothingStakedLine() });
  for (const kind of ['claim', 'unstake'] as const) {
    out.push({ source: `rewards:fail:${kind}`, line: ledgerFailedLine(kind) });
  }
  for (const visible of [true, false]) {
    out.push({ source: `widgets:${visible}`, line: widgetModeLine(visible) });
  }
  out.push({ source: 'ghost:deployed', line: ghostDeployedLine() });
  out.push({ source: 'ghost:failed', line: ghostDeployFailedLine() });
  out.push({ source: 'route:ready', line: routeReadyLine() });
  out.push({ source: 'replay:refused', line: replayRefusedLine() });
  out.push({ source: 'replay:link', line: replayLinkBadLine() });
  out.push({ source: 'onboarding:welcome', line: onboardingWelcomeLine() });
  out.push({ source: 'challenge', line: challengeCompleteLine('Canal Runner') });
  out.push({ source: 'claim:ready', line: claimReadyLine() });

  // The phone. Same rules, so the mobile build is held to the same contract.
  for (const level of [2, 4]) {
    out.push({ source: `ghost:upgraded:${level}`, line: ghostUpgradedLine(level) });
  }
  out.push({ source: 'ghost:upgrade-failed', line: ghostUpgradeFailedLine() });
  out.push({ source: 'ghost:roster-failed', line: ghostRosterFailedLine() });
  out.push({ source: 'ghost:no-post', line: noPostWorthTakingLine() });
  out.push({ source: 'wallet:connecting', line: walletConnectingLine() });
  out.push({ source: 'wallet:connect-failed', line: walletConnectFailedLine() });
  out.push({ source: 'strava:linked', line: stravaLinkedLine() });
  out.push({ source: 'strava:link-failed', line: stravaLinkFailedLine() });
  out.push({ source: 'coach:quiet', line: coachQuietLine() });
  out.push({ source: 'coach:trouble', line: coachTroubleLine() });
  out.push({ source: 'route:search', line: routeSearchLine() });
  out.push({ source: 'route:search-failed', line: routeSearchFailedLine() });
  out.push({ source: 'run:not-filed', line: runNotFiledLine() });
  out.push({ source: 'tracking:start-failed', line: trackingStartFailedLine() });
  out.push({ source: 'tracking:stop-failed', line: trackingStopFailedLine() });
  out.push({ source: 'claim:needs-wallet', line: claimNeedsWalletLine() });
  out.push({ source: 'claim:confirm-prompt', line: claimConfirmPromptLine() });
  out.push({ source: 'claim:eligible', line: claimEligibleLine() });
  for (const name of ['Harbour Cell', 'Unnamed Territory']) {
    out.push({ source: `claim:filed:${name}`, line: claimFiledLine(name) });
  }
  for (const count of [1, 4]) {
    out.push({ source: `nearby:count:${count}`, line: nearbyClaimsCountLine(count) });
  }
  for (const amount of [100, 250]) {
    out.push({ source: `challenge:reward:${amount}`, line: challengeRewardLine(amount, 'xp') });
  }
  out.push({ source: 'challenge:reward-failed', line: challengeRewardFailedLine() });
  for (const step of MOBILE_ONBOARDING) {
    out.push({ source: `onboarding:${step.id}`, line: `${step.title}. ${step.description}` });
  }
  for (const step of LEGACY_ONBOARDING_STEPS) {
    out.push({
      source: `onboarding:legacy:${step.id}`,
      line: `${step.title}. ${step.description}`,
    });
  }
  return out;
}

describe('pickLine', () => {
  it('is deterministic — the same key always reads the same', () => {
    const bank = ['one.', 'two.', 'three.'] as const;
    expect(pickLine(bank, 'km:3:steady')).toBe(pickLine(bank, 'km:3:steady'));
  });

  it('spreads different keys across the bank', () => {
    const bank = ['one.', 'two.', 'three.'] as const;
    const picked = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((k) => pickLine(bank, k)));
    expect(picked.size).toBe(bank.length);
  });

  it('refuses an empty bank rather than inventing silence', () => {
    expect(() => pickLine([] as string[], 'x')).toThrow(/empty line bank/);
  });
});

describe('atlas voice register', () => {
  const lines = sweep();

  it('sweeps a realistic amount of copy', () => {
    expect(lines.length).toBeGreaterThan(80);
  });

  it('keeps every line short enough for a phone toast', () => {
    for (const { source, line } of lines) {
      expect({ source, tooLong: line.length > VOICE_MAX_LINE }).toEqual({
        source,
        tooLong: false,
      });
    }
  });

  it('never uses the banned dashboard register', () => {
    for (const { source, line } of lines) {
      const lower = line.toLowerCase();
      for (const banned of VOICE_BANNED_TERMS) {
        expect({ source, banned, found: lower.includes(banned) }).toEqual({
          source,
          banned,
          found: false,
        });
      }
    }
  });

  it('is tidy prose: no stray whitespace, and it always ends a sentence', () => {
    for (const { source, line } of lines) {
      expect({ source, clean: line === line.trim() && !line.includes('  ') }).toEqual({
        source,
        clean: true,
      });
      expect({ source, terminated: /[.!?]$/.test(line) }).toEqual({ source, terminated: true });
    }
  });

  it('states the rules the product actually has', () => {
    // The service used to ship four built-in step sets that nothing called and
    // that had drifted: loops described as required, ground described as an NFT
    // on a named chain. They are gone; this keeps them gone. A copy guard is
    // the point — an assertion nobody reads will not catch the next drift.
    const onboarding = lines.filter(({ source }) => source.startsWith('onboarding:'));
    expect(onboarding.length).toBeGreaterThan(6);
    const forbidden: Array<[string, RegExp]> = [
      ['emoji', /\p{Extended_Pictographic}/u],
      ['loop required', /\bloops? (?:are|is) (?:required|needed)\b/i],
      ['complete loops', /\bcomplete (?:a |your )?loops?\b/i],
      ['nft ownership', /\bas (?:an?\s+)?nfts?\b/i],
      ['named chain', /\bzetachain\b/i],
      ['earn rewards', /\bearn rewards\b/i],
    ];
    for (const { source, line } of onboarding) {
      for (const [label, pattern] of forbidden) {
        expect({ source, label, matched: pattern.test(line) }).toEqual({
          source,
          label,
          matched: false,
        });
      }
    }
  });

  it('keeps the phone titles in the same register, and free of emoji', () => {
    // Titles are not sentences, so they are swept separately — but they are
    // still held to the banned register, and the old build hung emoji on
    // every one of them.
    for (const kind of Object.keys(MOBILE_TITLES) as Array<keyof typeof MOBILE_TITLES>) {
      const title = mobileTitle(kind);
      expect({ kind, titled: title.length > 0 && title === title.trim() }).toEqual({
        kind,
        titled: true,
      });
      expect({ kind, hasEmoji: /\p{Extended_Pictographic}/u.test(title) }).toEqual({
        kind,
        hasEmoji: false,
      });
      for (const banned of VOICE_BANNED_TERMS) {
        expect({ kind, banned, found: title.toLowerCase().includes(banned) }).toEqual({
          kind,
          banned,
          found: false,
        });
      }
    }
  });

  it('varies its line across a long run instead of repeating itself', () => {
    const distinct = new Set(
      Array.from({ length: 15 }, (_, i) => milestoneLine({ km: i + 1, paceSecPerKm: 360 }))
    );
    expect(distinct.size).toBeGreaterThanOrEqual(10);
  });
});

describe('milestones', () => {
  it('names the kilometre it is celebrating', () => {
    expect(milestoneLine({ km: 1, paceSecPerKm: 360 })).toContain('1 km');
    expect(milestoneLine({ km: 6, paceSecPerKm: 360 })).toContain('6 km');
    expect(milestoneLine({ km: 14, paceSecPerKm: 360 })).toContain('14 km');
  });

  it('treats sub-kilometre input as the first kilometre and never divides by zero', () => {
    expect(milestoneLine({ km: 0, paceSecPerKm: 360 })).toContain('1 km');
    expect(milestoneLine({ km: 0.4, paceSecPerKm: 0 })).toContain('1 km');
  });

  it('drops the pace aside in on alternate kilometres so it reads as a companion', () => {
    const odd = milestoneLine({ km: 3, paceSecPerKm: 360 });
    const even = milestoneLine({ km: 4, paceSecPerKm: 360 });
    // Two sentences means a pace aside was appended.
    expect(even.split('.').filter(Boolean).length).toBeGreaterThan(
      odd.split('.').filter(Boolean).length
    );
  });
});

describe('paceFeel', () => {
  it('bands pace without ever calling a runner slow', () => {
    expect(paceFeel(300)).toBe('brisk');
    expect(paceFeel(360)).toBe('steady');
    expect(paceFeel(480)).toBe('easy');
  });

  it('falls back to steady when pace is unknown', () => {
    expect(paceFeel(0)).toBe('steady');
    expect(paceFeel(Number.NaN)).toBe('steady');
    expect(paceFeel(-10)).toBe('steady');
  });
});

describe('run bookends', () => {
  it('writes the numbers into the wind-down line', () => {
    const line = runCompleteLine({ distanceLabel: '5.02 km', durationLabel: '27 min' });
    expect(line).toContain('5.02 km');
    expect(line).toContain('27 min');
  });

  it('mentions developed ground when the run claimed some', () => {
    const line = runCompleteLine({
      distanceLabel: '5.02 km',
      durationLabel: '27 min',
      developedCount: 3,
    });
    expect(line).toContain('3');
    expect(line.toLowerCase()).toContain('developed');
  });
});

describe('failure copy', () => {
  it('never dead-ends: every error offers a way forward or a reason it is fine', () => {
    for (const kind of ERROR_KINDS) {
      const copy = errorCopy(kind);
      expect(copy.message.length).toBeGreaterThan(0);
      if (kind === 'offline') {
        expect(copy.action).toBeUndefined();
        expect(copy.message.toLowerCase()).toContain('safe');
      } else {
        expect(copy.action).toBeTruthy();
      }
    }
  });

  it('keeps blame off the runner', () => {
    for (const kind of ERROR_KINDS) {
      const message = errorCopy(kind).message.toLowerCase();
      expect(message).not.toMatch(/you (did|should|must|failed)/);
    }
  });
});

describe('coming back', () => {
  it('names the absence', () => {
    expect(returnGreeting('3 days')).toContain('3 days');
    expect(returnQuiet('a day')).toContain('a day');
  });

  it('summarises what overexposed, and says so when nothing did', () => {
    expect(returnSummary({ crossings: 2 })).toContain('2');
    expect(returnSummary({ crossings: 2, developedCount: 4 })).toContain('4');
  });

  it('gets the grammar right for a single claim, in every bank line', () => {
    // "1 claims need a look" is the kind of thing a returning player notices
    // immediately, so it is pinned rather than left to review.
    for (let count = 1; count <= 4; count++) {
      const line = returnSummary({ crossings: count, developedCount: count });
      expect(line).not.toMatch(/\b1 (claims|cells|need|claim need)\b/);
      expect(line).not.toMatch(/\b1 claims\b/);
    }
    const held = returnSummary({ crossings: 2, developedCount: 1 });
    expect(held).toContain('1 claim held firm');
  });

  it('phrases absences coarsely but never wrongly', () => {
    expect(formatAbsence(0)).toBe('a moment');
    expect(formatAbsence(10 * 60 * 1000)).toBe('a moment');
    expect(formatAbsence(6 * 60 * 60 * 1000)).toBe('a few hours');
    expect(formatAbsence(26 * 60 * 60 * 1000)).toBe('a day');
    expect(formatAbsence(3 * 24 * 60 * 60 * 1000)).toBe('3 days');
    expect(formatAbsence(9 * 24 * 60 * 60 * 1000)).toBe('a week');
    expect(formatAbsence(30 * 24 * 60 * 60 * 1000)).toBe('4 weeks');
    expect(formatAbsence(Number.NaN)).toBe('a moment');
    // Never a number nobody would say out loud.
    for (const days of [1, 2, 5, 12, 40, 400]) {
      expect(formatAbsence(days * 24 * 60 * 60 * 1000)).not.toMatch(/^1 days$/);
    }
  });
});
