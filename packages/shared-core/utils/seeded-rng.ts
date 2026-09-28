/**
 * Seeded RNG — the determinism primitive for replayable game moments.
 *
 * mulberry32 over a 32-bit seed; string seeds arrive via FNV-1a (the same
 * hash versioned-store uses for checksums, re-exported here so callers
 * have one import). Tier A only: Math.imul and bitwise ops, no Math.sin /
 * Math.pow / Date.now / Math.random — same seed in, same stream out, on
 * every engine.
 */

import { checksumHex } from './versioned-store';

/** FNV-1a 32-bit of a string, as an unsigned integer seed. */
export function seedFromString(input: string): number {
  return Number.parseInt(checksumHex(input), 16) >>> 0;
}

export interface SeededRng {
  /** Next value in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
}

/** mulberry32 — small, fast, and fully specified by integer arithmetic. */
export function createSeededRng(seed: number | string): SeededRng {
  let state = (typeof seed === 'string' ? seedFromString(seed) : seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(min: number, max: number): number {
      return min + Math.floor(next() * (max - min + 1));
    },
  };
}
