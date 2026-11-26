import type { Footprint } from "@aoh/rules";
import { BASE_BEVEL, BASE_RADIUS, baseCentres, outside, type Point } from "./base";
import { BASE_HEIGHT, ball, box, limb, place, plate } from "./build";
import type { Paint } from "./paint";
import type { Part, V3 } from "./types";

/**
 * The ground on a figure's base at high quality, as tabletop miniatures have their bases dressed:
 * a few low pieces round the figure's feet, in its faction's style (grass and a flower for the
 * Verdant Court, flagstones for the Dawnhold Covenant, ash and a bone for the Ashen Host, and so on).
 *
 * Every piece is `high`, so Low leaves it out. They lie on the base's top, inside its bevelled edge
 * and clear of the middle where the figure stands, and stay low, so they change neither the
 * figure's Height nor its fit. They are baked into the figure's own mesh, so they cost no draw call.
 */

/** Where pieces may lie: from this far out from a hex's middle to this far, inside the bevel. */
const NEAR = 0.36;
const FAR = BASE_RADIUS - BASE_BEVEL - 0.07;
/** How many pieces a base gets on each of its hexes. */
const PIECES = 5;
/** The pieces are written small and drawn this much bigger, so they read from the usual camera distance. */
const SIZE = 1.6;

/** A small seeded generator, so a figure's ground is the same each time it is drawn. */
function generator(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
/** One piece of ground at the origin, on the base's top (y = 0 here); `place` moves it. */
type Piece = (r: Rand) => Part[];

const painted = (parts: readonly Part[], paint: Paint): Part[] => parts.map((p) => ({ ...p, paint, role: "base" as const }));

/** A pebble or stone, flattened. */
const pebble = (paint: Paint, size = 0.05): Piece => (r) => painted([ball([0, size * 0.25, 0], [size * (0.9 + r() * 0.4), size * 0.55, size * (0.7 + r() * 0.4)], 0)], paint);
/** A tuft of grass: a few thin blades leaning out. */
const tuft = (paint: Paint): Piece => (r) => {
  const blades: Part[] = [];
  const n = 4 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r();
    const h = 0.07 + r() * 0.05;
    blades.push(limb([0, 0, 0], [Math.cos(a) * 0.035, h, Math.sin(a) * 0.035], 0.012, 0.002, 3));
  }
  return painted(blades, paint);
};
/** A flower on a stalk. */
const flower: Piece = (r) => [
  ...painted([limb([0, 0, 0], [0.01, 0.07 + r() * 0.03, 0], 0.006, 0.004, 3)], "leaf"),
  ...painted([ball([0.01, 0.085, 0], 0.016, 0)], "flower"),
];
/** A fallen leaf, flat on the ground. */
const leaf: Piece = () => painted([plate([[0, -0.05], [0.025, 0], [0, 0.05], [-0.025, 0]], 0.006, "top", 0.004)], "leaf");
/** A flat slab of stone. */
const slab = (paint: Paint): Piece => (r) => painted([box([0.09 + r() * 0.05, 0.012, 0.07 + r() * 0.04], [0, 0.006, 0])], paint);
/** A small bone: a shaft with knobbed ends. */
const bone: Piece = () => painted([limb([-0.045, 0.01, 0], [0.045, 0.01, 0], 0.009, 0.009, 4), ball([-0.05, 0.012, 0], 0.016, 0), ball([0.05, 0.012, 0], 0.016, 0)], "bone");
/** A shell, half sunk in the sand. */
const shell: Piece = (r) => painted([ball([0, 0, 0], [0.03, 0.018 + r() * 0.01, 0.024], 0)], "shell");
/** A sprig of coral: a few branches. */
const coral: Piece = (r) => {
  const arms: Part[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + r();
    arms.push(limb([0, 0, 0], [Math.cos(a) * 0.03, 0.06 + r() * 0.03, Math.sin(a) * 0.03], 0.01, 0.004, 4));
  }
  return painted(arms, "coral");
};
/** Raked gravel: a few low ridges side by side. */
const rake: Piece = () => painted([-0.04, 0, 0.04].map((x) => box([0.016, 0.008, 0.11], [x, 0.004, 0])), "gravel");
/** A cog from some machine, lying flat. */
const cog: Piece = () => painted([limb([0, 0, 0], [0, 0.012, 0], 0.035, 0.035, 8), ...[0, 60, 120].map((t) => place([box([0.09, 0.012, 0.016], [0, 0.006, 0])], { turn: [0, t, 0] })[0]!)], "brass");
/** A spent cartridge. */
const cartridge: Piece = () => painted([limb([-0.02, 0.008, 0], [0.025, 0.008, 0], 0.008, 0.008, 5)], "brass");
/** A plate of metal with a glowing seam across it. */
const panel: Piece = (r) => [
  ...painted([box([0.1 + r() * 0.03, 0.01, 0.08], [0, 0.005, 0])], "machine"),
  ...painted([box([0.1, 0.004, 0.008], [0, 0.011, 0])], "glowCyan"),
];

/** Each faction's ground: the pieces its bases are dressed with, the first ones the most common. */
const GROUND: Record<string, readonly Piece[]> = {
  "Verdant Court": [tuft("leaf"), tuft("moss"), flower, leaf, pebble("stone", 0.04)],
  "Dawnhold Covenant": [slab("stone"), slab("gravel"), pebble("stone"), tuft("leaf")],
  "Ashen Host": [pebble("ash", 0.06), bone, pebble("stone", 0.04), slab("ash")],
  "Sunken Hive": [shell, coral, pebble("wetSand", 0.05), shell],
  "House Kagero": [rake, slab("stone"), pebble("gravel", 0.035), tuft("moss")],
  "Iron Concord": [pebble("stone"), cartridge, cog, slab("gravel")],
  "Nexus Collective": [panel, pebble("ironDark", 0.045), pebble("stone", 0.035), panel],
};

/**
 * The ground on a base of this footprint, for a figure of this faction. `seed` varies it, so a
 * squad's figures (and two units of one faction) are not dressed alike. Empty for a faction with
 * no ground.
 */
export function groundParts(faction: string, footprint: Footprint, seed: number): Part[] {
  const pieces = GROUND[faction];
  if (!pieces) return [];
  const r = generator(seed);
  const centres = baseCentres(footprint);
  const out: Part[] = [];
  for (const c of centres) {
    const start = r() * Math.PI * 2;
    for (let i = 0; i < PIECES; i++) {
      // Spread round the hex, each a little off its even place.
      const a = start + (i / PIECES) * Math.PI * 2 + (r() - 0.5) * 0.7;
      const d = NEAR + r() * (FAR - NEAR);
      const at: Point = { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d };
      // Keep clear of the edge where lobes of a larger base meet.
      if (outside(at.x, at.z, centres) > -(BASE_BEVEL + 0.07)) continue;
      const piece = pieces[Math.min(pieces.length - 1, Math.floor(Math.pow(r(), 1.4) * pieces.length))]!;
      const pos: V3 = [at.x, BASE_HEIGHT, at.z];
      out.push(...place(piece(r), { at: pos, turn: [0, r() * 360, 0], scale: [SIZE, SIZE * 0.85, SIZE] }).map((p) => ({ ...p, high: true })));
    }
  }
  return out;
}

/** A seed from text (a card's id), so each unit's ground differs. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
