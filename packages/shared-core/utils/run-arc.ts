/**
 * Run-arc copy model (onboarding slice).
 *
 * Runs read as chapters: expose → trace → develop → overexpose → settle,
 * with ghost interludes. Pure act/title/sub triples in the Sunprint
 * voice; the theater shell owns timing, queueing, and first-run gating.
 * Numerals are stable (Act I–VII) so returning runners learn the arc.
 */
export type ArcMilestone = 'expose' | 'trace' | 'ghost' | 'overexpose' | 'develop' | 'settle';

export interface ActTitle {
  act: string;
  title: string;
  sub: string;
}

const ACTS: Record<ArcMilestone, ActTitle> = {
  expose: {
    act: 'Act I',
    title: 'Expose',
    sub: 'Every step develops the atlas — run to reveal it.',
  },
  trace: {
    act: 'Act II',
    title: 'Trace',
    sub: 'Your route draws itself in chalk and light.',
  },
  ghost: {
    act: 'Act III',
    title: 'Ghost trace',
    sub: 'A spectral rival walks these streets with you.',
  },
  overexpose: {
    act: 'Act IV',
    title: 'Overexpose',
    sub: 'Weak ground burns coral — defend it or lose it.',
  },
  develop: {
    act: 'Act V',
    title: 'Develop',
    sub: 'Exposed ground becomes your territory.',
  },
  settle: {
    act: 'Act VI',
    title: 'Fix',
    sub: 'The run settles into stable, verdigris ground.',
  },
};

export function actTitleFor(milestone: ArcMilestone): ActTitle {
  return ACTS[milestone];
}

/** Distance-trace milestones in meters (Act II beats). */
export const TRACE_MILESTONES_M = [1000, 5000, 10000] as const;

export function traceMilestoneCrossed(
  previousMeters: number,
  currentMeters: number
): number | null {
  for (const mark of TRACE_MILESTONES_M) {
    if (previousMeters < mark && currentMeters >= mark) return mark;
  }
  return null;
}

export const ARC_SEEN_KEY = 'runrealm_arc_seen';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function arcSeen(): boolean {
  return storage()?.getItem(ARC_SEEN_KEY) === '1';
}

export function markArcSeen(): void {
  try {
    storage()?.setItem(ARC_SEEN_KEY, '1');
  } catch {
    /* storage unavailable — intro may repeat */
  }
}
