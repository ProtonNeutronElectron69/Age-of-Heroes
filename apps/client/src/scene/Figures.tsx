import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { HEX_SIZE, HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS, hexKey, hexToWorld, type Step } from "@aoh/rules";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import { ExtrudeGeometry, Shape, ShapeGeometry, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";

export interface FigureView {
  readonly id: string;
  /** Every hex the figure covers, front first. */
  readonly spots: readonly Step[];
  readonly height: number;
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

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (e.delta > 5) return;
      e.stopPropagation();
      onClick?.(f.id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover?.(f.id);
    },
    onPointerOut: () => onHover?.(null),
  };

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
  return (
    <>
      {figures.map((f) => (
        <Token key={f.id} f={f} onClick={onClick} onHover={onHover} />
      ))}
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
