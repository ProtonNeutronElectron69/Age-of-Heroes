import { ball, both, box, figure, gear, limb, mirror, place, plate, spine, squad } from "./build";
import { spear } from "./gear";
import { HEAD, human, type Human } from "./human";
import type { Paint } from "./paint";
import { AIM_TURN, aiming } from "./poses";
import type { FigureModel, Part, UnitModel, V3 } from "./types";

/**
 * Detailed figure models: stage 2, painted part by part (`paint.ts`) with more detail, drawn in
 * the detailed look. They keep the classic models' poses, heights and footprints, and stay
 * within the triangle budget. A unit without one here keeps its classic model in both looks.
 */

const paint = (parts: readonly Part[], p: Paint): Part[] => parts.map((x) => ({ ...x, paint: p }));
const centroid = (p: Part): V3 => {
  let x = 0, y = 0, z = 0;
  const n = p.tris.length / 3;
  for (let i = 0; i < p.tris.length; i += 3) { x += p.tris[i]!; y += p.tris[i + 1]!; z += p.tris[i + 2]!; }
  return [x / n, y / n, z / n];
};
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * The paint of each part of `human()`, in the order it makes them: hips, chest, neck, head, then
 * each arm (shoulder, upper arm, elbow, forearm, hand) and each leg (thigh, knee, shin, foot).
 */
function paintBody(b: Human, look: { hips: Paint; chest: Paint; sleeve: Paint; hand: Paint; thigh: Paint; shin: Paint; foot: Paint }): Part[] {
  const order: Paint[] = [look.hips, look.chest, "skin", "skin"];
  for (let s = 0; s < 2; s++) order.push(look.sleeve, look.sleeve, look.sleeve, look.sleeve, look.hand);
  for (let s = 0; s < 2; s++) order.push(look.thigh, look.thigh, look.shin, look.foot);
  return b.parts.map((p, i) => ({ ...p, paint: order[i] ?? "coat" }));
}
/** Cuffs at the wrists, just above the hands, and boot tops under the knees. */
function cuffs(b: Human, paintAs: Paint, r = 0.054): Part[] {
  const out: Part[] = [];
  for (const [elbow, hand] of [[6, 8], [11, 13]] as const) {
    const e = centroid(b.parts[elbow]!), h = centroid(b.parts[hand]!);
    out.push(...paint([limb(lerp(e, h, 0.66), lerp(e, h, 0.86), r, r, 6)], paintAs));
  }
  return out;
}
function bootTops(b: Human, paintAs: Paint): Part[] {
  const out: Part[] = [];
  for (const [knee, foot] of [[15, 17], [19, 21]] as const) {
    const k = centroid(b.parts[knee]!), f = centroid(b.parts[foot]!);
    out.push(...paint([limb(lerp(k, f, 0.12), lerp(k, f, 0.3), 0.075, 0.07, 6)], paintAs));
  }
  return out;
}
/** A face: nose and eyes, and hair over the back of the head with a queue. */
function face(b: Human, hairPaint: Paint): Part[] {
  return b.onHead([
    ...paint([box([0.022, 0.034, 0.03], [0, -0.008, 0.088])], "skin"),
    ...paint([box([0.02, 0.018, 0.01], [0.03, 0.016, 0.086]), box([0.02, 0.018, 0.01], [-0.03, 0.016, 0.086])], "eye"),
    ...paint([ball([0, 0.012, -0.018], [HEAD * 0.96, HEAD * 0.92, HEAD * 0.95], 0)], hairPaint),
    ...paint([limb([0, -0.02, -0.075], [0, -0.13, -0.1], 0.026, 0.016, 5)], hairPaint),
  ]);
}

// ---------- Captain Marisol Vance, stage 2 ----------
function sabre(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([plate([[0.028, 0.04], [0.03, 0.24], [0.012, 0.44], [-0.05, 0.6], [-0.04, 0.42], [-0.026, 0.22], [-0.026, 0.04]], 0.026)], "steel"),
    ...paint([box([0.05, 0.028, 0.12], [0, 0.045, 0]), limb([0.03, 0.04, 0.05], [0.03, -0.07, 0.05], 0.009, 0.009, 4)], "gold"),
    ...paint([limb([0, -0.06, 0], [0, 0.04, 0], 0.02, 0.02, 5)], "leather"),
    ...paint([ball([0, -0.07, 0], 0.024, 0)], "gold"),
  ], { at, turn }));
}
const vanceDetailed = (() => {
  const body = human({
    pelvis: [0, 0.49, 0], lean: 3, twist: -24, look: 20,
    handL: [0.1, 0.8, 0.38], handR: [-0.35, 0.98, -0.02], elbowR: [-1, -0.3, -0.5],
    footL: [0.09, 0, 0.15], footR: [-0.1, 0, -0.13],
  });
  const parts: Part[] = paintBody(body, { hips: "white", chest: "coat", sleeve: "coat", hand: "glove", thigh: "white", shin: "boot", foot: "boot" });
  const coat = place(paint([spine([[0, 0.13, 0.118, 0.088], [-0.005, -0.04, 0.165, 0.13], [-0.03, -0.22, 0.205, 0.175]])], "coat"), { at: [0, 0.49, 0], turn: [0, -8, 0] });
  // Coat skirts' turned-back facings, a sash at the waist, lapels, collar and gold buttons.
  const turnbacks = place(paint([spine([[-0.02, -0.12, 0.19, 0.16], [-0.03, -0.2, 0.207, 0.177]], { sides: 8 })], "facing"), { at: [0, 0.49, 0], turn: [0, -8, 0] });
  const sash = body.onChest(paint([spine([[0, 0.05, 0.142, 0.108], [0, 0.11, 0.136, 0.104]], { sides: 8 })], "sash"));
  const front = body.onChest([
    ...paint([box([0.055, 0.2, 0.012], [0.045, 0.24, 0.097]), box([0.055, 0.2, 0.012], [-0.045, 0.24, 0.097])], "facing"),
    ...paint([limb([0, 0.33, 0], [0, 0.375, 0.004], 0.066, 0.06, 8)], "facing"),
    ...paint([0.19, 0.25, 0.31].flatMap((y) => [box([0.02, 0.02, 0.014], [0.078, y, 0.104]), box([0.02, 0.02, 0.014], [-0.078, y, 0.104])]), "gold"),
  ]);
  const bicorne = body.onHead([
    ...paint([plate([[-0.22, 0], [-0.13, 0.1], [0, 0.15], [0.13, 0.1], [0.22, 0], [0.12, 0.03], [0, 0.05], [-0.12, 0.03]], 0.15, "front"), ball([0, 0.06, 0], [0.1, 0.05, 0.1], 0)], "hat"),
    // Gold lace along its upper front edge, and a cockade.
    ...paint(([1] as const).flatMap((zs) => {
      const pts: V3[] = [[-0.22, 0.004, 0], [-0.13, 0.1, 0], [0, 0.15, 0], [0.13, 0.1, 0], [0.22, 0.004, 0]].map(([x, y]) => [x, y, zs * 0.077] as V3);
      return pts.slice(1).map((p, i) => limb(pts[i]!, p, 0.009, 0.009, 3));
    }), "gold"),
    ...paint([ball([0.11, 0.075, 0.08], [0.03, 0.03, 0.012], 0)], "white"),
    ...paint([ball([0.11, 0.075, 0.088], [0.015, 0.015, 0.008], 0)], "sash"),
  ]);
  const epaulettes = body.onChest(paint([
    box([0.1, 0.035, 0.13], [0.19, 0.352, 0]), box([0.1, 0.035, 0.13], [-0.19, 0.352, 0]),
    ...([1, -1] as const).flatMap((s) => [-0.03, 0.03].map((z) => limb([s * 0.235, 0.35, z], [s * 0.245, 0.29, z], 0.009, 0.007, 3))),
  ], "gold"));
  const pistol = gear(place([
    ...paint([box([0.042, 0.05, 0.15], [0, 0.02, 0.03]), box([0.04, 0.1, 0.05], [0, -0.03, -0.01])], "wood"),
    ...paint([limb([0, 0.04, 0.05], [0, 0.04, 0.24], 0.016, 0.014, 6)], "steel"),
    ...paint([box([0.044, 0.02, 0.03], [0, 0.0, 0.04])], "gold"),
  ], { at: body.handL }));
  const all = [...parts, ...coat, ...turnbacks, ...sash, ...front, ...face(body, "hair"), ...bicorne, ...epaulettes, ...cuffs(body, "facing"), ...bootTops(body, "boot"), ...pistol, ...sabre(body.handR, [28, 0, 18])];
  return figure(all, 5);
})();

// ---------- Concord Fusiliers, stage 2 ----------
function musket(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([box([0.045, 0.075, 0.22], [0, 0, -0.14]), box([0.036, 0.04, 0.5], [0, 0.03, 0.2])], "wood"),
    ...paint([limb([0, 0.05, 0.0], [0, 0.05, 0.6], 0.012, 0.012, 6)], "steel"),
    ...paint([limb([0, 0.035, 0.58], [0, 0.035, 0.78], 0.013, 0, 4)], "steel"),
    ...paint([box([0.047, 0.078, 0.02], [0, 0, -0.25]), box([0.04, 0.045, 0.02], [0, 0.032, 0.36])], "gold"),
  ], { at, turn }));
}
function fusilierDetailed(kneeling: boolean): Part[] {
  const pose = aiming(kneeling);
  const body = human(pose);
  const parts = paintBody(body, { hips: "white", chest: "coat", sleeve: "coat", hand: "skin", thigh: "white", shin: "black", foot: "black" });
  const hat = body.onHead([
    ...paint([plate([[0, 0.21], [0.18, -0.13], [-0.18, -0.13]], 0.04, "top", 0.075), ball([0, 0.085, 0], [0.085, 0.05, 0.085], 0)], "hat"),
    // White lace round the brim, and a black cockade with a red button.
    ...paint(([[0, 0.21], [0.18, -0.13], [-0.18, -0.13]] as const).map(([x, z], i, all) => {
      const [nx, nz] = all[(i + 1) % 3]!;
      return limb([x, 0.117, z], [nx, 0.117, nz], 0.009, 0.009, 3);
    }), "white"),
    ...paint([ball([0.1, 0.13, 0.05], [0.028, 0.028, 0.01], 0)], "black"),
    ...paint([ball([0.1, 0.13, 0.057], 0.01, 0)], "sash"),
  ]);
  const coat = place(paint([spine([[0, 0.12, 0.118, 0.088], [-0.01, -0.04, 0.155, 0.12], [-0.04, kneeling ? -0.1 : -0.17, 0.175, 0.14]])], "coat"), { at: pose.pelvis });
  const turnbacks = place(paint([spine([[-0.025, kneeling ? -0.06 : -0.11, 0.165, 0.13], [-0.04, kneeling ? -0.1 : -0.17, 0.177, 0.142]], { sides: 8 })], "facing"), { at: pose.pelvis });
  const front = body.onChest([
    ...paint([box([0.05, 0.19, 0.012], [0.045, 0.24, 0.097]), box([0.05, 0.19, 0.012], [-0.045, 0.24, 0.097])], "facing"),
    ...paint([limb([0, 0.33, 0], [0, 0.37, 0.004], 0.064, 0.058, 8)], "facing"),
    ...paint([0.18, 0.24, 0.3].flatMap((y) => [box([0.019, 0.019, 0.014], [0.075, y, 0.104]), box([0.019, 0.019, 0.014], [-0.075, y, 0.104])]), "gold"),
    // White crossbelts over the coat, front and back.
    ...paint([1, -1].flatMap((s) => place([box([0.04, 0.42, 0.018])], { at: [0, 0.18, 0.112], turn: [0, 0, s * 38] }).concat(place([box([0.04, 0.42, 0.018])], { at: [0, 0.18, -0.105], turn: [0, 0, s * 38] }))), "white"),
    ...paint([box([0.12, 0.085, 0.05], [-0.13, 0.03, -0.11])], "black"),
    ...paint([box([0.2, 0.17, 0.09], [0, 0.22, -0.145])], "leather"),
    ...paint([limb([-0.11, 0.33, -0.15], [0.11, 0.33, -0.15], 0.038, 0.038, 5)], "blanket"),
  ]);
  return [...parts, ...hat, ...coat, ...turnbacks, ...front, ...face(body, "powder"), ...cuffs(body, "facing", 0.05), ...musket(body.handR, AIM_TURN)];
}
const fusiliersDetailed: FigureModel[] = (() => {
  const poses = [fusilierDetailed(false), fusilierDetailed(true)];
  return squad(poses, 5);
})();

// ---------- Lady Asagiri, stage 2 ----------
function katanaP(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([plate([[0.02, 0.06], [0.022, 0.32], [0.008, 0.52], [-0.036, 0.7], [-0.034, 0.52], [-0.022, 0.32], [-0.02, 0.06]], 0.024)], "steel"),
    ...paint([limb([0, 0.04, 0], [0, 0.062, 0], 0.052, 0.052, 8)], "gold"),
    ...paint([limb([0, -0.17, 0], [0, 0.04, 0], 0.019, 0.019, 5)], "black"),
    ...paint([limb([0, -0.185, 0], [0, -0.165, 0], 0.022, 0.022, 5)], "gold"),
  ], { at, turn }));
}
const asagiriDetailed = (() => {
  const body = human(
    { pelvis: [0, 0.47, 0], lean: 4, twist: -18, look: 14, handR: [-0.2, 0.74, 0.1], handL: [-0.11, 0.65, 0.15], elbowR: [-1, -0.2, -0.4], footL: [0.1, 0, 0.2], footR: [-0.12, 0, -0.16] },
    { bulk: 1.05 },
  );
  const parts = paintBody(body, { hips: "hakama", chest: "coat", sleeve: "lacquer", hand: "lacquer", thigh: "hakama", shin: "lacquer", foot: "tabi" });
  const helmet = body.onHead([
    ...paint([ball([0, 0.022, 0], [HEAD * 1.14, HEAD * 1.02, HEAD * 1.16])], "lacquer"),
    ...paint([spine([[-0.03, 0.03, 0.105, 0.11], [-0.085, -0.075, 0.2, 0.135]], { sides: 8 })], "coat"),
    // Silk lacing across the neck guard, and the gold crescent crest.
    ...paint([spine([[-0.056, -0.012, 0.15, 0.124], [-0.06, -0.03, 0.162, 0.127]], { sides: 8 })], "lace"),
    ...paint([plate([[-0.16, 0.22], [-0.085, 0.115], [0, 0.09], [0.085, 0.115], [0.16, 0.22], [0.065, 0.155], [0, 0.14], [-0.065, 0.155]], 0.022, "front", 0.098)], "gold"),
  ]);
  const armour = body.onChest([
    ...paint([box([0.06, 0.2, 0.17], [0.255, 0.24, 0]), box([0.06, 0.2, 0.17], [-0.255, 0.24, 0])], "coat"),
    ...paint([0.2, 0.28].flatMap((y) => [box([0.066, 0.014, 0.176], [0.255, y, 0]), box([0.066, 0.014, 0.176], [-0.255, y, 0])]), "lace"),
    ...paint([spine([[0, 0.125, 0.139, 0.101], [0, 0.14, 0.143, 0.104]], { sides: 8 }), spine([[0, 0.185, 0.155, 0.111], [0, 0.2, 0.159, 0.113]], { sides: 8 })], "lace"),
    ...paint([spine([[0, 0.04, 0.135, 0.1], [0, 0.085, 0.13, 0.097]], { sides: 8 })], "obi"),
  ]);
  const skirt = place([
    ...paint([spine([[0, 0.12, 0.14, 0.1], [0, -0.02, 0.2, 0.155], [0, -0.18, 0.24, 0.195]], { sides: 6 })], "coat"),
    ...paint([spine([[0, -0.06, 0.212, 0.168], [0, -0.075, 0.218, 0.172]], { sides: 6 }), spine([[0, -0.13, 0.232, 0.188], [0, -0.145, 0.236, 0.191]], { sides: 6 })], "lace"),
  ], { at: [0, 0.47, 0] });
  const scabbard = gear([...paint([limb([0.15, 0.53, 0.14], [0.21, 0.45, -0.34], 0.022, 0.018, 5)], "lacquer"), ...paint([limb([0.207, 0.455, -0.31], [0.21, 0.45, -0.345], 0.021, 0.019, 5)], "gold")]);
  const all = [...parts, ...face(body, "hair"), ...helmet, ...armour, ...skirt, ...scabbard, ...katanaP(body.handR, [-10, 0, 8])];
  return figure(all, 5);
})();

// ---------- Crimson Lotus Guard, stage 2 ----------
const GUARD = { shoulders: 0.165, bulk: 0.95 };
function lotusKitP(body: Human, pelvis: V3): Part[] {
  return [
    ...body.onHead([
      ...paint([limb([0, 0.03, 0], [0, 0.1, 0], 0.215, 0.04, 10)], "lacquer"),
      ...paint([limb([0, 0.028, 0], [0, 0.036, 0], 0.219, 0.214, 10)], "gold"),
      ...paint([ball([0, 0.072, 0.125], [0.042, 0.022, 0.042], 0)], "gold"),
      ...paint([ball([0, 0.04, -0.08], 0.042, 0)], "hair"),
    ]),
    ...body.onChest([
      ...paint([ball([0, 0.22, 0.02], [0.15, 0.13, 0.11], 0), box([0.055, 0.18, 0.16], [0.24, 0.25, 0]), box([0.055, 0.18, 0.16], [-0.24, 0.25, 0])], "coat"),
      ...paint([box([0.22, 0.014, 0.012], [0, 0.18, 0.127]), box([0.24, 0.014, 0.012], [0, 0.26, 0.127])], "lace"),
      ...paint([0.21, 0.29].flatMap((y) => [box([0.061, 0.012, 0.166], [0.24, y, 0]), box([0.061, 0.012, 0.166], [-0.24, y, 0])]), "lace"),
      ...paint([spine([[0, 0.04, 0.132, 0.098], [0, 0.08, 0.128, 0.095]], { sides: 8 })], "obi"),
    ]),
    ...place([
      ...paint([spine([[0, 0.12, 0.13, 0.095], [0, -0.02, 0.185, 0.145], [0, -0.17, 0.22, 0.18]], { sides: 6 })], "coat"),
      ...paint([spine([[0, -0.08, 0.198, 0.158], [0, -0.095, 0.204, 0.162]], { sides: 6 })], "lace"),
      ...gear([...paint([limb([0.17, 0.08, 0.12], [0.22, 0, -0.36], 0.022, 0.018, 5)], "lacquer")]),
    ], { at: pelvis }),
  ];
}
function yari(butt: V3, tip: V3): Part[] {
  const at = (t: number): V3 => lerp(butt, tip, t);
  const [shaft, blade] = spear(butt, tip) as [Part, Part];
  return gear([...paint([shaft], "wood"), ...paint([blade], "steel"), ...paint([limb(at(0.86), at(0.9), 0.022, 0.022, 5)], "gold")]);
}
const lotusWatching = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, twist: 8, look: -8, handR: [-0.27, 0.7, 0.1], handL: [0.165, 0.61, 0.2], footL: [0.09, 0, 0.04], footR: [-0.09, 0, -0.02] }, GUARD);
  const parts = paintBody(body, { hips: "hakama", chest: "kimono", sleeve: "kimono", hand: "skin", thigh: "hakama", shin: "hakama", foot: "tabi" });
  const hilt = gear([...paint([limb([0.17, 0.58, 0.12], [0.172, 0.585, 0.15], 0.05, 0.05, 8)], "gold"), ...paint([limb([0.172, 0.585, 0.15], [0.16, 0.61, 0.3], 0.019, 0.019, 5)], "black")]);
  return [...parts, ...face(body, "hair"), ...lotusKitP(body, pelvis), ...hilt, ...yari([-0.27, 0, 0.1], [-0.27, 1.6, 0.1])];
})();
const lotusStriking = (() => {
  const pelvis: V3 = [0, 0.46, 0];
  const body = human({ pelvis, lean: 6, twist: -10, look: 8, handR: [-0.03, 1.04, 0.1], handL: [0.04, 0.96, 0.13], elbowR: [-1, 0, 0.5], elbowL: [1, 0, 0.5], footL: [0.09, 0, 0.24], footR: [-0.1, 0, -0.2] }, GUARD);
  const parts = paintBody(body, { hips: "hakama", chest: "kimono", sleeve: "kimono", hand: "skin", thigh: "hakama", shin: "hakama", foot: "tabi" });
  return [...parts, ...face(body, "hair"), ...lotusKitP(body, pelvis), ...katanaP(body.handR, [-32, 0, 0])];
})();
const lotusDetailed: FigureModel[] = (() => {
  const poses = [lotusWatching, lotusStriking];
  return squad(poses, 5);
})();

// ---------- Creatures: helpers for bodies swept along a line ----------
type Sec = readonly [number, number, number, number];
/** Where the top (or underside) of a swept body is at section `i`, and the way out from it. */
function edgeOf(secs: readonly Sec[], i: number, up: boolean): { at: V3; out: V3 } {
  const [z, y, , rn] = secs[i]!;
  const prev = secs[Math.max(0, i - 1)]!, next = secs[Math.min(secs.length - 1, i + 1)]!;
  const len = Math.hypot(next[0] - prev[0], next[1] - prev[1]) || 1;
  const tz = (next[0] - prev[0]) / len, ty = (next[1] - prev[1]) / len;
  // The section's second axis, as spine() lays it: +n moves y by tz and z by -ty.
  let ny = tz, nz = -ty;
  if ((ny > 0) !== up) { ny = -ny; nz = -nz; }
  return { at: [0, y + ny * rn, z + nz * rn], out: [0, ny, nz] };
}
/** More sections, halfway between each pair, for a finer row of spikes. */
const finer = (secs: readonly Sec[]): Sec[] =>
  secs.flatMap((s, i) => (i + 1 < secs.length ? [s, s.map((v, k) => (v + secs[i + 1]![k]!) / 2) as unknown as Sec] : [s]));
function spikes(secs: readonly Sec[], from: number, to: number, length: number, radius: number): Part[] {
  const out: Part[] = [];
  for (let i = from; i <= to && i < secs.length; i++) {
    const { at, out: dir } = edgeOf(secs, i, true);
    const k = length * (1 - 0.25 * Math.abs(i - (from + to) / 2) / Math.max(1, (to - from) / 2));
    out.push(limb([at[0], at[1] - dir[1] * 0.02, at[2] - dir[2] * 0.02], [at[0], at[1] + dir[1] * k, at[2] + dir[2] * k - 0.03], radius, 0, 4));
  }
  return out;
}
/** A lighter strip along the underside: the same line, shifted down and narrower. */
function underside(secs: readonly Sec[], drop = 0.55, width = 0.62, thick = 0.5, sides = 6): Part {
  return spine(secs.map((s, i) => {
    const { out } = edgeOf(secs, i, false);
    return [s[0] + out[2] * s[3] * drop, s[1] + out[1] * s[3] * drop, s[2] * width, s[3] * thick] as Sec;
  }), { sides });
}

// ---------- Cinderjaw, stage 2 ----------
const cinderjawDetailed = (() => {
  const BODY: Sec[] = [[-0.25, 0.75, 0.2, 0.2], [-0.05, 0.95, 0.31, 0.29], [0.2, 1.2, 0.31, 0.28], [0.36, 1.4, 0.2, 0.2]];
  const NECK: Sec[] = [[0.32, 1.36, 0.18, 0.18], [0.46, 1.6, 0.13, 0.13], [0.6, 1.78, 0.11, 0.11]];
  const TAIL: Sec[] = [[-0.22, 0.78, 0.19, 0.19], [-0.45, 0.5, 0.13, 0.13], [-0.5, 0.25, 0.09, 0.09], [-0.35, 0.07, 0.06, 0.055], [-0.08, 0.03, 0.03, 0.025]];
  const body = paint([spine(BODY), spine(NECK, { sides: 6 }), spine(TAIL, { sides: 6 })], "coat");
  const belly = paint([underside(BODY), underside(NECK, 0.5, 0.6, 0.5, 5)], "belly");
  const ridge = paint([...spikes(finer(BODY), 1, 6, 0.14, 0.035), ...spikes(NECK, 0, 2, 0.09, 0.025), ...spikes(finer(TAIL), 1, 4, 0.08, 0.025)], "horn");
  const head = [
    ...paint([spine([[0.5, 1.82, 0.13, 0.12], [0.7, 1.84, 0.16, 0.14], [0.93, 1.76, 0.1, 0.08], [1.03, 1.72, 0.06, 0.04]], { sides: 6 })], "coat"),
    ...paint([spine([[0.62, 1.72, 0.12, 0.035], [0.96, 1.6, 0.05, 0.02]], { sides: 5 })], "coat"),
    ...paint(both([limb([0.09, 1.92, 0.56], [0.17, 2.0, 0.3], 0.05, 0, 4)]), "horn"),
    // Fire in the open mouth, amber eyes and a few teeth.
    ...paint([ball([0, 1.7, 0.8], [0.06, 0.03, 0.13], 0)], "glow"),
    ...paint([ball([0.1, 1.88, 0.76], 0.026, 0), ball([-0.1, 1.88, 0.76], 0.026, 0)], "glow"),
    ...paint([0.88, 0.96].flatMap((z) => [limb([0.045, 1.74, z], [0.045, 1.67, z], 0.013, 0, 3), limb([-0.045, 1.74, z], [-0.045, 1.67, z], 0.013, 0, 3)]), "horn"),
  ];
  // Each leg: thigh, shin, claw; upper arm, claw. The claws are horn.
  const legPaint: Paint[] = ["coat", "coat", "horn", "coat", "horn"];
  const legs = both([
    limb([0.2, 0.8, -0.15], [0.32, 0.52, 0.1], 0.12, 0.085, 5),
    limb([0.32, 0.52, 0.1], [0.3, 0.3, -0.04], 0.085, 0.05, 5),
    limb([0.3, 0.3, -0.04], [0.32, 0.22, 0.12], 0.05, 0, 4),
    limb([0.26, 1.22, 0.25], [0.35, 1.02, 0.46], 0.075, 0.05, 5),
    limb([0.35, 1.02, 0.46], [0.34, 0.9, 0.56], 0.05, 0, 4),
  ]).map((p, i) => ({ ...p, paint: legPaint[i % 5]! }));
  const OUTLINE: [number, number][] = [[0.12, 1.36], [0.4, 1.76], [0.74, 1.98], [0.95, 1.88], [0.85, 1.6], [0.95, 1.4], [0.7, 1.26], [0.72, 1.06], [0.45, 1.06], [0.15, 1.16]];
  const bone = (a: [number, number], b: [number, number], r: number) => limb([a[0], a[1], 0], [b[0], b[1], 0], r, r * 0.7, 4);
  const wingParts: Part[] = [
    ...paint([plate(OUTLINE, 0.03, "front")], "wing"),
    ...paint([bone(OUTLINE[0]!, OUTLINE[1]!, 0.03), bone(OUTLINE[1]!, OUTLINE[2]!, 0.024), bone(OUTLINE[2]!, OUTLINE[3]!, 0.018), bone(OUTLINE[1]!, OUTLINE[4]!, 0.016), bone(OUTLINE[1]!, OUTLINE[6]!, 0.016)], "wingbone"),
  ];
  const wing = place(wingParts, { at: [0, 0, 0.05], turn: [0, 25, 0] });
  const otherWing = mirror(wing);
  const all = [...body, ...belly, ...ridge, ...head, ...legs, ...wing, ...otherWing];
  return figure(all, 7);
})();

// ---------- Duskfang Prowlers, stage 2 ----------
function prowlerDetailed(drop: number, lift: number): Part[] {
  const d = drop * 0.22;
  const BODY: Sec[] = [[-0.52, 0.62, 0.07, 0.08], [-0.42, 0.62, 0.15, 0.17], [-0.15, 0.6, 0.17, 0.17], [0.15, 0.61, 0.19, 0.2], [0.36, 0.63, 0.15, 0.17], [0.44, 0.64, 0.08, 0.1]];
  const leg = (sections: Sec[], x: number) => spine(sections, { sides: 6, x });
  const LEGS: [Sec[], number][] = [
    [[[0.32, 0.5, 0.07, 0.09], [0.4, 0.28, 0.05, 0.055], [0.45, 0.07, 0.04, 0.045], [0.51, 0.03, 0.05, 0.035]], 0.12],
    [[[0.32, 0.5, 0.07, 0.09], [0.28, 0.27, 0.05, 0.055], [0.3, 0.07, 0.04, 0.045], [0.36, 0.03, 0.05, 0.035]], -0.12],
    [[[-0.36, 0.52, 0.08, 0.11], [-0.28, 0.3, 0.055, 0.06], [-0.38, 0.1, 0.04, 0.045], [-0.32, 0.03, 0.05, 0.035]], 0.12],
    [[[-0.36, 0.52, 0.08, 0.11], [-0.46, 0.3, 0.055, 0.06], [-0.56, 0.1, 0.04, 0.045], [-0.5, 0.03, 0.05, 0.035]], -0.12],
  ];
  const tailEnd: V3 = [0, 0.5 + lift * 0.42, -0.72];
  return [
    ...paint([spine(BODY)], "fur"),
    ...paint([underside(BODY, 0.62, 0.6, 0.45)], "belly"),
    // Dark stripes over the back and flanks.
    ...paint([-0.33, -0.21, -0.07, 0.07].map((z) => {
      const at = (zz: number): Sec => {
        const i = BODY.findIndex((s) => s[0] >= zz);
        const a = BODY[Math.max(0, i - 1)]!, b = BODY[i]!, t = (zz - a[0]) / (b[0] - a[0] || 1);
        return [zz, a[1] + (b[1] - a[1]) * t, (a[2] + (b[2] - a[2]) * t) * 1.04, (a[3] + (b[3] - a[3]) * t) * 1.04];
      };
      return spine([at(z), at(z + 0.035)], { sides: 8 });
    }), "stripe"),
    ...paint([ball([0, 0.74, 0.26], [0.17, 0.15, 0.18], 0)], "mane"),
    ...paint([spine([[0.36, 0.67, 0.12, 0.13], [0.52, 0.72 - d, 0.1, 0.1]], { sides: 6 })], "fur"),
    ...paint([spine([[0.4, 0.685, 0.128, 0.138], [0.45, 0.695, 0.124, 0.134]], { sides: 8 })], "leaf"),
    ...paint([spine([[0.46, 0.75 - d, 0.1, 0.1], [0.6, 0.73 - d, 0.115, 0.105], [0.74, 0.67 - d, 0.065, 0.06], [0.82, 0.64 - d, 0.04, 0.032]], { sides: 6 })], "fur"),
    ...paint(both([limb([0.07, 0.81 - d, 0.52], [0.1, 0.95 - d, 0.47], 0.042, 0, 4)]), "mane"),
    // Muzzle, nose, eyes, and the two sabre fangs.
    ...paint([ball([0, 0.635 - d, 0.77], [0.05, 0.035, 0.06], 0)], "belly"),
    ...paint([box([0.03, 0.02, 0.02], [0, 0.665 - d, 0.84])], "black"),
    ...paint([box([0.03, 0.018, 0.01], [0.055, 0.755 - d, 0.69]), box([0.03, 0.018, 0.01], [-0.055, 0.755 - d, 0.69])], "glowGreen"),
    ...paint([limb([0.03, 0.625 - d, 0.78], [0.034, 0.5 - d, 0.8], 0.014, 0, 4), limb([-0.03, 0.625 - d, 0.78], [-0.034, 0.5 - d, 0.8], 0.014, 0, 4)], "horn"),
    ...paint(LEGS.map(([secs, x]) => leg(secs, x)), "fur"),
    ...paint(LEGS.map(([secs, x]) => { const f = secs[3]!; return limb([x, 0.03, f[0] + 0.03], [x, 0.012, f[0] + 0.085], 0.02, 0, 3); }), "horn"),
    ...paint([spine([[-0.5, 0.64, 0.045, 0.05], [-0.64, 0.58 + lift * 0.18, 0.04, 0.045], [-0.72, 0.5 + lift * 0.42, 0.02, 0.022]], { sides: 5 })], "fur"),
    ...paint([ball(tailEnd, 0.032, 0)], "stripe"),
  ];
}
const prowlersDetailed: FigureModel[] = (() => {
  const poses = [prowlerDetailed(0, 0.3), prowlerDetailed(1, 1), prowlerDetailed(0.5, 0)];
  return squad(poses, 4);
})();


export const DETAILED_MODELS: Readonly<Record<string, UnitModel>> = {
  "marisol-vance": { figures: [vanceDetailed] },
  "concord-fusiliers": { figures: fusiliersDetailed },
  "lady-asagiri": { figures: [asagiriDetailed] },
  "crimson-lotus-guard": { figures: lotusDetailed },
  cinderjaw: { figures: [cinderjawDetailed] },
  "duskfang-prowlers": { figures: prowlersDetailed },
};
