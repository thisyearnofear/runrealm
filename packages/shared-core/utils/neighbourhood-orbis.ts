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

export type NeighbourhoodOrbisVariant = 'character' | 'atlas';

const GOAL_LINES_ATLAS: Record<NeighbourhoodGoal, string> = {
  explore:
    'The trace turns toward uncollected ground. Undeveloped hexagons appear as chalk outlines, with amber light gathering along a possible path across the paper. These are possibilities, not collected ground.',
  strengthen:
    'The trace turns toward familiar ground. Already collected verdigris hexagons wait along a chalk path on the paper. Do not deepen them until the outing is completed.',
  challenge:
    'The trace sets out to match a previous outing’s distance at its own pace. A single spectral companion trace on the paper represents that previous outing. Do not show a race winner or invent another competitor.',
};

function outcomeLineAtlas(scene: NeighbourhoodRealmScene): string {
  if (scene.outcome !== 'collected') {
    return 'The trace settles into the paper. Keep the collected ground unchanged: this outing did not collect or strengthen any cells. Acknowledge the movement without inventing territory or ownership.';
  }
  const challenge =
    scene.goal === 'challenge' && scene.challengeTargetReached !== undefined
      ? scene.challengeTargetReached
        ? ' The trace matched the previous outing’s distance. The companion trace settles beside it on the paper; this is a personal distance goal, not a race victory.'
        : ' The previous outing’s distance remains a goal for another day. The companion trace waits on the paper; do not depict a loss or a race victory.'
      : '';
  return `This completed outing collected ${count(scene.newCells)} new cells and revisited ${count(scene.revisitedCells)} familiar cells. Illustrate new ground developing into verdigris and revisited ground gaining a deeper print on the paper. The trace settles into the resulting atlas. This is a local collection, not registered ownership; the authoritative cell counts remain in the game interface.${challenge}`;
}

function transitionLineAtlas(scene: NeighbourhoodRealmScene, reason: string): string {
  switch (reason) {
    case 'realm-entered':
      return scene.stage === 'settled' ? outcomeLineAtlas(scene) : GOAL_LINES_ATLAS[scene.goal];
    case 'goal-selected':
      return GOAL_LINES_ATLAS[scene.goal];
    case 'local-ground-developed':
    case 'local-outing-uncredited':
    case 'run-completed':
      return outcomeLineAtlas(scene);
    case 'companion-arrived':
      return 'A single chalk-white spectral companion trace appears on the atlas beside the trace. It is a companion inspired by earlier outings recorded in the atlas, not another person or a verified competitor.';
    case 'run-started':
      return `${GOAL_LINES_ATLAS[scene.goal]} The outing begins and the chalk trace starts moving across the paper. Keep all territory collection provisional until the outing is completed.`;
    case 'run-paused':
      return 'The trace rests on the paper. Keep collected ground unchanged and preserve the same map, palette and framing.';
    case 'run-resumed':
      return 'The chalk trace continues from its resting point on the paper. Keep collection provisional until the outing is completed.';
    case 'cell-exposed':
      return 'A chalk outline brightens along the trace as a cell is visited. This is provisional movement feedback, not newly collected territory. Preserve the same map, palette and framing.';
    case 'pace-changed':
      return 'The trace’s movement cadence changes gently with the outing. Preserve the same map, palette, framing and collected ground. Do not imply a race result or urge a faster pace.';
    case 'ghost-deployed':
      return 'A spectral white-light rival trace enters the atlas and begins defending the territory on the paper. It is a previous outing, not another person.';
    case 'ghost-racing':
      return 'The spectral rival trace races alongside the trace across the paper, raising the visual tempo.';
    case 'territory-developing':
      return 'The exposed hexagonal frame begins developing from its center, amber chemistry spreading through the cell on the paper.';
    case 'territory-developed':
      return 'The territory fixes into stable verdigris on the paper as the claim resolves and the atlas settles.';
    case 'territory-overexposed':
      return 'Signal-coral overexposure creeps across the frame; the territory becomes unstable and contested.';
    default:
      return 'Preserve the same paper terrain, hexagonal grid, trace and developed cells. Do not invent collected ground, registered ownership or a race result.';
  }
}

export function buildNeighbourhoodAtlasOrbisText(
  scene: NeighbourhoodRealmScene,
  reason: string,
  initial: boolean
): { prompt: string; audioPrompt: string } {
  const transition = transitionLineAtlas(scene, reason);
  const prompt = initial
    ? `An overhead, slightly oblique view of a living cyanotype-inspired athletic atlas: the map itself is the whole scene. Deep blueprint-blue paper terrain with visible grain, a chalk-white hexagonal survey grid, and ${count(scene.collectedCells)} collected cells developed into stable verdigris hexagons, including ${count(scene.strengthenedCells)} revisited cells carrying a deeper print. A small chalk-light trace marker moves along a chalk path inside the map. This is an illustrative map print of a local collection, not real navigation or an exact geographic map. ${transition} Strict constraints: no real city, no streets, roads, landmarks or signage, no weather, no sky, no other people or crowds, no faces, no competing for territory, no fantasy buildings. It is a map illustration, not a place. Locked overhead camera, slightly oblique, one continuous take.`
    : `The same unbroken atlas scene continues. ${transition} Keep the same paper terrain, hexagonal grid and developed cells; only the described change appears.`;
  const audioPrompt =
    scene.stage === 'settled'
      ? 'Soft paper grain, a gentle developing chime and a quiet resolving tone; no spoken instructions.'
      : 'Soft paper grain rustle, faint chalk strokes and a restrained warm ambient tone; no spoken instructions or urgent alarms.';
  return { prompt, audioPrompt };
}

export function buildNeighbourhoodOrbisPrompt(
  scene: NeighbourhoodRealmScene,
  reason: string,
  initial: boolean,
  variant: NeighbourhoodOrbisVariant = 'character'
): { prompt: string; audioPrompt: string } {
  return variant === 'atlas'
    ? buildNeighbourhoodAtlasOrbisText(scene, reason, initial)
    : buildNeighbourhoodOrbisText(scene, reason, initial);
}
