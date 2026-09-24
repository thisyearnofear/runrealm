/**
 * Versioned-store tests.
 *
 * Pins the save-survival contract: every failure degrades to fresh with
 * a named reason, a future save is read-only, and a legacy bare payload
 * is adopted rather than deleted. Time is a parameter throughout, so no
 * fake timers are needed.
 */
import {
  checksumHex,
  openVersioned,
  quarantineKey,
  type VersionChain,
  writeVersioned,
} from '../versioned-store';

const arrayChain: VersionChain<unknown[]> = {
  floor: 1,
  head: 1,
  steps: [
    {
      toVersion: 1,
      note: 'base',
      migrate: (x) => x as unknown[],
      validate: (v) => {
        if (!Array.isArray(v)) throw new RangeError('expected an array');
        return v as unknown[];
      },
    },
  ],
  fresh: () => [],
};

describe('versioned-store', () => {
  it('round-trips an envelope with checksum intact', () => {
    const written = writeVersioned(1, [{ id: 'a' }], 1000);
    const opened = openVersioned(written, arrayChain);
    expect(opened.status).toBe('ok');
    expect(opened.state).toEqual([{ id: 'a' }]);
    expect(opened.firstRun).toBe(false);
    expect(opened.readOnly).toBe(false);
  });

  it('reports fresh first run when the key was never written', () => {
    const opened = openVersioned(null, arrayChain);
    expect(opened.status).toBe('fresh');
    expect(opened.firstRun).toBe(true);
  });

  it('adopts a legacy bare payload instead of deleting it', () => {
    const opened = openVersioned(JSON.stringify([{ id: 'b' }]), arrayChain);
    expect(opened.status).toBe('migrated');
    expect(opened.migratedFrom).toBe(0);
    expect(opened.state).toEqual([{ id: 'b' }]);
  });

  it('degrades a checksum mismatch to fresh and keeps it distinguishable from first run', () => {
    const envelope = JSON.parse(writeVersioned(1, [], 1000));
    envelope.c = 'deadbeef';
    const opened = openVersioned(JSON.stringify(envelope), arrayChain);
    expect(opened.status).toBe('corrupt');
    expect(opened.firstRun).toBe(false);
    expect(opened.reason).toMatch(/checksum/);
  });

  it('marks a future save read-only so a stale build cannot overwrite it', () => {
    const opened = openVersioned(writeVersioned(9, [], 1000), arrayChain);
    expect(opened.status).toBe('future');
    expect(opened.readOnly).toBe(true);
  });

  it('migrates rung by rung and names the origin version', () => {
    const chain: VersionChain<Array<{ id: string; flag?: boolean }>> = {
      floor: 1,
      head: 2,
      steps: [
        {
          toVersion: 1,
          note: 'base',
          migrate: (x) => x as Array<{ id: string }>,
          validate: (v) => v as Array<{ id: string }>,
        },
        {
          toVersion: 2,
          note: 'add flag',
          migrate: (v) => (v as Array<{ id: string }>).map((t) => ({ ...t, flag: true })),
          validate: (v) => v as Array<{ id: string; flag?: boolean }>,
        },
      ],
      fresh: () => [],
    };
    const opened = openVersioned(writeVersioned(1, [{ id: 'c' }], 1000), chain);
    expect(opened.status).toBe('migrated');
    expect(opened.migratedFrom).toBe(1);
    expect(opened.state).toEqual([{ id: 'c', flag: true }]);
  });

  it('quarantines under a derived key and checksums deterministically', () => {
    expect(quarantineKey('runrealm_claimed_territories')).toBe(
      'runrealm_claimed_territories:rejected'
    );
    expect(checksumHex('abc')).toBe(checksumHex('abc'));
  });
});
