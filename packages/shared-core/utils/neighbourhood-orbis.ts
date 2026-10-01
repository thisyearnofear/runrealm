import type { NeighbourhoodGoal, NeighbourhoodSummaryReason } from '../types/neighbourhood';

export interface NeighbourhoodRealmScene {
  goal: NeighbourhoodGoal;
  stage: 'preview' | 'recording' | 'settled';
  collectedCells: number;
  strengthenedCells: number;
  newCells: number;
  revisitedCells: number;
  outcome?: NeighbourhoodSummaryReason;
  challengeTargetReached?: boolean;
}

export type NeighbourhoodRealmReason =
  | 'realm-entered'
  | 'goal-selected'
  | 'local-ground-developed'
  | 'local-outing-uncredited'
  | 'companion-arrived';

export const NEIGHBOURHOOD_ORBIS_PRIORITIES = {
  'realm-entered': 110,
  'goal-selected': 60,
  'local-ground-developed': 100,
  'local-outing-uncredited': 80,
  'companion-arrived': 70,
} as const;

export const LIVING_REALM_SESSION_LIMIT_MS = 180_000;

const GOAL_LINES: Record<NeighbourhoodGoal, string> = {
  explore:
    'The runner chooses to explore. Undeveloped hexagons appear as chalk outlines, with amber light gathering along a possible path. These are possibilities, not collected ground.',
  strengthen:
    'The runner chooses to revisit familiar ground. Already collected verdigris hexagons wait along a chalk path. Do not deepen them until the outing is completed.',
  challenge:
    'The runner chooses to match their previous outing’s distance at their own pace. A single spectral companion represents that previous outing. Do not show a race winner or invent another competitor.',
};

function count(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function outcomeLine(scene: NeighbourhoodRealmScene): string {
  if (scene.outcome !== 'collected') {
    return 'The runner rests beside the living atlas. Keep the collected ground unchanged: this outing did not collect or strengthen any cells. Acknowledge the movement without inventing territory or ownership.';
  }
  const challenge =
    scene.goal === 'challenge' && scene.challengeTargetReached !== undefined
      ? scene.challengeTargetReached
        ? ' The runner matched the previous outing’s distance. The companion settles beside them; this is a personal distance goal, not a race victory.'
        : ' The previous outing’s distance remains a goal for another day. The companion waits kindly; do not depict a loss or a race victory.'
      : '';
  return `This completed outing collected ${count(scene.newCells)} new cells and revisited ${count(scene.revisitedCells)} familiar cells. Illustrate new ground developing into verdigris and revisited ground gaining a deeper print. The runner rests beside the resulting atlas. This is a local collection, not registered ownership; the authoritative cell counts remain in the game interface.${challenge}`;
}

function transitionLine(scene: NeighbourhoodRealmScene, reason: string): string {
  switch (reason) {
    case 'realm-entered':
      return scene.stage === 'settled' ? outcomeLine(scene) : GOAL_LINES[scene.goal];
    case 'goal-selected':
      return GOAL_LINES[scene.goal];
    case 'local-ground-developed':
    case 'local-outing-uncredited':
    case 'run-completed':
      return outcomeLine(scene);
    case 'companion-arrived':
      return 'A single chalk-white spectral companion joins the living atlas beside the runner. It is a companion inspired by the runner’s own outings, not another person or a verified competitor.';
    case 'run-started':
      return `${GOAL_LINES[scene.goal]} The outing begins and a chalk trace starts moving through the illustrative atlas. Keep all territory collection provisional until the outing is completed.`;
    case 'run-paused':
      return 'The runner pauses safely beside the atlas. The trace rests; keep collected ground unchanged and preserve the same character and setting.';
    case 'run-resumed':
      return 'The same runner resumes their outing. The chalk trace continues from its resting point. Keep collection provisional until the outing is completed.';
    case 'cell-exposed':
      return 'A chalk outline brightens along the runner’s trace as a cell is visited. This is provisional movement feedback, not newly collected territory. Preserve the same character and setting.';
    case 'pace-changed':
      return 'The runner’s movement cadence changes gently with the outing. Preserve the same character, setting and collected ground. Do not imply a race result or urge a faster pace.';
    default:
      return 'Preserve the same runner, companion and living atlas. Do not invent collected ground, registered ownership or a race result.';
  }
}

export function buildNeighbourhoodOrbisText(
  scene: NeighbourhoodRealmScene,
  reason: string,
  initial: boolean
): { prompt: string; audioPrompt: string } {
  const transition = transitionLine(scene, reason);
  const prompt = initial
    ? `A runner in dark athletic gear stands beside a living cyanotype-inspired athletic atlas in a quiet, imaginary city district. Deep blueprint-blue paper, chalk-white survey lines, restrained paper grain, warm amber exposure and verdigris developed ground. The atlas reflects a local collection of ${count(scene.collectedCells)} cells, including ${count(scene.strengthenedCells)} revisited cells. This is an illustrative world, not real navigation or an exact geographic map. ${transition} Medium-wide, eye-level, restrained camera, one continuous take.`
    : `The same unbroken scene continues. ${transition}`;
  const audioPrompt =
    scene.stage === 'settled'
      ? 'Quiet wind, a soft resolving chord and a gentle paper-development chime; no spoken instructions.'
      : 'Soft footsteps, quiet wind and a restrained warm ambient tone; no spoken instructions or urgent alarms.';
  return { prompt, audioPrompt };
}
