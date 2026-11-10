import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { HEX_SIZE, HIT_BAND_FROM, LEVEL_HEIGHT, TOKEN_RADIUS, hexKey, hexToWorld, type Step } from "@aoh/rules";
import { useMemo, useRef, type RefObject } from "react";
import { Vector3, type Group, type Mesh } from "three";

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

/** Where a figure's name tag floats: just above its front hex. */
function labelAnchor(f: FigureView): Vector3 {
  const front = f.spots[0]!;
  const { x, z } = hexToWorld(front.hex, HEX_SIZE);
  return new Vector3(x, (front.elevation + f.height) * LEVEL_HEIGHT + 0.35, z);
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
