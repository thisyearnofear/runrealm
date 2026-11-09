import {
  buildNeighbourhoodAtlasOrbisText,
  buildNeighbourhoodOrbisPrompt,
  buildNeighbourhoodOrbisText,
  type NeighbourhoodRealmScene,
} from '../neighbourhood-orbis';

const previewScene: NeighbourhoodRealmScene = {
  goal: 'explore',
  stage: 'preview',
  collectedCells: 9,
  strengthenedCells: 3,
  newCells: 0,
  revisitedCells: 0,
};

const settledScene: NeighbourhoodRealmScene = {
  goal: 'explore',
  stage: 'settled',
  collectedCells: 12,
  strengthenedCells: 4,
  newCells: 3,
  revisitedCells: 2,
  outcome: 'collected',
};

describe('buildNeighbourhoodOrbisText (character variant)', () => {
  it('keeps the existing initial prompt byte-for-byte', () => {
    const { prompt, audioPrompt } = buildNeighbourhoodOrbisText(
      previewScene,
      'realm-entered',
      true
    );
    expect(prompt).toBe(
      'A runner in dark athletic gear stands beside a living cyanotype-inspired athletic atlas in a quiet, imaginary city district. Deep blueprint-blue paper, chalk-white survey lines, restrained paper grain, warm amber exposure and verdigris developed ground. The atlas reflects a local collection of 9 cells, including 3 revisited cells. This is an illustrative world, not real navigation or an exact geographic map. The runner chooses to explore. Undeveloped hexagons appear as chalk outlines, with amber light gathering along a possible path. These are possibilities, not collected ground. Medium-wide, eye-level, restrained camera, one continuous take.'
    );
    expect(audioPrompt).toBe(
      'Soft footsteps, quiet wind and a restrained warm ambient tone; no spoken instructions or urgent alarms.'
    );
  });

  it('keeps the existing delta prompt byte-for-byte', () => {
    const { prompt } = buildNeighbourhoodOrbisText(previewScene, 'cell-exposed', false);
    expect(prompt).toBe(
      'The same unbroken scene continues. A chalk outline brightens along the runner’s trace as a cell is visited. This is provisional movement feedback, not newly collected territory. Preserve the same character and setting.'
    );
  });
});

describe('buildNeighbourhoodAtlasOrbisText (atlas variant)', () => {
  it('describes the atlas itself as the scene with the real counts', () => {
    const { prompt } = buildNeighbourhoodAtlasOrbisText(previewScene, 'realm-entered', true);
    expect(prompt).toContain('blueprint-blue paper terrain');
    expect(prompt).toContain('chalk');
    expect(prompt).toContain('hexagonal survey grid');
    expect(prompt).toContain('verdigris');
    expect(prompt).toContain('9 collected cells');
    expect(prompt).toContain('3 revisited cells');
    expect(prompt).toContain('trace');
    expect(prompt).toContain('map illustration, not a place');
  });

  it('states the strict negative constraints in every initial prompt', () => {
    for (const scene of [previewScene, settledScene]) {
      for (const reason of ['realm-entered', 'run-started']) {
        const { prompt } = buildNeighbourhoodAtlasOrbisText(scene, reason, true);
        expect(prompt).toContain('no real city');
        expect(prompt).toContain('landmarks');
        expect(prompt).toContain('no weather');
        expect(prompt).toContain('no sky');
        expect(prompt).toContain('no other people');
        expect(prompt).toContain('no faces');
        expect(prompt).toContain('no competing for territory');
        expect(prompt).toContain('no fantasy buildings');
      }
    }
  });

  it('never frames the atlas as a place a character stands beside', () => {
    const { prompt } = buildNeighbourhoodAtlasOrbisText(previewScene, 'realm-entered', true);
    expect(prompt).not.toContain('imaginary city');
    expect(prompt).not.toContain('district');
    expect(prompt).not.toContain('stands beside');
    expect(prompt).not.toContain('runner');
  });

  it('keeps the map-metaphor in transition lines', () => {
    const { prompt } = buildNeighbourhoodAtlasOrbisText(previewScene, 'goal-selected', false);
    expect(prompt).toContain('The trace turns toward uncollected ground');
    expect(prompt).not.toContain('runner');

    const settled = buildNeighbourhoodAtlasOrbisText(settledScene, 'run-completed', false);
    expect(settled.prompt).toContain('The trace settles into the resulting atlas');
    expect(settled.prompt).toContain('collected 3 new cells and revisited 2 familiar cells');
    expect(settled.prompt).not.toContain('The runner rests beside');
  });

  it('marks deltas as the same atlas scene with a preservation clause', () => {
    const { prompt } = buildNeighbourhoodAtlasOrbisText(previewScene, 'cell-exposed', false);
    expect(prompt).toContain('The same unbroken atlas scene continues.');
    expect(prompt).toContain('Keep the same paper terrain, hexagonal grid and developed cells');
    expect(prompt).toContain('only the described change appears');
    expect(prompt).not.toContain('blueprint-blue paper terrain with visible grain');
  });

  it('stays quiet and print-process flavored in the audio prompts', () => {
    const recording = buildNeighbourhoodAtlasOrbisText(previewScene, 'run-started', false);
    expect(recording.audioPrompt).toContain('paper grain');
    expect(recording.audioPrompt).toContain('no spoken instructions');
    expect(recording.audioPrompt).not.toContain('footsteps');

    const settled = buildNeighbourhoodAtlasOrbisText(settledScene, 'run-completed', false);
    expect(settled.audioPrompt).toContain('developing chime');
    expect(settled.audioPrompt).toContain('no spoken instructions');
  });
});

describe('buildNeighbourhoodOrbisPrompt', () => {
  it('defaults to the character variant', () => {
    const viaEntry = buildNeighbourhoodOrbisPrompt(previewScene, 'realm-entered', true);
    const viaCharacter = buildNeighbourhoodOrbisText(previewScene, 'realm-entered', true);
    expect(viaEntry).toEqual(viaCharacter);
  });

  it('delegates to the atlas builder for the atlas variant', () => {
    const viaEntry = buildNeighbourhoodOrbisPrompt(previewScene, 'realm-entered', true, 'atlas');
    const viaAtlas = buildNeighbourhoodAtlasOrbisText(previewScene, 'realm-entered', true);
    expect(viaEntry).toEqual(viaAtlas);
  });

  it('produces different prompts per variant for the same scene and reason', () => {
    const character = buildNeighbourhoodOrbisPrompt(
      previewScene,
      'realm-entered',
      true,
      'character'
    );
    const atlas = buildNeighbourhoodOrbisPrompt(previewScene, 'realm-entered', true, 'atlas');
    expect(atlas.prompt).not.toBe(character.prompt);
    expect(atlas.audioPrompt).not.toBe(character.audioPrompt);
  });
});
