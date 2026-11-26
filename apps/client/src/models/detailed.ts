import { ball, both, box, figure, gear, limb, mirror, place, plate, spine, squad } from "./build";
import { arrow, bow, flightStand, pointing, roundShield, spear } from "./gear";
import { HEAD, human, type Human } from "./human";
import { GALLOP, TROT, horse, type HorseLeg, type HorsePose } from "./horse";
import type { Paint } from "./paint";
import { AIM_TURN, DRAWN, aiming, loosing } from "./poses";
import type { FigureModel, Part, UnitModel, V3 } from "./types";
import { HIVE_DETAILED } from "./units/hive";

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
function paintBody(b: Human, look: { hips: Paint; chest: Paint; sleeve: Paint; hand: Paint; thigh: Paint; shin: Paint; foot: Paint; skin?: Paint }): Part[] {
  const order: Paint[] = [look.hips, look.chest, look.skin ?? "skin", look.skin ?? "skin"];
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

// ---------- Fine detail, drawn at high quality only ----------
/**
 * Detail only High draws (`Part.high`): Low leaves it out, so Low's figures stay as they were.
 * It counts as gear, so it never changes a figure's Height or how it fits its base.
 */
function fine(parts: readonly Part[]): Part[] {
  return parts.map((p) => ({ ...p, high: true, role: p.role === "body" ? ("gear" as const) : p.role }));
}
/** A thin edging round a rectangle in the front (x-y) plane, at depth `z`: the trim of a tabard or surcoat. */
function trimRect(w: number, h: number, at: V3, paintAs: Paint = "gold", r = 0.007): Part[] {
  const [x, y, z] = at;
  const c: V3[] = [[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z], [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]];
  return paint(c.map((p, i) => limb(p, c[(i + 1) % 4]!, r, r, 3)), paintAs);
}
/** Small domed rivets or studs. */
function rivets(points: readonly V3[], paintAs: Paint = "gold", r = 0.012): Part[] {
  return paint(points.map((p) => ball(p, r, 0)), paintAs);
}
/** A ring of `n` short rods round the y axis at height `y`: a band, a hoop or a rim. */
function hoopRing(radius: number, y: number, paintAs: Paint, r = 0.008, n = 10): Part[] {
  const pts: V3[] = Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * radius, y, Math.sin((i / n) * Math.PI * 2) * radius]);
  return paint(pts.map((p, i) => limb(p, pts[(i + 1) % n]!, r, r, 3)), paintAs);
}
/** A plume of feathers sweeping back and up from `at`, the outer ones a second colour. */
function plume(at: V3, paintAs: Paint, tips: Paint = paintAs, length = 0.24): Part[] {
  const out: Part[] = [];
  for (let i = 0; i < 5; i++) {
    const side = (i - 2) * 0.022;
    const end: V3 = [at[0] + side, at[1] + length * (0.45 + 0.08 * (2 - Math.abs(i - 2))), at[2] - length];
    const mid: V3 = [at[0] + side * 0.6, at[1] + length * 0.5, at[2] - length * 0.35];
    out.push(...paint([limb(at, mid, 0.03, 0.026, 5)], paintAs), ...paint([limb(mid, end, 0.026, 0, 5)], Math.abs(i - 2) === 2 ? tips : paintAs));
  }
  return out;
}
/** Plate guards over the knees and elbows of a `human()`. */
function jointGuards(b: Human, paintAs: Paint, r = 0.06): Part[] {
  return paint([6, 11, 15, 19].map((i) => ball(centroid(b.parts[i]!), r, 0)), paintAs);
}
/** A guard over one forearm of a `human()`: `left` the figure's left (its bow arm). */
function bracer(b: Human, left: boolean, paintAs: Paint, band: Paint): Part[] {
  const [elbow, hand] = left ? [6, 8] : [11, 13];
  const e = centroid(b.parts[elbow]!), h = centroid(b.parts[hand]!);
  return [...paint([limb(lerp(e, h, 0.3), lerp(e, h, 0.72), 0.05, 0.046, 6)], paintAs), ...paint([limb(lerp(e, h, 0.5), lerp(e, h, 0.55), 0.053, 0.053, 6)], band)];
}
/** A small leaf, flat, pointing along `dir` from `at`. */
function leafAt(at: V3, dir: V3, size = 0.05, paintAs: Paint = "leaf"): Part[] {
  const turn = pointing([0, 0, 0], dir);
  return paint(place([plate([[0, 0], [size * 0.35, size * 0.5], [0, size], [-size * 0.35, size * 0.5]], 0.008, "top")], { at, turn }), paintAs);
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
  // At high quality: a gold gorget at the throat, a white sword belt across the coat, and spurs.
  const finery = fine([
    ...body.onChest([
      ...paint([plate([[-0.06, 0.37], [0.06, 0.37], [0.05, 0.335], [0, 0.322], [-0.05, 0.335]], 0.012, "front", 0.106)], "gold"),
      ...paint(place([box([0.032, 0.42, 0.014])], { at: [0, 0.18, 0.111], turn: [0, 0, -36] }), "white"),
    ]),
    ...paint([17, 21].map((i) => { const f = centroid(body.parts[i]!); return limb([f[0], f[1] + 0.02, f[2] - 0.05], [f[0], f[1] + 0.02, f[2] - 0.11], 0.008, 0.004, 3); }), "steel"),
  ]);
  const all = [...parts, ...coat, ...turnbacks, ...sash, ...front, ...face(body, "hair"), ...bicorne, ...epaulettes, ...cuffs(body, "facing"), ...bootTops(body, "boot"), ...pistol, ...sabre(body.handR, [28, 0, 18]), ...finery];
  return figure(all, 5);
})();

// ---------- Concord Fusiliers, stage 2 ----------
function musket(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([box([0.045, 0.075, 0.22], [0, 0, -0.14]), box([0.036, 0.04, 0.5], [0, 0.03, 0.2])], "wood"),
    ...paint([limb([0, 0.05, 0.0], [0, 0.05, 0.6], 0.012, 0.012, 6)], "steel"),
    ...paint([limb([0, 0.035, 0.58], [0, 0.035, 0.78], 0.013, 0, 4)], "steel"),
    ...paint([box([0.047, 0.078, 0.02], [0, 0, -0.25]), box([0.04, 0.045, 0.02], [0, 0.032, 0.36])], "gold"),
    // At high quality: the ramrod under the barrel, and a leather sling.
    ...fine([
      ...paint([limb([0, 0.002, 0.08], [0, 0.002, 0.56], 0.005, 0.005, 3)], "steel"),
      ...paint([limb([0, -0.045, -0.2], [0, -0.03, 0.36], 0.006, 0.006, 3)], "leather"),
    ]),
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
  // At high quality: a brass plate where the crossbelts meet, a badge on the cartridge box, and a canteen.
  const finery = fine(body.onChest([
    ...paint([box([0.045, 0.045, 0.012], [0, 0.18, 0.123])], "brass"),
    ...paint([ball([-0.13, 0.03, -0.137], [0.022, 0.022, 0.008], 0)], "brass"),
    ...paint([limb([0.17, -0.02, 0.02], [0.17, -0.02, -0.05], 0.045, 0.045, 8)], "blanket"),
  ]));
  return [...parts, ...hat, ...coat, ...turnbacks, ...front, ...face(body, "powder"), ...cuffs(body, "facing", 0.05), ...musket(body.handR, AIM_TURN), ...finery];
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
  // At high quality: a lacquered face mask, gold rivets round the helmet, more lacing on the shoulder
  // guards, a bow of the obi at her back, and a silk cord wound round the scabbard.
  const finery = fine([
    ...body.onHead([
      ...paint([plate([[-0.06, -0.015], [0.06, -0.015], [0.05, -0.07], [0, -0.09], [-0.05, -0.07]], 0.02, "front", 0.09)], "lacquer"),
      ...rivets(Array.from({ length: 8 }, (_, i): V3 => [Math.sin((i / 8) * Math.PI * 2) * 0.094, 0.06, Math.cos((i / 8) * Math.PI * 2) * 0.094]), "gold", 0.008),
    ]),
    ...body.onChest([
      ...paint([0.16, 0.24, 0.32].flatMap((y) => [box([0.066, 0.01, 0.176], [0.255, y, 0]), box([0.066, 0.01, 0.176], [-0.255, y, 0])]), "lace"),
      ...paint([ball([0, 0.06, -0.11], [0.06, 0.04, 0.03], 0)], "obi"),
    ]),
    ...paint([0.05, 0.12].map((t) => limb(lerp([0.15, 0.53, 0.14], [0.21, 0.45, -0.34], t), lerp([0.15, 0.53, 0.14], [0.21, 0.45, -0.34], t + 0.03), 0.026, 0.026, 6)), "lace"),
  ]);
  const all = [...parts, ...face(body, "hair"), ...helmet, ...armour, ...skirt, ...scabbard, ...katanaP(body.handR, [-10, 0, 8]), ...finery];
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
    // At high quality: a banner on a pole at the back with the house's crest, gold rivets round the hat, and the crest on the chest.
    ...fine([
      ...body.onChest([
        ...paint([limb([0, 0.18, -0.13], [0, 0.8, -0.15], 0.01, 0.01, 4)], "wood"),
        ...paint([plate([[0, 0.5], [0.15, 0.5], [0.15, 0.78], [0, 0.78]], 0.008, "front", -0.155)], "coat"),
        ...paint([ball([0.075, 0.64, -0.161], [0.032, 0.032, 0.006], 0), ball([0, 0.22, 0.133], [0.026, 0.026, 0.006], 0)], "gold"),
      ]),
      ...body.onHead(rivets(Array.from({ length: 10 }, (_, i): V3 => [Math.sin((i / 10) * Math.PI * 2) * 0.2, 0.042, Math.cos((i / 10) * Math.PI * 2) * 0.2]), "gold", 0.009)),
    ]),
  ];
}
function yari(butt: V3, tip: V3): Part[] {
  const at = (t: number): V3 => lerp(butt, tip, t);
  const [shaft, blade] = spear(butt, tip) as [Part, Part];
  // At high quality: a red tassel hanging below the gold collar.
  const tassel = fine([...paint([ball(at(0.84), 0.026, 0)], "sash"), ...paint([-0.018, 0.018].map((dx) => limb(at(0.84), [at(0.84)[0] + dx, at(0.84)[1] - 0.07, at(0.84)[2]], 0.007, 0.004, 3)), "sash")]);
  return gear([...paint([shaft], "wood"), ...paint([blade], "steel"), ...paint([limb(at(0.86), at(0.9), 0.022, 0.022, 5)], "gold"), ...tassel]);
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
    // At high quality: finer veins across the membrane.
    ...fine(paint([bone(OUTLINE[1]!, OUTLINE[5]!, 0.01), bone(OUTLINE[1]!, OUTLINE[8]!, 0.01), bone(OUTLINE[0]!, OUTLINE[7]!, 0.01), bone(OUTLINE[2]!, OUTLINE[4]!, 0.008)], "wingbone")),
  ];
  const wing = place(wingParts, { at: [0, 0, 0.05], turn: [0, 25, 0] });
  const otherWing = mirror(wing);
  // At high quality: dark scales along the flanks, embers glowing between the belly plates, and smoke
  // curling from the nostrils.
  const finery = fine([
    ...paint(finer(BODY).slice(1, -1).flatMap(([z, y, rx]) => [ball([rx * 0.9, y + 0.04, z], [0.05, 0.035, 0.06], 0), ball([-rx * 0.9, y + 0.04, z], [0.05, 0.035, 0.06], 0)]), "coatDark"),
    ...paint([1, 2].map((i) => { const { at } = edgeOf(BODY, i, false); return ball([0, at[1] + 0.01, at[2]], [0.06, 0.02, 0.04], 0); }), "glow"),
    ...paint(([1, -1] as const).flatMap((sx) => [ball([sx * 0.045, 1.78, 1.08], 0.035, 0), ball([sx * 0.07, 1.86, 1.15], 0.05, 0)]), "powder"),
  ]);
  const all = [...body, ...belly, ...ridge, ...head, ...legs, ...wing, ...otherWing, ...finery];
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
    // At high quality: whiskers, tufted ears, more claws on each paw, and stripes round the tail.
    ...fine([
      ...paint(([1, -1] as const).flatMap((sx) => [0.66, 0.64, 0.62].map((y) => limb([sx * 0.045, y - d, 0.79], [sx * 0.17, y - d + (y - 0.64) * 1.5, 0.77], 0.003, 0.002, 3))), "white"),
      ...paint(([1, -1] as const).map((sx) => limb([sx * 0.1, 0.95 - d, 0.47], [sx * 0.112, 1.02 - d, 0.45], 0.012, 0, 3)), "black"),
      ...paint(LEGS.flatMap(([secs, x]) => { const f = secs[3]!; return [-0.025, 0.025].map((dx) => limb([x + dx, 0.03, f[0] + 0.03], [x + dx * 1.4, 0.012, f[0] + 0.08], 0.016, 0, 3)); }), "horn"),
      ...paint([0.3, 0.65].map((t) => {
        const a: V3 = lerp([0, 0.64, -0.5], [0, 0.58 + lift * 0.18, -0.64], t), b: V3 = lerp([0, 0.64, -0.5], [0, 0.58 + lift * 0.18, -0.64], t + 0.12);
        return limb(a, b, 0.05, 0.048, 6);
      }), "stripe"),
    ]),
  ];
}
const prowlersDetailed: FigureModel[] = (() => {
  const poses = [prowlerDetailed(0, 0.3), prowlerDetailed(1, 1), prowlerDetailed(0.5, 0)];
  return squad(poses, 4);
})();


// ---------- Shared: painting the shared gear ----------
/** Give a list of parts their paints in order; the last paint covers any parts left over. */
const each = (parts: readonly Part[], paints: readonly Paint[]): Part[] => parts.map((p, i) => ({ ...p, paint: paints[Math.min(i, paints.length - 1)]! }));
/** Nose and eyes only, for a head under a veil or a hood. */
function faceOnly(b: Human): Part[] {
  return b.onHead([
    ...paint([box([0.022, 0.034, 0.03], [0, -0.008, 0.088])], "skin"),
    ...paint([box([0.02, 0.018, 0.01], [0.03, 0.016, 0.086]), box([0.02, 0.018, 0.01], [-0.03, 0.016, 0.086])], "eye"),
  ]);
}
/** Glowing eye sockets in a skull. */
const ghostEyes = (b: Human): Part[] => b.onHead(paint([box([0.022, 0.016, 0.01], [0.03, 0.012, 0.087]), box([0.022, 0.016, 0.01], [-0.03, 0.012, 0.087])], "glowGreen"));
/** A belt round the hips. */
const belt = (pelvis: V3, paintAs: Paint, y = 0.09, r: [number, number] = [0.128, 0.096]): Part[] =>
  place(paint([spine([[0, y - 0.02, r[0], r[1]], [0, y + 0.02, r[0] * 0.98, r[1] * 0.98]], { sides: 8 })], paintAs), { at: pelvis });

// ---------- Nexus Reclaimers, stage 2 ----------
function carbineP(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([box([0.055, 0.085, 0.4], [0, 0.035, 0.12]), box([0.045, 0.075, 0.17], [0, 0.015, -0.16])], "machine"),
    ...paint([limb([0, 0.045, 0.32], [0, 0.045, 0.52], 0.018, 0.018, 5)], "steel"),
    ...paint([box([0.065, 0.065, 0.09], [0, -0.035, 0.2])], "coat"),
    ...paint([box([0.016, 0.016, 0.16], [0, 0.084, 0.1])], "glowCyan"),
  ], { at, turn }));
}
const RECLAIMER = { bulk: 1.05 };
const reclaimerBody = (b: Human) => paintBody(b, { hips: "machine", chest: "machine", sleeve: "machine", hand: "black", thigh: "machine", shin: "coat", foot: "black" });
const reclaimerKitP = (body: Human): Part[] => [
  ...body.onHead([
    ...paint([ball([0, 0.012, -0.005], [HEAD * 1.14, HEAD * 1.14, HEAD * 1.16])], "coat"),
    ...paint([box([0.15, 0.045, 0.06], [0, 0.012, 0.085])], "glowCyan"),
  ]),
  ...body.onChest([
    ...paint([ball([0.205, 0.335, 0], [0.095, 0.07, 0.1], 0), ball([-0.205, 0.335, 0], [0.095, 0.07, 0.1], 0)], "coat"),
    ...paint([box([0.2, 0.13, 0.03], [0, 0.24, 0.1])], "coat"),
    ...paint([box([0.22, 0.27, 0.11], [0, 0.22, -0.155])], "machine"),
    ...paint([box([0.14, 0.04, 0.02], [0, 0.27, -0.212])], "glowCyan"),
    ...paint([limb([0.07, 0.34, -0.17], [0.09, 0.5, -0.19], 0.022, 0.022, 4)], "steel"),
  ]),
];
const reclaimerAimingP = (() => {
  const body = human({ hips: -20, twist: -32, look: 28, handR: [-0.1, 0.76, 0.14], handL: [0.04, 0.76, 0.36], footL: [0.08, 0, 0.16], footR: [-0.1, 0, -0.12] }, RECLAIMER);
  return [...reclaimerBody(body), ...reclaimerKitP(body), ...carbineP(body.handR, [0, 32, 0])];
})();
const reclaimerAdvancingP = (() => {
  const body = human({ lean: 8, twist: 10, handR: [-0.23, 0.56, 0.16], handL: [0.22, 0.66, 0.32], footL: [0.09, 0, 0.2], footR: [-0.09, 0, -0.16] }, RECLAIMER);
  const claw = place([
    ...paint([ball([0, 0, 0], 0.07, 0)], "machine"),
    ...paint([limb([0.02, 0.02, 0.03], [0.07, 0.04, 0.19], 0.026, 0, 4), limb([-0.02, 0.02, 0.03], [-0.07, 0.04, 0.19], 0.026, 0, 4), limb([0, -0.02, 0.03], [0, -0.07, 0.18], 0.026, 0, 4)], "steel"),
  ], { at: body.handL });
  return [...reclaimerBody(body), ...reclaimerKitP(body), ...claw, ...carbineP(body.handR, [14, 0, 0])];
})();

// ---------- Siege Walker Atlas, stage 2 ----------
const atlasDetailed = (() => {
  const legs = each(both([
    box([0.56, 0.56, 0.7], [0.95, 1.5, 0]),
    limb([0.95, 1.5, 0], [1.0, 0.95, -0.6], 0.26, 0.22, 6),
    ball([1.0, 0.95, -0.6], 0.29, 0),
    limb([1.0, 0.95, -0.6], [1.0, 0.34, 0.08], 0.22, 0.19, 6),
    box([0.44, 0.34, 0.46], [1.0, 0.32, 0.08]),
    spine([[-0.42, 0.11, 0.3, 0.11], [0.5, 0.12, 0.36, 0.12], [0.92, 0.07, 0.3, 0.07]], { sides: 6, x: 1.0 }),
  ]), ["machine", "coat", "machine", "coat", "machine", "machine", "machine", "coat", "machine", "coat", "machine", "machine"]);
  const hull = [
    ...paint([box([1.5, 0.48, 1.0], [0, 1.52, 0])], "machine"),
    ...paint([spine([[-1.15, 2.08, 0.5, 0.34], [-0.75, 2.14, 0.8, 0.52], [0.5, 2.14, 0.8, 0.52], [1.1, 2.0, 0.54, 0.36], [1.4, 1.9, 0.32, 0.2]], { sides: 8 })], "coat"),
    ...paint([ball([0, 1.78, 1.12], 0.17, 0)], "glowCyan"),
    // A glowing slit of a cockpit window, warning stripes on the flanks, and vents.
    ...paint([box([0.46, 0.08, 0.06], [0, 2.3, 1.12])], "glowCyan"),
    ...paint([1, -1].flatMap((s) => [box([0.04, 0.3, 0.5], [s * 0.77, 1.5, 0.1])]), "gold"),
    ...paint([-0.25, 0, 0.25].map((x) => box([0.12, 0.05, 0.3], [x, 2.66, -0.55])), "machine"),
  ];
  const mortar = [...paint([limb([0, 2.55, -0.2], [0, 2.76, -0.2], 0.54, 0.5, 8)], "machine"), ...paint([limb([0, 2.66, -0.4], [0, 3.3, 0.1], 0.28, 0.32, 8)], "steel")];
  const gunPods = each(both([
    box([0.36, 0.44, 1.1], [1.1, 2.1, 0.2]),
    limb([1.1, 2.17, 0.7], [1.1, 2.17, 1.55], 0.085, 0.085, 6),
    limb([1.1, 1.99, 0.7], [1.1, 1.99, 1.4], 0.065, 0.065, 6),
  ]), ["coat", "steel", "steel", "coat", "steel", "steel"]);
  const exhausts = each(both([limb([0.42, 2.45, -0.95], [0.48, 2.95, -1.12], 0.11, 0.1, 6)]), ["machine"]);
  const glowingVents = gear(paint(both([ball([0.48, 2.96, -1.12], [0.08, 0.02, 0.08], 0)]), "glow"));
  const antenna = gear(paint([limb([-0.35, 2.6, -0.7], [-0.4, 3.15, -0.8], 0.02, 0.01, 4)], "steel"));
  return figure([...legs, ...hull, ...mortar, ...gunPods, ...exhausts, ...glowingVents, ...antenna], 10);
})();

// ---------- Barrow Legion, stage 2 ----------
const SKELETON = { shoulders: 0.15, bulk: 0.62 };
const skeletonBody = (b: Human) => paintBody(b, { hips: "bone", chest: "bone", sleeve: "bone", hand: "bone", thigh: "bone", shin: "bone", foot: "bone", skin: "bone" });
const legionKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...paint([box([0.1, 0.05, 0.09], [0, -0.085, 0.03])], "bone"),
    ...paint([ball([0, 0.035, -0.005], [HEAD * 1.12, HEAD * 0.82, HEAD * 1.14], 0)], "ironDark"),
    ...paint([plate([[-0.12, 0.07], [-0.04, 0.2], [0.08, 0.17], [0.11, 0.08]], 0.024)], "coat"),
  ]),
  ...ghostEyes(body),
  ...body.onChest(paint([ball([0, 0.23, 0.005], [0.125, 0.105, 0.085], 0)], "bone")),
  // A rotted kilt and a rusted belt.
  ...place(paint([spine([[0, 0.02, 0.1, 0.075], [0, -0.13, 0.135, 0.105]], { sides: 6 })], "coatDark"), { at: pelvis }),
  ...belt(pelvis, "ironDark", 0.035, [0.105, 0.08]),
];
const legionGuardingP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ handR: [-0.27, 0.66, 0.1], handL: [0.2, 0.62, 0.2], footL: [0.09, 0, 0.04], footR: [-0.09, 0, -0.02] }, SKELETON);
  return [...skeletonBody(body), ...legionKitP(body, pelvis), ...each(spear([-0.27, 0, 0.1], [-0.27, 1.5, 0.1]), ["wood", "ironDark"]), ...each(roundShield([0.22, 0.6, 0.27], 0.2, [0, 20, 0]), ["coat", "ironDark"])];
})();
const legionLungingP = (() => {
  const pelvis: V3 = [0, 0.4, 0.04];
  const body = human({ pelvis, lean: 22, twist: -25, look: 20, handR: [-0.14, 0.6, 0.26], handL: [0.2, 0.56, 0.34], footL: [0.08, 0, 0.3], footR: [-0.08, 0, -0.26] }, SKELETON);
  return [...skeletonBody(body), ...legionKitP(body, pelvis), ...each(spear([-0.17, 0.5, -0.4], [-0.1, 0.7, 0.74]), ["wood", "ironDark"]), ...each(roundShield([0.22, 0.55, 0.4], 0.2, [0, 15, 0]), ["coat", "ironDark"])];
})();

// ---------- Vorhal, stage 2 ----------
const vorhalDetailed = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, handL: [0.03, 0.8, 0.21], handR: [-0.03, 0.74, 0.21], footL: [0.12, 0, 0.02], footR: [-0.12, 0, -0.02] }, { shoulders: 0.19, bulk: 1.1 });
  const parts = paintBody(body, { hips: "ironDark", chest: "ironDark", sleeve: "ironDark", hand: "bone", thigh: "ironDark", shin: "ironDark", foot: "ironDark", skin: "bone" });
  const crown = body.onHead([
    ...paint([box([0.11, 0.05, 0.1], [0, -0.085, 0.03])], "bone"),
    ...paint([limb([0, 0.05, 0], [0, 0.1, 0], 0.094, 0.1, 8)], "gold"),
    ...paint([0, 72, 144, 216, 288].flatMap((turn) => place([limb([0, 0.09, 0.09], [0, 0.19, 0.1], 0.026, 0, 4)], { turn: [0, turn, 0] })), "gold"),
  ]);
  const armour = [
    ...body.onChest([
      ...paint([ball([0.21, 0.335, 0], [0.11, 0.08, 0.115], 0), ball([-0.21, 0.335, 0], [0.11, 0.08, 0.115], 0), ball([0, 0.22, 0.02], [0.17, 0.14, 0.12], 0)], "coat"),
      ...paint([spine([[-0.08, 0.35, 0.14, 0.035], [-0.13, 0.1, 0.2, 0.04], [-0.19, -0.2, 0.23, 0.035], [-0.24, -0.44, 0.2, 0.015]], { sides: 6 })], "coatDark"),
    ]),
    ...place(paint([spine([[0, 0.12, 0.145, 0.105], [0, -0.16, 0.2, 0.15]], { sides: 6 })], "coat"), { at: pelvis }),
    ...belt(pelvis, "gold", 0.1, [0.15, 0.11]),
  ];
  const greatsword = gear([
    ...paint([plate([[0, 0], [0.05, 0.09], [0.044, 0.66], [-0.044, 0.66], [-0.05, 0.09]], 0.022, "front", 0.21)], "steel"),
    ...paint([box([0.28, 0.034, 0.045], [0, 0.675, 0.21])], "gold"),
    ...paint([limb([0, 0.69, 0.21], [0, 0.86, 0.21], 0.02, 0.02, 5)], "leather"),
    ...paint([ball([0, 0.885, 0.21], 0.034, 0)], "gold"),
  ]);
  return figure([...parts, ...ghostEyes(body), ...crown, ...armour, ...greatsword], 6);
})();

// ---------- Dame Rowena Ashgrove, stage 2 ----------
const SUN_SHIELD: [number, number][] = [[-0.17, 0.2], [0.17, 0.2], [0.17, -0.02], [0, -0.28], [-0.17, -0.02]];
function sunShieldP(at: V3, turn: V3, size = 1): Part[] {
  return gear(place([
    ...paint([plate(SUN_SHIELD, 0.036, "front")], "coat"),
    // At high quality: a gold rim round its edge, and studs at its corners.
    ...fine(paint(SUN_SHIELD.map(([x, y], i) => { const [nx, ny] = SUN_SHIELD[(i + 1) % SUN_SHIELD.length]!; return limb([x, y, 0.02], [nx, ny, 0.02], 0.011, 0.011, 3); }), "gold")),
    ...fine(rivets(SUN_SHIELD.map(([x, y]): V3 => [x * 0.85, y * 0.88 + 0.01, 0.024]), "gold", 0.014)),
    ...paint([ball([0, 0.03, 0.03], [0.075, 0.075, 0.035], 0)], "gold"),
    // Rays of the sun round the boss.
    ...paint([0, 60, 120, 180, 240, 300].flatMap((a) => place([box([0.016, 0.06, 0.012], [0, 0.11, 0.022])], { at: [0, 0.03, 0], turn: [0, 0, a] })), "gold"),
  ], { at, turn, scale: size }));
}
const rowenaDetailed = (() => {
  const pelvis: V3 = [0, 0.49, 0];
  const body = human({ pelvis, lean: 4, twist: -16, look: 12, handR: [-0.34, 1.0, 0], elbowR: [-1, -0.3, -0.5], handL: [0.15, 0.64, 0.26], footL: [0.1, 0, 0.17], footR: [-0.11, 0, -0.13] }, { shoulders: 0.185, bulk: 1.1 });
  const parts = paintBody(body, { hips: "steel", chest: "steel", sleeve: "steel", hand: "steel", thigh: "steel", shin: "steel", foot: "steel" });
  const armour = [
    ...body.onHead([
      ...paint([ball([0, 0.02, -0.01], [0.102, 0.1, 0.106])], "steel"),
      ...paint([plate([[-0.13, 0.03], [-0.1, 0.17], [0.02, 0.2], [0.1, 0.12], [0.05, 0.1]], 0.026)], "coat"),
    ]),
    ...body.onChest([
      ...paint([ball([0.205, 0.335, 0], [0.105, 0.08, 0.11], 0), ball([-0.205, 0.335, 0], [0.105, 0.08, 0.11], 0)], "steel"),
      ...paint([spine([[-0.08, 0.35, 0.13, 0.034], [-0.12, 0.12, 0.18, 0.04], [-0.18, -0.2, 0.21, 0.03]], { sides: 6 })], "coatDark"),
      // A surcoat over the breastplate, with a gold sun.
      ...paint([box([0.17, 0.26, 0.02], [0, 0.2, 0.108])], "coat"),
      ...paint([ball([0, 0.22, 0.12], [0.03, 0.03, 0.01], 0)], "gold"),
    ]),
    ...place(paint([spine([[0, 0.12, 0.14, 0.1], [0, -0.17, 0.2, 0.155]], { sides: 6 })], "coat"), { at: pelvis }),
    ...belt(pelvis, "leather", 0.1, [0.146, 0.106]),
  ];
  const sword = gear(place([
    ...paint([plate([[0.024, 0.06], [0.024, 0.52], [0, 0.62], [-0.024, 0.52], [-0.024, 0.06]], 0.022)], "steel"),
    ...paint([box([0.03, 0.028, 0.18], [0, 0.045, 0])], "gold"),
    ...paint([limb([0, -0.08, 0], [0, 0.04, 0], 0.018, 0.018, 5)], "leather"),
    // At high quality: a dark fuller down the blade and a gold pommel.
    ...fine([...paint([box([0.026, 0.36, 0.008], [0, 0.3, 0])], "ironDark"), ...paint([ball([0, -0.095, 0], 0.026, 0)], "gold")]),
  ], { at: body.handR, turn: [22, 0, 14] }));
  // At high quality: a plume, gold rivets on the pauldrons, gold trim on the surcoat, and guards over knees and elbows.
  const finery = fine([
    ...body.onHead(plume([0, 0.11, -0.04], "white", "coat")),
    ...body.onChest([
      ...rivets(([1, -1] as const).flatMap((sx): V3[] => [[sx * 0.205, 0.39, 0.075], [sx * 0.27, 0.37, 0.06], [sx * 0.14, 0.37, 0.07]])),
      ...trimRect(0.17, 0.26, [0, 0.2, 0.119]),
    ]),
    ...jointGuards(body, "steel", 0.055),
    ...paint([box([0.05, 0.04, 0.02], [pelvis[0], pelvis[1] + 0.1, pelvis[2] + 0.115])], "gold"),
  ]);
  return figure([...parts, ...face(body, "hairLight"), ...armour, ...sword, ...sunShieldP([0.17, 0.62, 0.33], [0, 14, 0]), ...finery], 5);
})();

// ---------- Stormwake Huscarls, stage 2 ----------
const HUSCARL = { shoulders: 0.19, bulk: 1.15 };
const huscarlKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...paint([limb([0, 0.015, 0], [0, 0.18, 0], 0.102, 0.026, 8), box([0.028, 0.1, 0.022], [0, -0.01, 0.094])], "steel"),
    ...paint([limb([0, -0.05, 0.07], [0, -0.17, 0.09], 0.055, 0.012, 5)], "beard"),
  ]),
  ...faceOnly(body),
  ...body.onChest(paint([spine([[0, 0.375, 0.09, 0.085], [-0.01, 0.31, 0.225, 0.135], [-0.02, 0.235, 0.23, 0.14]], { sides: 8 })], "pelt")),
  ...place(paint([spine([[0, 0.12, 0.145, 0.105], [0, -0.15, 0.2, 0.155]], { sides: 8 })], "mail"), { at: pelvis }),
  ...belt(pelvis, "leather", 0.1, [0.15, 0.11]),
  // At high quality: a gold band round the helm, braids in the beard with gold beads, and a belt buckle.
  ...fine([
    ...body.onHead([
      ...hoopRing(0.1, 0.03, "gold", 0.009, 10),
      ...paint(([1, -1] as const).map((sx) => limb([sx * 0.03, -0.13, 0.085], [sx * 0.036, -0.22, 0.08], 0.014, 0.01, 4)), "beard"),
      ...rivets(([1, -1] as const).map((sx): V3 => [sx * 0.036, -0.225, 0.08]), "gold", 0.016),
    ]),
    ...paint([box([0.05, 0.045, 0.02], [pelvis[0], pelvis[1] + 0.1, pelvis[2] + 0.118])], "gold"),
  ]),
];
const huscarlBody = (b: Human) => paintBody(b, { hips: "coat", chest: "mail", sleeve: "coat", hand: "skin", thigh: "hakama", shin: "leather", foot: "boot" });
function axeP(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([limb([0, -0.12, 0], [0, 0.42, 0], 0.019, 0.019, 5)], "wood"),
    ...paint([plate([[0.015, 0.41], [0.15, 0.47], [0.175, 0.36], [0.15, 0.25], [0.015, 0.31]], 0.026)], "steel"),
    // At high quality: leather wraps round the haft.
    ...fine(paint([limb([0, -0.02, 0], [0, 0.02, 0], 0.025, 0.025, 5), limb([0, 0.16, 0], [0, 0.2, 0], 0.025, 0.025, 5)], "leather")),
  ], { at, turn }));
}
const huscarlShield = (at: V3, turn: V3) => [
  ...each(roundShield(at, 0.25, turn), ["coat", "steel"]),
  // At high quality: an iron rim and a ring of studs.
  ...gear(fine(place([
    ...place(hoopRing(0.245, 0, "ironDark", 0.014, 14), { turn: [90, 0, 0] }),
    ...rivets(Array.from({ length: 8 }, (_, i): V3 => [Math.cos((i / 8) * Math.PI * 2) * 0.19, Math.sin((i / 8) * Math.PI * 2) * 0.19, 0.026]), "steel", 0.016),
  ], { at, turn }))),
];
const huscarlStrikingP = (() => {
  const pelvis: V3 = [0, 0.48, 0];
  const body = human({ pelvis, lean: 6, twist: -15, look: 12, handL: [0.14, 0.66, 0.3], handR: [-0.33, 0.98, 0.02], elbowR: [-1, -0.3, -0.5], footL: [0.1, 0, 0.16], footR: [-0.11, 0, -0.12] }, HUSCARL);
  return [...huscarlBody(body), ...huscarlKitP(body, pelvis), ...huscarlShield([0.14, 0.64, 0.37], [0, 10, 0]), ...axeP(body.handR, [20, 0, 15])];
})();
const huscarlRestingP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, handR: [-0.2, 0.78, 0.12], elbowR: [-0.6, -1, 0.3], handL: [0.27, 0.52, 0.04], footL: [0.1, 0, 0.03], footR: [-0.1, 0, -0.02] }, HUSCARL);
  return [...huscarlBody(body), ...huscarlKitP(body, pelvis), ...huscarlShield([0.32, 0.5, 0.04], [0, 90, 0]), ...axeP(body.handR, [-62, 0, 0])];
})();

// ---------- Gatewarden Pikemen, stage 2 ----------
const pikemanKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead(paint([
    ball([0, 0.03, 0], [HEAD * 1.1, HEAD * 0.95, HEAD * 1.12]),
    plate([[0, 0.2], [0.115, 0.08], [0.125, -0.06], [0, -0.18], [-0.125, -0.06], [-0.115, 0.08]], 0.022, "top", 0.03),
    plate([[-0.1, 0.1], [0, 0.18], [0.1, 0.1]], 0.022),
  ], "steel")),
  ...body.onChest(paint([ball([0, 0.215, 0.02], [0.17, 0.145, 0.125], 0)], "steel")),
  ...place(paint([spine([[0, 0.12, 0.118, 0.088], [-0.01, -0.04, 0.155, 0.12], [-0.03, -0.14, 0.17, 0.135]])], "coat"), { at: pelvis }),
  ...belt(pelvis, "leather", 0.06, [0.14, 0.105]),
  // At high quality: brass rivets round the morion's brim, a ridge and rivets on the breastplate, and tassets over the hips.
  ...fine([
    ...body.onHead(rivets([[0.1, 0.04, 0.08], [-0.1, 0.04, 0.08], [0.11, 0.04, -0.05], [-0.11, 0.04, -0.05], [0, 0.04, 0.18], [0, 0.04, -0.16]], "brass", 0.01)),
    ...body.onChest([
      ...paint([limb([0, 0.33, 0.13], [0, 0.11, 0.128], 0.012, 0.012, 4)], "steel"),
      ...rivets([[0.12, 0.3, 0.1], [-0.12, 0.3, 0.1], [0.14, 0.15, 0.09], [-0.14, 0.15, 0.09]], "brass", 0.01),
    ]),
    ...place(paint([box([0.1, 0.11, 0.02], [0.075, -0.07, 0.112]), box([0.1, 0.11, 0.02], [-0.075, -0.07, 0.112])], "steel"), { at: pelvis }),
  ]),
];
const pikemanBody = (b: Human) => paintBody(b, { hips: "white", chest: "coat", sleeve: "coat", hand: "skin", thigh: "white", shin: "black", foot: "black" });
const pikeP = (butt: V3, tip: V3): Part[] => [
  ...each(spear(butt, tip, 0.016), ["wood", "steel"]),
  // At high quality: a red tassel below the head.
  ...gear(fine([
    ...paint([ball(lerp(butt, tip, 0.875), 0.028, 0)], "sash"),
    ...paint([-0.02, 0.02].map((dx) => { const at = lerp(butt, tip, 0.875); return limb(at, [at[0] + dx, at[1] - 0.08, at[2]], 0.008, 0.004, 3); }), "sash"),
  ])),
];
const pikemanGuardingP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, handR: [-0.27, 0.72, 0.1], handL: [0.2, 0.56, 0.06], elbowL: [1, -0.3, -0.6], footL: [0.09, 0, 0.04], footR: [-0.09, 0, -0.02] });
  return [...pikemanBody(body), ...faceOnly(body), ...pikemanKitP(body, pelvis), ...cuffs(body, "facing", 0.05), ...pikeP([-0.27, 0, 0.1], [-0.27, 1.9, 0.1])];
})();
const pikemanBracedP = (() => {
  const pelvis: V3 = [0, 0.36, 0];
  const body = human({ pelvis, lean: 12, twist: -30, look: 26, handL: [-0.058, 0.58, 0.27], handR: [-0.082, 0.366, 0.052], footL: [0.08, 0, 0.3], footR: [-0.1, 0, -0.26] });
  return [...pikemanBody(body), ...faceOnly(body), ...pikemanKitP(body, pelvis), ...cuffs(body, "facing", 0.05), ...pikeP([-0.12, 0.02, -0.3], [0, 1.1, 0.8])];
})();

// ---------- Sister Maren Holloway, stage 2 ----------
const marenDetailed = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, twist: 8, look: -6, handL: [0.27, 1.0, 0.16], elbowL: [1, -0.6, -0.2], handR: [-0.25, 0.54, 0.14], footL: [0.08, 0, 0.06], footR: [-0.09, 0, -0.03] }, { shoulders: 0.16, bulk: 0.92 });
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "coat", hand: "skin", thigh: "coat", shin: "boot", foot: "boot" });
  const veil = body.onHead([
    ...paint([ball([0, 0.012, -0.014], [HEAD * 1.14, HEAD * 1.14, HEAD * 1.16])], "white"),
    ...paint([spine([[-0.06, 0, 0.1, 0.05], [-0.1, -0.16, 0.145, 0.04], [-0.13, -0.32, 0.155, 0.025]], { sides: 6 })], "white"),
  ]);
  const coat = place(paint([spine([[0, 0.12, 0.11, 0.082], [0, -0.1, 0.16, 0.125], [-0.01, -0.38, 0.2, 0.165]])], "coat"), { at: pelvis });
  // A white apron with a red cross, and a satchel.
  const apron = body.onChest([
    ...paint([box([0.15, 0.3, 0.018], [0, 0.17, 0.088])], "white"),
    ...paint([box([0.06, 0.018, 0.008], [0, 0.24, 0.099]), box([0.018, 0.06, 0.008], [0, 0.24, 0.099])], "sash"),
  ]);
  const satchel = body.onChest(paint([box([0.09, 0.14, 0.16], [-0.17, 0.05, -0.02])], "leather"));
  const [x, y, z] = body.handL;
  const lantern = gear([
    ...paint([limb([x, y - 0.02, z], [x, y - 0.08, z], 0.012, 0.012, 4)], "steel"),
    ...paint([limb([x, y - 0.08, z], [x, y - 0.11, z], 0.02, 0.055, 6)], "gold"),
    ...paint([box([0.085, 0.12, 0.085], [x, y - 0.17, z])], "glow"),
  ]);
  const pistol = gear(place([...paint([box([0.04, 0.048, 0.22], [0, 0.03, 0.09])], "steel"), ...paint([box([0.038, 0.09, 0.048], [0, -0.03, -0.01])], "wood")], { at: body.handR, turn: [25, 0, 0] }));
  // At high quality: a brass frame round the lantern's glass, red trim on the apron, the satchel's strap and buckle, and a band on the veil.
  const finery = fine([
    ...paint(([[1, 1], [1, -1], [-1, 1], [-1, -1]] as const).map(([dx, dz]) => limb([x + dx * 0.044, y - 0.11, z + dz * 0.044], [x + dx * 0.044, y - 0.235, z + dz * 0.044], 0.006, 0.006, 3)), "brass"),
    ...body.onChest([
      ...trimRect(0.15, 0.3, [0, 0.17, 0.1], "sash", 0.006),
      ...paint(place([box([0.028, 0.44, 0.012])], { at: [-0.02, 0.19, 0.102], turn: [0, 0, -38] }), "leather"),
      ...paint([box([0.03, 0.03, 0.01], [-0.17, 0.12, 0.065])], "brass"),
    ]),
    ...body.onHead(hoopRing(HEAD * 1.15, 0.03, "lace", 0.008, 10)),
  ]);
  return figure([...parts, ...faceOnly(body), ...veil, ...coat, ...apron, ...satchel, ...lantern, ...pistol, ...finery], 5);
})();

// ---------- Teppo Gunners, stage 2 ----------
function teppoGunnerP(kneeling: boolean): Part[] {
  const pose = aiming(kneeling);
  const body = human(pose);
  const parts = paintBody(body, { hips: "hakama", chest: "kimono", sleeve: "kimono", hand: "skin", thigh: "hakama", shin: "hakama", foot: "tabi" });
  const hat = body.onHead([
    ...paint([limb([0, 0.035, 0], [0, 0.11, 0], 0.2, 0.03, 8)], "lacquer"),
    ...paint([limb([0, 0.033, 0], [0, 0.041, 0], 0.204, 0.198, 8)], "gold"),
  ]);
  const armour = [
    ...body.onChest([
      ...paint([box([0.05, 0.15, 0.14], [0.24, 0.25, 0]), box([0.05, 0.15, 0.14], [-0.24, 0.25, 0])], "coat"),
      ...paint([0.22, 0.29].flatMap((yy) => [box([0.056, 0.012, 0.146], [0.24, yy, 0]), box([0.056, 0.012, 0.146], [-0.24, yy, 0])]), "lace"),
      ...paint([spine([[0, 0.04, 0.132, 0.098], [0, 0.08, 0.128, 0.095]], { sides: 8 })], "obi"),
    ]),
    ...place([
      ...paint([spine([[0, 0.12, 0.135, 0.1], [0, -0.03, 0.19, 0.15], [0, kneeling ? -0.1 : -0.17, 0.22, 0.18]], { sides: 6 })], "coat"),
      ...paint([spine([[0, -0.06, 0.2, 0.158], [0, -0.075, 0.206, 0.163]], { sides: 6 })], "lace"),
    ], { at: pose.pelvis }),
  ];
  const matchlock = gear(place([
    ...paint([box([0.045, 0.07, 0.2], [0, 0, -0.13]), box([0.036, 0.045, 0.4], [0, 0.03, 0.16])], "wood"),
    ...paint([limb([0, 0.055, 0.04], [0, 0.055, 0.52], 0.014, 0.014, 5)], "steel"),
    ...paint([box([0.03, 0.035, 0.06], [-0.03, 0.065, 0.02])], "gold"),
    // The lit match on the lock.
    ...paint([ball([-0.04, 0.09, 0.03], 0.012, 0)], "glow"),
    // At high quality: the slow match coiled round the stock, and a wisp of smoke.
    ...fine([
      ...place(hoopRing(0.034, 0, "straw", 0.006, 8), { turn: [90, 0, 0], at: [0, 0.0, -0.1] }),
      ...place(hoopRing(0.034, 0, "straw", 0.006, 8), { turn: [90, 0, 0], at: [0, 0.0, -0.06] }),
      ...paint([ball([-0.045, 0.125, 0.03], 0.018, 0), ball([-0.05, 0.165, 0.02], 0.024, 0)], "powder"),
    ]),
  ], { at: body.handR, turn: AIM_TURN }));
  // At high quality: gold rivets round the hat, the house's crest on the chest, and a powder flask at the belt.
  const finery = fine([
    ...body.onHead(rivets(Array.from({ length: 10 }, (_, i): V3 => [Math.sin((i / 10) * Math.PI * 2) * 0.186, 0.047, Math.cos((i / 10) * Math.PI * 2) * 0.186]), "gold", 0.009)),
    ...body.onChest(paint([ball([0, 0.22, 0.108], [0.024, 0.024, 0.006], 0)], "gold")),
    ...place([...paint([box([0.05, 0.07, 0.03], [0.15, 0.04, 0.09])], "lacquer"), ...paint([limb([0.15, 0.075, 0.09], [0.15, 0.1, 0.09], 0.012, 0.01, 4)], "gold")], { at: pose.pelvis }),
  ]);
  return [...parts, ...face(body, "hair"), ...hat, ...armour, ...matchlock, ...finery];
}

// ---------- Glade Wardens, stage 2 ----------
const WARDEN = { shoulders: 0.15, bulk: 0.84 };
const wardenBody = (b: Human) => paintBody(b, { hips: "leather", chest: "tunic", sleeve: "tunic", hand: "skin", thigh: "leather", shin: "boot", foot: "boot" });
const wardenEars = (body: Human) => body.onHead(paint(both([limb([0.074, 0, -0.005], [0.155, 0.09, -0.075], 0.03, 0, 4)]), "skin"));
const wardenQuiver = (body: Human) =>
  body.onChest([
    ...paint([limb([-0.08, 0.1, -0.115], [0.07, 0.4, -0.13], 0.042, 0.048, 6), limb([0.07, 0.4, -0.13], [0.1, 0.47, -0.133], 0.036, 0.04, 5)], "leather"),
    ...gear(paint([-0.015, 0.015].map((dx) => limb([0.09 + dx, 0.46, -0.13], [0.1 + dx, 0.52, -0.13], 0.011, 0.006, 3)), "white")),
    // At high quality: more arrows in it, each fletched.
    ...fine([
      ...paint([-0.03, 0, 0.03].map((dx) => limb([0.085 + dx, 0.44, -0.122], [0.095 + dx, 0.55, -0.12], 0.006, 0.006, 3)), "wood"),
      ...paint([-0.03, 0, 0.03].flatMap((dx) => place([plate([[0, 0], [0.012, 0.01], [0.012, 0.04], [0, 0.03]], 0.004, "side")], { at: [0.095 + dx, 0.51, -0.12] })), "white"),
    ]),
  ]);
function wardenCloak(body: Human, sweep: number): Part[] {
  return body.onChest(paint([spine([[-0.07, 0.35, 0.12, 0.034], [-0.105 - sweep * 0.2, 0.18, 0.165, 0.04], [-0.14 - sweep * 0.6, -0.08, 0.2, 0.038], [-0.17 - sweep, -0.3, 0.22, 0.018]], { sides: 6 })], "coat"));
}
const wardenBow = (at: V3, draw: number, turn?: V3) => paint(bow(at, draw, turn), "wood");
const wardenArrow = (from: V3, to: V3) => each(arrow(from, to), ["wood", "steel"]);
/** At high quality: a leaf clasp at the throat, leaves along the cloak's hem, and a bracer on the bow arm. */
const wardenFinery = (body: Human, sweep: number): Part[] => fine([
  ...body.onChest([
    ...leafAt([0.07, 0.355, 0.085], [0.4, 1, 0.3], 0.07),
    ...rivets([[0.07, 0.355, 0.09]], "gold", 0.014),
    ...[-0.18, -0.09, 0, 0.09, 0.18].flatMap((x) => leafAt([x, -0.29, -0.16 - sweep], [x * 0.5, -1, -0.25], 0.07)),
  ]),
  ...bracer(body, true, "leather", "leaf"),
]);
const wardenLoosingP = (() => {
  const body = human(loosing(), WARDEN);
  const hood = body.onChest(paint([ball([0, 0.37, -0.09], [0.09, 0.06, 0.07], 0)], "coat"));
  return [...wardenBody(body), ...face(body, "hairLight"), ...wardenEars(body), ...hood, ...wardenCloak(body, 0.1), ...wardenQuiver(body), ...wardenBow(body.handL, 0.09), ...wardenArrow(...DRAWN), ...wardenFinery(body, 0.1)];
})();
const wardenWatchingP = (() => {
  const body = human({ twist: 10, look: 14, handL: [0.25, 0.5, 0.07], handR: [-0.22, 0.5, 0.09], footL: [0.085, 0, 0.03], footR: [-0.08, 0, -0.03] }, WARDEN);
  const hood = body.onHead(paint([ball([0, 0.008, -0.014], [HEAD * 1.16, HEAD * 1.22, HEAD * 1.2]), limb([0, 0.05, -0.05], [0, 0.03, -0.17], 0.05, 0, 5)], "coat"));
  const mantle = body.onChest(paint([spine([[0, 0.37, 0.08, 0.075], [-0.01, 0.31, 0.185, 0.12], [-0.02, 0.22, 0.2, 0.13]], { sides: 8 })], "coat"));
  return [...wardenBody(body), ...faceOnly(body), ...hood, ...mantle, ...wardenCloak(body, 0), ...wardenQuiver(body), ...wardenBow(body.handL, 0, [0, 12, 0]), ...wardenArrow([-0.22, 0.5, 0.09], [-0.26, 0.2, 0.3]), ...wardenFinery(body, 0)];
})();

// ---------- Harrow Riflemen, stage 2 ----------
function rifleP(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([box([0.045, 0.08, 0.24], [0, -0.005, -0.15]), box([0.032, 0.042, 0.74], [0, 0.035, 0.31])], "wood"),
    ...paint([limb([0, 0.06, 0.02], [0, 0.06, 0.67], 0.011, 0.011, 5), box([0.014, 0.03, 0.03], [0, 0.072, 0.64])], "steel"),
    ...paint([box([0.047, 0.083, 0.02], [0, -0.005, -0.265]), box([0.05, 0.03, 0.06], [0.012, 0.05, 0.02])], "gold"),
    // At high quality: a leather sling under the stock.
    ...fine(paint([limb([0, -0.05, -0.2], [0, 0.01, 0.5], 0.006, 0.006, 3)], "leather")),
  ], { at, turn }));
}
const riflemanBody = (b: Human) => paintBody(b, { hips: "hakama", chest: "coat", sleeve: "coat", hand: "skin", thigh: "hakama", shin: "black", foot: "black" });
const riflemanKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...paint([limb([0, 0.04, 0], [0, 0.18, 0], 0.09, 0.1, 8)], "hat"),
    ...paint([limb([0, 0.165, 0], [0, 0.181, 0], 0.099, 0.101, 8), box([0.055, 0.06, 0.012], [0, 0.11, 0.096])], "gold"),
    ...paint([box([0.14, 0.018, 0.08], [0, 0.05, 0.11])], "black"),
    ...gear(paint([limb([0, 0.18, 0.06], [0, 0.27, 0.06], 0.026, 0.018, 5)], "leaf")),
  ]),
  ...place(paint([spine([[0, 0.12, 0.118, 0.088], [-0.005, -0.02, 0.15, 0.115], [-0.01, -0.1, 0.158, 0.122]])], "coat"), { at: pelvis }),
  ...belt(pelvis, "black", 0.1, [0.125, 0.094]),
  ...body.onChest([
    ...paint([limb([-0.14, 0.31, -0.135], [0.14, 0.31, -0.135], 0.055, 0.055, 6)], "blanket"),
    ...paint([box([0.1, 0.1, 0.07], [-0.17, 0.02, -0.05])], "black"),
    // A black crossbelt, front and back, a facing collar and a row of buttons.
    ...paint([...place([box([0.036, 0.42, 0.016])], { at: [0, 0.19, 0.108], turn: [0, 0, 36] }), ...place([box([0.036, 0.42, 0.016])], { at: [0, 0.19, -0.104], turn: [0, 0, -36] })], "black"),
    ...paint([limb([0, 0.33, 0], [0, 0.37, 0.004], 0.064, 0.058, 8)], "facing"),
    ...paint([0.18, 0.24, 0.3].map((y) => box([0.018, 0.018, 0.012], [0.04, y, 0.102])), "steel"),
  ]),
  // At high quality: cords looping across the shako, and a powder horn at the hip.
  ...fine([
    ...body.onHead(paint([limb([0.095, 0.13, 0.03], [0, 0.085, 0.104], 0.007, 0.007, 3), limb([0, 0.085, 0.104], [-0.095, 0.13, 0.03], 0.007, 0.007, 3)], "lace")),
    ...place([
      ...paint([limb([0.14, 0.08, 0.06], [0.17, -0.04, 0.1], 0.03, 0.012, 6)], "horn"),
      ...paint([ball([0.14, 0.085, 0.06], 0.02, 0)], "brass"),
    ], { at: pelvis }),
  ]),
];
const riflemanAimingP = (() => {
  const pose = aiming(false);
  const body = human(pose);
  return [...riflemanBody(body), ...face(body, "hair"), ...riflemanKitP(body, pose.pelvis), ...cuffs(body, "facing", 0.05), ...rifleP(body.handR, AIM_TURN)];
})();
const riflemanReadyP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, twist: 12, look: -8, handR: [-0.13, 0.6, 0.17], handL: [0.13, 0.86, 0.19], footL: [0.09, 0, 0.05], footR: [-0.09, 0, -0.03] });
  return [...riflemanBody(body), ...face(body, "hair"), ...riflemanKitP(body, pelvis), ...cuffs(body, "facing", 0.05), ...rifleP(body.handR, pointing(body.handR, body.handL))];
})();

// ---------- Sergeant Brannock, stage 2 ----------
const brannockDetailed = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human({
    pelvis, lean: 6, twist: -35, look: 30,
    handR: [-0.3, 0.95, -0.28], elbowR: [-1, 0, -0.5], handL: [0.2, 0.82, 0.36],
    footL: [0.1, 0, 0.24], footR: [-0.12, 0, -0.2],
  }, { shoulders: 0.2, bulk: 1.25 });
  const parts = paintBody(body, { hips: "hakama", chest: "coat", sleeve: "coat", hand: "skin", thigh: "hakama", shin: "boot", foot: "boot" });
  const cap = body.onHead([
    ...paint([limb([0, 0.05, 0], [0, 0.105, 0], 0.094, 0.086, 8)], "coat"),
    ...paint([limb([0, 0.05, 0], [0, 0.066, 0], 0.096, 0.095, 8)], "facing"),
    ...paint([box([0.13, 0.02, 0.08], [0, 0.055, 0.1])], "black"),
    ...paint([limb([0, -0.05, 0.065], [0, -0.17, 0.085], 0.06, 0.02, 5), box([0.07, 0.02, 0.02], [0, -0.03, 0.09])], "beard"),
  ]);
  const apron = place(paint([spine([[0, 0.13, 0.145, 0.105], [0.01, -0.06, 0.18, 0.14], [0.02, -0.24, 0.19, 0.15]], { sides: 6 })], "leather"), { at: pelvis });
  // Tool pouches on a belt, a hammer's handle and a wrench sticking out of them.
  const tools = [
    ...belt(pelvis, "black", 0.11, [0.15, 0.11]),
    ...body.onChest([
      ...paint([box([0.1, 0.12, 0.09], [0.19, 0.03, 0.02]), box([0.1, 0.12, 0.09], [-0.19, 0.03, -0.02])], "leather"),
      ...paint([box([0.104, 0.03, 0.094], [0.19, 0.08, 0.02]), box([0.104, 0.03, 0.094], [-0.19, 0.08, -0.02])], "boot"),
      ...gear([...paint([limb([0.18, 0.09, 0.03], [0.17, 0.17, 0.04], 0.012, 0.012, 4)], "wood"), ...paint([limb([-0.2, 0.09, -0.02], [-0.21, 0.16, -0.02], 0.01, 0.014, 4)], "steel")]),
    ]),
  ];
  const [x, y, z] = body.handR;
  const charge = gear([
    ...paint([box([0.17, 0.13, 0.1], [x, y - 0.03, z - 0.02])], "blanket"),
    ...paint([box([0.175, 0.02, 0.105], [x, y - 0.03, z - 0.02])], "leather"),
    ...paint([limb([x + 0.05, y + 0.03, z - 0.02], [x + 0.09, y + 0.16, z - 0.05], 0.012, 0.008, 4)], "black"),
    ...paint([ball([x + 0.09, y + 0.165, z - 0.05], 0.022, 0)], "glow"),
  ]);
  const spade = gear(body.onChest([
    ...paint([limb([-0.14, 0.02, -0.13], [0.12, 0.42, -0.14], 0.016, 0.016, 5)], "wood"),
    ...paint([plate([[-0.06, 0], [0.06, 0], [0.07, 0.13], [0, 0.17], [-0.07, 0.13]], 0.016, "front", -0.14)], "steel"),
  ]));
  // At high quality: brass goggles pushed up on his cap, rivets along the apron, and sparks from the fuse.
  const finery = fine([
    ...body.onHead([
      ...paint(([1, -1] as const).map((sx) => limb([sx * 0.04, 0.085, 0.088], [sx * 0.04, 0.085, 0.108], 0.028, 0.026, 8)), "brass"),
      ...paint(([1, -1] as const).map((sx) => limb([sx * 0.04, 0.085, 0.104], [sx * 0.04, 0.085, 0.11], 0.02, 0.02, 8)), "steel"),
      ...paint([limb([0.07, 0.085, 0.08], [0.095, 0.075, 0], 0.008, 0.008, 3), limb([-0.07, 0.085, 0.08], [-0.095, 0.075, 0], 0.008, 0.008, 3)], "leather"),
    ]),
    ...place(rivets([-0.1, -0.05, 0, 0.05, 0.1].map((x): V3 => [x, 0.12, 0.112]), "brass", 0.01), { at: pelvis }),
    ...paint(([[x + 0.11, y + 0.19, z - 0.05], [x + 0.07, y + 0.2, z - 0.07], [x + 0.1, y + 0.21, z - 0.03]] as V3[]).map((p) => ball(p, 0.01, 0)), "glow"),
  ]);
  return figure([...parts, ...faceOnly(body), ...cap, ...apron, ...tools, ...cuffs(body, "facing", 0.072), ...charge, ...spade, ...finery], 5);
})();

// ---------- Shirokage Ronin, stage 2 ----------
function roninP(coiled: boolean): Part[] {
  const pelvis: V3 = [0, coiled ? 0.4 : 0.5, 0];
  const body = human({
    pelvis, lean: coiled ? 20 : 2, twist: coiled ? 20 : -8, look: coiled ? -16 : 10,
    handR: coiled ? [0.12, 0.52, 0.14] : [-0.25, 0.5, 0.06], handL: coiled ? [0.18, 0.47, 0.02] : [0.21, 0.56, 0.08],
    footL: coiled ? [0.1, 0, -0.22] : [0.09, 0, 0.05], footR: coiled ? [-0.1, 0, 0.24] : [-0.1, 0, -0.03],
  });
  const parts = paintBody(body, { hips: "hakama", chest: "coat", sleeve: "coat", hand: "skin", thigh: "hakama", shin: "hakama", foot: "tabi" });
  const hair = body.onHead([
    ...paint([ball([0, 0.012, -0.018], [HEAD * 0.96, HEAD * 0.92, HEAD * 0.95], 0), limb([0, 0.075, -0.03], [0, 0.16, -0.08], 0.032, 0.022, 5)], "hair"),
    ...paint([limb([0, 0.085, -0.035], [0, 0.1, -0.045], 0.036, 0.036, 5)], "white"),
  ]);
  const trousers = place(paint([spine([[0, 0.1, 0.13, 0.09], [0, -0.12, 0.2, 0.15], [0, coiled ? -0.28 : -0.4, 0.24, 0.18]], { sides: 8 })], "hakama"), { at: pelvis });
  // A white under-collar, a sash at the waist and a worn cord across the back.
  const dress = [
    ...body.onChest(paint([limb([0, 0.33, 0], [0, 0.37, 0.004], 0.064, 0.058, 8)], "white")),
    ...belt(pelvis, "obi", 0.1, [0.136, 0.096]),
  ];
  const a: V3 = [0.14, 0.5, 0.24], b: V3 = [0.21, 0.41, -0.46];
  const sword = coiled
    ? gear([
      ...paint([limb(a, lerp(a, b, 0.24), 0.02, 0.02, 5)], "black"),
      ...paint([limb(lerp(a, b, 0.24), lerp(a, b, 0.27), 0.04, 0.04, 8)], "gold"),
      ...paint([limb(lerp(a, b, 0.27), b, 0.024, 0.018, 5)], "sash"),
    ])
    : katanaP(body.handR, [112, 0, 0]);
  // At high quality: a straw hat slung on his back, and a gourd at his hip.
  const finery = fine([
    ...body.onChest([
      ...paint([limb([0, 0.25, -0.12], [0, 0.26, -0.2], 0.19, 0.02, 10)], "straw"),
      ...paint([limb([0.07, 0.36, 0.06], [0.08, 0.27, -0.12], 0.005, 0.005, 3), limb([-0.07, 0.36, 0.06], [-0.08, 0.27, -0.12], 0.005, 0.005, 3)], "leather"),
    ]),
    ...place([...paint([ball([-0.16, 0.0, 0.07], 0.042, 0), ball([-0.16, 0.06, 0.07], 0.03, 0)], "straw"), ...paint([limb([-0.16, 0.075, 0.07], [-0.14, 0.1, 0.06], 0.006, 0.006, 3)], "sash")], { at: pelvis }),
  ]);
  return [...parts, ...faceOnly(body), ...hair, ...trousers, ...dress, ...sword, ...finery];
}

// ---------- Kenzo the Lantern Monk, stage 2 ----------
const kenzoDetailed = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, lean: 3, handR: [-0.276, 0.75, 0.168], handL: [0.05, 0.72, 0.2], elbowL: [0.6, -1, 0], footL: [0.08, 0, 0.05], footR: [-0.09, 0, -0.02] });
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "coat", hand: "skin", thigh: "coat", shin: "coat", foot: "tabi" });
  const hat = body.onHead([
    ...paint([limb([0, 0.03, 0], [0, 0.15, 0], 0.25, 0.02, 10)], "straw"),
    ...paint([limb([0, 0.03, 0], [0, 0.045, 0], 0.252, 0.238, 10)], "leather"),
  ]);
  const robe = [
    ...place(paint([spine([[0, 0.12, 0.125, 0.092], [0, -0.1, 0.175, 0.135], [0, -0.44, 0.23, 0.185]])], "coat"), { at: pelvis }),
    ...belt(pelvis, "obi", 0.1, [0.13, 0.096]),
    ...body.onChest(paint([spine([[0.02, 0.37, 0.085, 0.075], [0.03, 0.27, 0.16, 0.115]], { sides: 6 })], "coatDark")),
    ...paint([
      ball([body.handL[0] + 0.04, body.handL[1] - 0.07, body.handL[2] - 0.06], [0.07, 0.1, 0.09], 0),
      ball([body.handR[0] + 0.02, body.handR[1] - 0.08, body.handR[2] - 0.07], [0.07, 0.1, 0.09], 0),
    ], "coat"),
    // Prayer beads hanging on his chest.
    ...body.onChest(paint(Array.from({ length: 9 }, (_, i) => {
      const t = (i / 8 - 0.5) * 2.4;
      const y = 0.35 - Math.cos(t) * 0.09;
      return ball([Math.sin(t) * 0.075, y, 0.105 + (0.37 - y) * 0.45], 0.016, 0);
    }), "wood")),
  ];
  const staff = gear([
    ...paint([limb([-0.3, 0, 0.12], [-0.26, 1.25, 0.2], 0.018, 0.016, 5), limb([-0.26, 1.25, 0.2], [-0.25, 1.24, 0.37], 0.014, 0.012, 4)], "wood"),
    ...paint([limb([-0.25, 1.24, 0.37], [-0.25, 1.14, 0.37], 0.007, 0.007, 3)], "black"),
    ...paint([ball([-0.25, 1.05, 0.37], [0.075, 0.1, 0.075], 0)], "glow"),
    ...paint([limb([-0.25, 1.158, 0.37], [-0.25, 1.138, 0.37], 0.042, 0.048, 6), limb([-0.25, 0.962, 0.37], [-0.25, 0.942, 0.37], 0.048, 0.042, 6)], "lacquer"),
  ]);
  // At high quality: the hat's weave, a lacquered frame round the lantern with a tassel below, and a tassel on the beads.
  const finery = fine([
    ...body.onHead([...hoopRing(0.19, 0.062, "leather", 0.005, 12), ...hoopRing(0.12, 0.098, "leather", 0.005, 10)]),
    ...paint([0, 90, 180, 270].map((a) => { const r = (a * Math.PI) / 180; return limb([-0.25 + Math.cos(r) * 0.07, 0.96, 0.37 + Math.sin(r) * 0.07], [-0.25 + Math.cos(r) * 0.07, 1.14, 0.37 + Math.sin(r) * 0.07], 0.006, 0.006, 3); }), "lacquer"),
    ...paint([limb([-0.25, 0.94, 0.37], [-0.25, 0.86, 0.37], 0.01, 0.006, 3), ball([-0.25, 0.85, 0.37], 0.016, 0)], "sash"),
    ...body.onChest(paint([limb([0, 0.26, 0.15], [0, 0.18, 0.16], 0.01, 0.005, 3)], "sash")),
  ]);
  return figure([...parts, ...faceOnly(body), ...hat, ...robe, ...staff, ...finery], 5);
})();

// ---------- Mossback Treefolk, stage 2 ----------
function treefolkP(reach: number): Part[] {
  const r = reach;
  return [
    ...paint([spine([[0, 0.3, 0.31, 0.29], [0.02, 0.85, 0.26, 0.24], [0, 1.4, 0.31, 0.28], [0, 1.72, 0.22, 0.2]], { sides: 7 })], "bark"),
    ...paint(both([limb([0.15, 0.45, 0], [0.3, 0, 0.06], 0.18, 0.2, 6), limb([0.3, 0.07, 0.06], [0.44, 0, 0.32], 0.1, 0.03, 5), limb([0.3, 0.07, 0.06], [0.5, 0, -0.14], 0.09, 0.03, 5)]), "bark"),
    ...paint([
      limb([0.27, 1.36, 0], [0.56, 1.06, 0.16], 0.115, 0.085, 5),
      limb([0.56, 1.06, 0.16], [0.64, 0.7, 0.3], 0.085, 0.055, 5),
      limb([0.64, 0.7, 0.3], [0.6, 0.5, 0.42], 0.05, 0, 4),
      limb([0.64, 0.7, 0.3], [0.74, 0.54, 0.3], 0.05, 0, 4),
      limb([-0.27, 1.4, 0], [-0.6, 1.4 + r * 0.2, 0.12], 0.115, 0.085, 5),
      limb([-0.6, 1.4 + r * 0.2, 0.12], [-0.72, 1.2 + r * 0.72, 0.24], 0.085, 0.055, 5),
      limb([-0.72, 1.2 + r * 0.72, 0.24], [-0.7, 1.05 + r * 0.98, 0.36], 0.05, 0, 4),
      limb([-0.72, 1.2 + r * 0.72, 0.24], [-0.84, 1.1 + r * 0.86, 0.22], 0.05, 0, 4),
      box([0.4, 0.07, 0.1], [0, 1.42, 0.25]),
      limb([0, 1.34, 0.26], [0, 1.2, 0.36], 0.06, 0.03, 5),
    ], "bark"),
    // Deep-set glowing eyes under the brow, and a gash of a mouth.
    ...paint([box([0.08, 0.035, 0.03], [0.1, 1.35, 0.276]), box([0.08, 0.035, 0.03], [-0.1, 1.35, 0.276])], "glowGreen"),
    ...paint([box([0.16, 0.025, 0.03], [0, 1.12, 0.256])], "black"),
    // The crown of leaves, moss on the shoulders and roots, and a tuft at each bough's elbow.
    ...paint([ball([0, 2.04, 0], [0.56, 0.38, 0.52], 1)], "coat"),
    ...paint([ball([0.4, 1.86, 0.12], 0.26, 0), ball([-0.38, 1.9, -0.14], 0.28, 0), ball([0.05, 1.88, -0.36], 0.25, 0)], "leaf"),
    ...paint([
      ball([0.17, 1.6, 0.13], [0.13, 0.05, 0.11], 0), ball([-0.16, 1.62, 0.1], [0.12, 0.05, 0.12], 0),
      ball([0.2, 0.5, 0.2], [0.12, 0.06, 0.1], 0), ball([-0.18, 0.95, 0.18], [0.1, 0.12, 0.08], 0),
    ], "moss"),
    ...paint([ball([0.64, 0.7, 0.3], 0.08, 0), ball([-0.72, 1.2 + r * 0.72, 0.24], 0.08, 0)], "leaf"),
    // At high quality: deep cracks in the bark, vines hanging from the boughs, a cluster of mushrooms,
    // and flowers in the crown.
    ...fine([
      ...paint([-0.9, -0.3, 0.4, 1.0].flatMap((a) => {
        const at = (y: number, rx: number, rn: number): V3 => [Math.sin(a) * rx * 1.01, y, Math.cos(a) * rn * 1.01];
        return [limb(at(0.36, 0.3, 0.28), at(0.85, 0.26, 0.24), 0.018, 0.018, 3), limb(at(0.85, 0.26, 0.24), at(1.3, 0.3, 0.27), 0.018, 0.012, 3)];
      }), "hair"),
      ...paint([limb([0.45, 1.16, 0.1], [0.47, 0.86, 0.15], 0.012, 0.008, 3), limb([-0.48, 1.42, 0.1], [-0.5, 1.1, 0.13], 0.012, 0.008, 3), limb([0.1, 1.72, 0.2], [0.12, 1.45, 0.3], 0.012, 0.008, 3)], "leaf"),
      ...leafAt([0.47, 0.98, 0.15], [1, -0.3, 0.3], 0.07), ...leafAt([-0.5, 1.22, 0.13], [-1, -0.3, 0.3], 0.07),
      ...paint([ball([0.29, 0.72, 0.1], [0.06, 0.025, 0.06], 0), ball([0.27, 0.62, 0.16], [0.045, 0.02, 0.045], 0)], "shell"),
      ...paint([limb([0.24, 0.7, 0.1], [0.29, 0.71, 0.1], 0.015, 0.015, 3), limb([0.23, 0.6, 0.15], [0.27, 0.61, 0.16], 0.012, 0.012, 3)], "white"),
      ...paint(([[0.3, 2.3, 0.3], [-0.35, 2.25, 0.25], [0.1, 2.38, -0.3], [-0.2, 2.3, -0.35], [0.45, 2.1, -0.15], [0, 2.4, 0.1]] as V3[]).map((p) => ball(p, 0.04, 0)), "flower"),
    ]),
  ];
}

// ---------- Sylvanne, stage 2 ----------
const sylvanneDetailed = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, twist: 6, handR: [-0.27, 0.78, 0.14], handL: [0.26, 0.84, 0.2], elbowL: [1, -0.8, -0.2], footL: [0.07, 0, 0.04], footR: [-0.08, 0, -0.02] }, WARDEN);
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "coat", hand: "skin", thigh: "coat", shin: "boot", foot: "boot" });
  const antlers = gear(body.onHead(paint(both([
    limb([0.05, 0.07, 0], [0.15, 0.2, -0.03], 0.024, 0.018, 4),
    limb([0.15, 0.2, -0.03], [0.22, 0.34, 0], 0.018, 0, 4),
    limb([0.15, 0.2, -0.03], [0.1, 0.33, 0.05], 0.016, 0, 4),
    limb([0.1, 0.135, -0.015], [0.2, 0.15, 0.07], 0.014, 0, 4),
  ]), "horn")));
  // A circlet of leaves at her brow.
  const circlet = body.onHead(paint([limb([0, 0.035, -0.01], [0, 0.055, -0.01], 0.094, 0.092, 8)], "leaf"));
  const robe = [
    ...place([
      ...paint([spine([[0, 0.12, 0.11, 0.082], [0, -0.1, 0.165, 0.13], [-0.02, -0.44, 0.24, 0.19]])], "coat"),
      ...paint([spine([[-0.02, -0.405, 0.234, 0.186], [-0.02, -0.44, 0.244, 0.194]])], "gold"),
    ], { at: pelvis }),
    ...belt(pelvis, "leaf", 0.1, [0.118, 0.088]),
    ...body.onChest(paint([spine([[0, 0.37, 0.08, 0.075], [-0.01, 0.31, 0.19, 0.125], [-0.02, 0.2, 0.21, 0.14]], { sides: 7 })], "leaf")),
  ];
  const staff = gear([
    ...paint([limb([-0.3, 0, 0.1], [-0.27, 0.8, 0.14], 0.022, 0.02, 5), limb([-0.27, 0.8, 0.14], [-0.2, 1.24, 0.18], 0.02, 0.016, 5), limb([-0.2, 1.24, 0.18], [-0.08, 1.32, 0.2], 0.016, 0.01, 4)], "wood"),
    ...paint([ball([-0.24, 1.28, 0.16], 0.075, 0), ball([-0.12, 1.36, 0.22], 0.055, 0)], "leaf"),
    ...paint([ball([-0.17, 1.31, 0.23], 0.026, 0)], "glowGreen"),
  ]);
  const mote = gear(paint([ball([body.handL[0], body.handL[1] + 0.13, body.handL[2]], 0.055, 0)], "glowGreen"));
  // At high quality: flowers in her circlet, leaves winding up the staff and round the robe's hem, and
  // more motes of light drifting round her.
  const finery = fine([
    ...body.onHead(paint([-50, -15, 20, 55].map((a): Part => ball([Math.sin((a * Math.PI) / 180) * 0.096, 0.05, Math.cos((a * Math.PI) / 180) * 0.096], 0.016, 0)), "flower")),
    ...[0.15, 0.3, 0.45, 0.6, 0.75].flatMap((t, i) => {
      const at = lerp([-0.3, 0, 0.1], [-0.27, 0.8, 0.14], t);
      const a = i * 2.1;
      return leafAt([at[0] + Math.cos(a) * 0.024, at[1], at[2] + Math.sin(a) * 0.024], [Math.cos(a), 0.4, Math.sin(a)], 0.06);
    }),
    ...place([0, 45, 90, 135, 180, 225, 270, 315].flatMap((a) => {
      const r = (a * Math.PI) / 180;
      return leafAt([Math.sin(r) * 0.23, -0.43, Math.cos(r) * 0.185], [Math.sin(r), -1.2, Math.cos(r)], 0.07);
    }), { at: pelvis }),
    ...paint([ball([0.2, 1.05, -0.15], 0.02, 0), ball([-0.12, 1.12, 0.3], 0.016, 0), ball([0.32, 0.7, 0.05], 0.018, 0)], "glowGreen"),
  ]);
  return figure([...parts, ...face(body, "hairLight"), ...wardenEars(body), ...circlet, ...antlers, ...robe, ...staff, ...mote, ...finery], 5);
})();

// ---------- Sentinel K-7, stage 2 ----------
const sentinelDetailed = (() => {
  const pelvis: V3 = [0, 0.48, 0];
  const body = human({ pelvis, twist: -10, handL: [0.3, 0.7, 0.3], handR: [-0.32, 0.7, 0.1], elbowR: [-1, -0.6, -0.6], footL: [0.17, 0, 0.1], footR: [-0.17, 0, -0.06] }, { shoulders: 0.27, bulk: 1.45 });
  const parts = paintBody(body, { hips: "machine", chest: "machine", sleeve: "machine", hand: "machine", thigh: "machine", shin: "coat", foot: "machine", skin: "machine" });
  const plating = [
    ...body.onChest([
      ...paint([box([0.5, 0.3, 0.3], [0, 0.22, 0.01]), box([0.17, 0.12, 0.19], [0.3, 0.33, 0]), box([0.17, 0.12, 0.19], [-0.3, 0.33, 0])], "coat"),
      ...paint([box([0.3, 0.24, 0.12], [0, 0.24, -0.2])], "machine"),
      ...paint([limb([0.11, 0.36, -0.22], [0.13, 0.62, -0.24], 0.018, 0.012, 4)], "steel"),
      // A glowing core in the chest, vents on the power unit and warning stripes on the shoulders.
      ...paint([box([0.11, 0.09, 0.02], [0, 0.24, 0.162])], "glowCyan"),
      ...paint([-0.07, 0.07].map((x) => box([0.08, 0.035, 0.012], [x, 0.22, -0.262])), "glowCyan"),
      ...paint([0.3, -0.3].map((x) => box([0.176, 0.03, 0.196], [x, 0.31, 0])), "gold"),
      ...paint([box([0.3, 0.03, 0.306], [0, 0.1, 0.01])], "machine"),
    ]),
    ...body.onHead([...paint([box([0.2, 0.15, 0.21], [0, 0.005, 0])], "coat"), ...paint([box([0.17, 0.04, 0.05], [0, 0.01, 0.1])], "glowCyan")]),
    ...place(paint([box([0.34, 0.16, 0.24], [0, 0, 0])], "machine"), { at: pelvis }),
    ...paint([box([0.17, 0.09, 0.3], [0.17, 0.045, 0.13]), box([0.17, 0.09, 0.3], [-0.17, 0.045, -0.03])], "coat"),
    ...paint([box([0.176, 0.025, 0.04], [0.17, 0.06, 0.27]), box([0.176, 0.025, 0.04], [-0.17, 0.06, 0.11])], "steel"),
  ];
  const cannon = place([
    ...paint([limb([0, 0, -0.12], [0, 0, 0.24], 0.1, 0.085, 8)], "machine"),
    ...paint([limb([0, 0, 0.24], [0, 0, 0.31], 0.1, 0.1, 8)], "steel"),
    ...paint([0.04, 0.14].map((zz) => limb([0, 0, zz], [0, 0, zz + 0.03], 0.098, 0.096, 8)), "glowCyan"),
  ], { at: body.handR });
  const deflector = gear(place(paint([limb([0, 0, -0.012], [0, 0, 0.012], 0.25, 0.25, 6)], "glowCyan"), { at: [body.handL[0] + 0.1, body.handL[1] + 0.02, body.handL[2] + 0.08], turn: [0, 24, 0] }));
  return figure([...parts, ...plating, ...cannon, ...deflector], 7);
})();

// ---------- Nexus Breachers, stage 2 ----------
const BREACHER = { shoulders: 0.19, bulk: 1.15 };
const gauntletP = (at: V3): Part[] => [
  ...paint([box([0.12, 0.12, 0.15], at)], "coat"),
  ...paint([box([0.14, 0.05, 0.05], [at[0], at[1] + 0.02, at[2] + 0.08])], "steel"),
  ...paint([box([0.05, 0.012, 0.1], [at[0], at[1] + 0.054, at[2] - 0.01])], "glowCyan"),
];
const breacherClosingP = (() => {
  const body = human({ pelvis: [0, 0.47, 0], lean: 12, twist: -18, look: 14, handL: [0.12, 0.84, 0.32], handR: [-0.15, 0.78, 0.22], elbowL: [1, -1, 0], elbowR: [-1, -1, 0], footL: [0.1, 0, 0.2], footR: [-0.11, 0, -0.16] }, BREACHER);
  return [...reclaimerBody(body), ...reclaimerKitP(body), ...gauntletP(body.handL), ...gauntletP(body.handR)];
})();
const breacherChargedP = (() => {
  const body = human({ handR: [-0.32, 1.0, 0.08], elbowR: [-1, -0.4, -0.3], handL: [0.24, 0.56, 0.1], footL: [0.11, 0, 0.04], footR: [-0.11, 0, -0.03] }, BREACHER);
  const sparks = gear(place(paint(([[0, 0.24, 0], [0.17, 0.15, 0], [-0.17, 0.15, 0], [0, 0.13, 0.17]] as V3[]).map((d) => limb([d[0] * 0.4, d[1] * 0.4, d[2] * 0.4], d, 0.02, 0, 4)), "glowCyan"), { at: body.handR }));
  return [...reclaimerBody(body), ...reclaimerKitP(body), ...gauntletP(body.handL), ...gauntletP(body.handR), ...sparks];
})();

// ---------- Bonebow Archers, stage 2 ----------
const bonebowKitP = (body: Human): Part[] => [
  ...body.onHead([
    ...paint([box([0.1, 0.05, 0.09], [0, -0.085, 0.03])], "bone"),
    ...paint([ball([0, 0.008, -0.014], [HEAD * 1.16, HEAD * 1.2, HEAD * 1.2]), limb([0, 0.05, -0.05], [0, 0.0, -0.19], 0.055, 0, 5)], "coatDark"),
    // The dark of the hood's opening, and the eyes burning in it.
    ...paint([box([0.12, 0.1, 0.008], [0, 0.0, 0.094])], "black"),
    ...paint([box([0.024, 0.016, 0.01], [0.03, 0.012, 0.097]), box([0.024, 0.016, 0.01], [-0.03, 0.012, 0.097])], "glowGreen"),
  ]),
  ...body.onChest([
    ...paint([ball([0, 0.23, 0.005], [0.125, 0.105, 0.085], 0)], "bone"),
    ...paint([0.19, 0.23, 0.27].map((y) => box([0.16, 0.01, 0.012], [0, y, 0.088])), "black"),
    ...paint([spine([[-0.05, 0.36, 0.12, 0.05], [-0.09, 0.2, 0.16, 0.035], [-0.12, 0.06, 0.17, 0.02]], { sides: 6 })], "coatDark"),
    ...paint([limb([-0.07, 0.1, -0.1], [0.06, 0.4, -0.115], 0.036, 0.04, 6)], "leather"),
    ...gear(paint([-0.015, 0.015].map((dx) => limb([0.065 + dx, 0.39, -0.115], [0.075 + dx, 0.45, -0.115], 0.011, 0.006, 3)), "coatDark")),
  ]),
];
const bonebowArrow = (from: V3, to: V3) => each(arrow(from, to), ["wood", "glowGreen"]);
const bonebowLoosingP = (() => {
  const body = human(loosing(), SKELETON);
  return [...skeletonBody(body), ...bonebowKitP(body), ...paint(bow(body.handL, 0.09), "horn"), ...bonebowArrow(...DRAWN)];
})();
const bonebowNockingP = (() => {
  const body = human({ lean: 6, twist: -20, look: 16, handL: [0.2, 0.58, 0.2], handR: [0.02, 0.62, 0.16], footL: [0.09, 0, 0.08], footR: [-0.09, 0, -0.05] }, SKELETON);
  return [...skeletonBody(body), ...bonebowKitP(body), ...paint(bow(body.handL, 0, [0, 0, 35]), "horn"), ...bonebowArrow(body.handR, [body.handL[0] + 0.03, body.handL[1] + 0.02, body.handL[2] + 0.02])];
})();

// ---------- Covenant Crossbowmen, stage 2 ----------
const crossbowmanBody = (b: Human) => paintBody(b, { hips: "coatDark", chest: "mail", sleeve: "mail", hand: "leather", thigh: "coatDark", shin: "boot", foot: "boot" });
const crossbowmanKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead(paint([ball([0, 0.03, 0], [0.097, 0.081, 0.099], 0), limb([0, 0.02, 0], [0, 0.04, 0], 0.18, 0.165, 10)], "steel")),
  ...faceOnly(body),
  ...place(paint([spine([[0, 0.13, 0.125, 0.095], [0, -0.2, 0.175, 0.135]], { sides: 6 })], "coat"), { at: pelvis }),
  ...belt(pelvis, "leather", 0.1, [0.135, 0.103]),
  ...body.onChest([
    // The tabard's front over the mail, with a gold sun on it.
    ...paint([box([0.17, 0.26, 0.012], [0, 0.2, 0.098]), box([0.17, 0.26, 0.012], [0, 0.2, -0.096])], "coat"),
    ...paint([ball([0, 0.24, 0.105], [0.035, 0.035, 0.008], 0)], "gold"),
    ...paint([box([0.07, 0.2, 0.07], [0.15, 0, -0.1])], "leather"),
    ...gear(paint([-0.015, 0.015].map((dx) => limb([0.15 + dx, 0.1, -0.1], [0.15 + dx, 0.15, -0.1], 0.01, 0.006, 3)), "white")),
  ]),
  // At high quality: rivets round the kettle hat's brim, gold trim on the tabard, and a dagger at the belt.
  ...fine([
    ...body.onHead(rivets(Array.from({ length: 8 }, (_, i): V3 => [Math.cos((i / 8) * Math.PI * 2) * 0.165, 0.045, Math.sin((i / 8) * Math.PI * 2) * 0.165]), "steel", 0.011)),
    ...body.onChest([...trimRect(0.17, 0.26, [0, 0.2, 0.105]), ...trimRect(0.17, 0.26, [0, 0.2, -0.103])]),
    ...place([
      ...paint([limb([0, 0, 0], [0, -0.15, 0.02], 0.014, 0, 4)], "steel"),
      ...paint([limb([0, 0, 0], [0, 0.06, 0], 0.012, 0.012, 4)], "leather"),
      ...paint([box([0.06, 0.012, 0.016], [0, 0, 0])], "gold"),
    ], { at: [pelvis[0] + 0.145, pelvis[1] + 0.06, pelvis[2] + 0.05] }),
  ]),
];
function crossbowP(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([box([0.042, 0.05, 0.44], [0, 0.02, 0.09])], "wood"),
    ...paint([plate([[-0.22, 0.2], [-0.11, 0.275], [0, 0.3], [0.11, 0.275], [0.22, 0.2], [0.11, 0.245], [0, 0.265], [-0.11, 0.245]], 0.026, "top", 0.03)], "steel"),
    ...paint([limb([-0.215, 0.045, 0.205], [0, 0.05, 0.06], 0.004, 0.004, 3), limb([0.215, 0.045, 0.205], [0, 0.05, 0.06], 0.004, 0.004, 3)], "black"),
    ...paint([box([0.012, 0.05, 0.05], [0, -0.025, 0.0])], "steel"),
    // At high quality: a stirrup at the front, and brass rivets down the stock.
    ...fine([
      ...paint([limb([-0.03, 0.02, 0.31], [-0.035, 0.02, 0.37], 0.007, 0.007, 3), limb([0.03, 0.02, 0.31], [0.035, 0.02, 0.37], 0.007, 0.007, 3), limb([-0.035, 0.02, 0.37], [0.035, 0.02, 0.37], 0.007, 0.007, 3)], "steel"),
      ...rivets([0, 0.1, 0.2].flatMap((z): V3[] => [[0.022, 0.03, z], [-0.022, 0.03, z]]), "brass", 0.008),
    ]),
  ], { at, turn }));
}
const crossbowmanAimingP = (() => {
  const pose = aiming(false);
  const body = human(pose);
  return [...crossbowmanBody(body), ...crossbowmanKitP(body, pose.pelvis), ...crossbowP(body.handR, AIM_TURN)];
})();
const crossbowmanMarchingP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, lean: 3, handR: [-0.2, 0.72, 0.14], elbowR: [-0.6, -1, 0.3], handL: [0.22, 0.5, -0.08], footL: [0.09, 0, 0.18], footR: [-0.09, 0, -0.14] });
  return [...crossbowmanBody(body), ...crossbowmanKitP(body, pelvis), ...crossbowP(body.handR, [-125, 0, 0])];
})();

const MOUNT = 0.84;
// ---------- Brass Hussars, stage 2 ----------
/**
 * A painted horse: `horse()`'s parts (barrel, neck, head, two ears, mane, tail, four legs) in a
 * horse's colours, with hooves, eyes and cheek straps, at the classic horse's size.
 */
function horseP(pose: HorsePose): Part[] {
  const legs: [HorseLeg, number][] = [[pose.frontL, 0.118], [pose.frontR, -0.118], [pose.hindL, 0.118], [pose.hindR, -0.118]];
  return [
    ...each(horse(pose, { barrel: 6, leg: 5 }), ["horse", "horse", "horse", "horse", "horse", "hair", "hair", "horse"]),
    ...paint(legs.map(([l, x]) => limb([x, l[3][1], l[3][0] + 0.014], [x, l[3][1] + 0.045, l[3][0] + 0.012], 0.072, 0.066, 4)), "boot"),
    ...paint([box([0.02, 0.026, 0.03], [0.078, 1.14, 0.62]), box([0.02, 0.026, 0.03], [-0.078, 1.14, 0.62])], "eye"),
  ];
}
/** The classic sabre's shape, painted: a steel blade, a gold guard and a leather grip. */
const hussarSabre = (at: V3, turn: V3): Part[] => gear(place([
  ...paint([plate([[0.028, 0.04], [0.03, 0.24], [0.012, 0.44], [-0.05, 0.6], [-0.04, 0.42], [-0.026, 0.22], [-0.026, 0.04]], 0.026)], "steel"),
  ...paint([box([0.05, 0.028, 0.12], [0, 0.045, 0])], "gold"),
  ...paint([limb([0, -0.06, 0], [0, 0.04, 0], 0.02, 0.02, 5)], "leather"),
], { at, turn }));
function hussarP(pose: HorsePose, sabreHand: V3, sabreTurn: V3): Part[] {
  const back = 0.89 * MOUNT;
  const rider = human({ pelvis: [0, back + 0.05, -0.04], lean: 12, handL: [0.07, back + 0.2, 0.2], handR: sabreHand, elbowR: [-1, -0.4, -0.3], footL: [0.24, back - 0.4, 0.08], footR: [-0.24, back - 0.4, 0.08], kneeL: [0.9, 0.2, 1], kneeR: [-0.9, 0.2, 1] });
  const parts = paintBody(rider, { hips: "white", chest: "coat", sleeve: "coat", hand: "glove", thigh: "white", shin: "boot", foot: "boot" });
  // A fur busby with its plume, a braided jacket, and the pelisse on the left shoulder.
  const cap = rider.onHead([
    ...paint([limb([0, 0.03, 0], [0, 0.17, 0], 0.098, 0.106, 8)], "pelt"),
    ...gear(paint([limb([0, 0.17, 0.04], [0, 0.3, 0.03], 0.032, 0.014, 5)], "white")),
  ]);
  const braid = rider.onChest([
    ...paint([0.18, 0.24, 0.3].map((y) => box([0.13, 0.012, 0.012], [0, y, 0.1])), "gold"),
  ]);
  const pelisse = rider.onChest(paint([spine([[-0.085, 0.34, 0.11, 0.034], [-0.13, 0.18, 0.135, 0.036], [-0.17, 0.02, 0.145, 0.022]], { sides: 6, x: 0.07 })], "facing"));
  const saddle = [
    ...paint([box([0.36 * MOUNT, 0.04, 0.42], [0, back, -0.04])], "leather"),
    // The saddle cloth, hanging down each flank, with a gold edge.
    ...paint([box([0.012, 0.17, 0.4], [0.168, back - 0.09, -0.06]), box([0.012, 0.17, 0.4], [-0.168, back - 0.09, -0.06])], "coat"),
  ];
  const [hx, hy, hz] = rider.handL;
  const reins = gear(paint(([1, -1] as const).map((s) => limb([s * 0.05 * MOUNT, 0.95 * MOUNT, 0.78 * MOUNT], [hx + s * 0.02, hy, hz], 0.008, 0.008, 3)), "leather"));
  // At high quality: more braid with gold buttons, the busby's bag, a sabretache, gold edging on the
  // saddle cloth, and stirrups.
  const finery = fine([
    ...rider.onChest([
      ...paint([0.21, 0.27].map((y) => box([0.13, 0.01, 0.012], [0, y, 0.1])), "gold"),
      ...rivets([0.18, 0.21, 0.24, 0.27, 0.3].flatMap((y): V3[] => [[0.07, y, 0.104], [-0.07, y, 0.104]]), "gold", 0.009),
    ]),
    ...rider.onHead(paint([limb([0.05, 0.16, 0], [0.12, 0.08, -0.02], 0.03, 0.022, 5)], "coat")),
    ...paint([box([0.02, 0.14, 0.1], [0.2, back - 0.12, -0.14])], "coat"),
    ...rivets([[0.211, back - 0.12, -0.14]], "gold", 0.02),
    ...paint([box([0.016, 0.014, 0.4], [0.169, back - 0.172, -0.06]), box([0.016, 0.014, 0.4], [-0.169, back - 0.172, -0.06])], "gold"),
    ...paint(([1, -1] as const).map((sx) => limb([sx * 0.24, back - 0.43, 0.06], [sx * 0.24, back - 0.43, 0.11], 0.024, 0.024, 6)), "steel"),
  ]);
  return [...place(horseP(pose), { scale: MOUNT }), ...saddle, ...parts, ...faceOnly(rider), ...cap, ...braid, ...pelisse, ...reins, ...hussarSabre(rider.handR, sabreTurn), ...finery];
}

// ---------- Concord Grenadiers, stage 2 ----------
const grenadierBody = (b: Human) => paintBody(b, { hips: "white", chest: "coat", sleeve: "coat", hand: "skin", thigh: "white", shin: "black", foot: "black" });
const grenadierKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...paint([plate([[-0.09, 0.04], [-0.075, 0.2], [0, 0.28], [0.075, 0.2], [0.09, 0.04]], 0.05, "front", 0.045)], "gold"),
    ...paint([ball([0, 0.07, -0.03], [0.085, 0.09, 0.08], 0)], "coat"),
    ...paint([ball([0, 0.13, 0.073], [0.03, 0.03, 0.01], 0)], "facing"),
    // A moustache.
    ...paint([box([0.07, 0.016, 0.016], [0, -0.034, 0.09])], "hair"),
  ]),
  ...place(paint([spine([[0, 0.12, 0.118, 0.088], [-0.01, -0.04, 0.155, 0.12], [-0.04, -0.17, 0.175, 0.14]])], "coat"), { at: pelvis }),
  ...place(paint([spine([[-0.025, -0.11, 0.165, 0.13], [-0.04, -0.17, 0.177, 0.142]], { sides: 8 })], "facing"), { at: pelvis }),
  ...body.onChest([
    ...paint([box([0.12, 0.11, 0.08], [-0.16, 0.03, -0.06])], "black"),
    ...paint([box([0.05, 0.19, 0.012], [0.045, 0.24, 0.097]), box([0.05, 0.19, 0.012], [-0.045, 0.24, 0.097])], "facing"),
    ...paint([limb([0, 0.33, 0], [0, 0.37, 0.004], 0.064, 0.058, 8)], "facing"),
    ...paint([1, -1].flatMap((s) => place([box([0.04, 0.42, 0.018])], { at: [0, 0.18, 0.112], turn: [0, 0, s * 38] })), "white"),
    ...paint([0.18, 0.24, 0.3].flatMap((y) => [box([0.019, 0.019, 0.014], [0.075, y, 0.104]), box([0.019, 0.019, 0.014], [-0.075, y, 0.104])]), "gold"),
  ]),
  // At high quality: a flaming grenade on the cap's plate, a brass plate on the crossbelt, a match case and a badge on the pouch.
  ...fine([
    ...body.onHead([
      ...paint([ball([0, 0.12, 0.074], [0.03, 0.03, 0.01], 0)], "black"),
      ...paint([plate([[-0.016, 0.145], [0, 0.195], [0.016, 0.145]], 0.01, "front", 0.074)], "sash"),
    ]),
    ...body.onChest([
      ...paint([box([0.045, 0.045, 0.012], [0, 0.18, 0.123])], "brass"),
      ...paint([limb([0.07, 0.26, 0.118], [0.1, 0.3, 0.115], 0.012, 0.012, 5)], "brass"),
      ...paint([ball([-0.16, 0.03, -0.102], [0.022, 0.022, 0.008], 0)], "brass"),
    ]),
  ]),
];
const grenadeP = (at: V3, lit: boolean): Part[] => gear([
  ...paint([ball(at, 0.05, 0)], "black"),
  ...paint([limb([at[0], at[1] + 0.04, at[2]], [at[0] + 0.02, at[1] + 0.1, at[2]], 0.01, 0.006, 4)], "blanket"),
  ...(lit ? paint([ball([at[0] + 0.02, at[1] + 0.105, at[2]], 0.018, 0)], "glow") : []),
]);
const grenadierLobbingP = (() => {
  const pelvis: V3 = [0, 0.49, 0];
  const body = human({ pelvis, lean: -4, twist: -22, look: 18, handR: [-0.3, 1.02, -0.12], elbowR: [-1, -0.2, -0.5], handL: [0.2, 0.8, 0.3], footL: [0.09, 0, 0.2], footR: [-0.1, 0, -0.16] });
  return [...grenadierBody(body), ...faceOnly(body), ...grenadierKitP(body, pelvis), ...cuffs(body, "facing", 0.05), ...grenadeP([body.handR[0], body.handR[1] + 0.07, body.handR[2]], true)];
})();
const grenadierLightingP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, lean: 8, handL: [0.06, 0.7, 0.26], handR: [-0.09, 0.73, 0.23], footL: [0.09, 0, 0.05], footR: [-0.09, 0, -0.03] });
  const end: V3 = [body.handR[0] + 0.1, body.handR[1] + 0.03, body.handR[2] + 0.06];
  const match = gear([...paint([limb(body.handR, end, 0.012, 0.008, 4)], "blanket"), ...paint([ball(end, 0.016, 0)], "glow")]);
  return [...grenadierBody(body), ...faceOnly(body), ...grenadierKitP(body, pelvis), ...cuffs(body, "facing", 0.05), ...grenadeP([body.handL[0], body.handL[1] + 0.07, body.handL[2]], false), ...match];
})();

// ---------- Solenne, stage 2 ----------
const solenneDetailed = (() => {
  const body = human({ pelvis: [0, 0.62, 0], lean: -4, handR: [-0.3, 0.86, 0.12], handL: [0.3, 1.0, 0.16], elbowL: [1, -0.5, -0.2], footL: [0.05, 0.14, 0.02], footR: [-0.06, 0.2, -0.04] }, { shoulders: 0.16, bulk: 0.9 });
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "coat", hand: "skin", thigh: "coat", shin: "coat", foot: "gold" });
  const gown = place([
    ...paint([spine([[0, 0.12, 0.11, 0.085], [-0.01, -0.1, 0.16, 0.125], [-0.05, -0.36, 0.18, 0.135], [-0.14, -0.56, 0.1, 0.06], [-0.2, -0.62, 0.03, 0.02]])], "coat"),
    ...paint([spine([[-0.01, -0.12, 0.163, 0.128], [-0.015, -0.16, 0.168, 0.131]])], "gold"),
  ], { at: [0, 0.62, 0] });
  // A gold breastplate and belt, and long fair hair down her back.
  const armour = [
    ...body.onChest(paint([ball([0, 0.215, 0.02], [0.15, 0.13, 0.112], 0)], "gold")),
    ...body.onHead(paint([limb([0, 0.0, -0.07], [0, -0.2, -0.11], 0.06, 0.03, 5)], "hairLight")),
  ];
  const outline: [number, number][] = [[0.03, 0.88], [0.26, 1.12], [0.52, 1.23], [0.74, 1.2], [0.7, 1.02], [0.76, 0.88], [0.6, 0.8], [0.62, 0.64], [0.44, 0.62], [0.42, 0.48], [0.24, 0.52], [0.05, 0.68]];
  // Each wing white, with a gold covert of shorter feathers along its top.
  const wing = place([
    ...paint([plate(outline, 0.04, "front")], "white"),
    ...paint([plate([[0.06, 0.9], [0.26, 1.12], [0.52, 1.22], [0.5, 1.1], [0.3, 1.0], [0.08, 0.82]], 0.05, "front")], "lace"),
    // At high quality: the shafts of the long flight feathers, on both faces of the wing.
    ...fine(paint(([[0.74, 1.18], [0.72, 1.0], [0.74, 0.88], [0.6, 0.8], [0.6, 0.66]] as const).flatMap(([x, y]) =>
      [0.025, -0.025].map((z) => limb([0.22, 0.84, z], [x * 0.96, y, z], 0.006, 0.004, 3))), "lace")),
  ], { at: [0, 0, -0.1], turn: [0, 14, 0] });
  const halo = gear(body.onHead(paint([limb([0, 0.07, -0.11], [0, 0.07, -0.09], 0.16, 0.16, 10)], "glow")));
  const pennon = gear(paint([plate([[0.12, 1.32], [-0.12, 1.29], [-0.03, 1.235], [-0.14, 1.18], [0.12, 1.15]], 0.014, "side", -0.3)], "gold"));
  const spearP = each(spear([-0.3, 0.16, 0.11], [-0.3, 1.5, 0.14]), ["gold", "steel"]);
  // At high quality: a sun on the breastplate, and bands round the spear.
  const finery = fine([
    ...body.onChest([
      ...paint([ball([0, 0.23, 0.132], [0.032, 0.032, 0.01], 0)], "white"),
      ...paint([0, 45, 90, 135, 180, 225, 270, 315].flatMap((a) => place([box([0.012, 0.045, 0.008], [0, 0.065, 0])], { at: [0, 0.23, 0.134], turn: [0, 0, a] })), "gold"),
    ]),
    ...paint([0.55, 0.62, 0.75].map((t) => limb([-0.3, 0.16 + 1.34 * t, 0.11 + 0.03 * t], [-0.3, 0.19 + 1.34 * t, 0.11 + 0.03 * t], 0.022, 0.022, 6)), "white"),
  ]);
  return figure([...parts, ...face(body, "hairLight"), ...gown, ...armour, ...wing, ...mirror(wing), ...halo, ...spearP, ...pennon, ...finery], 6);
})();

// ---------- Magister Orrin Vael, stage 2 ----------
const openBookP = (at: V3): Part[] => gear([
  ...paint([...place([box([0.13, 0.02, 0.18], [0.065, 0, 0])], { at, turn: [0, 0, 16] }), ...place([box([0.13, 0.02, 0.18], [-0.065, 0, 0])], { at, turn: [0, 0, -16] })], "lace"),
  ...paint([...place([box([0.14, 0.012, 0.19], [0.068, -0.014, 0])], { at, turn: [0, 0, 16] }), ...place([box([0.14, 0.012, 0.19], [-0.068, -0.014, 0])], { at, turn: [0, 0, -16] })], "sash"),
]);
const orrinDetailed = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, lean: 2, twist: -14, look: 10, handR: [-0.28, 0.94, 0.24], elbowR: [-1, -0.6, -0.2], handL: [0.2, 0.7, 0.24], footL: [0.08, 0, 0.06], footR: [-0.09, 0, -0.03] }, { bulk: 0.95 });
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "coat", hand: "skin", thigh: "coat", shin: "boot", foot: "boot" });
  const scholar = [
    ...body.onHead([
      ...paint([limb([0, 0.045, -0.005], [0, 0.115, -0.015], 0.1, 0.08, 8)], "coatDark"),
      ...paint([limb([0, -0.05, 0.07], [0, -0.26, 0.1], 0.06, 0.016, 5), box([0.08, 0.018, 0.02], [0, -0.032, 0.09])], "white"),
      ...paint([ball([0, -0.005, -0.03], [HEAD * 0.95, HEAD * 0.85, HEAD * 0.92], 0)], "white"),
    ]),
    ...place([
      ...paint([spine([[0, 0.12, 0.12, 0.09], [0, -0.1, 0.175, 0.135], [-0.01, -0.44, 0.235, 0.19]])], "coat"),
      ...paint([spine([[-0.01, -0.405, 0.229, 0.185], [-0.01, -0.44, 0.24, 0.195]])], "gold"),
    ], { at: pelvis }),
    ...belt(pelvis, "lace", 0.1, [0.125, 0.094]),
    ...body.onChest(paint([spine([[0.01, 0.37, 0.085, 0.075], [0.02, 0.26, 0.17, 0.12]], { sides: 6 })], "gold")),
    ...paint([ball([body.handL[0] + 0.02, body.handL[1] - 0.08, body.handL[2] - 0.07], [0.07, 0.1, 0.09], 0), ball([body.handR[0] + 0.02, body.handR[1] - 0.09, body.handR[2] - 0.07], [0.07, 0.1, 0.09], 0)], "coat"),
  ];
  const [bx, by, bz] = body.handL;
  const [x, y, z] = body.handR;
  const bolt = gear(paint([
    limb([x, y + 0.02, z + 0.04], [x - 0.04, y + 0.12, z + 0.2], 0.026, 0.02, 4),
    limb([x - 0.04, y + 0.12, z + 0.2], [x + 0.04, y + 0.04, z + 0.34], 0.02, 0.016, 4),
    limb([x + 0.04, y + 0.04, z + 0.34], [x - 0.02, y + 0.14, z + 0.54], 0.016, 0, 4),
    limb([x + 0.04, y + 0.04, z + 0.34], [x + 0.1, y - 0.06, z + 0.46], 0.014, 0, 4),
  ], "glowCyan"));
  // At high quality: spectacles, a gold band down the robe's front, and a pouch and scroll at the belt.
  const lens = (cx: number): Part[] => {
    const pts: V3[] = Array.from({ length: 8 }, (_, i) => [cx + Math.cos((i / 8) * Math.PI * 2) * 0.024, 0.016 + Math.sin((i / 8) * Math.PI * 2) * 0.024, 0.097]);
    return pts.map((p, i) => limb(p, pts[(i + 1) % 8]!, 0.004, 0.004, 3));
  };
  const finery = fine([
    ...body.onHead(paint([...lens(0.032), ...lens(-0.032), limb([0.008, 0.02, 0.097], [-0.008, 0.02, 0.097], 0.004, 0.004, 3)], "gold")),
    ...place([
      ...paint([limb([0, 0.12, 0.094], [0, -0.44, 0.198], 0.018, 0.018, 4)], "gold"),
      ...paint([box([0.06, 0.07, 0.04], [0.13, 0.04, 0.08])], "leather"),
      ...paint([limb([0.09, 0.09, 0.11], [0.18, 0.13, 0.08], 0.02, 0.02, 6)], "lace"),
    ], { at: pelvis }),
  ]);
  return figure([...parts, ...faceOnly(body), ...scholar, ...openBookP([bx, by + 0.05, bz + 0.02]), ...bolt, ...finery], 5);
})();

// ---------- Silverlance Knights, stage 2 ----------
const KNIGHT = { shoulders: 0.185, bulk: 1.1 };
const knightBody = (b: Human) => paintBody(b, { hips: "mail", chest: "steel", sleeve: "steel", hand: "steel", thigh: "steel", shin: "steel", foot: "steel", skin: "mail" });
const knightKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...paint([limb([0, -0.095, 0], [0, 0.085, 0], 0.102, 0.104, 8), limb([0, 0.085, 0], [0, 0.115, 0], 0.104, 0.07, 8)], "steel"),
    // The eye slit, breaths and a gold cross over the face.
    ...paint([box([0.15, 0.016, 0.012], [0, 0.02, 0.099])], "black"),
    ...paint([box([0.016, 0.12, 0.012], [0, -0.03, 0.101])], "gold"),
    ...gear(paint([limb([0, 0.11, -0.02], [0, 0.26, -0.08], 0.034, 0.012, 5)], "sash")),
  ]),
  ...body.onChest([
    ...paint([ball([0.205, 0.335, 0], [0.1, 0.075, 0.105], 0), ball([-0.205, 0.335, 0], [0.1, 0.075, 0.105], 0)], "steel"),
    // The surcoat's front and back over the plate, with a gold sun.
    ...paint([box([0.18, 0.28, 0.012], [0, 0.19, 0.104]), box([0.18, 0.28, 0.012], [0, 0.19, -0.1])], "coat"),
    ...paint([ball([0, 0.22, 0.111], [0.04, 0.04, 0.008], 0)], "gold"),
  ]),
  ...place(paint([spine([[0, 0.13, 0.135, 0.1], [0, -0.24, 0.19, 0.15]], { sides: 6 })], "coat"), { at: pelvis }),
  ...belt(pelvis, "leather", 0.11, [0.14, 0.104]),
  // At high quality: gold rivets on the pauldrons and down the visor, gold trim on the surcoat, and guards over knees and elbows.
  ...fine([
    ...body.onChest([
      ...rivets(([1, -1] as const).flatMap((sx): V3[] => [[sx * 0.205, 0.39, 0.07], [sx * 0.27, 0.37, 0.056], [sx * 0.14, 0.37, 0.066]])),
      ...trimRect(0.18, 0.28, [0, 0.19, 0.111]),
      ...trimRect(0.18, 0.28, [0, 0.19, -0.107]),
    ]),
    ...body.onHead(rivets([-0.06, -0.03, 0.03, 0.06].map((x): V3 => [x, -0.06, 0.1]), "gold", 0.009)),
    ...jointGuards(body, "steel", 0.06),
  ]),
];
function lanceP(butt: V3, tip: V3): Part[] {
  const [a, b] = [lerp(butt, tip, 0.78), lerp(butt, tip, 0.9)];
  // At high quality: a vamplate, the cone that guards the hand on the lance.
  const vamplate = fine(paint([limb(lerp(butt, tip, 0.2), lerp(butt, tip, 0.25), 0.075, 0.02, 8)], "steel"));
  return [...each(spear(butt, tip, 0.018), ["wood", "steel"]), ...gear(paint([limb(b, [a[0] - 0.16, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], 0.045, 0, 4)], "gold")), ...gear(vamplate)];
}
const knightAtAttentionP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, handR: [-0.27, 0.72, 0.1], handL: [0.22, 0.6, 0.16], footL: [0.09, 0, 0.04], footR: [-0.09, 0, -0.02] }, KNIGHT);
  return [...knightBody(body), ...knightKitP(body, pelvis), ...lanceP([-0.27, 0, 0.1], [-0.27, 1.95, 0.1]), ...sunShieldP([0.25, 0.6, 0.24], [0, 30, 0], 0.8)];
})();
const knightChargingP = (() => {
  const pelvis: V3 = [0, 0.46, 0];
  const body = human({ pelvis, lean: 20, twist: -10, handR: [-0.163, 0.657, 0], elbowR: [-1, -0.2, -0.6], handL: [0.16, 0.62, 0.3], footL: [0.09, 0, 0.26], footR: [-0.1, 0, -0.24] }, KNIGHT);
  return [...knightBody(body), ...knightKitP(body, pelvis), ...lanceP([-0.2, 0.62, -0.5], [-0.1, 0.72, 0.85]), ...sunShieldP([0.17, 0.6, 0.38], [0, 12, 0], 0.8)];
})();

// ---------- Dawn Acolytes, stage 2 ----------
const ACOLYTE = { shoulders: 0.16, bulk: 0.9 };
const acolyteBody = (b: Human) => paintBody(b, { hips: "coat", chest: "coat", sleeve: "coat", hand: "skin", thigh: "coat", shin: "coat", foot: "boot" });
const acolyteKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead(paint([limb([0, 0.045, -0.005], [0, 0.09, -0.01], 0.09, 0.06, 8)], "gold")),
  ...place([
    ...paint([spine([[0, 0.12, 0.115, 0.085], [0, -0.1, 0.17, 0.13], [-0.01, -0.44, 0.225, 0.18]])], "coat"),
    ...paint([spine([[-0.01, -0.405, 0.219, 0.175], [-0.01, -0.44, 0.23, 0.185]])], "gold"),
  ], { at: pelvis }),
  ...belt(pelvis, "lace", 0.1, [0.12, 0.09]),
  ...body.onChest([
    ...paint([spine([[0, 0.38, 0.08, 0.075], [-0.005, 0.31, 0.18, 0.115], [-0.01, 0.25, 0.19, 0.12]], { sides: 8 }), ball([0, 0.35, -0.11], [0.09, 0.065, 0.07], 0)], "coatDark"),
    ...paint([0.062, -0.062].map((x) => spine([[0.118, 0.3, 0.03, 0.014], [0.128, 0.02, 0.03, 0.014], [0.168, -0.3, 0.033, 0.014]], { sides: 4, x })), "gold"),
  ]),
  ...paint([ball([body.handL[0] + 0.02, body.handL[1] - 0.08, body.handL[2] - 0.07], [0.07, 0.1, 0.09], 0), ball([body.handR[0] - 0.02, body.handR[1] - 0.08, body.handR[2] - 0.07], [0.07, 0.1, 0.09], 0)], "coat"),
  // At high quality: a sun pendant on a gold chain, and the cord's tassels hanging from the belt.
  ...fine([
    ...body.onChest([
      ...paint([limb([0.07, 0.36, 0.095], [0, 0.26, 0.128], 0.004, 0.004, 3), limb([-0.07, 0.36, 0.095], [0, 0.26, 0.128], 0.004, 0.004, 3)], "gold"),
      ...paint([ball([0, 0.245, 0.132], [0.03, 0.03, 0.01], 0)], "gold"),
      ...paint([ball([0, 0.245, 0.139], [0.014, 0.014, 0.006], 0)], "glow"),
    ]),
    ...place(paint([0.05, 0.085].flatMap((x) => [limb([x, 0.09, 0.09], [x + 0.01, -0.12, 0.12], 0.008, 0.008, 3), ball([x + 0.01, -0.13, 0.12], 0.016, 0)]), "lace"), { at: pelvis }),
  ]),
];
const acolyteSingingP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, lean: -3, handL: [0.1, 0.74, 0.25], handR: [-0.1, 0.74, 0.25], footL: [0.08, 0, 0.04], footR: [-0.08, 0, -0.02] }, ACOLYTE);
  return [...acolyteBody(body), ...face(body, "hair"), ...acolyteKitP(body, pelvis), ...openBookP([0, 0.79, 0.27])];
})();
const acolyteBlessingP = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({ pelvis, twist: -8, look: 6, handR: [-0.26, 0.98, 0.2], elbowR: [-1, -0.5, -0.2], handL: [0.25, 0.66, 0.22], elbowL: [1, -0.8, -0.2], footL: [0.08, 0, 0.06], footR: [-0.09, 0, -0.03] }, ACOLYTE);
  const sun: V3 = [-0.236, 1.42, 0.246];
  const staff = gear([
    ...paint([limb([-0.29, 0.28, 0.13], [-0.24, 1.33, 0.24], 0.017, 0.015, 5)], "wood"),
    ...place([
      ...paint([limb([0, 0, -0.016], [0, 0, 0.016], 0.085, 0.085, 10)], "glow"),
      ...paint([0, 45, 90, 135, 180, 225, 270, 315].flatMap((turn) => place([limb([0, 0.09, 0], [0, 0.16, 0], 0.022, 0, 4)], { turn: [0, 0, turn] })), "gold"),
    ], { at: sun }),
  ]);
  return [...acolyteBody(body), ...face(body, "hair"), ...acolyteKitP(body, pelvis), ...staff];
})();

// ---------- Sunbound Archers, stage 2 ----------
const SUNBOUND = { shoulders: 0.165, bulk: 0.95 };
const sunboundBody = (b: Human) => paintBody(b, { hips: "leather", chest: "tunic", sleeve: "tunic", hand: "skin", thigh: "leather", shin: "boot", foot: "boot" });
const sunboundKitP = (body: Human, hips: number): Part[] => [
  ...body.onHead([
    ...paint([limb([0, 0.03, 0], [0, 0.062, 0], 0.097, 0.097, 8), ball([0, 0.046, 0.094], [0.034, 0.034, 0.016], 0)], "gold"),
    ...paint([limb([0, 0.03, -0.07], [0, -0.09, -0.135], 0.042, 0.016, 5)], "hairLight"),
  ]),
  ...place([
    ...paint([spine([[0, 0.13, 0.12, 0.09], [0, -0.2, 0.165, 0.13]], { sides: 6 })], "coat"),
    ...paint([spine([[0, -0.17, 0.161, 0.127], [0, -0.2, 0.168, 0.133]], { sides: 6 })], "gold"),
  ], { at: [0, 0.5, 0], turn: [0, hips, 0] }),
  ...body.onChest([
    ...paint([ball([0.195, 0.335, 0], [0.09, 0.065, 0.1], 0)], "steel"),
    ...paint([box([0.15, 0.24, 0.012], [0, 0.2, 0.094])], "coat"),
    ...paint([ball([0, 0.24, 0.1], [0.032, 0.032, 0.008], 0)], "gold"),
    ...paint(place([box([0.035, 0.4, 0.014])], { at: [0, 0.2, 0.1], turn: [0, 0, 36] }), "leather"),
  ]),
  ...wardenQuiver(body),
  // At high quality: a bracer on the bow arm, gold trim on the tabard, and a glowing stone in the circlet.
  ...fine([
    ...bracer(body, true, "leather", "gold"),
    ...body.onChest(trimRect(0.15, 0.24, [0, 0.2, 0.101])),
    ...body.onHead(paint([ball([0, 0.046, 0.106], 0.014, 0)], "glow")),
  ]),
];
const sunboundLoosingP = (() => {
  const body = human(loosing(), SUNBOUND);
  return [...sunboundBody(body), ...face(body, "hairLight"), ...sunboundKitP(body, -78), ...paint(bow(body.handL, 0.09, [0, 0, 0], 1.25), "wood"), ...wardenArrow(...DRAWN)];
})();
const sunboundWaitingP = (() => {
  const body = human({ twist: 16, look: -12, handL: [0.21, 0.55, 0.2], handR: [0.03, 0.57, 0.14], footL: [0.09, 0, 0.06], footR: [-0.09, 0, -0.04] }, SUNBOUND);
  return [...sunboundBody(body), ...face(body, "hairLight"), ...sunboundKitP(body, 0), ...paint(bow(body.handL, 0.03, [0, 48, 50], 1.25), "wood"), ...wardenArrow(body.handR, [body.handL[0] + 0.05, body.handL[1] - 0.01, body.handL[2] + 0.06])];
})();

// ---------- Hollow Reed Shinobi, stage 2 ----------
const SHINOBI = { shoulders: 0.145, bulk: 0.8 };
const shinobiBody = (b: Human) => paintBody(b, { hips: "coatDark", chest: "coatDark", sleeve: "coatDark", hand: "black", thigh: "coatDark", shin: "black", foot: "tabi", skin: "coatDark" });
const shinobiKitP = (body: Human): Part[] => [
  ...body.onHead([
    // The wrap leaves only a strip of face for the eyes.
    ...paint([box([0.1, 0.03, 0.016], [0, 0.012, 0.084])], "skin"),
    ...paint([box([0.02, 0.014, 0.008], [0.03, 0.014, 0.093]), box([0.02, 0.014, 0.008], [-0.03, 0.014, 0.093])], "eye"),
    ...paint([limb([0, 0.02, -0.08], [0.04, -0.03, -0.22], 0.034, 0.008, 4)], "sash"),
  ]),
  ...gear(body.onChest([
    ...paint([limb([-0.14, 0.44, -0.105], [0.13, 0.08, -0.115], 0.018, 0.018, 4)], "lacquer"),
    ...paint([box([0.05, 0.02, 0.05], [-0.09, 0.375, -0.108])], "black"),
  ])),
  ...body.onChest(paint([spine([[0, 0.05, 0.108, 0.08], [0, 0.09, 0.104, 0.077]], { sides: 8 })], "sash")),
  // At high quality: throwing stars on the chest strap, and wrapped forearms.
  ...fine([
    ...body.onChest(paint([[0.05, 0.25], [0.085, 0.19]].map(([x, y]) => {
      const star: [number, number][] = Array.from({ length: 8 }, (_, i) => { const r = i % 2 ? 0.01 : 0.026, a = (i / 8) * Math.PI * 2; return [x! + Math.cos(a) * r, y! + Math.sin(a) * r]; });
      return plate(star, 0.006, "front", 0.088);
    }), "steel")),
    ...bracer(body, true, "black", "sash"),
    ...bracer(body, false, "black", "sash"),
  ]),
];
const shinobiCrouchedP = (() => {
  const body = human({ pelvis: [0, 0.3, -0.04], lean: 28, twist: -20, look: 15, handL: [0.12, 0.62, 0.38], handR: [-0.25, 0.42, -0.12], elbowR: [-1, 0, -0.5], footL: [0.1, 0, 0.2], footR: [-0.1, 0, -0.2] }, SHINOBI);
  const knife = gear(place(paint([plate([[0.02, 0.03], [0.012, 0.16], [-0.014, 0.23], [-0.018, 0.03]], 0.016)], "steel"), { at: body.handR, turn: [-115, 0, 0] }));
  return [...shinobiBody(body), ...shinobiKitP(body), ...knife];
})();
const shinobiBlowpipeP = (() => {
  const body = human({ hips: -72, twist: -78, look: 74, handL: [0.02, 0.9, 0.34], handR: [0, 0.9, 0.17], elbowR: [-0.3, -1, -0.3], footL: [0.02, 0, 0.15], footR: [-0.03, 0, -0.14], kneeL: [-0.4, 0, 1], kneeR: [-1, 0, 0.2] }, SHINOBI);
  const pipe = gear(paint([limb([0, 0.905, 0.1], [0.025, 0.89, 0.68], 0.014, 0.014, 5)], "straw"));
  return [...shinobiBody(body), ...shinobiKitP(body), ...pipe];
})();

// ---------- Ashfang Oni, stage 2 ----------
const oniDetailed = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human({ pelvis, lean: 10, twist: -12, look: 10, handR: [-0.4, 1.06, 0.04], elbowR: [-1, -0.3, -0.4], handL: [0.32, 0.6, 0.28], footL: [0.17, 0, 0.14], footR: [-0.18, 0, -0.1] }, { shoulders: 0.26, bulk: 1.5 });
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "coat", hand: "coat", thigh: "coat", shin: "coat", foot: "coat", skin: "coat" });
  const head = body.onHead([
    ...paint(both([limb([0.055, 0.06, 0.03], [0.12, 0.22, 0.07], 0.034, 0, 4)]), "horn"),
    ...paint([box([0.15, 0.06, 0.11], [0, -0.075, 0.035])], "coat"),
    ...paint(both([limb([0.05, -0.06, 0.085], [0.06, 0.0, 0.11], 0.02, 0, 4)]), "horn"),
    // Burning eyes under a heavy brow, and a wild black mane.
    ...paint([box([0.03, 0.016, 0.012], [0.032, 0.016, 0.088]), box([0.03, 0.016, 0.012], [-0.032, 0.016, 0.088])], "glow"),
    ...paint([box([0.12, 0.022, 0.03], [0, 0.034, 0.08])], "coatDark"),
    ...paint([ball([0, 0.02, -0.035], [HEAD * 1.02, HEAD * 1.0, HEAD * 0.95], 0), limb([0, 0.0, -0.08], [0, -0.16, -0.12], 0.06, 0.02, 5)], "black"),
  ]);
  // A tiger pelt, gold with black stripes, round the hips and over the shoulder.
  const pelt = [
    ...place([
      ...paint([spine([[0, 0.12, 0.17, 0.125], [0, -0.06, 0.24, 0.18], [0, -0.2, 0.27, 0.2]], { sides: 7 })], "obi"),
      ...paint([-0.17, -0.06, 0.05].map((x) => box([0.025, 0.2, 0.05], [x, -0.07, 0.19 - Math.abs(x) * 0.3])), "black"),
    ], { at: pelvis }),
    ...body.onChest(paint([ball([0.2, 0.34, 0], [0.13, 0.085, 0.13], 0)], "obi")),
    ...belt(pelvis, "black", 0.12, [0.175, 0.13]),
  ];
  const club = gear(place([
    ...paint([limb([0, -0.12, 0], [0, 0.24, 0], 0.03, 0.036, 6)], "wood"),
    ...paint([limb([0, 0.24, 0], [0, 0.66, 0], 0.06, 0.11, 8), limb([0, 0.66, 0], [0, 0.72, 0], 0.11, 0.07, 8)], "ironDark"),
    ...paint([0, 90, 180, 270].flatMap((a) => place([box([0.03, 0.03, 0.03], [0, 0.5, 0.1]), box([0.03, 0.03, 0.03], [0, 0.38, 0.085])], { turn: [0, a, 0] })), "steel"),
  ], { at: body.handR, turn: [18, 0, 12] }));
  // At high quality: a sacred straw rope round the waist hung with paper streamers, gold rings on the
  // arms, and a second row of studs on the club.
  const finery = fine([
    ...belt(pelvis, "straw", 0.17, [0.19, 0.145]),
    ...place(paint([-0.1, 0, 0.1].map((x) => plate([[x - 0.015, 0.15], [x + 0.015, 0.15], [x + 0.005, 0.11], [x + 0.02, 0.08], [x - 0.01, 0.05], [x - 0.005, 0.1]], 0.006, "front", 0.16)), "white"), { at: pelvis }),
    ...paint(([[4, 6], [9, 11]] as const).map(([u, e]) => { const a = centroid(body.parts[u]!), b = centroid(body.parts[e]!); return limb(lerp(a, b, 0.55), lerp(a, b, 0.7), 0.095, 0.095, 8); }), "gold"),
    ...gear(place(paint([45, 135, 225, 315].flatMap((a) => place([box([0.028, 0.028, 0.028], [0, 0.6, 0.105]), box([0.028, 0.028, 0.028], [0, 0.44, 0.095])], { turn: [0, a, 0] })), "steel"), { at: body.handR, turn: [18, 0, 12] })),
  ]);
  return figure([...parts, ...head, ...pelt, ...cuffs(body, "ironDark", 0.09), ...club, ...finery], 7);
})();

// ---------- Lady Suzume, stage 2 ----------
const suzumeDetailed = (() => {
  const body = human(loosing(), { shoulders: 0.16, bulk: 0.92 });
  const parts = paintBody(body, { hips: "hakama", chest: "kimono", sleeve: "kimono", hand: "skin", thigh: "hakama", shin: "hakama", foot: "tabi" });
  const hair = body.onHead([
    ...paint([spine([[-0.07, 0.04, 0.045, 0.045], [-0.2, 0.02, 0.05, 0.04], [-0.36, -0.05, 0.03, 0.022]], { sides: 5 })], "hair"),
    ...paint([limb([0, 0.04, 0], [0, 0.065, 0], 0.094, 0.094, 8), limb([-0.03, 0.05, -0.09], [-0.08, 0.1, -0.26], 0.016, 0.006, 4)], "white"),
  ]);
  const armour = [
    ...body.onChest([
      ...paint([ball([0, 0.22, 0.02], [0.15, 0.13, 0.11], 0), box([0.05, 0.16, 0.14], [0.22, 0.25, 0])], "coat"),
      ...paint([0.21, 0.28].map((y) => box([0.056, 0.012, 0.146], [0.22, y, 0])), "lace"),
      ...paint([limb([-0.08, 0.1, -0.115], [0.07, 0.42, -0.13], 0.04, 0.046, 6)], "lacquer"),
      ...gear(paint([-0.015, 0.015].map((dx) => limb([0.07 + dx, 0.41, -0.13], [0.08 + dx, 0.48, -0.13], 0.011, 0.006, 3)), "white")),
    ]),
    ...place([
      ...paint([spine([[0, 0.12, 0.13, 0.095], [0, -0.03, 0.18, 0.14], [0, -0.17, 0.21, 0.17]], { sides: 6 })], "coat"),
      ...paint([spine([[0, -0.06, 0.188, 0.147], [0, -0.075, 0.194, 0.152]], { sides: 6 })], "lace"),
    ], { at: [0, 0.5, 0], turn: [0, -78, 0] }),
  ];
  // At high quality: hairpins with flowers, more fletched arrows in the quiver, a wrapped grip on the bow, and the house's crest.
  const finery = fine([
    ...body.onHead([
      ...paint([limb([0.02, 0.08, -0.06], [0.12, 0.15, -0.1], 0.006, 0.004, 3), limb([-0.02, 0.08, -0.07], [-0.1, 0.16, -0.12], 0.006, 0.004, 3)], "gold"),
      ...paint([ball([0.12, 0.15, -0.1], 0.02, 0), ball([-0.1, 0.16, -0.12], 0.018, 0)], "sash"),
    ]),
    ...body.onChest([
      ...paint([-0.035, 0.035].map((dx) => limb([0.07 + dx, 0.4, -0.125], [0.08 + dx, 0.5, -0.125], 0.006, 0.006, 3)), "wood"),
      ...paint([-0.035, 0, 0.035].flatMap((dx) => place([plate([[0, 0], [0.012, 0.01], [0.012, 0.04], [0, 0.03]], 0.004, "side")], { at: [0.08 + dx, 0.46, -0.125] })), "white"),
      ...paint([ball([0, 0.22, 0.128], [0.024, 0.024, 0.006], 0)], "gold"),
    ]),
    ...paint([limb([body.handL[0], body.handL[1] - 0.05, body.handL[2]], [body.handL[0], body.handL[1] + 0.05, body.handL[2]], 0.024, 0.024, 6)], "leather"),
  ]);
  return figure([...parts, ...face(body, "hair"), ...hair, ...armour, ...paint(bow(body.handL, 0.09, [0, 0, 0], 1.45), "wood"), ...each(arrow(...DRAWN), ["wood", "steel"]), ...finery], 5);
})();

// ---------- Swarmling Drones, stage 2 ----------
const standP = (top: V3) => paint(flightStand(top), "stand");
function droneP(bank: number, lift: number): Part[] {
  const machine = [
    ...paint([ball([0, 0, 0], [0.24, 0.22, 0.24], 1)], "coat"),
    ...paint([limb([0, -0.015, 0], [0, 0.015, 0], 0.248, 0.248, 8)], "machine"),
    ...paint([ball([0, -0.02, 0.2], 0.09, 0)], "glowCyan"),
    ...each(both([limb([0.15, 0.12, 0], [0.36, 0.22, 0], 0.045, 0.03, 5), limb([0.36, 0.235, 0], [0.36, 0.26, 0], 0.2, 0.2, 8)]), ["machine", "steel"]),
    ...paint([...both([limb([0.1, -0.16, 0.1], [0.17, -0.3, 0.2], 0.035, 0, 4)]), limb([0, -0.16, -0.12], [0, -0.3, -0.24], 0.035, 0, 4)], "machine"),
  ];
  const height = 0.5 + lift;
  return [...standP([0, height, 0]), ...place(machine, { at: [0, height, 0], turn: [bank * 0.5, bank, bank] })];
}

// ---------- Skyhook Raiders, stage 2 ----------
const jetPackP = (body: Human): Part[] => body.onChest([
  ...paint(both([limb([0.1, 0.12, -0.2], [0.11, -0.02, -0.23], 0.05, 0.07, 6), limb([0.17, 0.34, -0.15], [0.21, 0.47, -0.18], 0.05, 0.035, 6)]), "machine"),
  // Jet flames under the pack.
  ...gear(paint(both([limb([0.11, -0.025, -0.23], [0.115, -0.12, -0.24], 0.055, 0, 5)]), "glow")),
]);
const sidearmP = (at: V3, turn: V3): Part[] => gear(place([
  ...paint([box([0.04, 0.055, 0.18], [0, 0.03, 0.07]), box([0.038, 0.08, 0.045], [0, -0.03, -0.005])], "machine"),
  ...paint([box([0.012, 0.012, 0.12], [0, 0.062, 0.08])], "glowCyan"),
], { at, turn }));
const raiderHoveringP = (() => {
  const body = human({ twist: -14, look: 10, handR: [-0.2, 0.72, 0.26], handL: [0.26, 0.6, 0.1], footL: [0.1, 0.2, 0.1], footR: [-0.1, 0.27, -0.05] }, RECLAIMER);
  return [...reclaimerBody(body), ...reclaimerKitP(body), ...jetPackP(body), ...sidearmP(body.handR, [0, 0, 0]), ...standP([0, 0.43, -0.03])];
})();
const raiderSwoopingP = (() => {
  const body = human({ pelvis: [0, 0.5, -0.05], lean: 50, handR: [-0.14, 0.6, 0.48], handL: [0.26, 0.62, 0], footL: [0.08, 0.35, -0.42], footR: [-0.08, 0.42, -0.38], kneeL: [0, -1, 0], kneeR: [0, -1, 0] }, RECLAIMER);
  return [...reclaimerBody(body), ...reclaimerKitP(body), ...jetPackP(body), ...sidearmP(body.handR, [20, 0, 0]), ...standP([0, 0.42, -0.05])];
})();

// ---------- Proxima, stage 2 ----------
const proximaDetailed = (() => {
  const body = human({ pelvis: [0, 0.38, 0.05], hips: -35, lean: 8, twist: -50, look: 45, handL: [0.05, 0.7, 0.52], handR: [-0.1, 0.8, -0.38], elbowR: [-0.5, -1, 0], footL: [0.03, 0, 0.42], footR: [-0.04, 0, -0.32], kneeL: [0, 0.3, 1] }, { shoulders: 0.16, bulk: 0.78 });
  const parts = paintBody(body, { hips: "machine", chest: "coat", sleeve: "machine", hand: "machine", thigh: "machine", shin: "coat", foot: "machine", skin: "machine" });
  const shell = [
    ...body.onHead([
      ...paint([plate([[-0.09, 0.05], [-0.03, 0.19], [0.07, 0.07]], 0.022)], "coat"),
      ...paint([box([0.13, 0.035, 0.05], [0, 0.01, 0.085])], "glowCyan"),
    ]),
    ...body.onChest([
      ...paint([ball([0.185, 0.33, 0], [0.08, 0.06, 0.085], 0), ball([-0.185, 0.33, 0], [0.08, 0.06, 0.085], 0)], "coat"),
      ...paint(both([limb([0.07, 0.3, -0.08], [0.16, 0.44, -0.2], 0.035, 0, 4)]), "steel"),
      ...paint([box([0.06, 0.06, 0.012], [0, 0.22, 0.1])], "glowCyan"),
    ]),
  ];
  const blade = gear(place([
    ...paint([limb([0, 0.03, 0], [0, 0.045, 0], 0.045, 0.045, 6)], "machine"),
    ...paint([limb([0, 0.045, 0], [0, 0.34, 0], 0.03, 0.022, 4), limb([0, 0.34, 0], [0, 0.7, 0], 0.022, 0, 4)], "glowCyan"),
  ], { at: body.handL, turn: [84, 0, 0] }));
  return figure([...parts, ...shell, ...blade], 5);
})();

// ---------- Hollowsteel Hunters, stage 2 ----------
const HUNTER = { shoulders: 0.17, bulk: 0.68, hollow: true };
/** A hollow body's paints: hips, the four bars of the open chest, neck, head, then arms and legs as `human()` makes them. */
function hunterBody(b: Human): Part[] {
  const order: Paint[] = ["machine", "ironDark", "steel", "ironDark", "ironDark", "machine", "coat"];
  for (let s = 0; s < 2; s++) order.push("machine", "machine", "coat", "machine", "machine");
  for (let s = 0; s < 2; s++) order.push("machine", "machine", "coat", "machine");
  return b.parts.map((p, i) => ({ ...p, paint: order[i] ?? "machine" }));
}
const forearmBladeP = (at: V3, turn: V3): Part[] => gear(place(paint([plate([[-0.16, 0.05], [0.1, 0.07], [0.56, 0], [0.1, -0.04], [-0.16, -0.03]], 0.034)], "steel"), { at, turn }));
function hunterP(raise: number, crouch: number): Part[] {
  const body = human({ pelvis: [0, 0.46 - crouch, 0], lean: 14 + crouch * 120, twist: -18, look: 14, handL: [0.1, 0.7 - crouch + raise, 0.32], elbowL: [1, -0.6, -0.2], handR: [-0.26, 0.54 - crouch * 0.5, 0.12 + crouch * 2], elbowR: [-1, -0.2, -1], footL: [0.1, 0, 0.24], footR: [-0.11, 0, -0.22] }, HUNTER);
  const shell = [
    ...body.onHead([
      ...paint([plate([[-0.15, 0.11], [-0.03, 0.125], [0.08, 0.06], [-0.05, 0.04]], 0.03)], "coat"),
      ...paint([box([0.13, 0.035, 0.05], [0, 0.01, 0.085])], "glowCyan"),
    ]),
    ...body.onChest([
      ...paint([ball([0, 0.2, 0.01], 0.052, 0)], "glowCyan"),
      ...paint([ball([0.19, 0.33, 0], [0.08, 0.055, 0.085], 0), ball([-0.19, 0.33, 0], [0.08, 0.055, 0.085], 0)], "coat"),
    ]),
  ];
  return [...hunterBody(body), ...shell, ...forearmBladeP(body.handL, [-18 - raise * 110, -8, 0]), ...forearmBladeP(body.handR, [12 - crouch * 120, 10, 0])];
}

// ---------- Marrowcoil, stage 2 ----------
const marrowcoilDetailed = (() => {
  const bones: (readonly [x: number, y: number, z: number, r: number])[] = [];
  const along = 15;
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const r = 0.08 + 0.3 * t ** 0.7;
    bones.push([0.46 * Math.sin(t * Math.PI * 2.6) * (0.35 + 0.65 * t), r + 0.22 * t * (0.5 + 0.5 * Math.sin(t * 9 + 1)), -3.05 + 4.5 * t, r]);
  }
  bones.push([0.2, 0.9, 1.75, 0.36], [0.07, 1.34, 1.85, 0.32], [0, 1.7, 2.09, 0.27]);
  const parts: Part[] = [];
  bones.forEach(([x, y, z, r], i) => {
    const next = bones[i + 1];
    // Dark sinew between bone knuckles, a spine on each in the main colour, and bone ribs.
    if (next) parts.push(...paint([limb([x, y, z], [next[0], next[1], next[2]], r * 0.72, next[3] * 0.72, 6)], "coatDark"));
    parts.push(...paint([ball([x, y, z], [r * 1.15, r * 1.15, r * 0.8], 0)], "bone"), ...paint([limb([x, y + r * 0.8, z], [x, y + r * 2.2, z - r * 0.7], r * 0.42, 0, 4)], "coat"));
    if (i >= 6 && i <= along + 2) {
      for (const side of [1, -1]) parts.push(...paint([limb([x + side * r * 0.7, y + r * 0.2, z], [x + side * r * 1.8, y - r * 0.75, z + r * 0.3], r * 0.34, 0, 4)], "bone"));
    }
  });
  const skull = place([
    ...paint([spine([[-0.24, 0.02, 0.19, 0.17], [0.05, 0.06, 0.24, 0.2], [0.36, -0.02, 0.16, 0.12], [0.6, -0.07, 0.09, 0.06]], { sides: 6 })], "bone"),
    ...paint([spine([[-0.08, -0.17, 0.18, 0.045], [0.28, -0.29, 0.13, 0.04], [0.52, -0.36, 0.07, 0.025]], { sides: 6 })], "bone"),
    ...each(both([limb([0.13, 0.16, -0.1], [0.32, 0.25, -0.58], 0.085, 0, 5), limb([0.1, -0.06, 0.5], [0.1, -0.2, 0.52], 0.03, 0, 4)]), ["coat", "horn"]),
    // Green fire in the eye sockets.
    ...paint([box([0.08, 0.05, 0.08], [0.12, 0.14, 0.3]), box([0.08, 0.05, 0.08], [-0.12, 0.14, 0.3])], "glowGreen"),
  ], { at: [0, 1.8, 2.31], turn: [22, 0, 0], scale: 1.15 });
  return figure([...parts, ...skull], 6);
})();

// ---------- Ghoul Pack, stage 2 ----------
const GHOUL = { shoulders: 0.16, bulk: 0.78 };
const ghoulBody = (b: Human) => paintBody(b, { hips: "coatDark", chest: "ghoul", sleeve: "ghoul", hand: "ghoul", thigh: "ghoul", shin: "ghoul", foot: "ghoul", skin: "ghoul" });
const ghoulKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...paint([box([0.1, 0.045, 0.1], [0, -0.1, 0.04])], "ghoul"),
    ...paint([box([0.08, 0.012, 0.02], [0, -0.078, 0.082])], "bone"),
    ...paint([ball([0, 0.02, -0.03], [HEAD * 0.95, HEAD * 0.9, HEAD * 0.9], 0)], "black"),
  ]),
  ...ghostEyes(body),
  ...body.onChest(paint([limb([0, 0.3, -0.07], [0, 0.34, -0.14], 0.04, 0, 4), limb([0, 0.2, -0.08], [0, 0.23, -0.15], 0.04, 0, 4), limb([0, 0.1, -0.075], [0, 0.12, -0.14], 0.035, 0, 4)], "bone")),
  // A rag round the hips.
  ...place(paint([spine([[0, 0.03, 0.1, 0.075], [0, -0.1, 0.12, 0.09]], { sides: 6 })], "coatDark"), { at: pelvis }),
];
const clawsP = (at: V3, turn: V3): Part[] => place(paint([limb([0.03, 0.01, 0.02], [0.06, 0, 0.15], 0.022, 0, 4), limb([-0.03, 0.01, 0.02], [-0.06, 0, 0.15], 0.022, 0, 4), limb([0, -0.02, 0.02], [0, -0.05, 0.15], 0.022, 0, 4)], "black"), { at, turn });
const ghoulLopingP = (() => {
  const pelvis: V3 = [0, 0.36, 0];
  const body = human({ pelvis, lean: 45, handL: [0.17, 0.3, 0.42], handR: [-0.15, 0.36, 0.38], footL: [0.1, 0, 0.1], footR: [-0.1, 0, -0.25] }, GHOUL);
  return [...ghoulBody(body), ...ghoulKitP(body, pelvis), ...clawsP(body.handL, [20, 0, 0]), ...clawsP(body.handR, [20, 0, 0])];
})();
const ghoulShriekingP = (() => {
  const pelvis: V3 = [0, 0.42, 0];
  const body = human({ pelvis, lean: -8, handL: [0.37, 0.78, 0.12], handR: [-0.37, 0.74, 0.14], elbowL: [1, -0.6, -0.3], elbowR: [-1, -0.6, -0.3], footL: [0.13, 0, 0.05], footR: [-0.12, 0, -0.06] }, GHOUL);
  return [...ghoulBody(body), ...ghoulKitP(body, pelvis), ...clawsP(body.handL, [-50, 30, 0]), ...clawsP(body.handR, [-50, -30, 0])];
})();

// ---------- Orcs: Grubnak and the Ruinmaw Raiders, stage 2 ----------
const orcJaw = (): Part[] => [
  ...paint([box([0.15, 0.06, 0.11], [0, -0.08, 0.035])], "orc"),
  ...paint(both([limb([0.05, -0.065, 0.085], [0.06, -0.005, 0.11], 0.02, 0, 4)]), "horn"),
];
const grubnakDetailed = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human({ pelvis, lean: 8, twist: 10, handR: [-0.36, 1.02, 0.1], elbowR: [-1, -0.3, -0.4], handL: [0.27, 0.56, 0.24], footL: [0.15, 0, 0.1], footR: [-0.15, 0, -0.08] }, { shoulders: 0.23, bulk: 1.35 });
  const parts = paintBody(body, { hips: "pelt", chest: "orc", sleeve: "orc", hand: "orc", thigh: "leather", shin: "orc", foot: "orc", skin: "orc" });
  const headdress = body.onHead([
    ...paint([ball([0, 0.05, -0.01], [HEAD * 1.2, HEAD * 0.95, HEAD * 1.22], 0)], "bone"),
    ...paint([box([0.03, 0.025, 0.012], [0.035, 0.075, 0.1]), box([0.03, 0.025, 0.012], [-0.035, 0.075, 0.1])], "black"),
    ...paint(both([limb([0.08, 0.08, 0], [0.21, 0.2, -0.04], 0.038, 0, 4)]), "horn"),
    ...paint([box([0.024, 0.014, 0.01], [0.032, -0.005, 0.086]), box([0.024, 0.014, 0.01], [-0.032, -0.005, 0.086])], "glowGreen"),
    ...orcJaw(),
  ]);
  const hides = [
    ...body.onChest(paint([spine([[0, 0.375, 0.1, 0.09], [-0.01, 0.31, 0.265, 0.15], [-0.02, 0.23, 0.27, 0.155]], { sides: 8 })], "pelt")),
    ...place(paint([spine([[0, 0.12, 0.16, 0.12], [0, -0.18, 0.22, 0.17]], { sides: 6 })], "coat"), { at: pelvis }),
    ...belt(pelvis, "leather", 0.1, [0.165, 0.125]),
    // The war drum at his left hip, its heads bound in bone.
    ...paint([limb([0.19, 0.44, 0.12], [0.36, 0.5, 0.16], 0.135, 0.135, 8)], "leather"),
    ...paint([limb([0.18, 0.437, 0.118], [0.2, 0.444, 0.122], 0.14, 0.14, 8), limb([0.35, 0.496, 0.158], [0.37, 0.504, 0.162], 0.14, 0.14, 8)], "bone"),
  ];
  const hex = gear(place(paint(([[0, 0.24, 0], [0.16, 0.14, 0.04], [-0.16, 0.14, 0.04], [0, 0.12, 0.18], [0, 0.12, -0.16]] as V3[]).map((d) => limb([d[0] * 0.3, d[1] * 0.3, d[2] * 0.3], d, 0.022, 0, 4)), "glowGreen"), { at: body.handR }));
  const drumstick = gear(paint([limb([body.handL[0], body.handL[1] + 0.04, body.handL[2]], [body.handL[0] + 0.02, body.handL[1] - 0.12, body.handL[2] - 0.06], 0.016, 0.024, 5)], "bone"));
  return figure([...parts, ...headdress, ...hides, ...hex, ...drumstick], 6);
})();
const RAIDER = { shoulders: 0.215, bulk: 1.25 };
function hatchetP(at: V3, turn: V3): Part[] {
  return gear(place([
    ...paint([limb([0, -0.08, 0], [0, 0.28, 0], 0.02, 0.02, 5)], "wood"),
    ...paint([plate([[0.012, 0.27], [0.13, 0.33], [0.155, 0.22], [0.13, 0.12], [0.012, 0.18]], 0.03)], "steel"),
  ], { at, turn }));
}
const raiderBodyP = (b: Human) => paintBody(b, { hips: "pelt", chest: "orc", sleeve: "orc", hand: "orc", thigh: "leather", shin: "orc", foot: "boot", skin: "orc" });
const raiderKitP = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...orcJaw(),
    ...paint(both([limb([0.075, 0.01, -0.01], [0.165, 0.06, -0.05], 0.03, 0, 4)]), "orc"),
    ...paint([plate([[-0.13, 0], [-0.11, 0.15], [-0.02, 0.2], [0.06, 0.15], [0.085, 0.07]], 0.05)], "coat"),
    // Eyes under a stripe of war paint.
    ...paint([box([0.13, 0.03, 0.012], [0, 0.016, 0.084])], "black"),
    ...paint([box([0.022, 0.014, 0.008], [0.032, 0.016, 0.092]), box([0.022, 0.014, 0.008], [-0.032, 0.016, 0.092])], "glow"),
  ]),
  ...body.onChest(paint([ball([0.225, 0.34, 0], [0.13, 0.085, 0.135], 0)], "pelt")),
  ...place([
    ...paint([spine([[0, 0.12, 0.15, 0.112], [0, -0.17, 0.205, 0.158]], { sides: 6 })], "pelt"),
    ...hatchetP([-0.2, 0.1, -0.06], [165, 0, 0]),
  ], { at: pelvis }),
  ...belt(pelvis, "leather", 0.1, [0.155, 0.116]),
];
const raiderHurlingP = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human({ pelvis, lean: 6, twist: -38, look: 32, handR: [-0.3, 0.98, -0.26], elbowR: [-1, 0, -0.5], handL: [0.2, 0.8, 0.36], footL: [0.12, 0, 0.24], footR: [-0.14, 0, -0.2] }, RAIDER);
  return [...raiderBodyP(body), ...raiderKitP(body, pelvis), ...hatchetP(body.handR, [-40, 0, 0])];
})();
const raiderBellowingP = (() => {
  const pelvis: V3 = [0, 0.48, 0];
  const body = human({ pelvis, lean: -8, handR: [-0.34, 0.62, 0.14], elbowR: [-1, -0.3, -0.5], handL: [0.34, 0.66, 0.14], elbowL: [1, -0.3, -0.5], footL: [0.15, 0, 0.06], footR: [-0.15, 0, -0.02] }, RAIDER);
  return [...raiderBodyP(body), ...raiderKitP(body, pelvis), ...hatchetP(body.handR, [0, -65, 24]), ...hatchetP(body.handL, [0, 65, -24])];
})();

// ---------- Morvane the Gravecaller, stage 2 ----------
const morvaneDetailed = (() => {
  const pelvis: V3 = [0, 0.49, 0];
  const body = human({ pelvis, lean: 8, twist: -8, handR: [-0.28, 0.8, 0.16], handL: [0.25, 0.8, 0.24], elbowL: [1, -0.8, -0.2], footL: [0.08, 0, 0.06], footR: [-0.09, 0, -0.03] }, { shoulders: 0.16, bulk: 0.9 });
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "coatDark", hand: "ghoul", thigh: "coat", shin: "coat", foot: "boot", skin: "ghoul" });
  const hoodP = body.onHead([
    ...paint([ball([0, 0.008, -0.014], [HEAD * 1.16, HEAD * 1.2, HEAD * 1.2]), limb([0, 0.05, -0.05], [0, 0.0, -0.19], 0.055, 0, 5)], "coatDark"),
    ...paint([box([0.12, 0.1, 0.008], [0, 0.0, 0.094])], "black"),
    ...paint([box([0.024, 0.016, 0.01], [0.03, 0.012, 0.097]), box([0.024, 0.016, 0.01], [-0.03, 0.012, 0.097])], "glowGreen"),
  ]);
  const robes = [
    ...place([
      ...paint([spine([[0, 0.12, 0.115, 0.085], [0, -0.1, 0.17, 0.13], [-0.02, -0.43, 0.23, 0.185]], { sides: 7 })], "coat"),
      ...paint([20, 110, 200, 290].flatMap((turn) => place([limb([0, -0.36, 0.17], [0, -0.48, 0.24], 0.05, 0, 4)], { turn: [0, turn, 0] })), "coatDark"),
    ], { at: pelvis }),
    ...belt(pelvis, "bone", 0.1, [0.12, 0.09]),
    ...body.onChest(paint([spine([[-0.07, 0.35, 0.13, 0.035], [-0.11, 0.1, 0.18, 0.04], [-0.17, -0.22, 0.2, 0.03]], { sides: 6 })], "coatDark")),
  ];
  const staff = gear([
    ...paint([limb([-0.31, 0, 0.12], [-0.25, 1.22, 0.2], 0.02, 0.018, 5)], "wood"),
    ...paint([ball([-0.245, 1.3, 0.205], [0.075, 0.085, 0.085], 0), box([0.08, 0.04, 0.07], [-0.245, 1.215, 0.225])], "bone"),
    ...paint([box([0.022, 0.02, 0.01], [-0.218, 1.3, 0.288]), box([0.022, 0.02, 0.01], [-0.272, 1.3, 0.288])], "glowGreen"),
  ]);
  const [x, y, z] = body.handL;
  const light = gear(paint([ball([x, y + 0.1, z], 0.055, 0), limb([x, y + 0.11, z], [x + 0.02, y + 0.3, z], 0.045, 0, 5)], "glowGreen"));
  return figure([...parts, ...hoodP, ...robes, ...staff, ...light], 5);
})();

// ---------- Old Rootback, stage 2 ----------
function saplingP(foot: V3, top: V3, size: number): Part[] {
  return [
    ...paint([limb(foot, top, size * 0.3, size * 0.2, 5)], "bark"),
    ...paint([ball([top[0], top[1] + size * 0.45, top[2]], size, 0)], "leaf"),
    ...paint([ball([top[0] - size * 0.6, top[1], top[2] + size * 0.6], size * 0.7, 0), ball([top[0] + size * 0.6, top[1] + size * 0.05, top[2] - size * 0.5], size * 0.7, 0)], "moss"),
  ];
}
const rootbackDetailed = (() => {
  const body = paint([spine([[-1.34, 0.84, 0.14, 0.14], [-1.16, 0.92, 0.46, 0.4], [-0.7, 1.02, 0.66, 0.56], [-0.1, 1.06, 0.7, 0.6], [0.5, 1.02, 0.66, 0.56], [0.92, 0.94, 0.54, 0.46], [1.16, 0.86, 0.42, 0.36]], { sides: 10 })], "fur");
  const shell = paint([spine([[-1.3, 1.1, 0.2, 0.1], [-1.02, 1.2, 0.6, 0.42], [-0.5, 1.26, 0.8, 0.68], [0, 1.28, 0.83, 0.72], [0.5, 1.25, 0.76, 0.6], [0.88, 1.18, 0.5, 0.36], [1.04, 1.12, 0.2, 0.1]], { sides: 10 })], "moss");
  const head = [
    ...paint([spine([[1.0, 0.84, 0.42, 0.38], [1.36, 0.74, 0.4, 0.36], [1.62, 0.62, 0.3, 0.25], [1.76, 0.55, 0.2, 0.15]], { sides: 8 })], "fur"),
    ...paint([spine([[1.0, 1.08, 0.3, 0.1], [1.36, 1.02, 0.36, 0.12], [1.6, 0.86, 0.24, 0.07]], { sides: 6 })], "bark"),
    // Small, deep-set eyes under the brow plate.
    ...paint([box([0.04, 0.05, 0.08], [0.375, 0.86, 1.38]), box([0.04, 0.05, 0.08], [-0.375, 0.86, 1.38])], "glowGreen"),
  ];
  const tusks = each(both([limb([0.27, 0.54, 1.42], [0.42, 0.3, 1.74], 0.11, 0.09, 6), limb([0.42, 0.3, 1.74], [0.37, 0.6, 1.94], 0.09, 0, 6)]), ["horn"]);
  const legs = paint(both([limb([0.46, 0.8, 0.7], [0.55, 0.4, 0.82], 0.3, 0.26, 7), limb([0.55, 0.4, 0.82], [0.55, 0, 0.82], 0.26, 0.3, 7), limb([0.46, 0.8, -0.74], [0.56, 0.42, -0.88], 0.31, 0.26, 7), limb([0.56, 0.42, -0.88], [0.56, 0, -0.88], 0.26, 0.3, 7)]), "fur");
  // Toenails at the front of each foot.
  const nails = paint(both([box([0.2, 0.08, 0.06], [0.55, 0.04, 1.11]), box([0.2, 0.08, 0.06], [0.56, 0.04, -0.59])]), "horn");
  const tail = paint([spine([[-1.3, 0.88, 0.14, 0.14], [-1.5, 0.72, 0.09, 0.09], [-1.6, 0.5, 0.03, 0.03]], { sides: 5 })], "fur");
  const saplings = [...saplingP([0.05, 1.9, -0.1], [0.1, 2.32, -0.04], 0.2), ...saplingP([-0.32, 1.74, 0.46], [-0.4, 2.06, 0.52], 0.15), ...saplingP([0.16, 1.78, -0.66], [0.2, 2.04, -0.74], 0.13)];
  // Ferns and stones on the shell.
  const growth = [
    ...paint([ball([0.45, 1.62, 0.3], [0.16, 0.08, 0.14], 0), ball([-0.5, 1.6, -0.35], [0.14, 0.07, 0.16], 0)], "leaf"),
    ...paint([ball([-0.2, 1.68, -0.1], [0.1, 0.07, 0.09], 0)], "ironDark"),
  ];
  // At high quality: ridges of bark across the shell, moss hanging from its rim, mushrooms, and flowers
  // among the saplings.
  const SHELL: [number, number, number, number][] = [[-0.5, 1.26, 0.8, 0.68], [0, 1.28, 0.83, 0.72], [0.5, 1.25, 0.76, 0.6]];
  const finery = fine([
    ...paint(SHELL.flatMap(([z, y, rx, rn]) => {
      const pts: V3[] = Array.from({ length: 7 }, (_, i) => { const t = Math.PI * (0.15 + (0.7 * i) / 6); return [Math.cos(t) * rx * 1.01, y + Math.sin(t) * rn * 1.01, z]; });
      return pts.slice(1).map((p, i) => limb(pts[i]!, p, 0.03, 0.03, 4));
    }), "bark"),
    ...paint(SHELL.flatMap(([z, y, rx]) => ([1, -1] as const).map((sx) => limb([sx * rx * 0.98, y + 0.05, z], [sx * rx * 1.0, y - 0.25, z + 0.04], 0.03, 0.01, 4))), "moss"),
    ...paint([ball([0.55, 1.52, 0.6], [0.08, 0.035, 0.08], 0), ball([0.48, 1.5, 0.72], [0.06, 0.03, 0.06], 0), ball([-0.6, 1.5, -0.6], [0.07, 0.03, 0.07], 0)], "shell"),
    ...paint(([[0.25, 1.75, 0.35], [-0.1, 1.8, -0.35], [0.4, 1.7, -0.2], [-0.4, 1.72, 0.2], [0.05, 1.85, 0.5]] as V3[]).map((p) => ball(p, 0.05, 0)), "flower"),
  ]);
  return figure([...body, ...shell, ...head, ...tusks, ...legs, ...nails, ...tail, ...saplings, ...growth, ...finery], 9);
})();

// ---------- Briar Sprites and Queen Ilyth, stage 2 ----------
const SPRITE = { shoulders: 0.135, bulk: 0.75 };
function faeP(hands: { handL: V3; handR: V3; elbowR?: V3 }, build: { shoulders: number; bulk: number }): { body: Human; parts: Part[] } {
  const pelvis: V3 = [0, 0.75, 0];
  const body = human({ pelvis, lean: 6, ...hands, footL: [0.04, 0.3, 0.04], footR: [-0.05, 0.37, -0.05] }, build);
  const wing = place([
    ...paint([plate([[0.03, 1.12], [0.28, 1.4], [0.56, 1.44], [0.62, 1.24], [0.4, 1.08], [0.1, 1.02]], 0.022, "front")], "faeWing"),
    ...paint([plate([[0.03, 1.02], [0.36, 1.0], [0.52, 0.8], [0.34, 0.68], [0.1, 0.86]], 0.022, "front")], "faeWing"),
    // A vein along each wing.
    ...paint([plate([[0.05, 1.1], [0.5, 1.38], [0.52, 1.35], [0.07, 1.07]], 0.03, "front"), plate([[0.05, 0.99], [0.44, 0.84], [0.44, 0.81], [0.06, 0.96]], 0.03, "front")], "coat"),
    // At high quality: finer veins branching off, and a dot of colour near each wing's tip.
    ...fine([
      ...paint([[0.25, 1.22, 0.36, 1.42], [0.3, 1.25, 0.55, 1.26], [0.22, 0.92, 0.34, 0.7], [0.25, 0.91, 0.48, 0.92]].map(([x1, y1, x2, y2]) => limb([x1!, y1!, 0.016], [x2!, y2!, 0.016], 0.006, 0.004, 3)), "coat"),
      ...paint([ball([0.5, 1.33, 0.016], [0.035, 0.035, 0.008], 0), ball([0.4, 0.8, 0.016], [0.03, 0.03, 0.008], 0)], "coatDark"),
    ]),
  ], { at: [0, 0, -0.08], turn: [0, 20, 0] });
  const parts = paintBody(body, { hips: "coat", chest: "coat", sleeve: "skin", hand: "skin", thigh: "skin", shin: "skin", foot: "skin" });
  const petals = place([
    ...paint([spine([[0, 0.1, 0.1, 0.08], [0, -0.15, 0.21, 0.18]], { sides: 6 })], "coat"),
    ...paint([spine([[0, -0.12, 0.2, 0.17], [0, -0.15, 0.215, 0.185]], { sides: 6 })], "leaf"),
  ], { at: pelvis });
  // At high quality: antennae tipped with light, a flower in the hair, and a second ring of petals.
  const finery = fine([
    ...body.onHead([
      ...paint(([1, -1] as const).map((sx) => limb([sx * 0.03, 0.08, 0.03], [sx * 0.08, 0.21, 0.09], 0.006, 0.004, 3)), "black"),
      ...paint(([1, -1] as const).map((sx) => ball([sx * 0.08, 0.215, 0.09], 0.014, 0)), "glowGreen"),
      ...paint([ball([0.075, 0.05, 0.03], 0.024, 0)], "flower"),
    ]),
    ...place(paint([spine([[0, -0.17, 0.23, 0.2], [0, -0.2, 0.24, 0.21]], { sides: 7 })], "leaf"), { at: pelvis }),
  ]);
  return { body, parts: [...parts, ...face(body, "hairLight"), ...wardenEars(body), ...wing, ...mirror(wing), ...petals, ...standP([0, 0.7, -0.05]), ...finery] };
}
const thornP = (at: V3, turn: V3): Part[] => gear(place(paint([limb([0, -0.03, 0], [0, 0.18, 0], 0.022, 0, 4)], "bark"), { at, turn }));
const spriteThrowingP = (() => {
  const sprite = faeP({ handL: [0.24, 1.0, 0.22], handR: [-0.28, 1.3, -0.08], elbowR: [-1, -0.2, -0.6] }, SPRITE);
  return [...sprite.parts, ...thornP(sprite.body.handR, [40, 0, 0])];
})();
const spriteHoveringP = (() => {
  const sprite = faeP({ handL: [0.28, 0.95, 0.14], handR: [-0.28, 0.95, 0.14] }, SPRITE);
  return [...sprite.parts, ...thornP(sprite.body.handL, [70, 0, -20]), ...thornP(sprite.body.handR, [70, 0, 20])];
})();
const ilythDetailed = (() => {
  const queen = faeP({ handL: [0.28, 1.08, 0.25], handR: [-0.26, 0.9, 0.05] }, { shoulders: 0.14, bulk: 0.8 });
  const crown = queen.body.onHead([
    ...paint([limb([0, 0.05, 0], [0, 0.085, 0], 0.092, 0.098, 8)], "bark"),
    ...paint([0, 60, 120, 180, 240, 300].flatMap((turn) => place([limb([0, 0.08, 0.088], [0, 0.17, 0.11], 0.022, 0, 4)], { turn: [0, turn, 0] })), "sash"),
  ]);
  const burst = gear(place(paint(([[0, 0, 0.24], [0.14, 0.11, 0.16], [-0.14, 0.11, 0.16], [0, 0.2, 0.12], [0.12, -0.12, 0.16], [-0.12, -0.12, 0.16]] as V3[]).map((d) => limb([d[0] * 0.3, d[1] * 0.3, d[2] * 0.3], d, 0.02, 0, 4)), "glowGreen"), { at: queen.body.handL }));
  // At high quality: a glowing jewel on each spike of her crown, and a gold torc at her throat.
  const finery = fine([
    ...queen.body.onHead(paint([0, 60, 120, 180, 240, 300].map((turn) => place([ball([0, 0.175, 0.112], 0.016, 0)], { turn: [0, turn, 0] })[0]!), "glowGreen")),
    ...queen.body.onChest(place(hoopRing(0.07, 0.37, "gold", 0.009, 10), { at: [0, 0, 0] })),
  ]);
  return figure([...queen.parts, ...crown, ...burst, ...finery], 4);
})();

export const DETAILED_MODELS: Readonly<Record<string, UnitModel>> = {
  "marisol-vance": { figures: [vanceDetailed] },
  "concord-fusiliers": { figures: fusiliersDetailed },
  "lady-asagiri": { figures: [asagiriDetailed] },
  "crimson-lotus-guard": { figures: lotusDetailed },
  cinderjaw: { figures: [cinderjawDetailed] },
  "duskfang-prowlers": { figures: prowlersDetailed },
  "nexus-reclaimers": { figures: squad([reclaimerAimingP, reclaimerAdvancingP], 5) },
  "siege-walker-atlas": { figures: [atlasDetailed] },
  "barrow-legion": { figures: squad([legionGuardingP, legionLungingP], 5) },
  vorhal: { figures: [vorhalDetailed] },
  "dame-rowena": { figures: [rowenaDetailed] },
  "stormwake-huscarls": { figures: squad([huscarlStrikingP, huscarlRestingP], 5) },
  "gatewarden-pikemen": { figures: squad([pikemanGuardingP, pikemanBracedP], 5) },
  "sister-maren": { figures: [marenDetailed] },
  "teppo-gunners": { figures: squad([teppoGunnerP(false), teppoGunnerP(true)], 5) },
  "glade-wardens": { figures: squad([wardenLoosingP, wardenWatchingP], 5) },
  "harrow-riflemen": { figures: squad([riflemanAimingP, riflemanReadyP], 5) },
  brannock: { figures: [brannockDetailed] },
  "shirokage-ronin": { figures: squad([roninP(true), roninP(false)], 5) },
  kenzo: { figures: [kenzoDetailed] },
  "mossback-treefolk": { figures: squad([treefolkP(0), treefolkP(1)], 8) },
  sylvanne: { figures: [sylvanneDetailed] },
  "sentinel-k7": { figures: [sentinelDetailed] },
  "nexus-breachers": { figures: squad([breacherClosingP, breacherChargedP], 5) },
  "bonebow-archers": { figures: squad([bonebowLoosingP, bonebowNockingP], 5) },
  "covenant-crossbowmen": { figures: squad([crossbowmanAimingP, crossbowmanMarchingP], 5) },
  "brass-hussars": { figures: squad([hussarP(GALLOP, [-0.27, 0.89 * MOUNT + 0.64, 0.16], [30, 0, 14]), hussarP(TROT, [-0.28, 0.89 * MOUNT + 0.46, 0.26], [48, 0, 10])], 6) },
  "concord-grenadiers": { figures: squad([grenadierLobbingP, grenadierLightingP], 5) },
  solenne: { figures: [solenneDetailed] },
  "orrin-vael": { figures: [orrinDetailed] },
  "silverlance-knights": { figures: squad([knightAtAttentionP, knightChargingP], 5) },
  "dawn-acolytes": { figures: squad([acolyteSingingP, acolyteBlessingP], 5) },
  "sunbound-archers": { figures: squad([sunboundLoosingP, sunboundWaitingP], 5) },
  "hollow-reed-shinobi": { figures: squad([shinobiCrouchedP, shinobiBlowpipeP], 4) },
  "ashfang-oni": { figures: [oniDetailed] },
  "lady-suzume": { figures: [suzumeDetailed] },
  "swarmling-drones": { figures: squad([droneP(0, 0.04), droneP(18, 0), droneP(-14, -0.06)], 3) },
  "skyhook-raiders": { figures: squad([raiderHoveringP, raiderSwoopingP], 5) },
  proxima: { figures: [proximaDetailed] },
  "hollowsteel-hunters": { figures: squad([hunterP(0.2, 0), hunterP(0, 0.08)], 5) },
  marrowcoil: { figures: [marrowcoilDetailed] },
  "ghoul-pack": { figures: squad([ghoulLopingP, ghoulShriekingP], 4) },
  grubnak: { figures: [grubnakDetailed] },
  morvane: { figures: [morvaneDetailed] },
  "ruinmaw-raiders": { figures: squad([raiderHurlingP, raiderBellowingP], 6) },
  "old-rootback": { figures: [rootbackDetailed] },
  "queen-ilyth": { figures: [ilythDetailed] },
  "briar-sprites": { figures: squad([spriteThrowingP, spriteHoveringP], 3) },
  // The Sunken Hive builds both looks from one set of poses (`units/hive.ts`).
  ...HIVE_DETAILED,
};
