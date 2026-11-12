import type { Drawing, Figure, Part, Placed, Role } from "./types";

/** Helpers for drawing figures from points instead of hand-written paths. */

export type P = readonly [number, number];

const n = (v: number) => Math.round(v * 10) / 10;
const at = (p: P) => `${n(p[0])},${n(p[1])}`;

/** A closed polygon. */
export const pts = (...points: P[]) => `M${points.map(at).join(" L")} Z`;

/** An open line through the points, for detail lines. */
export const line = (...points: P[]) => `M${points.map(at).join(" L")}`;

/** A circle. */
export const disc = (c: P, r: number) => `M${n(c[0] - r)},${n(c[1])} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;

/** A limb or shaft from `a` to `b`, `wa` wide at the start and `wb` at the end. */
export function limb(a: P, b: P, wa: number, wb: number = wa): string {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len / 2;
  const ny = dx / len / 2;
  return pts([a[0] + nx * wa, a[1] + ny * wa], [b[0] + nx * wb, b[1] + ny * wb], [b[0] - nx * wb, b[1] - ny * wb], [a[0] - nx * wa, a[1] - ny * wa]);
}

/** The point a share `t` of the way from `a` to `b`. */
export const along = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

export const part = (role: Role, d: string, lines?: string): Part => (lines ? { role, d, lines } : { role, d });

/** An arm: upper arm, forearm and hand. */
export function arm(shoulder: P, elbow: P, hand: P, sleeve: Role, opts: { fore?: Role; hand?: Role; w?: number } = {}): Part[] {
  const w = opts.w ?? 9;
  return [
    part(sleeve, limb(shoulder, elbow, w, w - 1)),
    part(opts.fore ?? sleeve, limb(elbow, hand, w - 1, w - 2.5)),
    part(opts.hand ?? "skin", disc(hand, w * 0.55)),
  ];
}

/** A leg: thigh, shin and foot. `toe` is -1 for a foot pointing left, 1 for right, 0 for straight on. */
export function leg(hip: P, knee: P, foot: P, thigh: Role, shin: Role, opts: { toe?: number; w?: number; boot?: Role } = {}): Part[] {
  const w = opts.w ?? 12;
  const toe = opts.toe ?? 0;
  const [fx, fy] = foot;
  const half = w / 2 - 0.5;
  return [
    part(thigh, limb(hip, knee, w, w - 2)),
    part(shin, limb(knee, foot, w - 2, w - 3.5)),
    part(opts.boot ?? shin, pts([fx - half, fy - 3], [fx + half, fy - 3], [fx + half + (toe > 0 ? 10 : 2), 244], [fx - half - (toe < 0 ? 10 : 2), 244])),
  ];
}

/** A torso between the shoulders and the hips. */
export function torso(shL: P, shR: P, hipL: P, hipR: P, role: Role, lines?: string): Part {
  return part(role, pts([shL[0] - 3, shL[1] - 3], [shR[0] + 3, shR[1] - 3], [hipR[0] + 5, hipR[1] + 2], [hipL[0] - 5, hipL[1] + 2]), lines);
}

/** A belt across the hips. */
export function belt(hipL: P, hipR: P, role: Role = "sash"): Part {
  return part(role, pts([hipL[0] - 5.5, hipL[1] - 7], [hipR[0] + 5.5, hipR[1] - 7], [hipR[0] + 6, hipR[1] + 2.5], [hipL[0] - 6, hipL[1] + 2.5]));
}

/** A head with eyes: `look` is -1 for a head turned left, 1 for right, 0 for facing us. */
export function head(c: P, look = 0, r = 11): Part {
  const [x, y] = c;
  const eyes = look === 0 ? `${line([x - 6, y - 1], [x - 2, y - 1])} ${line([x + 2, y - 1], [x + 6, y - 1])}` : line([x + look * 8, y - 1.5], [x + look * 3.5, y - 1.5]);
  return part("skin", disc(c, r), eyes);
}

/** Joints for a soldier kneeling side-on and aiming a long gun to the left. */
export const KNEELING_AIM = {
  head: [102, 98],
  shL: [90, 122],
  shR: [114, 120],
  hipL: [98, 176],
  hipR: [116, 176],
  kneeL: [76, 192],
  footL: [78, 238],
  kneeR: [128, 234],
  footR: [152, 239],
  elbowL: [76, 134],
  handL: [62, 116],
  elbowR: [126, 140],
  handR: [102, 120],
  stock: [124, 118],
  grip: [68, 114],
  breech: [94, 113.5],
  muzzle: [26, 109.5],
} as const satisfies Record<string, P>;

/** Joints for a soldier standing side-on and aiming a long gun to the left. */
export const STANDING_AIM = {
  head: [106, 62],
  shL: [92, 87],
  shR: [118, 85],
  hipL: [92, 146],
  hipR: [114, 146],
  kneeL: [84, 194],
  footL: [76, 238],
  kneeR: [118, 194],
  footR: [126, 238],
  elbowL: [78, 100],
  handL: [64, 82],
  elbowR: [129, 105],
  handR: [106, 87],
  stock: [128, 84],
  grip: [72, 80],
  breech: [98, 79.5],
  muzzle: [30, 75.5],
} as const satisfies Record<string, P>;

/** Either aiming stance. */
export type AimStance = Record<keyof typeof STANDING_AIM, P>;

/**
 * A drawing of one figure. A figure that reaches far to either side gives its
 * `span`, the leftmost and rightmost x it draws to, so that it is moved or
 * shrunk to fit the narrow window of the Advanced side (x from 42 to 198).
 */
export const solo = (figure: Figure, span?: readonly [number, number]): Drawing => {
  const wide = [{ figure, dx: 0, dy: 0, scale: 1 }];
  if (!span || (span[0] >= 42 && span[1] <= 198)) return { tall: wide, wide };
  const room = 156;
  const scale = Math.min(1, room / (span[1] - span[0]));
  const dx = 42 - span[0] * scale + (room - (span[1] - span[0]) * scale) / 2;
  return { tall: [{ figure, dx, dy: 244 * (1 - scale), scale }], wide };
};

/** A figure standing with the middle of its box at `centre` and its feet at `feet`. */
const stand = (figure: Figure, centre: number, feet: number, scale: number): Placed => ({
  figure,
  dx: centre - 100 * scale,
  dy: feet - (figure.bottom + (figure.hover ?? 0)) * scale,
  scale,
});

/** Where a figure stands: the x of its box's middle, the y of its feet, and its scale. */
export type Spot = readonly [centre: number, feet: number, scale: number];

/** Where the figures of a squad stand, back to front. */
const TALL: Record<number, readonly Spot[]> = {
  2: [[90, 150, 0.7], [128, 246, 0.8]],
  3: [[96, 140, 0.62], [152, 190, 0.66], [102, 246, 0.74]],
  4: [[118, 112, 0.54], [80, 162, 0.6], [156, 180, 0.62], [106, 246, 0.7]],
};
const WIDE: Record<number, readonly Spot[]> = {
  2: [[20, 232, 0.9], [130, 244, 0.95]],
  3: [[-4, 235, 0.8], [86, 229, 0.8], [148, 244, 0.9]],
  4: [[-22, 230, 0.68], [40, 238, 0.7], [100, 226, 0.7], [152, 244, 0.78]],
};

/**
 * A squad's drawing: the figures in a column for the tall arrangement and in a
 * row for the wide one. Give them back to front; the last is nearest. Figures of
 * an unusual shape, such as beasts, can give their own spots for either.
 */
export function squad(figures: readonly Figure[], own: { tall?: readonly Spot[]; wide?: readonly Spot[] } = {}): Drawing {
  const place = (spots: readonly Spot[] | undefined) =>
    figures.map((figure, i) => {
      const [centre, feet, scale] = spots?.[i] ?? [100, 244, 0.7];
      return stand(figure, centre, feet, scale);
    });
  return { tall: place(own.tall ?? TALL[figures.length]), wide: place(own.wide ?? WIDE[figures.length]) };
}
