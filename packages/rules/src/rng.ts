/**
 * Small, fast, seedable PRNG (mulberry32). The whole state is a single uint32,
 * which is stored inside the game state so every game can be replayed exactly
 * from its seed and command log.
 */
export class Rng {
  private s: number;

  constructor(state: number) {
    this.s = state >>> 0;
  }

  /** Current internal state; persist this back into the game state. */
  get state(): number {
    return this.s;
  }

  /** Uniform float in [0, 1). */
  float(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    if (max < min) throw new Error(`Rng.int: max (${max}) < min (${min})`);
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** Roll a die with `sides` faces, returning 1..sides. */
  die(sides: number): number {
    return this.int(1, sides);
  }

  d20(): number {
    return this.die(20);
  }
}

/** Derive a uint32 seed from any string (FNV-1a). */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
