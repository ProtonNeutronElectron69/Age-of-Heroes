/**
 * Particle bursts for the board at high graphics quality: sparks where wounds land, a glint where a
 * blow is blocked, dust where a figure lands, splashes in water and swamp, embers on lava, a burst
 * where a destroyed figure leaves the board, and a sparkle where a figure is healed or returns.
 *
 * Pure and frame-rate independent (no DOM, no three.js): a burst is a list of particles made from a
 * seed, and a particle's place at any time comes from a closed form, so the drawing (`Particles.tsx`)
 * only has to ask where each one is now. Positions are in board units (a hex is 1 across).
 */

export type BurstKind = "sparks" | "glint" | "dust" | "splash" | "embers" | "shatter" | "heal";

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Particle {
  /** Where it starts, and how fast it sets off (units a second). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** Seconds after the burst that it appears, and how long it lasts then. */
  readonly delay: number;
  readonly life: number;
  /** Its size at the start and at the end, in board units. */
  readonly size: number;
  readonly endSize: number;
  /** Its colour, 0 to 1 a channel. */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  /** Pull downward (units a second squared; negative floats up) and air drag (a second). */
  readonly gravity: number;
  readonly drag: number;
  /** It never sinks below this height (the ground it was thrown from). */
  readonly floor: number;
  /** Drawn glowing (added to what is behind it) rather than as solid dust. */
  readonly glow: boolean;
}

/** Where a particle is at a moment, and how strongly it shows (0 to 1). */
export interface ParticleNow {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
}

/** A small seeded generator (mulberry32), so a burst looks the same for the same seed. */
function generator(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

interface Recipe {
  readonly count: number;
  /** How far from the centre they start, across and up. */
  readonly spread: number;
  readonly rise: number;
  /** Speed outward and upward, each with a random part added. */
  readonly out: readonly [number, number];
  readonly up: readonly [number, number];
  readonly life: readonly [number, number];
  readonly delay: number;
  readonly size: readonly [number, number];
  /** The end size as a share of the start size. */
  readonly grow: number;
  readonly colors: readonly string[];
  readonly gravity: number;
  readonly drag: number;
  readonly glow: boolean;
}

const RECIPES: Record<BurstKind, Recipe> = {
  // Hot sparks flying from a wound, falling as they cool.
  sparks: { count: 26, spread: 0.12, rise: 0.15, out: [1.2, 2.2], up: [0.6, 1.8], life: [0.35, 0.4], delay: 0.05, size: [0.1, 0.08], grow: 0.3, colors: ["#fff3c4", "#ffb347", "#ff6a2b", "#ffd36b"], gravity: 6, drag: 2.5, glow: true },
  // A few cold blue glints off a shield: the blow did no harm.
  glint: { count: 12, spread: 0.15, rise: 0.1, out: [0.9, 0.8], up: [0.3, 0.9], life: [0.3, 0.25], delay: 0.03, size: [0.1, 0.06], grow: 0.2, colors: ["#e6f2ff", "#8cc4ff", "#4f9dff"], gravity: 3, drag: 3, glow: true },
  // Soft dust kicked up round a figure's feet.
  dust: { count: 12, spread: 0.3, rise: 0.02, out: [0.5, 0.5], up: [0.15, 0.3], life: [0.6, 0.4], delay: 0, size: [0.22, 0.14], grow: 2.4, colors: ["#b9a68a", "#a08c70", "#cbbb9f"], gravity: 0.25, drag: 3, glow: false },
  // Drops thrown up from water or swamp, falling back.
  splash: { count: 20, spread: 0.25, rise: 0.02, out: [0.5, 0.7], up: [1.6, 1.0], life: [0.5, 0.25], delay: 0, size: [0.09, 0.06], grow: 0.7, colors: ["#d7f1ff", "#8fd0f2", "#5aa9d6"], gravity: 7, drag: 1, glow: false },
  // Embers lifting off lava, drifting up and going out.
  embers: { count: 16, spread: 0.3, rise: 0.03, out: [0.25, 0.4], up: [0.7, 0.8], life: [0.8, 0.6], delay: 0.08, size: [0.08, 0.05], grow: 0.2, colors: ["#ffe08a", "#ff9a2e", "#ff4d1a"], gravity: -0.4, drag: 1.2, glow: true },
  // A destroyed figure goes in a puff of dust and bright chips.
  shatter: { count: 40, spread: 0.3, rise: 0.25, out: [0.8, 1.4], up: [0.6, 1.4], life: [0.55, 0.5], delay: 0.02, size: [0.13, 0.12], grow: 1.3, colors: ["#d9cbb3", "#a89379", "#fff1cf", "#8a7660"], gravity: 2.5, drag: 2.5, glow: false },
  // Green-gold motes rising round a figure that is healed or returns.
  heal: { count: 22, spread: 0.45, rise: 0.6, out: [0.05, 0.15], up: [0.5, 0.7], life: [0.8, 0.5], delay: 0.5, size: [0.1, 0.06], grow: 0.5, colors: ["#f4ffd0", "#9dff9a", "#59e38c", "#ffe58a"], gravity: -0.3, drag: 0.8, glow: true },
};

/** How long a burst of this kind can last, in seconds, from its first particle to its last. */
export function burstSeconds(kind: BurstKind): number {
  const r = RECIPES[kind];
  return r.delay + r.life[0] + r.life[1];
}

export interface BurstOptions {
  /** Grows the burst: a big figure throws up more dust. */
  readonly scale?: number;
  /** A colour mixed into every particle (a destroyed figure's chips take its army's colour). */
  readonly tint?: string;
  /** Colours to use instead of the kind's own (dust takes the ground's colour). */
  readonly colors?: readonly string[];
  /** A direction the particles lean toward, across the board (sparks fly away from the blow). */
  readonly toward?: { readonly x: number; readonly z: number };
}

/** The particles of one burst at `at` (its centre; the ground for dust, splashes and embers). */
export function burst(kind: BurstKind, at: Point3, seed: number, options: BurstOptions = {}): Particle[] {
  const r = RECIPES[kind];
  const rand = generator(seed);
  const scale = options.scale ?? 1;
  const tint = options.tint ? rgb(options.tint) : null;
  const lean = options.toward ? Math.hypot(options.toward.x, options.toward.z) : 0;
  const count = Math.round(r.count * Math.min(2, Math.sqrt(scale)));
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.9;
    const reach = Math.sqrt(rand()) * r.spread * scale;
    const speed = (r.out[0] + rand() * r.out[1]) * Math.sqrt(scale);
    let vx = Math.cos(angle) * speed;
    let vz = Math.sin(angle) * speed;
    if (lean > 0) {
      vx += (options.toward!.x / lean) * speed * 0.8;
      vz += (options.toward!.z / lean) * speed * 0.8;
    }
    const colors = options.colors ?? r.colors;
    let [cr, cg, cb] = rgb(colors[Math.floor(rand() * colors.length)]!);
    // Every third chip of a shattered figure takes its army's colour.
    if (tint && i % 3 === 0) [cr, cg, cb] = tint;
    const size = (r.size[0] + rand() * r.size[1]) * Math.min(1.6, Math.sqrt(scale));
    out.push({
      x: at.x + Math.cos(angle) * reach,
      y: at.y + rand() * r.rise * scale,
      z: at.z + Math.sin(angle) * reach,
      vx,
      vy: (r.up[0] + rand() * r.up[1]) * Math.sqrt(scale),
      vz,
      delay: rand() * r.delay,
      life: r.life[0] + rand() * r.life[1],
      size,
      endSize: size * r.grow,
      r: cr,
      g: cg,
      b: cb,
      gravity: r.gravity,
      drag: r.drag,
      floor: at.y,
      glow: r.glow,
    });
  }
  return out;
}

/**
 * Where a particle is `t` seconds after its burst began, or null if it is not showing (not yet
 * started, or gone). Motion with linear drag and gravity, in closed form, so it is the same
 * whatever the frame rate. It fades in quickly and out over the last 40% of its life.
 */
export function particleAt(p: Particle, t: number, out: ParticleNow): ParticleNow | null {
  const s = t - p.delay;
  if (s < 0 || s >= p.life) return null;
  const k = p.drag;
  const kept = k > 0 ? (1 - Math.exp(-k * s)) / k : s;
  out.x = p.x + p.vx * kept;
  out.z = p.z + p.vz * kept;
  // With drag, a falling particle tends to the speed gravity / drag.
  const y = k > 0 ? p.y + (p.vy + p.gravity / k) * kept - (p.gravity / k) * s : p.y + p.vy * s - 0.5 * p.gravity * s * s;
  out.y = Math.max(p.floor, y);
  const u = s / p.life;
  out.size = p.size + (p.endSize - p.size) * u;
  out.alpha = Math.min(1, s / 0.06) * (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);
  return out;
}

/** Dust the colour of the ground it rises from, where that is not plain earth. */
const DUST: Record<string, readonly string[]> = {
  sand: ["#e9d8a6", "#d8c38a", "#f1e4bd"],
  snow: ["#ffffff", "#e9f1f6", "#d6e3ec"],
  ice: ["#f2fbff", "#cfe9f5", "#e3f3fa"],
  rock: ["#bdb8b0", "#a29d95", "#cfcac2"],
  road: ["#c4b398", "#ab9a7e", "#d6c7ad"],
};

/** What a figure lands on decides its burst: water and swamp splash, lava throws embers, the rest raises dust. */
export function landingBurst(terrain: string | undefined): { kind: BurstKind; colors?: readonly string[] } {
  if (terrain === "water") return { kind: "splash" };
  if (terrain === "swamp") return { kind: "splash", colors: ["#b5c48c", "#7d9259", "#5f7044"] };
  if (terrain === "lava") return { kind: "embers" };
  const colors = terrain ? DUST[terrain] : undefined;
  return colors ? { kind: "dust", colors } : { kind: "dust" };
}
