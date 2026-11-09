import { Html } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { HEX_SIZE, HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS, hexToWorld, type FigurePosition } from "@aoh/rules";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

export interface FigureView {
  readonly id: string;
  readonly position: FigurePosition;
  readonly height: number;
  readonly color: string;
  readonly label: string;
  readonly hero: boolean;
  /** Visual state. */
  readonly status: "idle" | "ready" | "selected" | "spent" | "target";
}

interface Props {
  figures: readonly FigureView[];
  onClick?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

const RING: Record<FigureView["status"], string | null> = {
  idle: null,
  ready: "#ffffff",
  selected: "#ffd54a",
  spent: null,
  target: "#ff3b30",
};

function Token({ f, onClick, onHover }: { f: FigureView; onClick?: Props["onClick"]; onHover?: Props["onHover"] }) {
  const ring = useRef<Mesh>(null);
  const { x, z } = hexToWorld(f.position.hex, HEX_SIZE);
  const base = f.position.elevation * LEVEL_HEIGHT;
  const h = f.height * LEVEL_HEIGHT;
  const bandStart = h * HIT_BAND_FROM;
  const ringColor = RING[f.status];

  useFrame(({ clock }) => {
    if (ring.current) {
      const pulse = f.status === "ready" || f.status === "target" ? 0.75 + 0.25 * Math.sin(clock.elapsedTime * 4) : 1;
      ring.current.scale.set(pulse, 1, pulse);
    }
  });

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onClick?.(f.id);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover?.(f.id);
    },
    onPointerOut: () => onHover?.(null),
  };

  return (
    <group position={[x, base, z]}>
      {/* Body below the hit band */}
      <mesh position={[0, bandStart / 2, 0]} {...handlers}>
        <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, bandStart, 24]} />
        <meshStandardMaterial color={f.color} roughness={0.6} transparent={f.status === "spent"} opacity={f.status === "spent" ? 0.6 : 1} />
      </mesh>
      {/* Hit band: the part an Advanced attacker must see */}
      <mesh position={[0, bandStart + (h - bandStart) / 2, 0]} {...handlers}>
        <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, h - bandStart, 24]} />
        <meshStandardMaterial color="#f4f1ea" roughness={0.5} />
      </mesh>
      {/* Heroes get a gold cap; squads a cap in their colour */}
      <mesh position={[0, h + 0.03, 0]} raycast={() => null}>
        <cylinderGeometry args={[TOKEN_RADIUS * 0.7, TOKEN_RADIUS * 0.7, 0.06, 24]} />
        <meshStandardMaterial color={f.hero ? "#e8b730" : f.color} metalness={f.hero ? 0.6 : 0} roughness={0.4} />
      </mesh>
      {ringColor && (
        <mesh ref={ring} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <ringGeometry args={[TOKEN_RADIUS * 1.12, TOKEN_RADIUS * 1.4, 32]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      <Html position={[0, h + 0.35, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <span className={`figure-label ${f.status}`} style={{ borderColor: f.color }}>
          {f.label}
        </span>
      </Html>
    </group>
  );
}

export function Figures({ figures, onClick, onHover }: Props) {
  return (
    <>
      {figures.map((f) => (
        <Token key={f.id} f={f} onClick={onClick} onHover={onHover} />
      ))}
    </>
  );
}
