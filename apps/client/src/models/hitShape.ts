import { HIT_BOX_NUMBERS } from "@aoh/rules";
import type { FigureModel, Part } from "./types";

/**
 * A model's hit shape, for games with hit zones: one box round each part. Body parts become body
 * boxes, which can be hit; gear and flight stands become gear boxes, which only block the view.
 * The base, and the details drawn only at High, are left out. The rules read the result as data
 * (`hitShapes.json` in `@aoh/content`), written by `test/hitShapes.test.ts`; see docs/CONTENT.md.
 */

type Vec = [number, number, number];

/** Parts smaller than this (in cubic world units) are left out: an eye or a button changes nothing. */
const SMALLEST = 2e-6;

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The eigenvectors of a symmetric 3 by 3 matrix (Jacobi), as the columns of a turn. */
function eigenvectors(m: number[][]): Vec[] {
  const a = m.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 24; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p]![q]! ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++) {
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p]![q]!) < 1e-15) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * a[p]![q]!);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return [0, 1, 2].map((j) => norm([v[0]![j]!, v[1]![j]!, v[2]![j]!]));
}

/** A right-handed set of axes from a first one and a hint for the second. */
function frameFrom(first: Vec, hint: Vec): Vec[] | null {
  const u = norm(first);
  const w = cross(u, hint);
  if (Math.hypot(...w) < 1e-6) return null;
  const wn = norm(w);
  return [u, cross(wn, u), wn];
}

export interface ModelBox {
  readonly kind: "body" | "gear";
  readonly centre: Vec;
  readonly half: Vec;
  /** The box's own directions, right-handed. */
  readonly axes: readonly [Vec, Vec, Vec];
}

/** The smallest of a few candidate boxes round a part's corners. */
export function partBox(part: Part): ModelBox | null {
  const t = part.tris;
  const points: Vec[] = [];
  for (let i = 0; i < t.length; i += 3) points.push([t[i]!, t[i + 1]!, t[i + 2]!]);
  if (points.length === 0) return null;
  const mean: Vec = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) mean[k]! += p[k]! / points.length;
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of points) {
    const d = sub(p, mean);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cov[r]![c]! += d[r]! * d[c]!;
  }
  const candidates: Vec[][] = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
  ];
  const pca = eigenvectors(cov);
  const pf = frameFrom(pca[0]!, pca[1]!);
  if (pf) candidates.push(pf);
  // The flat faces of the part: a box sits best along its biggest faces and their edges.
  const faces: { area: number; normal: Vec; edge: Vec }[] = [];
  for (let i = 0; i < t.length; i += 9) {
    const a: Vec = [t[i]!, t[i + 1]!, t[i + 2]!];
    const b: Vec = [t[i + 3]!, t[i + 4]!, t[i + 5]!];
    const c: Vec = [t[i + 6]!, t[i + 7]!, t[i + 8]!];
    const n = cross(sub(b, a), sub(c, a));
    const area = Math.hypot(...n);
    if (area < 1e-12) continue;
    const edges = [sub(b, a), sub(c, b), sub(a, c)].sort((x, y) => Math.hypot(...y) - Math.hypot(...x));
    faces.push({ area, normal: norm(n), edge: edges[0]! });
  }
  faces.sort((x, y) => y.area - x.area);
  for (const f of faces.slice(0, 6)) {
    const fr = frameFrom(f.edge, f.normal);
    if (fr) candidates.push(fr);
  }
  let best: ModelBox | null = null;
  let bestVolume = Infinity;
  for (const axes of candidates) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const p of points) {
      for (let k = 0; k < 3; k++) {
        const d = dot(p, axes[k]!);
        lo[k] = Math.min(lo[k]!, d);
        hi[k] = Math.max(hi[k]!, d);
      }
    }
    const half: Vec = [0, 1, 2].map((k) => Math.max(0.004, (hi[k]! - lo[k]!) / 2)) as Vec;
    const volume = half[0] * half[1] * half[2];
    if (volume >= bestVolume - 1e-12) continue;
    const mid = [0, 1, 2].map((k) => (hi[k]! + lo[k]!) / 2);
    const centre: Vec = [0, 1, 2].map((j) => mid[0]! * axes[0]![j]! + mid[1]! * axes[1]![j]! + mid[2]! * axes[2]![j]!) as Vec;
    bestVolume = volume;
    best = { kind: part.role === "body" ? "body" : "gear", centre, half, axes: [axes[0]!, axes[1]!, axes[2]!] };
  }
  return best;
}

/** A model's boxes: its body, gear and flight stand parts, without its base or details drawn only at High. */
export function modelBoxes(model: FigureModel): ModelBox[] {
  const boxes: ModelBox[] = [];
  for (const part of model.parts) {
    if (part.high || (part.role !== "body" && part.role !== "gear" && part.role !== "stand")) continue;
    const box = partBox(part);
    if (box && 8 * box.half[0] * box.half[1] * box.half[2] >= SMALLEST) boxes.push(box);
  }
  return boxes;
}

/** The rotation (x, y, z, w) that turns the world axes onto a box's axes. */
function quaternion(axes: readonly [Vec, Vec, Vec]): [number, number, number, number] {
  const [u, v, w] = axes;
  // The matrix has the axes as its columns.
  const m00 = u[0], m01 = v[0], m02 = w[0];
  const m10 = u[1], m11 = v[1], m12 = w[1];
  const m20 = u[2], m21 = v[2], m22 = w[2];
  const trace = m00 + m11 + m22;
  let x: number, y: number, z: number, s: number;
  if (trace > 0) {
    const r = Math.sqrt(trace + 1) * 2;
    s = r / 4;
    x = (m21 - m12) / r;
    y = (m02 - m20) / r;
    z = (m10 - m01) / r;
  } else if (m00 > m11 && m00 > m22) {
    const r = Math.sqrt(1 + m00 - m11 - m22) * 2;
    s = (m21 - m12) / r;
    x = r / 4;
    y = (m01 + m10) / r;
    z = (m02 + m20) / r;
  } else if (m11 > m22) {
    const r = Math.sqrt(1 + m11 - m00 - m22) * 2;
    s = (m02 - m20) / r;
    x = (m01 + m10) / r;
    y = r / 4;
    z = (m12 + m21) / r;
  } else {
    const r = Math.sqrt(1 + m22 - m00 - m11) * 2;
    s = (m10 - m01) / r;
    x = (m02 + m20) / r;
    y = (m12 + m21) / r;
    z = r / 4;
  }
  // One sign for each turn, so the stored numbers are always the same.
  const sign = s < 0 || (s === 0 && (x < 0 || (x === 0 && (y < 0 || (y === 0 && z < 0))))) ? -1 : 1;
  return [x * sign, y * sign, z * sign, s * sign];
}

/** A model's hit shape in the stored form the rules read (`decodeHitShape`): whole thousandths, half sizes rounded up. */
export function encodeModel(model: FigureModel): number[] {
  const out: number[] = [];
  for (const box of modelBoxes(model)) {
    const q = quaternion(box.axes);
    out.push(
      box.kind === "body" ? 0 : 1,
      ...box.centre.map((n) => Math.round(n * 1000)),
      ...box.half.map((n) => Math.ceil(n * 1000 - 1e-6)),
      ...q.map((n) => Math.round(n * 1000)),
    );
  }
  if (out.length % HIT_BOX_NUMBERS !== 0) throw new Error("A hit box has the wrong count of numbers");
  return out;
}
