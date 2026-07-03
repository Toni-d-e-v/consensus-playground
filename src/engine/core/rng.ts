import type { Seed } from "./types";

/** Seeded PRNG interface — the only source of randomness in the engine (SPEC §4). */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Pick one element (array must be non-empty). */
  pick<T>(arr: readonly T[]): T;
  /** In-place Fisher–Yates shuffle; returns the same array. */
  shuffle<T>(arr: T[]): T[];
}

/** mulberry32 (SPEC §5: rng.ts — mulberry32 or sfc32). */
export function createRng(seed: Seed): Rng {
  let a = seed | 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    pick: (arr) => {
      if (arr.length === 0) throw new Error("rng.pick on empty array");
      return arr[Math.floor(next() * arr.length)] as (typeof arr)[number];
    },
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i] as (typeof arr)[number];
        arr[i] = arr[j] as (typeof arr)[number];
        arr[j] = tmp;
      }
      return arr;
    },
  };
}
