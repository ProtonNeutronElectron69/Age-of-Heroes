import { Edges, OrbitControls } from "@react-three/drei";
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
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { BufferGeometry, CylinderGeometry, Float32BufferAttribute, MeshStandardMaterial, Vector3 } from "three";
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

/** Drives the camera from a figure's eye point, and puts it back afterwards. */
function EyeCamera({ view, center }: { view: { eye: Vec3; look: Vec3 }; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const saved = useRef<{ position: Vector3; fov: number } | null>(null);
  useEffect(() => {
    saved.current = { position: camera.position.clone(), fov: (camera as { fov?: number }).fov ?? 45 };
    return () => {
      if (saved.current) camera.position.copy(saved.current.position);
    };
  }, [camera]);
  useFrame(() => {
    camera.position.set(view.eye.x - center.x, view.eye.y, view.eye.z - center.z);
    camera.lookAt(view.look.x - center.x, view.look.y, view.look.z - center.z);
  });
  return null;
}

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
        {cells.map((cell) => {
          const { x, z } = hexToWorld(cell.hex, HEX_SIZE);
          return (
            <mesh
              key={`${hexKey(cell.hex)}@${cell.layer}`}
              geometry={geometry}
              material={materials.get(cell.terrain) ?? fallback}
              position={[x, cell.layer * LEVEL_HEIGHT + LEVEL_HEIGHT / 2, z]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                if (e.delta > DRAG_PIXELS) return;
                e.stopPropagation();
                const s = surfaceForCell(board, cell);
                if (s) onSurfaceClick?.(s, cell);
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onSurfaceHover?.(surfaceForCell(board, cell), cell);
              }}
              onPointerOut={() => onSurfaceHover?.(null, null)}
            >
              <Edges threshold={20} color="#141414" />
            </mesh>
          );
        })}
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
        target={origin ? [0, 0, 0] : [-fitted.span * 0.1, 0, 0]}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={6}
        maxDistance={Math.max(fitted.span * 2, 60)}
      />
    </>
  );
}
