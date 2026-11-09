import { Edges, OrbitControls } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { hexKey, hexToWorld, type Board, type Cell, type TerrainTable } from "@aoh/rules";
import { useMemo } from "react";
import { CylinderGeometry, MeshStandardMaterial } from "three";
import { HEX_GAP, HEX_SIZE, LEVEL_HEIGHT, SEAT_COLORS } from "./scale";

interface Props {
  board: Board;
  terrain: TerrainTable;
  hovered: Cell | null;
  onHover: (cell: Cell | null) => void;
}

export function BoardScene({ board, terrain, hovered, onHover }: Props) {
  const cells = useMemo(() => board.cells(), [board]);

  const geometry = useMemo(
    () => new CylinderGeometry(HEX_SIZE * HEX_GAP, HEX_SIZE * HEX_GAP, LEVEL_HEIGHT, 6),
    [],
  );
  const markerGeometry = useMemo(
    () => new CylinderGeometry(HEX_SIZE * 0.8, HEX_SIZE * 0.8, 0.02, 6),
    [],
  );
  const materials = useMemo(() => {
    const m = new Map<string, MeshStandardMaterial>();
    for (const t of terrain.values()) {
      m.set(t.id, new MeshStandardMaterial({ color: t.color, flatShading: true, roughness: 0.9 }));
    }
    return m;
  }, [terrain]);
  const fallback = useMemo(() => new MeshStandardMaterial({ color: "#ff00ff" }), []);

  // Centre the map on the origin so the camera orbits around its middle.
  const center = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const h of board.hexes()) {
      const { x, z } = hexToWorld(h, HEX_SIZE);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  }, [board]);

  const zoneMarkers = useMemo(
    () =>
      board.definition.startZones.flatMap((zone) =>
        zone.hexes.map((h) => {
          const top = board.topSurface(h);
          const { x, z } = hexToWorld(h, HEX_SIZE);
          return { key: `${zone.seat}:${hexKey(h)}`, seat: zone.seat, x, z, y: (top?.elevation ?? 0) * LEVEL_HEIGHT + 0.012 };
        }),
      ),
    [board],
  );

  const hoverTop = hovered ? board.topSurface(hovered.hex) : undefined;
  const hoverPos = hovered ? hexToWorld(hovered.hex, HEX_SIZE) : null;

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
              onPointerOver={(e: ThreeEvent<PointerEvent>) => {
                e.stopPropagation();
                onHover(cell);
              }}
              onPointerOut={() => onHover(null)}
            >
              <Edges threshold={20} color="#141414" />
            </mesh>
          );
        })}
        {zoneMarkers.map((m) => (
          <mesh key={m.key} geometry={markerGeometry} position={[m.x, m.y, m.z]} raycast={() => null}>
            <meshBasicMaterial color={SEAT_COLORS[m.seat]} transparent opacity={0.55} />
          </mesh>
        ))}
        {hoverPos && hoverTop && (
          <mesh
            geometry={markerGeometry}
            position={[hoverPos.x, hoverTop.elevation * LEVEL_HEIGHT + 0.03, hoverPos.z]}
            raycast={() => null}
          >
            <meshBasicMaterial color="#ffffff" transparent opacity={0.45} />
          </mesh>
        )}
      </group>
      <OrbitControls makeDefault target={[-5, 0, 1]} maxPolarAngle={Math.PI / 2.15} minDistance={6} maxDistance={60} />
    </>
  );
}
