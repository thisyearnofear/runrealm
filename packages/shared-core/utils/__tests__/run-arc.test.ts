import { actTitleFor, traceMilestoneCrossed } from '../run-arc';

describe('actTitleFor', () => {
  it('narrates the full arc in Sunprint voice', () => {
    const acts = ['expose', 'trace', 'ghost', 'overexpose', 'develop', 'settle'] as const;
    const titles = acts.map((m) => actTitleFor(m));
    expect(titles.map((t) => t.act)).toEqual([
      'Act I',
      'Act II',
      'Act III',
      'Act IV',
      'Act V',
      'Act VI',
    ]);
    expect(titles.every((t) => t.title && t.sub)).toBe(true);
  });
});

describe('traceMilestoneCrossed', () => {
  it('fires once per threshold crossing', () => {
    expect(traceMilestoneCrossed(0, 500)).toBeNull();
    expect(traceMilestoneCrossed(900, 1100)).toBe(1000);
    expect(traceMilestoneCrossed(1000, 1200)).toBeNull();
    expect(traceMilestoneCrossed(4900, 10100)).toBe(5000);
  });
});
