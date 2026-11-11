/**
 * Balance checks for map pieces. A piece (or a run of pieces joined side by
 * side, such as a bridge) stays up when its centre of mass sits over the area
 * between the points it rests on. Points are flat (x, z) world positions.
 */

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

const EPS = 1e-6;

function cross(o: Point2, a: Point2, b: Point2): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

function dedupe(points: readonly Point2[]): Point2[] {
  const out: Point2[] = [];
  for (const p of points) {
    if (!out.some((q) => Math.abs(q.x - p.x) < EPS && Math.abs(q.z - p.z) < EPS)) out.push(p);
  }
  return out;
}

/** Convex hull, counter-clockwise, without collinear points. */
export function convexHull(points: readonly Point2[]): Point2[] {
  const pts = dedupe(points).sort((a, b) => a.x - b.x || a.z - b.z);
  if (pts.length < 3) return pts;
  const half = (list: Point2[]) => {
    const h: Point2[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(h[h.length - 2]!, h[h.length - 1]!, p) <= EPS) h.pop();
      h.push(p);
    }
    return h;
  };
  const lower = half(pts);
  const upper = half([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Is `p` inside the convex hull of `points`, or on its edge? A hull of 2 points is a segment. */
export function overHull(p: Point2, points: readonly Point2[]): boolean {
  const pts = dedupe(points);
  if (pts.length === 0) return false;
  if (pts.length === 1) return Math.abs(pts[0]!.x - p.x) < EPS && Math.abs(pts[0]!.z - p.z) < EPS;
  const hull = convexHull(pts);
  if (hull.length < 3) {
    // All points on one line: the centre must lie on the segment between the end points.
    const ends = [...pts].sort((a, b) => a.x - b.x || a.z - b.z);
    const a = ends[0]!;
    const b = ends[ends.length - 1]!;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (Math.abs(cross(a, b, p)) / len > EPS) return false;
    const t = ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z)) / (len * len);
    return t >= -EPS && t <= 1 + EPS;
  }
  for (let i = 0; i < hull.length; i++) {
    if (cross(hull[i]!, hull[(i + 1) % hull.length]!, p) < -EPS) return false;
  }
  return true;
}

/**
 * Does a body made of `cells` (hex centres) stay up on these contact points?
 * A body of more than one hex needs at least 2 contact points, and its centre
 * of mass (the average of its hex centres) must sit over the area, or on the
 * line, between them.
 */
export function isBalanced(cells: readonly Point2[], contacts: readonly Point2[]): boolean {
  if (cells.length === 0) return true;
  const distinct = dedupe(contacts);
  if (distinct.length < (cells.length > 1 ? 2 : 1)) return false;
  const centre = {
    x: cells.reduce((n, c) => n + c.x, 0) / cells.length,
    z: cells.reduce((n, c) => n + c.z, 0) / cells.length,
  };
  return overHull(centre, distinct);
}
