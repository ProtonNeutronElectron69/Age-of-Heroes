import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import { HEX_SIZE, HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS, hex, hexKey, hexToWorld, shapeFrame, type Footprint, type HitShape, type Step } from "@aoh/rules";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { BoxGeometry, BufferGeometry, Color, ExtrudeGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, Shape, ShapeGeometry, Vector3, type Group, type Mesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BASE_COLOR, BASE_RADIUS, UNIT_MODELS, baseFrame, baseGeometry, bakedGeometry, figureColors, seedOf, unitModel, withGround, type BakedFigure, type FigureModel, type PaintContext } from "../models";
import { useReducedMotion } from "../motion";
import { useDisplay, useGraphics } from "../settings";
import { useBoardActivity } from "./activity";
import { REACTION_SECONDS, reactionPose, type ReactionKind } from "./reactions";
import { useWake } from "./wake";
import { factionTheme } from "../ui/factionThemes";

export interface FigureView {
  readonly id: string;
  /** The unit card, which picks the figure model. */
  readonly cardId: string;
  readonly footprint: Footprint;
  readonly faction: string;
  /** The owning player: a figure faces the nearest figure of another player. */
  readonly owner: string;
  /** The figure's place in its unit; a squad's figures take its model's poses in turn. */
  readonly pose: number;
  /** Every hex the figure covers, front first. */
  readonly spots: readonly Step[];
  readonly height: number;
  /** The owning player's colour. */
  readonly color: string;
  readonly label: string;
  readonly hero: boolean;
  /** Visual state. */
  readonly status: "idle" | "ready" | "selected" | "spent" | "target";
  /** Life left, shown for figures with more than 1 Life. */
  readonly lifeLeft?: number;
  /** Show a floating, spinning arrow above the figure (the figure chosen to act). */
  readonly arrow?: boolean;
  /**
   * Which way the figure faces, in degrees turned from +z towards +x (games with facing).
   * Without it, a single-hex figure faces the nearest enemy.
   */
  readonly facing?: number;
  /** Show the outline of the figure's front cone: it may still be turned (R). */
  readonly cone?: boolean;
  /**
   * Its hit shape, in games with hit zones: the token view draws these boxes, its body in its
   * colour and its gear grey, turned the way the figure faces, as line of sight sees it.
   */
  readonly hitShape?: HitShape;
}

/** Figures that moved with the last command; a new `key` sets them hopping along their paths. */
export interface FigureMotions {
  readonly key: number;
  readonly moves: readonly { readonly figureId: string; readonly from: Step; readonly path: readonly Step[] }[];
}

/** A figure picked up by the pointer: it hangs over `to`, or over its own hex. Once let go it settles there. */
export interface FigureCarry {
  readonly id: string;
  /** Where the figure stands. */
  readonly from: Step;
  readonly to: Step | null;
  readonly held: boolean;
}

/**
 * Where the chosen figure would end up if it moved to the hovered hex: a see-through copy of it
 * there, turned the way the move leaves it, with its front cone in games with facing.
 */
export interface FigurePreview {
  /** The figure that would move; its look, not its place. */
  readonly figure: FigureView;
  /** Every hex it would cover, front first. */
  readonly spots: readonly Step[];
  /** The way it would face, in degrees (as `FigureView.facing`). */
  readonly facing: number;
  /** Draw the front cone (games with facing). */
  readonly cone: boolean;
}

/** Figures to jump on the spot, so they are easy to find; a new `key` starts a jump. */
export interface FigureJump {
  readonly key: number;
  readonly ids: readonly string[];
}

/** Figures to shake on the spot (a destroyed figure, just before it leaves the board); a new `key` starts a shake. */
export type FigureShake = FigureJump;

/**
 * Reactions in a fight (high graphics quality): a new `key` starts each listed figure's. The
 * direction is across the board: toward the target for a lunge or a kick, away from the attacker
 * for a recoil or a topple. A toppled figure stays down until it leaves the board.
 */
export interface FigureReactions {
  readonly key: number;
  readonly list: readonly { readonly id: string; readonly kind: ReactionKind; readonly dir: { readonly x: number; readonly z: number } }[];
}

interface Props {
  figures: readonly FigureView[];
  onClick?: (id: string) => void;
  onHover?: (id: string | null) => void;
  motions?: FigureMotions | null;
  jump?: FigureJump | null;
  shake?: FigureShake | null;
  reactions?: FigureReactions | null;
  carry?: FigureCarry | null;
  /** Figures the pointer may pick up and drag. While one is held the camera stays still. */
  canDrag?: (id: string) => boolean;
  /** The pointer has pulled a figure off its spot. */
  onDragStart?: (id: string) => void;
  /** The pointer let go of the figure it was dragging. */
  onDragEnd?: () => void;
  /** The <FigureLabels> layer drawn over the canvas, kept in step with the camera. */
  labels?: RefObject<HTMLDivElement | null>;
  /** Draw models or tokens whatever the display setting says (the menu backdrop always shows models). */
  style?: "models" | "tokens";
  /** A hopping figure has landed on the next step of its path (for its sound). */
  onLand?: (figureId: string, step: Step) => void;
  /** The chosen figure's end place and facing for the hovered move. */
  preview?: FigurePreview | null;
}

const RING: Record<FigureView["status"], string | null> = {
  idle: null,
  ready: "#ffffff",
  selected: "#ffd54a",
  spent: null,
  target: "#ff3b30",
};

/** Gap between the top of a token and the tip of its selection arrow, leaving room for the name tag. */
const ARROW_GAP = 0.8;
/**
 * A decorative loop: the arrow's bob and spin, a ready or target ring's pulse.
 * The board is only drawn when something changes, so a running loop asks for
 * every frame. It runs while `active`, unless the player's system asks for
 * reduced motion; then it stands still and the board can rest (browser tests
 * run that way). Returns whether it runs; call the returned `next` in useFrame
 * to ask for the following frame.
 */
function useLoop(active: boolean): { running: boolean; next: () => void } {
  const reduced = useReducedMotion();
  const running = active && !reduced;
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  useEffect(() => {
    if (running) wake();
  }, [running, wake]);
  return { running, next: invalidate };
}

/** The pulse of a ready or target ring, from -1 to 1, or null when it does not pulse (or motion is reduced). */
function useRingPulse(status: FigureView["status"]): (time: number) => number | null {
  const { running, next } = useLoop(status === "ready" || status === "target");
  return (time: number) => {
    if (!running) return null;
    next();
    return Math.sin(time * 4);
  };
}

/** A red arrow that bobs and spins above a figure, pointing down at it. */
function SelectionArrow({ top }: { top: number }) {
  const arrow = useRef<Group>(null);
  const { running, next } = useLoop(true);
  useFrame(({ clock }) => {
    if (!arrow.current) return;
    if (!running) {
      arrow.current.position.y = top + ARROW_GAP;
      return;
    }
    const t = clock.elapsedTime;
    arrow.current.rotation.y = t * 2;
    arrow.current.position.y = top + ARROW_GAP + 0.18 * Math.sin(t * 3);
    next();
  });
  return (
    <group ref={arrow} position={[0, top + ARROW_GAP, 0]} scale={1.8}>
      {/* Head: a four-sided point, so the spin shows */}
      <mesh position={[0, 0.2, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null}>
        <coneGeometry args={[0.32, 0.4, 4]} />
        <meshStandardMaterial color="#e53935" emissive="#7f0000" flatShading />
      </mesh>
      {/* Shaft */}
      <mesh position={[0, 0.6, 0]} raycast={() => null}>
        <boxGeometry args={[0.14, 0.42, 0.14]} />
        <meshStandardMaterial color="#e53935" emissive="#7f0000" flatShading />
      </mesh>
    </group>
  );
}

// ---- Movement ------------------------------------------------------------------

/** A hop from one hex to the next: how long it takes and how high it goes. A long path speeds up to fit. */
const HOP_SECONDS = 0.22;
const HOP_MAX_SECONDS = 2.4;
const HOP_HEIGHT = 0.55;
/** How high a figure hangs while the pointer carries it. */
const CARRY_LIFT = 0.7;
/** The jump that shows where a figure is: one high leap and a small bounce. */
const JUMP_SECONDS = 0.95;
const JUMP_HEIGHT = 3.2;
/** How quickly a figure settles where it belongs: the share of the way left covered each second is 1 - e^-rate. */
const SETTLE_RATE = 14;
/** A shake: how long, how far to each side at first, and how many times a second. */
export const SHAKE_SECONDS = 0.6;
const SHAKE_WIDTH = 0.09 * HEX_SIZE;
const SHAKE_RATE = 14;

interface Animation {
  readonly motions: FigureMotions | null;
  readonly jump: FigureJump | null;
  readonly shake: FigureShake | null;
  readonly reactions: FigureReactions | null;
  readonly carry: FigureCarry | null;
  /** How far each figure is drawn from where it stands, for the name tags. */
  readonly offsets: Map<string, Vector3>;
  readonly onDown: (id: string, e: ThreeEvent<PointerEvent>) => void;
  readonly onLand?: (figureId: string, step: Step) => void;
}

const AnimationContext = createContext<Animation | null>(null);

function worldOf(step: Step, out: Vector3): Vector3 {
  const { x, z } = hexToWorld(step.hex, HEX_SIZE);
  return out.set(x, step.elevation * LEVEL_HEIGHT, z);
}

const scratch = new Vector3();
const scratch2 = new Vector3();
const lastDrawn = new Vector3();
const tiltAxis = new Vector3();
const NO_TURN = new Quaternion();

/**
 * Moves a figure's drawing about its place on the board: hopping hex by hex
 * along a move, hanging from the pointer while dragged, jumping to be found.
 * Any other change of place (a slide, a shove, a swap) glides. The rules
 * already have the figure on its new hex; only the drawing lags behind.
 */
function useFigureAnimation(f: FigureView): RefObject<Group | null> {
  const group = useRef<Group>(null);
  const anim = useContext(AnimationContext);
  const live = useRef({
    offset: new Vector3(),
    anchor: null as Vector3 | null,
    // Moves and jumps already made when the figure is first drawn are not played again.
    seenMotions: anim?.motions?.key,
    seenJump: anim?.jump?.key,
    seenShake: anim?.shake?.key,
    seenReactions: anim?.reactions?.key,
    /** A hop along a path: where each landing is drawn, the step it lands on, and how many have landed. */
    hop: null as { points: Vector3[]; steps: Step[]; landed: number; t: number } | null,
    jumpT: -1,
    shakeT: -1,
    /** A reaction under way: its kind, its direction (a unit vector across the board) and how long it has run. */
    reaction: null as { kind: ReactionKind; dx: number; dz: number; t: number } | null,
    /** How far the name tag is drawn from its place: the figure's offset, without a reaction's tilt. */
    label: new Vector3(),
  });
  const reduced = useReducedMotion();
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const activity = useBoardActivity();
  // A new move, jump, drag or place needs a frame to start from.
  useEffect(() => wake(), [anim?.motions, anim?.jump, anim?.shake, anim?.reactions, anim?.carry, f.spots, wake]);
  // Report a hop about to start before the next frame, so the camera waits for it to land.
  useLayoutEffect(() => {
    const m = anim?.motions;
    if (m && m.key !== live.current.seenMotions && m.moves.some((x) => x.figureId === f.id && x.path.length > 0)) {
      activity.hopping.add(f.id);
    }
  }, [anim?.motions, activity, f.id]);
  useEffect(() => () => void activity.hopping.delete(f.id), [activity, f.id]);
  useEffect(() => {
    const offsets = anim?.offsets;
    if (!offsets) return;
    const g = group.current;
    if (g) offsets.set(f.id, live.current.label);
    return () => void offsets.delete(f.id);
  }, [anim?.offsets, f.id]);
  useFrame((_, frameDelta) => {
    const g = group.current;
    if (!g || !anim) return;
    const st = live.current;
    const delta = Math.min(frameDelta, 0.1);
    // Stay where it was drawn when its place changes, then catch up.
    const anchor = worldOf(f.spots[0]!, scratch);
    if (!st.anchor) st.anchor = anchor.clone();
    else if (!st.anchor.equals(anchor)) {
      st.offset.add(st.anchor).sub(anchor);
      st.anchor.copy(anchor);
    }
    const m = anim.motions;
    if (m && m.key !== st.seenMotions) {
      st.seenMotions = m.key;
      const mine = m.moves.find((x) => x.figureId === f.id);
      if (mine && mine.path.length > 0) {
        const end = worldOf(mine.path[mine.path.length - 1]!, new Vector3());
        const points: Vector3[] = [];
        const steps: Step[] = [];
        for (const step of [mine.from, ...mine.path]) {
          const p = worldOf(step, new Vector3()).sub(end);
          if (points.length === 0 || !points[points.length - 1]!.equals(p)) {
            points.push(p);
            steps.push(step);
          }
        }
        st.hop = points.length > 1 ? { points, steps, landed: 0, t: 0 } : null;
      }
      if (!st.hop) activity.hopping.delete(f.id);
    }
    if (st.hop) {
      const hops = st.hop.points.length - 1;
      const each = Math.min(HOP_SECONDS, HOP_MAX_SECONDS / hops);
      st.hop.t += delta;
      const at = st.hop.t / each;
      while (st.hop.landed < Math.min(hops, Math.floor(at))) {
        st.hop.landed++;
        anim.onLand?.(f.id, st.hop.steps[st.hop.landed]!);
      }
      if (at >= hops) {
        st.hop = null;
        st.offset.set(0, 0, 0);
        activity.hopping.delete(f.id);
      } else {
        const i = Math.floor(at);
        const u = at - i;
        st.offset.lerpVectors(st.hop.points[i]!, st.hop.points[i + 1]!, u);
        st.offset.y += HOP_HEIGHT * 4 * u * (1 - u);
      }
    } else {
      const carry = anim.carry?.id === f.id ? anim.carry : null;
      const target = scratch2.set(0, 0, 0);
      if (carry) {
        if (carry.to) worldOf(carry.to, target).sub(worldOf(carry.from, scratch));
        if (carry.held) target.y += CARRY_LIFT;
      }
      if (st.offset.distanceToSquared(target) < 1e-6) st.offset.copy(target);
      else st.offset.lerp(target, 1 - Math.exp(-SETTLE_RATE * delta));
    }
    const j = anim.jump;
    if (j && j.key !== st.seenJump) {
      st.seenJump = j.key;
      if (j.ids.includes(f.id)) st.jumpT = 0;
    }
    let up = 0;
    if (st.jumpT >= 0) {
      st.jumpT += delta;
      const u = st.jumpT / JUMP_SECONDS;
      if (u >= 1) st.jumpT = -1;
      else if (u < 0.72) up = JUMP_HEIGHT * 4 * (u / 0.72) * (1 - u / 0.72);
      else up = JUMP_HEIGHT * 0.16 * 4 * ((u - 0.72) / 0.28) * (1 - (u - 0.72) / 0.28);
    }
    const sh = anim.shake;
    if (sh && sh.key !== st.seenShake) {
      st.seenShake = sh.key;
      // Under reduced motion the figure keeps still.
      if (sh.ids.includes(f.id) && !reduced) st.shakeT = 0;
    }
    let side = 0;
    if (st.shakeT >= 0) {
      st.shakeT += delta;
      const u = st.shakeT / SHAKE_SECONDS;
      if (u >= 1) st.shakeT = -1;
      else side = SHAKE_WIDTH * (1 - u) * Math.sin(st.shakeT * SHAKE_RATE * 2 * Math.PI);
    }
    const rx = anim.reactions;
    if (rx && rx.key !== st.seenReactions) {
      st.seenReactions = rx.key;
      const mine = reduced ? undefined : rx.list.find((x) => x.id === f.id);
      const length = mine ? Math.hypot(mine.dir.x, mine.dir.z) : 0;
      if (mine) {
        st.reaction = { kind: mine.kind, dx: length > 1e-6 ? mine.dir.x / length : 0, dz: length > 1e-6 ? mine.dir.z / length : 1, t: 0 };
        activity.reactions++;
      }
    }
    const was = lastDrawn.copy(g.position);
    g.position.set(st.offset.x + side, st.offset.y + up, st.offset.z + side * 0.4);
    st.label.copy(g.position);
    const r = st.reaction;
    let reacting = false;
    if (r) {
      r.t += delta;
      reacting = r.t < REACTION_SECONDS[r.kind] + delta;
      const pose = reactionPose(r.kind, r.t);
      // Tipped about a line on the ground through the middle of its base (a topple: its edge).
      const cells = f.spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
      const cx = cells.reduce((n, c) => n + c.x, 0) / cells.length;
      const cz = cells.reduce((n, c) => n + c.z, 0) / cells.length;
      const edge = r.kind === "topple" ? Math.max(0, ...cells.map((c) => Math.hypot(c.x - cx, c.z - cz))) + BASE_RADIUS : 0;
      const pivot = scratch.set(cx + r.dx * edge, Math.max(...f.spots.map((s) => s.elevation)) * LEVEL_HEIGHT, cz + r.dz * edge);
      tiltAxis.set(r.dz, 0, -r.dx);
      g.quaternion.setFromAxisAngle(tiltAxis, pose.tilt);
      const turned = scratch2.copy(pivot).applyQuaternion(g.quaternion);
      g.position.x += r.dx * pose.push + pivot.x - turned.x;
      g.position.y += pose.lift + pivot.y - turned.y;
      g.position.z += r.dz * pose.push + pivot.z - turned.z;
      if (!reacting && r.kind !== "topple") {
        st.reaction = null;
        g.quaternion.identity();
      }
    } else if (!g.quaternion.equals(NO_TURN)) g.quaternion.identity();
    // Keep drawing while the figure moves, and once more after it stops, so its name tag
    // (placed in the same frame, perhaps before it moved) catches up.
    if (!was.equals(g.position) || st.hop || st.jumpT >= 0 || st.shakeT >= 0 || reacting) invalidate();
  });
  return group;
}

interface Point {
  readonly x: number;
  readonly y: number;
}

/** Convex hull (counter-clockwise) of a few points; collinear points collapse to the two ends. */
function hull(points: readonly Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 1e-9) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = build(pts);
  const upper = build([...pts].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The outline of every point grown by `radius`: a stadium for a line of hexes, a rounded shape otherwise. */
function roundedOutline(points: readonly Point[], radius: number, target: Shape): void {
  const h = hull(points);
  if (h.length === 1) {
    target.absarc(h[0]!.x, h[0]!.y, radius, 0, Math.PI * 2, false);
    return;
  }
  const normal = (a: Point, b: Point) => Math.atan2(-(b.x - a.x), b.y - a.y);
  for (let i = 0; i < h.length; i++) {
    const prev = h[(i - 1 + h.length) % h.length]!;
    const cur = h[i]!;
    const next = h[(i + 1) % h.length]!;
    const from = normal(prev, cur);
    let to = normal(cur, next);
    while (to < from) to += Math.PI * 2;
    target.absarc(cur.x, cur.y, radius, from, to, false);
  }
  target.closePath();
}

/**
 * A multi-hex figure as one solid piece: a rounded slab covering all its hexes,
 * coloured below the hit band and white across it, with a cap on its front hex.
 * It stands on the highest of its hexes (a figure may straddle one level).
 */
function BigToken({ f, handlers }: { f: FigureView; handlers: object }) {
  const ring = useRef<MeshBasicMaterial>(null);
  const h = f.height * LEVEL_HEIGHT;
  const bandStart = h * HIT_BAND_FROM;
  const front = hexToWorld(f.spots[0]!.hex, HEX_SIZE);
  const base = Math.max(...f.spots.map((s) => s.elevation)) * LEVEL_HEIGHT;
  // Shape coordinates are relative to the front hex; shape y runs opposite to world z.
  const points = useMemo(
    () =>
      f.spots.map((s) => {
        const { x, z } = hexToWorld(s.hex, HEX_SIZE);
        return { x: x - front.x, y: -(z - front.z) };
      }),
    [f.spots, front.x, front.z],
  );
  const geometries = useMemo(() => {
    const outline = new Shape();
    roundedOutline(points, TOKEN_RADIUS, outline);
    const body = new ExtrudeGeometry(outline, { depth: bandStart, bevelEnabled: false, curveSegments: 10 });
    const band = new ExtrudeGeometry(outline, { depth: h - bandStart, bevelEnabled: false, curveSegments: 10 });
    const ringShape = new Shape();
    roundedOutline(points, TOKEN_RADIUS * 1.4, ringShape);
    const hole = new Shape();
    roundedOutline(points, TOKEN_RADIUS * 1.12, hole);
    ringShape.holes.push(hole);
    const ringGeo = new ShapeGeometry(ringShape, 10);
    return { body, band, ringGeo };
  }, [points, bandStart, h]);
  useEffect(
    () => () => {
      geometries.body.dispose();
      geometries.band.dispose();
      geometries.ringGeo.dispose();
    },
    [geometries],
  );
  const ringColor = RING[f.status];
  const pulse = useRingPulse(f.status);
  useFrame(({ clock }) => {
    const p = pulse(clock.elapsedTime);
    if (ring.current) ring.current.opacity = p === null ? 0.9 : 0.55 + 0.35 * p;
  });
  const centre = points.reduce((c, p) => ({ x: c.x + p.x / points.length, y: c.y + p.y / points.length }), { x: 0, y: 0 });
  return (
    <group position={[front.x, base, front.z]}>
      {/* Extrusions run along the shape's z axis; turn them so they stand up. */}
      <mesh geometry={geometries.body} rotation={[-Math.PI / 2, 0, 0]} {...handlers}>
        <meshStandardMaterial
          color={f.color}
          roughness={0.6}
          transparent={f.status === "spent"}
          opacity={f.status === "spent" ? 0.6 : 1}
        />
      </mesh>
      <mesh geometry={geometries.band} rotation={[-Math.PI / 2, 0, 0]} position={[0, bandStart, 0]} {...handlers}>
        <meshStandardMaterial color="#f4f1ea" roughness={0.5} />
      </mesh>
      <mesh position={[0, h + 0.03, 0]} raycast={() => null}>
        <cylinderGeometry args={[TOKEN_RADIUS * 0.7, TOKEN_RADIUS * 0.7, 0.06, 24]} />
        <meshStandardMaterial
          color={f.hero ? "#e8b730" : f.color}
          metalness={f.hero ? 0.6 : 0}
          roughness={0.4}
        />
      </mesh>
      {ringColor && (
        <mesh geometry={geometries.ringGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} raycast={() => null}>
          <meshBasicMaterial ref={ring} color={ringColor} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      {f.arrow && (
        <group position={[centre.x, 0, -centre.y]}>
          <SelectionArrow top={h} />
        </group>
      )}
    </group>
  );
}

// ---- Figure models -----------------------------------------------------------

/** The six ways a single-hex figure can face: across a flat side of its hex. */
const SIDES = [0, 1, 2, 3, 4, 5].map((r) => baseFrame("1", hex(0, 0), r).yaw);

function nearestSide(yaw: number): number {
  const turn = (a: number) => Math.abs(Math.atan2(Math.sin(a - yaw), Math.cos(a - yaw)));
  return SIDES.reduce((best, side) => (turn(side) < turn(best) ? side : best));
}

/**
 * Which way each single-hex figure faces: towards the nearest figure of another
 * player, or the middle of the others when there is none. A figure on several
 * hexes faces along its base instead, so it is not listed.
 */
function facings(figures: readonly FigureView[]): Map<string, number> {
  const at = new Map(figures.map((f) => [f.id, hexToWorld(f.spots[0]!.hex, HEX_SIZE)]));
  const out = new Map<string, number>();
  for (const f of figures) {
    if (f.spots.length !== 1) continue;
    const me = at.get(f.id)!;
    const others = figures.filter((o) => o.id !== f.id);
    const enemies = others.filter((o) => o.owner !== f.owner);
    let target: { x: number; z: number } | undefined;
    if (enemies.length > 0) {
      const d = (o: FigureView) => Math.hypot(at.get(o.id)!.x - me.x, at.get(o.id)!.z - me.z);
      target = at.get(enemies.reduce((a, b) => (d(b) < d(a) ? b : a)).id);
    } else if (others.length > 0) {
      target = {
        x: others.reduce((n, o) => n + at.get(o.id)!.x, 0) / others.length,
        z: others.reduce((n, o) => n + at.get(o.id)!.z, 0) / others.length,
      };
    }
    if (target && Math.hypot(target.x - me.x, target.z - me.z) > 1e-6) out.set(f.id, nearestSide(Math.atan2(target.x - me.x, target.z - me.z)));
  }
  return out;
}

interface UnitMeshes {
  readonly poses: readonly FigureModel[];
  readonly base: { top: BufferGeometry; rim: BufferGeometry };
}

/** Built once per unit card and look and shared by every figure of it, for as long as the page is open. */
const meshCache = new Map<string, UnitMeshes>();

function unitMeshes(cardId: string, footprint: Footprint, detailed: boolean, high = false): UnitMeshes {
  const key = `${cardId}:${detailed ? "detailed" : "classic"}:${high ? "high" : "low"}`;
  let found = meshCache.get(key);
  if (!found) {
    const unit = unitModel(cardId, detailed)!;
    found = { poses: unit.figures, base: baseGeometry(footprint, high) };
    meshCache.set(key, found);
  }
  return found;
}

/** The figures' two materials: their colours are in the meshes. Glowing parts are unlit, so they stay bright. */
const SOLID = new MeshStandardMaterial({ vertexColors: true, roughness: 0.68 });
const GLOWING = new MeshBasicMaterial({ vertexColors: true });
/** The see-through copy a move preview draws. */
const GHOST_OPACITY = 0.5;
const GHOST_SOLID = new MeshStandardMaterial({ vertexColors: true, roughness: 0.68, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });
const GHOST_GLOWING = new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: GHOST_OPACITY, depthWrite: false });

/**
 * At high quality a figure's outline catches a soft light in its player's colour (an edge light),
 * so armies stand out from the board and from each other. One material per colour; they share a
 * shader. The light grows where the surface turns away from the eye, as a rim light does.
 */
const EDGE_STRENGTH = 0.32;
const EDGE_POWER = 3.4;
const edgeLit = new Map<string, MeshStandardMaterial>();
function edgeLitMaterial(color: string): MeshStandardMaterial {
  let found = edgeLit.get(color);
  if (found) return found;
  found = SOLID.clone();
  const rim = { value: new Color(color) };
  found.onBeforeCompile = (shader) => {
    shader.uniforms.uEdgeColor = rim;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uEdgeColor;")
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float aohEdge = 1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        totalEmissiveRadiance += uEdgeColor * pow(aohEdge, ${EDGE_POWER.toFixed(2)}) * ${EDGE_STRENGTH.toFixed(2)};`,
      );
  };
  found.customProgramCacheKey = () => "aoh-edge-light";
  // Read by the graphics test (`window.__aoh.graphics().edgeLit`).
  found.userData.edgeLight = true;
  edgeLit.set(color, found);
  return found;
}

/** Baked figures by model, colouring, state and quality, kept for as long as the page is open. */
const baked = new WeakMap<FigureModel, Map<string, BakedFigure>>();

function bakedFor(model: FigureModel, context: PaintContext, spent: boolean, high = false): BakedFigure {
  let byColour = baked.get(model);
  if (!byColour) baked.set(model, (byColour = new Map()));
  const key = `${context.scheme}|${context.main}|${context.faction}|${spent}|${high}`;
  let found = byColour.get(key);
  if (!found) byColour.set(key, (found = bakedGeometry(model, context, spent, high)));
  return found;
}

/**
 * A figure's model: a detailed one painted part by part, a classic one all in the model colour.
 * Either way it is one mesh, plus one for any glowing parts. At high quality (`high`) it keeps its
 * high-only details and smooth shading, and `edge` gives it an edge light in that colour.
 */
export function PaintedModel({
  model,
  context,
  spent = false,
  ghost = false,
  high = false,
  edge,
}: {
  model: FigureModel;
  context: PaintContext;
  spent?: boolean;
  ghost?: boolean;
  high?: boolean;
  edge?: string;
}) {
  const { solid, glow } = bakedFor(model, context, spent, high);
  return (
    <>
      <mesh geometry={solid} material={ghost ? GHOST_SOLID : edge ? edgeLitMaterial(edge) : SOLID} raycast={() => null} renderOrder={ghost ? 4 : 0} />
      {glow && <mesh geometry={glow} material={ghost ? GHOST_GLOWING : GLOWING} raycast={() => null} renderOrder={ghost ? 4 : 0} />}
    </>
  );
}

/** A status ring just outside the base, flat on the ground. */
const MODEL_RING_INNER = BASE_RADIUS * 1.03;
const MODEL_RING_OUTER = BASE_RADIUS * 1.2;

/**
 * A figure model on its base, in place of a token. It stands where the token
 * would, takes the same clicks through an unseen token-shaped target, and
 * shows its state with a ring round its base.
 */
function ModelFigure({
  f,
  onClick,
  onHover,
  yaw,
  scheme,
  detailed,
  high,
  glow,
}: {
  f: FigureView;
  onClick?: Props["onClick"];
  onHover?: Props["onHover"];
  yaw: number;
  scheme: Parameters<typeof figureColors>[0];
  /** The detailed look: a detailed model where the unit has one. */
  detailed: boolean;
  /** High graphics quality: in the detailed look, a rounder base, smooth shading, the ground on its base and an edge light. */
  high: boolean;
  /** The edge light at high quality (**Outline glow in player colours** under Display). */
  glow: boolean;
}) {
  const ring = useRef<MeshBasicMaterial>(null);
  const moving = useFigureAnimation(f);
  const down = useContext(AnimationContext)?.onDown;
  // High quality's figure detail comes with the detailed look only: the classic look (B) keeps its
  // plain, faceted, single-colour models and plain bases at any quality.
  const fine = high && detailed;
  const meshes = unitMeshes(f.cardId, f.footprint, detailed, fine);
  const pose = meshes.poses[f.pose % meshes.poses.length]!;
  // The ground on its base, in its faction's style.
  const model = fine ? withGround(pose, f.faction, f.footprint, seedOf(f.cardId) + f.pose) : pose;
  const handlers = pointerHandlers(f.id, onClick, onHover, down);
  const h = f.height * LEVEL_HEIGHT;
  const ground = Math.max(...f.spots.map((s) => s.elevation)) * LEVEL_HEIGHT;
  const cells = f.spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
  const centre = { x: cells.reduce((n, c) => n + c.x, 0) / cells.length, z: cells.reduce((n, c) => n + c.z, 0) / cells.length };
  // A figure on several hexes faces from the middle of its base to its front hex, as on the model page.
  const turn = cells.length > 1 ? Math.atan2(cells[0]!.x - centre.x, cells[0]!.z - centre.z) : yaw;

  const colors = figureColors(scheme, factionTheme(f.faction).primary, f.color);
  const context = useMemo<PaintContext>(() => ({ scheme, main: colors.model, faction: f.faction }), [scheme, colors.model, f.faction]);

  const ringColor = RING[f.status];
  const ringGeometry = useMemo(() => {
    if (!ringColor) return null;
    const points = cells.map((c) => ({ x: c.x - centre.x, y: -(c.z - centre.z) }));
    const outer = new Shape();
    roundedOutline(points, MODEL_RING_OUTER, outer);
    const hole = new Shape();
    roundedOutline(points, MODEL_RING_INNER, hole);
    outer.holes.push(hole);
    return new ShapeGeometry(outer, 12);
    // The ring follows the hexes the figure covers.
  }, [ringColor, f.spots]);
  useEffect(() => () => ringGeometry?.dispose(), [ringGeometry]);
  const pulse = useRingPulse(f.status);
  useFrame(({ clock }) => {
    const p = pulse(clock.elapsedTime);
    if (ring.current) ring.current.opacity = p === null ? 0.95 : 0.6 + 0.35 * p;
  });

  return (
    <>
      <group ref={moving}>
      <group position={[centre.x, ground, centre.z]}>
        <group rotation={[0, turn, 0]}>
          <PaintedModel model={model} context={context} spent={f.status === "spent"} high={fine} edge={fine && glow ? f.color : undefined} />
          <mesh geometry={meshes.base.top} raycast={() => null}>
            <meshStandardMaterial color={BASE_COLOR} roughness={0.75} />
          </mesh>
          <mesh geometry={meshes.base.rim} raycast={() => null}>
            <meshStandardMaterial color={colors.ring} roughness={0.55} />
          </mesh>
        </group>
        {ringGeometry && (
          <mesh geometry={ringGeometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} raycast={() => null}>
            <meshBasicMaterial ref={ring} color={ringColor!} transparent opacity={0.95} depthWrite={false} />
          </mesh>
        )}
        {f.arrow && <SelectionArrow top={h} />}
      </group>
      </group>
      {/* Clicks and hovers land on the token's shape, which is what the rules measure. It is hidden, but rays still find it, and it stays on the figure's hex while the model hops there. */}
      {f.spots.map((s) => {
        const { x, z } = hexToWorld(s.hex, HEX_SIZE);
        return (
          <mesh key={hexKey(s.hex)} position={[x, s.elevation * LEVEL_HEIGHT + h / 2, z]} visible={false} {...handlers}>
            <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, h, 12]} />
          </mesh>
        );
      })}
    </>
  );
}

/** Click and hover for a figure's meshes. A drag that turns the camera is not a click. */
function pointerHandlers(id: string, onClick?: Props["onClick"], onHover?: Props["onHover"], onDown?: Animation["onDown"]) {
  return {
    onPointerDown: (e: ThreeEvent<PointerEvent>) => onDown?.(id, e),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 5) return;
      e.stopPropagation();
      onClick?.(id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover?.(id);
    },
    onPointerOut: () => onHover?.(null),
  };
}

function Token({ f, onClick, onHover }: { f: FigureView; onClick?: Props["onClick"]; onHover?: Props["onHover"] }) {
  const ring = useRef<Mesh>(null);
  const h = f.height * LEVEL_HEIGHT;
  const bandStart = h * HIT_BAND_FROM;
  const ringColor = RING[f.status];
  const front = f.spots[0]!;
  const frontPos = hexToWorld(front.hex, HEX_SIZE);
  const moving = useFigureAnimation(f);
  const down = useContext(AnimationContext)?.onDown;

  const pulse = useRingPulse(f.status);
  useFrame(({ clock }) => {
    const p = pulse(clock.elapsedTime);
    const scale = p === null ? 1 : 0.75 + 0.25 * p;
    if (ring.current) ring.current.scale.set(scale, 1, scale);
  });

  const handlers = pointerHandlers(f.id, onClick, onHover, down);

  if (f.hitShape) {
    return (
      <group ref={moving}>
        <ShapeToken f={f} shape={f.hitShape} handlers={handlers} />
        <group position={[frontPos.x, front.elevation * LEVEL_HEIGHT, frontPos.z]}>
          {ringColor && (
            <mesh ref={ring} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
              <ringGeometry args={[TOKEN_RADIUS * 1.12, TOKEN_RADIUS * 1.4, 32]} />
              <meshBasicMaterial color={ringColor} transparent opacity={0.9} depthWrite={false} />
            </mesh>
          )}
          {f.arrow && <SelectionArrow top={h} />}
        </group>
      </group>
    );
  }

  if (f.spots.length > 1) {
    return (
      <group ref={moving}>
        <BigToken f={f} handlers={handlers} />
      </group>
    );
  }

  return (
    <group ref={moving}>
      {f.spots.map((s, i) => {
        const { x, z } = hexToWorld(s.hex, HEX_SIZE);
        return (
          <group key={hexKey(s.hex)} position={[x, s.elevation * LEVEL_HEIGHT, z]}>
            {/* Body below the hit band */}
            <mesh position={[0, bandStart / 2, 0]} {...handlers}>
              <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, bandStart, 24]} />
              <meshStandardMaterial
                color={f.color}
                roughness={0.6}
                transparent={f.status === "spent"}
                opacity={f.status === "spent" ? 0.6 : 1}
              />
            </mesh>
            {/* Hit band: the part an attacker must see */}
            <mesh position={[0, bandStart + (h - bandStart) / 2, 0]} {...handlers}>
              <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, h - bandStart, 24]} />
              <meshStandardMaterial color="#f4f1ea" roughness={0.5} />
            </mesh>
            {/* Heroes get a gold cap on their front hex; squads a cap in their colour */}
            <mesh position={[0, h + 0.03, 0]} raycast={() => null}>
              <cylinderGeometry args={[TOKEN_RADIUS * 0.7, TOKEN_RADIUS * 0.7, 0.06, 24]} />
              <meshStandardMaterial
                color={f.hero && i === 0 ? "#e8b730" : f.color}
                metalness={f.hero && i === 0 ? 0.6 : 0}
                roughness={0.4}
              />
            </mesh>
          </group>
        );
      })}
      <group position={[frontPos.x, front.elevation * LEVEL_HEIGHT, frontPos.z]}>
        {ringColor && (
          <mesh ref={ring} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[TOKEN_RADIUS * 1.12, TOKEN_RADIUS * 1.4, 32]} />
            <meshBasicMaterial color={ringColor} transparent opacity={0.9} depthWrite={false} />
          </mesh>
        )}
        {f.arrow && <SelectionArrow top={f.height * LEVEL_HEIGHT} />}
        {f.facing !== undefined && (
          <mesh geometry={FACING_MARK} position={[0, h + 0.065, 0]} rotation={[-Math.PI / 2, 0, (f.facing * Math.PI) / 180]} raycast={() => null}>
            <meshBasicMaterial color="#f4f1ea" />
          </mesh>
        )}
      </group>
    </group>
  );
}

/** Each hit shape's boxes as two meshes, body and gear, kept for as long as the page is open (the shapes never change). */
const shapeMeshes = new WeakMap<HitShape, { body: BufferGeometry | null; gear: BufferGeometry | null }>();

function shapeGeometry(shape: HitShape): { body: BufferGeometry | null; gear: BufferGeometry | null } {
  const known = shapeMeshes.get(shape);
  if (known) return known;
  const parts = (kind: "body" | "gear") => {
    const boxes = shape
      .filter((b) => b.kind === kind)
      .map((b) => {
        const g = new BoxGeometry(b.half.x * 2, b.half.y * 2, b.half.z * 2);
        const [u, v, w] = b.axes;
        g.applyMatrix4(new Matrix4().set(u.x, v.x, w.x, b.centre.x, u.y, v.y, w.y, b.centre.y, u.z, v.z, w.z, b.centre.z, 0, 0, 0, 1));
        return g;
      });
    if (boxes.length === 0) return null;
    const merged = mergeGeometries(boxes);
    for (const g of boxes) g.dispose();
    return merged;
  };
  const made = { body: parts("body"), gear: parts("gear") };
  shapeMeshes.set(shape, made);
  return made;
}

const GEAR_GREY = "#8d9096";

/**
 * A figure as line of sight sees it in games with hit zones: its body boxes in its player's
 * colour and its gear boxes grey, standing where the rules put them (`shapeFrame`). Clicks land
 * on an unseen token on each of its hexes, as for a model.
 */
function ShapeToken({ f, shape, handlers }: { f: FigureView; shape: HitShape; handlers: object }) {
  const frame = shapeFrame(f.spots, f.facing ?? 0);
  const { body, gear } = shapeGeometry(shape);
  const h = f.height * LEVEL_HEIGHT;
  const spent = f.status === "spent";
  return (
    <>
      <group position={[frame.x, frame.y, frame.z]} rotation={[0, (frame.facing * Math.PI) / 180, 0]}>
        {body && (
          <mesh geometry={body} raycast={() => null}>
            <meshStandardMaterial color={f.color} roughness={0.6} transparent={spent} opacity={spent ? 0.6 : 1} />
          </mesh>
        )}
        {gear && (
          <mesh geometry={gear} raycast={() => null}>
            <meshStandardMaterial color={GEAR_GREY} roughness={0.7} transparent={spent} opacity={spent ? 0.6 : 1} />
          </mesh>
        )}
      </group>
      {f.spots.map((s) => {
        const { x, z } = hexToWorld(s.hex, HEX_SIZE);
        return (
          <mesh key={hexKey(s.hex)} position={[x, s.elevation * LEVEL_HEIGHT + h / 2, z]} visible={false} {...handlers}>
            <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, h, 12]} />
          </mesh>
        );
      })}
    </>
  );
}

/** The pointer on a token's cap that shows which way it faces: a flat wedge, its tip forward. */
const FACING_MARK = (() => {
  const s = new Shape();
  s.moveTo(0, -TOKEN_RADIUS * 0.62);
  s.lineTo(TOKEN_RADIUS * 0.3, TOKEN_RADIUS * 0.12);
  s.lineTo(-TOKEN_RADIUS * 0.3, TOKEN_RADIUS * 0.12);
  s.closePath();
  return new ShapeGeometry(s);
})();

/** How far the front cone's outline reaches from the figure, in hexes. */
const CONE_RADIUS = 1.7 * HEX_SIZE;
const CONE_LINE = 0.07;

/**
 * The front cone's outline, flat on the ground under a figure that may still be turned: a half
 * circle ahead of it, with the side line through its middle, over a faint fill.
 */
const CONE = (() => {
  // Shape y runs opposite to world z, so ahead (+z, unturned) is -y.
  const arc = (r: number, from: number, to: number, path: Shape) => {
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = from + ((to - from) * i) / n;
      path.lineTo(Math.sin(t) * r, -Math.cos(t) * r);
    }
  };
  const rim = new Shape();
  rim.moveTo(-CONE_RADIUS, 0);
  arc(CONE_RADIUS, -Math.PI / 2, Math.PI / 2, rim);
  rim.lineTo(CONE_RADIUS - CONE_LINE, 0);
  arc(CONE_RADIUS - CONE_LINE, Math.PI / 2, -Math.PI / 2, rim);
  rim.closePath();
  const side = new Shape();
  side.moveTo(-CONE_RADIUS, -CONE_LINE / 2);
  side.lineTo(CONE_RADIUS, -CONE_LINE / 2);
  side.lineTo(CONE_RADIUS, CONE_LINE / 2);
  side.lineTo(-CONE_RADIUS, CONE_LINE / 2);
  side.closePath();
  const fill = new Shape();
  fill.moveTo(-CONE_RADIUS, 0);
  arc(CONE_RADIUS, -Math.PI / 2, Math.PI / 2, fill);
  fill.closePath();
  return { line: new ShapeGeometry([rim, side]), fill: new ShapeGeometry(fill) };
})();

/** The outline of a figure's front cone: while it may still be turned, or where a move would leave it. */
function FacingCone({ spots, facing }: { spots: readonly Step[]; facing: number }) {
  const cells = spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
  const x = cells.reduce((n, c) => n + c.x, 0) / cells.length;
  const z = cells.reduce((n, c) => n + c.z, 0) / cells.length;
  const y = Math.max(...spots.map((s) => s.elevation)) * LEVEL_HEIGHT + 0.07;
  const turn = (facing * Math.PI) / 180;
  return (
    <group position={[x, y, z]} rotation={[0, turn, 0]}>
      <mesh geometry={CONE.fill} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={2}>
        <meshBasicMaterial color="#ffe28a" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <mesh geometry={CONE.line} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} renderOrder={3}>
        <meshBasicMaterial color="#ffe28a" transparent opacity={0.9} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * A see-through copy of the chosen figure where the hovered move would leave it, turned the way
 * it would face. It takes no clicks, so the hex under it can still be clicked.
 */
function GhostFigure({ preview, drawn }: { preview: FigurePreview; drawn: "models" | "tokens" }) {
  const display = useDisplay();
  const { figure: f, spots } = preview;
  const h = f.height * LEVEL_HEIGHT;
  const ground = Math.max(...spots.map((s) => s.elevation)) * LEVEL_HEIGHT;
  const cells = spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
  const centre = { x: cells.reduce((n, c) => n + c.x, 0) / cells.length, z: cells.reduce((n, c) => n + c.z, 0) / cells.length };
  const turn = (preview.facing * Math.PI) / 180;
  const colors = figureColors(display.scheme, factionTheme(f.faction).primary, f.color);
  const context = useMemo<PaintContext>(() => ({ scheme: display.scheme, main: colors.model, faction: f.faction }), [display.scheme, colors.model, f.faction]);
  if (drawn === "tokens") {
    return (
      <>
        {spots.map((s) => {
          const { x, z } = hexToWorld(s.hex, HEX_SIZE);
          return (
            <mesh key={hexKey(s.hex)} position={[x, s.elevation * LEVEL_HEIGHT + h / 2, z]} raycast={() => null} renderOrder={4}>
              <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, h, 24]} />
              <meshStandardMaterial color={f.color} transparent opacity={GHOST_OPACITY} depthWrite={false} />
            </mesh>
          );
        })}
      </>
    );
  }
  const meshes = unitMeshes(f.cardId, f.footprint, display.tiles === "detailed");
  const model = meshes.poses[f.pose % meshes.poses.length]!;
  return (
    <group position={[centre.x, ground, centre.z]} rotation={[0, turn, 0]}>
      <PaintedModel model={model} context={context} ghost />
      <mesh geometry={meshes.base.top} raycast={() => null} renderOrder={4}>
        <meshStandardMaterial color={BASE_COLOR} roughness={0.75} transparent opacity={GHOST_OPACITY} depthWrite={false} />
      </mesh>
      <mesh geometry={meshes.base.rim} raycast={() => null} renderOrder={4}>
        <meshStandardMaterial color={colors.ring} roughness={0.55} transparent opacity={GHOST_OPACITY} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Pointer travel (pixels) that turns a press on a figure into a drag. */
const DRAG_PIXELS = 5;

export function Figures({ figures, onClick, onHover, labels, style, motions = null, jump = null, shake = null, reactions = null, carry = null, canDrag, onDragStart, onDragEnd, onLand, preview = null }: Props) {
  const display = useDisplay();
  const high = useGraphics() === "high";
  const drawn = style ?? display.figures;
  const facing = useMemo(() => facings(figures), [figures]);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const offsets = useMemo(() => new Map<string, Vector3>(), []);

  // A press on a figure that may be dragged holds the camera still; moving the pointer then picks the figure up.
  const drag = useRef({ canDrag, onDragStart, onDragEnd, controls });
  drag.current = { canDrag, onDragStart, onDragEnd, controls };
  const press = useRef<{ id: string; x: number; y: number; started: boolean; held: { enabled: boolean } | null } | null>(null);
  const onDown = useMemo<Animation["onDown"]>(
    () => (id, e) => {
      if (e.nativeEvent.button !== 0 || !drag.current.canDrag?.(id) || press.current) return;
      const held = drag.current.controls?.enabled ? drag.current.controls : null;
      if (held) held.enabled = false;
      press.current = { id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, started: false, held };
    },
    [],
  );
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p || p.started || Math.hypot(e.clientX - p.x, e.clientY - p.y) <= DRAG_PIXELS) return;
      p.started = true;
      drag.current.onDragStart?.(p.id);
    };
    const up = () => {
      const p = press.current;
      if (!p) return;
      press.current = null;
      if (p.held) p.held.enabled = true;
      if (p.started) drag.current.onDragEnd?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      up();
    };
  }, []);

  const animation = useMemo<Animation>(() => ({ motions, jump, shake, reactions, carry, offsets, onDown, onLand }), [motions, jump, shake, reactions, carry, offsets, onDown, onLand]);
  return (
    <AnimationContext.Provider value={animation}>
      {figures.map((f) =>
        drawn === "models" && UNIT_MODELS[f.cardId] ? (
          <ModelFigure
            key={f.id}
            f={f}
            onClick={onClick}
            onHover={onHover}
            yaw={f.facing !== undefined ? (f.facing * Math.PI) / 180 : (facing.get(f.id) ?? SIDES[0]!)}
            scheme={display.scheme}
            detailed={display.tiles === "detailed"}
            high={high}
            glow={display.outlineGlow}
          />
        ) : (
          <Token key={f.id} f={f} onClick={onClick} onHover={onHover} />
        ),
      )}
      {figures.map((f) => f.cone && f.facing !== undefined && <FacingCone key={`cone:${f.id}`} spots={f.spots} facing={f.facing} />)}
      {preview && <GhostFigure preview={preview} drawn={drawn === "models" && UNIT_MODELS[preview.figure.cardId] ? "models" : "tokens"} />}
      {preview?.cone && <FacingCone spots={preview.spots} facing={preview.facing} />}
      {labels && <LabelTracker figures={figures} layer={labels} offsets={offsets} />}
    </AnimationContext.Provider>
  );
}

/** Where a figure's name tag floats: just above it (the middle of a multi-hex piece). */
function labelAnchor(f: FigureView): Vector3 {
  const at = f.spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
  const x = at.reduce((n, p) => n + p.x, 0) / at.length;
  const z = at.reduce((n, p) => n + p.z, 0) / at.length;
  const top = Math.max(...f.spots.map((s) => s.elevation)) + f.height;
  return new Vector3(x, top * LEVEL_HEIGHT + 0.35, z);
}

/** Moves the DOM name tags to follow their figures on screen, every frame that is drawn. */
function LabelTracker({
  figures,
  layer,
  offsets,
}: {
  figures: readonly FigureView[];
  layer: RefObject<HTMLDivElement | null>;
  offsets: Map<string, Vector3>;
}) {
  const anchors = useMemo(() => new Map(figures.map((f) => [f.id, labelAnchor(f)])), [figures]);
  const invalidate = useThree((s) => s.invalidate);
  // New or changed figures have new tags to place.
  useEffect(() => invalidate(), [anchors, invalidate]);
  const v = useMemo(() => new Vector3(), []);
  // Anchors are in board coordinates; this group shares the figures' parent, so it maps them to the world.
  const frame = useRef<Group>(null);
  useFrame(({ camera, size }) => {
    const el = layer.current;
    if (!el || !frame.current) return;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const id = child.dataset.id ?? "";
      const anchor = anchors.get(id);
      const offset = offsets.get(id);
      if (anchor) {
        v.copy(anchor);
        // The tag stays over a figure that is hopping, carried or jumping.
        if (offset) v.add(offset);
        frame.current.localToWorld(v).project(camera);
      }
      if (!anchor || v.z < -1 || v.z > 1) {
        child.style.visibility = "hidden";
        continue;
      }
      const x = ((v.x + 1) / 2) * size.width;
      const y = ((1 - v.y) / 2) * size.height;
      child.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      // Nearer tags draw on top of farther ones.
      child.style.zIndex = String(Math.round((1 - v.z) * 100000));
      child.style.visibility = "visible";
    }
  });
  return <group ref={frame} />;
}

/**
 * Name tags for the figures, as plain DOM over the canvas. Render it next to
 * the <Canvas> and pass the same ref to <Figures labels>.
 */
export function FigureLabels({
  figures,
  layer,
}: {
  figures: readonly FigureView[];
  layer: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="label-layer" ref={layer} aria-hidden="true">
      {figures.map((f) => (
        <div key={f.id} className="label-anchor" data-id={f.id}>
          <span className={`figure-label ${f.status}`} style={{ borderColor: f.color }}>
            {f.label}
            {f.lifeLeft !== undefined && <span className="life-badge">{f.lifeLeft}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * A figure off the board, drawn at its parent's origin: the same model (or
 * token) as on the board, standing on its unit card. It waits there to be
 * deployed, and goes back there once destroyed.
 */
export function CardFigure({
  cardId,
  footprint,
  pose,
  faction,
  color,
  height,
}: {
  cardId: string;
  footprint: Footprint;
  pose: number;
  faction: string;
  /** The owning player's colour. */
  color: string;
  /** The card's Height. */
  height: number;
}) {
  const display = useDisplay();
  const h = height * LEVEL_HEIGHT;
  const colors = figureColors(display.scheme, factionTheme(faction).primary, color);
  if (display.figures === "models" && UNIT_MODELS[cardId]) {
    const meshes = unitMeshes(cardId, footprint, display.tiles === "detailed");
    return (
      <group>
        <PaintedModel model={meshes.poses[pose % meshes.poses.length]!} context={{ scheme: display.scheme, main: colors.model, faction }} />
        <mesh geometry={meshes.base.top} raycast={() => null}>
          <meshStandardMaterial color={BASE_COLOR} roughness={0.75} />
        </mesh>
        <mesh geometry={meshes.base.rim} raycast={() => null}>
          <meshStandardMaterial color={colors.ring} roughness={0.55} />
        </mesh>
      </group>
    );
  }
  const bandStart = h * HIT_BAND_FROM;
  return (
    <group>
      <mesh position={[0, bandStart / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, bandStart, 24]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, bandStart + (h - bandStart) / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, h - bandStart, 24]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.5} />
      </mesh>
    </group>
  );
}
