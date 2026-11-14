import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { HEX_SIZE, HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS, hex, hexKey, hexToWorld, type Footprint, type Step } from "@aoh/rules";
import { useEffect, useMemo, useRef, type RefObject } from "react";
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
  /** Advanced game: life left, shown for figures with more than 1 Life. */
  readonly lifeLeft?: number;
  /** Show a floating, spinning arrow above the figure (the figure chosen to act). */
  readonly arrow?: boolean;
}

interface Props {
  figures: readonly FigureView[];
  onClick?: (id: string) => void;
  onHover?: (id: string | null) => void;
  /** The <FigureLabels> layer drawn over the canvas, kept in step with the camera. */
  labels?: RefObject<HTMLDivElement | null>;
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
  const meshes = unitMeshes(f.cardId, f.footprint);
  const geometry = meshes.poses[f.pose % meshes.poses.length]!;
  const handlers = pointerHandlers(f.id, onClick, onHover);
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
      {/* Clicks and hovers land on the token's shape, which is what the rules measure. It is hidden, but rays still find it. */}
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
function pointerHandlers(id: string, onClick?: Props["onClick"], onHover?: Props["onHover"]) {
  return {
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

  useFrame(({ clock }) => {
    if (ring.current) {
      const pulse = f.status === "ready" || f.status === "target" ? 0.75 + 0.25 * Math.sin(clock.elapsedTime * 4) : 1;
      ring.current.scale.set(pulse, 1, pulse);
    }
  });

  const handlers = pointerHandlers(f.id, onClick, onHover);

  if (f.spots.length > 1) return <BigToken f={f} handlers={handlers} />;

  return (
    <>
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
            {/* Hit band: the part an Advanced attacker must see */}
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
    </>
  );
}

export function Figures({ figures, onClick, onHover, labels }: Props) {
  const display = useDisplay();
  const facing = useMemo(() => facings(figures), [figures]);
  return (
    <>
      {figures.map((f) =>
        display.figures === "models" && UNIT_MODELS[f.cardId] ? (
          <ModelFigure key={f.id} f={f} onClick={onClick} onHover={onHover} yaw={facing.get(f.id) ?? SIDES[0]!} scheme={display.scheme} />
        ) : (
          <Token key={f.id} f={f} onClick={onClick} onHover={onHover} />
        ),
      )}
      {labels && <LabelTracker figures={figures} layer={labels} />}
    </>
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
function LabelTracker({ figures, layer }: { figures: readonly FigureView[]; layer: RefObject<HTMLDivElement | null> }) {
  const anchors = useMemo(() => new Map(figures.map((f) => [f.id, labelAnchor(f)])), [figures]);
  const v = useMemo(() => new Vector3(), []);
  // Anchors are in board coordinates; this group shares the figures' parent, so it maps them to the world.
  const frame = useRef<Group>(null);
  useFrame(({ camera, size }) => {
    const el = layer.current;
    if (!el || !frame.current) return;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const anchor = anchors.get(child.dataset.id ?? "");
      if (anchor) frame.current.localToWorld(v.copy(anchor)).project(camera);
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
