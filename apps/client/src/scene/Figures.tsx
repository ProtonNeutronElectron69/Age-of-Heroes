import type { ThreeEvent } from "@react-three/fiber";
import { useFrame, useThree } from "@react-three/fiber";
import { HEX_SIZE, HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS, hex, hexKey, hexToWorld, type Footprint, type Step } from "@aoh/rules";
import { createContext, useContext, useEffect, useMemo, useRef, type RefObject } from "react";
import { BufferGeometry, Color, ExtrudeGeometry, Shape, ShapeGeometry, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { BASE_COLOR, BASE_RADIUS, UNIT_MODELS, baseFrame, baseGeometry, figureColors, figureGeometry } from "../models";
import { useDisplay } from "../settings";
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

/** Figures to jump on the spot, so they are easy to find; a new `key` starts a jump. */
export interface FigureJump {
  readonly key: number;
  readonly ids: readonly string[];
}

interface Props {
  figures: readonly FigureView[];
  onClick?: (id: string) => void;
  onHover?: (id: string | null) => void;
  motions?: FigureMotions | null;
  jump?: FigureJump | null;
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

/** A red arrow that bobs and spins above a figure, pointing down at it. */
function SelectionArrow({ top }: { top: number }) {
  const arrow = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!arrow.current) return;
    const t = clock.elapsedTime;
    arrow.current.rotation.y = t * 2;
    arrow.current.position.y = top + ARROW_GAP + 0.18 * Math.sin(t * 3);
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

interface Animation {
  readonly motions: FigureMotions | null;
  readonly jump: FigureJump | null;
  readonly carry: FigureCarry | null;
  /** How far each figure is drawn from where it stands, for the name tags. */
  readonly offsets: Map<string, Vector3>;
  readonly onDown: (id: string, e: ThreeEvent<PointerEvent>) => void;
}

const AnimationContext = createContext<Animation | null>(null);

function worldOf(step: Step, out: Vector3): Vector3 {
  const { x, z } = hexToWorld(step.hex, HEX_SIZE);
  return out.set(x, step.elevation * LEVEL_HEIGHT, z);
}

const scratch = new Vector3();
const scratch2 = new Vector3();

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
    hop: null as { points: Vector3[]; t: number } | null,
    jumpT: -1,
  });
  useEffect(() => {
    const offsets = anim?.offsets;
    if (!offsets) return;
    const g = group.current;
    if (g) offsets.set(f.id, g.position);
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
        for (const step of [mine.from, ...mine.path]) {
          const p = worldOf(step, new Vector3()).sub(end);
          if (points.length === 0 || !points[points.length - 1]!.equals(p)) points.push(p);
        }
        st.hop = points.length > 1 ? { points, t: 0 } : null;
      }
    }
    if (st.hop) {
      const hops = st.hop.points.length - 1;
      const each = Math.min(HOP_SECONDS, HOP_MAX_SECONDS / hops);
      st.hop.t += delta;
      const at = st.hop.t / each;
      if (at >= hops) {
        st.hop = null;
        st.offset.set(0, 0, 0);
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
    g.position.set(st.offset.x, st.offset.y + up, st.offset.z);
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
  useFrame(({ clock }) => {
    if (ring.current && (f.status === "ready" || f.status === "target")) {
      ring.current.opacity = 0.55 + 0.35 * Math.sin(clock.elapsedTime * 4);
    }
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
  readonly poses: readonly BufferGeometry[];
  readonly base: { top: BufferGeometry; rim: BufferGeometry };
}

/** Built once per unit card and shared by every figure of it, for as long as the page is open. */
const meshCache = new Map<string, UnitMeshes>();

function unitMeshes(cardId: string, footprint: Footprint): UnitMeshes {
  let found = meshCache.get(cardId);
  if (!found) {
    const unit = UNIT_MODELS[cardId]!;
    found = { poses: unit.figures.map(figureGeometry), base: baseGeometry(footprint) };
    meshCache.set(cardId, found);
  }
  return found;
}

/** A figure that has acted this turn is drawn darker, as a spent token is drawn faded. */
const SPENT_SHADE = new Color("#30343a");

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
}: {
  f: FigureView;
  onClick?: Props["onClick"];
  onHover?: Props["onHover"];
  yaw: number;
  scheme: Parameters<typeof figureColors>[0];
}) {
  const ring = useRef<MeshBasicMaterial>(null);
  const moving = useFigureAnimation(f);
  const down = useContext(AnimationContext)?.onDown;
  const meshes = unitMeshes(f.cardId, f.footprint);
  const geometry = meshes.poses[f.pose % meshes.poses.length]!;
  const handlers = pointerHandlers(f.id, onClick, onHover, down);
  const h = f.height * LEVEL_HEIGHT;
  const ground = Math.max(...f.spots.map((s) => s.elevation)) * LEVEL_HEIGHT;
  const cells = f.spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
  const centre = { x: cells.reduce((n, c) => n + c.x, 0) / cells.length, z: cells.reduce((n, c) => n + c.z, 0) / cells.length };
  // A figure on several hexes faces from the middle of its base to its front hex, as on the model page.
  const turn = cells.length > 1 ? Math.atan2(cells[0]!.x - centre.x, cells[0]!.z - centre.z) : yaw;

  const colors = figureColors(scheme, factionTheme(f.faction).primary, f.color);
  const modelColor = useMemo(() => {
    const c = new Color(colors.model);
    return f.status === "spent" ? c.lerp(SPENT_SHADE, 0.45) : c;
  }, [colors.model, f.status]);

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
  useFrame(({ clock }) => {
    if (ring.current) {
      ring.current.opacity = f.status === "ready" || f.status === "target" ? 0.6 + 0.35 * Math.sin(clock.elapsedTime * 4) : 0.95;
    }
  });

  return (
    <>
      <group ref={moving}>
      <group position={[centre.x, ground, centre.z]}>
        <group rotation={[0, turn, 0]}>
          <mesh geometry={geometry} raycast={() => null}>
            <meshStandardMaterial color={modelColor} roughness={0.7} />
          </mesh>
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

  useFrame(({ clock }) => {
    if (ring.current) {
      const pulse = f.status === "ready" || f.status === "target" ? 0.75 + 0.25 * Math.sin(clock.elapsedTime * 4) : 1;
      ring.current.scale.set(pulse, 1, pulse);
    }
  });

  const handlers = pointerHandlers(f.id, onClick, onHover, down);

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
      </group>
    </group>
  );
}

/** Pointer travel (pixels) that turns a press on a figure into a drag. */
const DRAG_PIXELS = 5;

export function Figures({ figures, onClick, onHover, labels, style, motions = null, jump = null, carry = null, canDrag, onDragStart, onDragEnd }: Props) {
  const display = useDisplay();
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

  const animation = useMemo<Animation>(() => ({ motions, jump, carry, offsets, onDown }), [motions, jump, carry, offsets, onDown]);
  return (
    <AnimationContext.Provider value={animation}>
      {figures.map((f) =>
        drawn === "models" && UNIT_MODELS[f.cardId] ? (
          <ModelFigure key={f.id} f={f} onClick={onClick} onHover={onHover} yaw={facing.get(f.id) ?? SIDES[0]!} scheme={display.scheme} />
        ) : (
          <Token key={f.id} f={f} onClick={onClick} onHover={onHover} />
        ),
      )}
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

/** Moves the DOM name tags to follow their figures on screen, every frame. */
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
    const meshes = unitMeshes(cardId, footprint);
    return (
      <group>
        <mesh geometry={meshes.poses[pose % meshes.poses.length]!} raycast={() => null}>
          <meshStandardMaterial color={colors.model} roughness={0.7} />
        </mesh>
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
