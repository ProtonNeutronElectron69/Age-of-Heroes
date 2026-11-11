import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  HEX_SIZE,
  LEVEL_HEIGHT,
  hexKey,
  hexToWorld,
  worldToHex,
  type Board,
  type Cell,
  type Hex,
  type ScenerySpot,
  type Step,
  type TerrainTable,
  type Vec3,
} from "@aoh/rules";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Matrix4,
  MeshStandardMaterial,
  Vector3,
  type InstancedMesh,
  type Material,
} from "three";
import { HEX_GAP } from "./scale";

export interface Marker {
  readonly step: Step;
  readonly color: string;
  readonly opacity?: number;
}

export interface GroundHandlers {
  /** Pointer over the empty table (or nothing) at this hex. */
  onHover: (hex: Hex | null) => void;
  onClick: (hex: Hex) => void;
}

interface Props {
  board: Board;
  terrain: TerrainTable;
  /** World point the camera orbits; defaults to the board's centre. */
  origin?: { x: number; z: number };
  markers?: readonly Marker[];
  onSurfaceClick?: (step: Step, cell: Cell) => void;
  onSurfaceHover?: (step: Step | null, cell: Cell | null) => void;
  onSceneryClick?: (spot: ScenerySpot) => void;
  /** Editor only: an invisible table top with a hex grid, for placing pieces on empty space. */
  ground?: GroundHandlers;
  /** Figure's-eye view: put the camera at `eye` looking at `look` (board coordinates). */
  eyeView?: { eye: Vec3; look: Vec3 } | null;
  children?: ReactNode;
}

/** Eye view look speed: radians per pixel dragged, and per second with the arrow keys. */
const LOOK_DRAG = 0.005;
const LOOK_KEYS = 1.6;
/** How far eye view can look up or down, short of straight up or down. */
const LOOK_PITCH_LIMIT = Math.PI / 2 - 0.05;

/**
 * Drives the camera from a figure's eye point, and puts it back afterwards.
 * It starts facing `look`; dragging or the arrow keys turn it all the way around.
 */
function EyeCamera({ view, center }: { view: { eye: Vec3; look: Vec3 }; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const saved = useRef<{ position: Vector3; fov: number } | null>(null);
  const angles = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  useEffect(() => {
    saved.current = { position: camera.position.clone(), fov: (camera as { fov?: number }).fov ?? 45 };
    return () => {
      if (saved.current) camera.position.copy(saved.current.position);
    };
  }, [camera]);

  // Face the target whenever the eye or the target changes.
  const { eye, look } = view;
  useEffect(() => {
    const dx = look.x - eye.x;
    const dy = look.y - eye.y;
    const dz = look.z - eye.z;
    angles.current = { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
  }, [eye.x, eye.y, eye.z, look.x, look.y, look.z]);

  // Drag anywhere on the board, or hold the arrow keys, to look around.
  useEffect(() => {
    let last: { x: number; y: number } | null = null;
    const turn = (dYaw: number, dPitch: number) => {
      const a = angles.current;
      a.yaw += dYaw;
      a.pitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, a.pitch + dPitch));
    };
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!last || e.buttons === 0) {
        last = null;
        return;
      }
      // Drag the scene: moving the pointer right turns the view left, like grabbing the world.
      turn((e.clientX - last.x) * LOOK_DRAG, (e.clientY - last.y) * LOOK_DRAG);
      last = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      last = null;
    };
    const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
    const keyDown = (e: KeyboardEvent) => {
      if (!ARROWS.includes(e.key) || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      keys.current.add(e.key);
    };
    const keyUp = (e: KeyboardEvent) => keys.current.delete(e.key);
    const held = keys.current;
    dom.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    return () => {
      dom.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      held.clear();
    };
  }, [dom]);

  const target = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    const k = keys.current;
    const a = angles.current;
    const step = LOOK_KEYS * Math.min(delta, 0.1);
    if (k.has("ArrowLeft")) a.yaw += step;
    if (k.has("ArrowRight")) a.yaw -= step;
    if (k.has("ArrowUp")) a.pitch = Math.min(LOOK_PITCH_LIMIT, a.pitch + step);
    if (k.has("ArrowDown")) a.pitch = Math.max(-LOOK_PITCH_LIMIT, a.pitch - step);
    const x = eye.x - center.x;
    const z = eye.z - center.z;
    camera.position.set(x, eye.y, z);
    const flat = Math.cos(a.pitch);
    target.set(x + Math.sin(a.yaw) * flat, eye.y + Math.sin(a.pitch), z + Math.cos(a.yaw) * flat);
    camera.lookAt(target);
  });
  return null;
}

/** Camera smoothing: the share of the remaining movement applied each frame (1 means none). */
const CAMERA_DAMPING = 0.25;
const CAMERA_ZOOM_SPEED = 1.4;

/** Pointer travel (pixels) beyond which a click is treated as a camera drag. */
const DRAG_PIXELS = 5;

/** The standing surface a click on a cell refers to: the top of the solid stack containing it. */
function surfaceForCell(board: Board, cell: Cell): Step | null {
  const s = board.surfaces(cell.hex).find((x) => x.elevation > cell.layer);
  return s ? { hex: cell.hex, elevation: s.elevation } : null;
}

export function boardCenter(board: Board): { x: number; z: number; span: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const h of board.hexes()) {
    const { x, z } = hexToWorld(h, HEX_SIZE);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX)) return { x: 0, z: 0, span: 30 };
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ, 12) };
}

export function SceneryMesh({ spot, onClick }: { spot: ScenerySpot; onClick?: (spot: ScenerySpot) => void }) {
  const { placement, rules } = spot;
  const { x, z } = hexToWorld(placement.hex, HEX_SIZE);
  const base = placement.elevation * LEVEL_HEIGHT;
  const h = rules.height * LEVEL_HEIGHT;
  const r = (rules.radius ?? 0.6) * HEX_SIZE;
  const handlers = onClick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > DRAG_PIXELS) return;
          e.stopPropagation();
          onClick(spot);
        },
      }
    : { raycast: () => null };
  return (
    <group position={[x, base, z]}>
      {rules.id === "tree" ? (
        <>
          <mesh position={[0, h * 0.15, 0]} {...handlers}>
            <cylinderGeometry args={[0.12, 0.16, h * 0.3, 8]} />
            <meshStandardMaterial color="#6d4c2f" flatShading />
          </mesh>
          <mesh position={[0, h * 0.62, 0]} {...handlers}>
            <coneGeometry args={[r, h * 0.76, 8]} />
            <meshStandardMaterial color={rules.color} flatShading />
          </mesh>
        </>
      ) : rules.shape === "prism" ? (
        <mesh position={[0, h / 2, 0]} {...handlers}>
          <cylinderGeometry args={[HEX_SIZE * 0.86, HEX_SIZE * 0.86, h, 6]} />
          <meshStandardMaterial color={rules.color} flatShading />
        </mesh>
      ) : (
        <mesh position={[0, h / 2, 0]} scale={[1, h / (2 * r), 1]} {...handlers}>
          <dodecahedronGeometry args={[r, 0]} />
          <meshStandardMaterial color={rules.color} flatShading />
        </mesh>
      )}
    </group>
  );
}

interface CellHandlers {
  onSurfaceClick?: Props["onSurfaceClick"];
  onSurfaceHover?: Props["onSurfaceHover"];
}

/**
 * Every cell of one terrain as a single instanced mesh: one draw call instead of
 * one per hex, and one React element instead of hundreds to reconcile.
 */
function TerrainCells({
  board,
  cells,
  geometry,
  material,
  onSurfaceClick,
  onSurfaceHover,
}: CellHandlers & { board: Board; cells: readonly Cell[]; geometry: BufferGeometry; material: Material }) {
  const mesh = useRef<InstancedMesh>(null);
  const hovered = useRef<number | null>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new Matrix4();
    cells.forEach((cell, i) => {
      const { x, z } = hexToWorld(cell.hex, HEX_SIZE);
      m.setMatrixAt(i, matrix.makeTranslation(x, cell.layer * LEVEL_HEIGHT + LEVEL_HEIGHT / 2, z));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [cells]);
  const cellAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? undefined : cells[e.instanceId]);
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, cells.length]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (e.delta > DRAG_PIXELS) return;
        const cell = cellAt(e);
        if (!cell) return;
        e.stopPropagation();
        const s = surfaceForCell(board, cell);
        if (s) onSurfaceClick?.(s, cell);
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        // While a button is held the camera is being dragged: skip hover work until it stops.
        if (e.buttons !== 0 || e.instanceId === hovered.current) return;
        hovered.current = e.instanceId ?? null;
        const cell = cellAt(e);
        if (cell) onSurfaceHover?.(surfaceForCell(board, cell), cell);
      }}
      onPointerOut={() => {
        hovered.current = null;
        onSurfaceHover?.(null, null);
      }}
    />
  );
}

/** The outline of every cell, as one set of line segments. */
function CellEdges({ cells, geometry }: { cells: readonly Cell[]; geometry: BufferGeometry }) {
  const lines = useMemo(() => {
    const edges = new EdgesGeometry(geometry, 20);
    const src = edges.getAttribute("position").array;
    const out = new Float32Array(src.length * cells.length);
    cells.forEach((cell, i) => {
      const { x, z } = hexToWorld(cell.hex, HEX_SIZE);
      const y = cell.layer * LEVEL_HEIGHT + LEVEL_HEIGHT / 2;
      const o = i * src.length;
      for (let k = 0; k < src.length; k += 3) {
        out[o + k] = src[k]! + x;
        out[o + k + 1] = src[k + 1]! + y;
        out[o + k + 2] = src[k + 2]! + z;
      }
    });
    edges.dispose();
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(out, 3));
    return g;
  }, [cells, geometry]);
  useEffect(() => () => lines.dispose(), [lines]);
  return (
    <lineSegments geometry={lines} raycast={() => null}>
      <lineBasicMaterial color="#141414" />
    </lineSegments>
  );
}

/** Hex outlines on the table around the map, so the editor shows where pieces can go. */
function HexGrid({ center }: { center: { x: number; z: number } }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const c = worldToHex(center.x, center.z, HEX_SIZE);
    const corners = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      return [Math.cos(a) * HEX_SIZE * 0.98, Math.sin(a) * HEX_SIZE * 0.98] as const;
    });
    for (let dr = -16; dr <= 16; dr++) {
      for (let dq = -22 - Math.ceil(dr / 2); dq <= 22 - Math.floor(dr / 2); dq++) {
        const { x, z } = hexToWorld({ q: c.q + dq, r: c.r + dr }, HEX_SIZE);
        for (let k = 0; k < 6; k++) {
          const [ax, az] = corners[k]!;
          const [bx, bz] = corners[(k + 1) % 6]!;
          positions.push(x + ax, 0.002, z + az, x + bx, 0.002, z + bz);
        }
      }
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return g;
  }, [center.x, center.z]);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color="#3a4658" transparent opacity={0.6} />
    </lineSegments>
  );
}

export function BoardScene({
  board,
  terrain,
  origin,
  markers = [],
  onSurfaceClick,
  onSurfaceHover,
  onSceneryClick,
  ground,
  eyeView,
  children,
}: Props) {
  const cells = useMemo(() => board.cells(), [board]);
  const cellsByTerrain = useMemo(() => {
    const groups = new Map<string, Cell[]>();
    for (const cell of cells) {
      const list = groups.get(cell.terrain);
      if (list) list.push(cell);
      else groups.set(cell.terrain, [cell]);
    }
    return [...groups];
  }, [cells]);
  const scenery = useMemo(() => board.scenery(), [board]);
  const geometry = useMemo(
    () => new CylinderGeometry(HEX_SIZE * HEX_GAP, HEX_SIZE * HEX_GAP, LEVEL_HEIGHT, 6),
    [],
  );
  const markerGeometry = useMemo(() => new CylinderGeometry(HEX_SIZE * 0.82, HEX_SIZE * 0.82, 0.03, 6), []);
  const materials = useMemo(() => {
    const m = new Map<string, MeshStandardMaterial>();
    for (const t of terrain.values()) {
      m.set(t.id, new MeshStandardMaterial({ color: t.color, flatShading: true, roughness: 0.9 }));
    }
    return m;
  }, [terrain]);
  const fallback = useMemo(() => new MeshStandardMaterial({ color: "#ff00ff" }), []);
  const fitted = useMemo(() => boardCenter(board), [board]);
  const center = origin ?? fitted;

  return (
    <>
      <color attach="background" args={["#18202c"]} />
      <hemisphereLight args={["#dfe9ff", "#3a3128", 0.9]} />
      <directionalLight position={[12, 24, 10]} intensity={1.6} />
      <group position={[-center.x, 0, -center.z]}>
        {ground && (
          <>
            <HexGrid center={center} />
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[center.x, 0, center.z]}
              onPointerMove={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                ground.onHover(worldToHex(e.point.x + center.x, e.point.z + center.z, HEX_SIZE));
              }}
              onPointerOut={() => ground.onHover(null)}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                if (e.delta > DRAG_PIXELS) return;
                e.stopPropagation();
                ground.onClick(worldToHex(e.point.x + center.x, e.point.z + center.z, HEX_SIZE));
              }}
            >
              <planeGeometry args={[200, 200]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          </>
        )}
        {cellsByTerrain.map(([terrainId, list]) => (
          <TerrainCells
            // A new key when the count changes, since an instanced mesh cannot grow.
            key={`${terrainId}:${list.length}`}
            board={board}
            cells={list}
            geometry={geometry}
            material={materials.get(terrainId) ?? fallback}
            onSurfaceClick={onSurfaceClick}
            onSurfaceHover={onSurfaceHover}
          />
        ))}
        <CellEdges cells={cells} geometry={geometry} />
        {scenery.map((spot) => (
          <SceneryMesh key={spot.placement.id} spot={spot} onClick={onSceneryClick} />
        ))}
        {markers.map((m, i) => {
          const { x, z } = hexToWorld(m.step.hex, HEX_SIZE);
          return (
            <mesh
              key={`${i}:${hexKey(m.step.hex)}@${m.step.elevation}`}
              geometry={markerGeometry}
              position={[x, m.step.elevation * LEVEL_HEIGHT + 0.02, z]}
              raycast={() => null}
            >
              <meshBasicMaterial color={m.color} transparent opacity={m.opacity ?? 0.55} depthWrite={false} />
            </mesh>
          );
        })}
        {children}
      </group>
      {eyeView && <EyeCamera view={eyeView} center={center} />}
      <OrbitControls
        makeDefault
        enabled={!eyeView}
        // The default damping (0.05) lets the camera trail the pointer and drift after release.
        dampingFactor={CAMERA_DAMPING}
        zoomSpeed={CAMERA_ZOOM_SPEED}
        target={origin ? [0, 0, 0] : [-fitted.span * 0.1, 0, 0]}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={6}
        maxDistance={Math.max(fitted.span * 2, 60)}
      />
    </>
  );
}
