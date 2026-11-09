import { Edges, OrbitControls } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { HEX_SIZE, LEVEL_HEIGHT, hexKey, hexToWorld, type Board, type Cell, type Step, type TerrainTable } from "@aoh/rules";
import { useMemo, type ReactNode } from "react";
import { CylinderGeometry, MeshStandardMaterial } from "three";
import { HEX_GAP } from "./scale";

export interface Marker {
  readonly step: Step;
  readonly color: string;
  readonly opacity?: number;
}

interface Props {
  board: Board;
  terrain: TerrainTable;
  markers?: readonly Marker[];
  onSurfaceClick?: (step: Step) => void;
  onSurfaceHover?: (step: Step | null) => void;
  children?: ReactNode;
}

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
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ) };
}

export function BoardScene({ board, terrain, markers = [], onSurfaceClick, onSurfaceHover, children }: Props) {
  const cells = useMemo(() => board.cells(), [board]);
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
  const center = useMemo(() => boardCenter(board), [board]);

  return (
    <>
      <color attach="background" args={["#18202c"]} />
      <hemisphereLight args={["#dfe9ff", "#3a3128", 0.9]} />
      <directionalLight position={[12, 24, 10]} intensity={1.6} />
      <group position={[-center.x, 0, -center.z]}>
        {cells.map((cell) => {
          const { x, z } = hexToWorld(cell.hex, HEX_SIZE);
          return (
            <mesh
              key={`${hexKey(cell.hex)}@${cell.layer}`}
              geometry={geometry}
              material={materials.get(cell.terrain) ?? fallback}
              position={[x, cell.layer * LEVEL_HEIGHT + LEVEL_HEIGHT / 2, z]}
              onClick={(e: ThreeEvent<MouseEvent>) => {
                e.stopPropagation();
                const s = surfaceForCell(board, cell);
                if (s) onSurfaceClick?.(s);
              }}
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onSurfaceHover?.(surfaceForCell(board, cell));
              }}
              onPointerOut={() => onSurfaceHover?.(null)}
            >
              <Edges threshold={20} color="#141414" />
            </mesh>
          );
        })}
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
      <OrbitControls
        makeDefault
        target={[-center.span * 0.1, 0, 0]}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={6}
        maxDistance={center.span * 2}
      />
    </>
  );
}
