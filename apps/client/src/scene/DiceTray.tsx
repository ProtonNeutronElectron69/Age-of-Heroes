import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import {
  CanvasTexture,
  MeshStandardMaterial,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Group,
  type Mesh,
  type PerspectiveCamera,
  type SpotLight,
} from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { cubeMaterialsFor, d20Geometry, d20MaterialFor } from "./dice3d";
import { DIE_SIZE, FRAME_RATE, WALL_HEIGHT, type DieKind, type PlayedDie } from "./diceRoll";
import { useWake } from "./wake";

/**
 * The dice tray of the attack scene and the initiative roll: a felt-lined wooden tray on a wooden
 * table under a warm lamp, with the dice of a throw (`diceRoll.ts`) played back in it. In an attack
 * the figures stand on the table at the tray's two ends, outside its walls, so no die can reach them.
 */

/** How thick the tray's walls are, and how high the felt is off the table (the walls' height is `WALL_HEIGHT`). */
export const WALL_THICK = 0.45;
export const FELT_HEIGHT = 0.22;

// ---- Textures, painted in code ---------------------------------------------------

/** A repeatable random source for the textures, so every tray looks the same. */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return [c, c.getContext("2d")!];
}

function texture(c: HTMLCanvasElement, repeat: number): CanvasTexture {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** Felt: a deep green with a fine speckle of lighter and darker fibres. */
function feltTexture(): CanvasTexture {
  const [c, g] = canvas(256);
  g.fillStyle = "#1f4d3a";
  g.fillRect(0, 0, 256, 256);
  const r = noise(7);
  for (let i = 0; i < 9000; i++) {
    const light = r() > 0.5;
    g.fillStyle = light ? `rgba(120, 170, 140, ${0.05 + r() * 0.08})` : `rgba(5, 20, 12, ${0.08 + r() * 0.12})`;
    const x = r() * 256, y = r() * 256, a = r() * Math.PI;
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillRect(-1.5, -0.4, 3, 0.8);
    g.restore();
  }
  return texture(c, 3);
}

/** Wood: long grain lines over a base colour, with a knot or two. */
function woodTexture(base: string, dark: string, light: string, seed: number): CanvasTexture {
  const [c, g] = canvas(512);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  const r = noise(seed);
  for (let i = 0; i < 140; i++) {
    const y = r() * 512;
    const wave = 2 + r() * 6;
    const freq = 0.004 + r() * 0.01;
    g.strokeStyle = r() > 0.6 ? light : dark;
    g.globalAlpha = 0.08 + r() * 0.22;
    g.lineWidth = 0.6 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= 512; x += 8) g.lineTo(x, y + Math.sin(x * freq + i) * wave);
    g.stroke();
  }
  g.globalAlpha = 0.35;
  for (let k = 0; k < 2; k++) {
    const x = 80 + r() * 350, y = 80 + r() * 350;
    for (let ring = 1; ring < 6; ring++) {
      g.strokeStyle = dark;
      g.lineWidth = 1.4;
      g.beginPath();
      g.ellipse(x, y, ring * 5, ring * 2.4, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  g.globalAlpha = 1;
  return texture(c, 1);
}

let materials: { felt: MeshStandardMaterial; rim: MeshStandardMaterial; table: MeshStandardMaterial } | null = null;
function trayMaterials() {
  materials ??= {
    felt: new MeshStandardMaterial({ map: feltTexture(), roughness: 1 }),
    rim: new MeshStandardMaterial({ map: woodTexture("#6e4226", "#3c2213", "#a26b40", 11), roughness: 0.55 }),
    table: new MeshStandardMaterial({ map: woodTexture("#3a271b", "#1d130c", "#5c4029", 23), roughness: 0.7 }),
  };
  return materials;
}

let dieGeometry: RoundedBoxGeometry | null = null;

// ---- The tray ----------------------------------------------------------------------

/** The table, the tray of the given inside half sizes, and the lamp over it. */
export function TraySet({ halfX, halfZ }: { halfX: number; halfZ: number }) {
  const m = trayMaterials();
  const spot = useRef<SpotLight>(null);
  const outerX = halfX + WALL_THICK;
  const outerZ = halfZ + WALL_THICK;
  const wallY = (WALL_HEIGHT - FELT_HEIGHT) / 2;
  const wallH = WALL_HEIGHT + FELT_HEIGHT;
  useLayoutEffect(() => {
    const light = spot.current;
    if (!light) return;
    light.target.position.set(0, 0, 0);
    light.target.updateMatrixWorld();
  }, []);
  // Each wall's wood runs along it.
  const walls: { at: [number, number, number]; size: [number, number, number] }[] = [
    { at: [0, wallY, -outerZ + WALL_THICK / 2], size: [outerX * 2, wallH, WALL_THICK] },
    { at: [0, wallY, outerZ - WALL_THICK / 2], size: [outerX * 2, wallH, WALL_THICK] },
    { at: [-outerX + WALL_THICK / 2, wallY, 0], size: [WALL_THICK, wallH, halfZ * 2] },
    { at: [outerX - WALL_THICK / 2, wallY, 0], size: [WALL_THICK, wallH, halfZ * 2] },
  ];
  return (
    <>
      <color attach="background" args={["#120c08"]} />
      <fog attach="fog" args={["#120c08", 18, 42]} />
      <hemisphereLight args={["#ffe9c9", "#2a1a10", 0.55]} />
      <spotLight
        ref={spot}
        position={[1.5, 16, 7]}
        angle={0.62}
        penumbra={0.75}
        decay={0}
        intensity={3.2}
        color="#fff0d8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-camera-near={6}
        shadow-camera-far={30}
      />
      <directionalLight position={[-6, 5, 10]} intensity={0.45} color="#c8d6ff" />
      {/* The table. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -FELT_HEIGHT, 0]} material={m.table} receiveShadow raycast={() => null}>
        <planeGeometry args={[80, 80]} />
      </mesh>
      {/* The felt floor. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={m.felt} receiveShadow raycast={() => null}>
        <planeGeometry args={[halfX * 2, halfZ * 2]} />
      </mesh>
      {walls.map((w, i) => (
        <mesh key={i} position={w.at} material={m.rim} castShadow receiveShadow raycast={() => null}>
          <boxGeometry args={w.size} />
        </mesh>
      ))}
    </>
  );
}

// ---- The dice ------------------------------------------------------------------------

/** An attack or defense die. */
export function CubeDie({ kind }: { kind: DieKind }) {
  dieGeometry ??= new RoundedBoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE, 3, DIE_SIZE * 0.1);
  return <mesh geometry={dieGeometry} material={cubeMaterialsFor(kind)} castShadow receiveShadow raycast={() => null} />;
}

/** An initiative d20 in its player's colour. */
export function D20Die({ color }: { color: string }) {
  return <mesh geometry={d20Geometry()} material={d20MaterialFor(color)} castShadow receiveShadow raycast={() => null} />;
}

/**
 * Plays back a throw: every die follows its recorded path, and each one is reported as it comes
 * to rest. `still` shows the end at once (reduced motion). `draw` gives each die's drawing;
 * `hidden` dice are left out (a d20 picked up to be thrown again).
 */
export function ThrownDice({
  dice,
  frameCount,
  draw,
  still,
  hidden,
  onLanded,
  cueAt,
  onCue,
}: {
  dice: readonly PlayedDie[];
  frameCount: number;
  draw: (n: number) => ReactNode;
  still: boolean;
  hidden?: readonly boolean[];
  /** A die has come to rest. */
  onLanded?: (n: number) => void;
  /** A frame to be told of as it plays (the defense dice leaving the hand, for their sound). */
  cueAt?: number;
  onCue?: () => void;
}) {
  const groups = useRef<(Group | null)[]>([]);
  const started = useRef<number | null>(null);
  const reported = useRef<boolean[]>([]);
  const cued = useRef(false);
  const finished = useRef(false);
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const report = useRef({ onLanded, onCue });
  report.current = { onLanded, onCue };
  const work = useMemo(() => ({ a: new Vector3(), b: new Vector3(), qa: new Quaternion(), qb: new Quaternion() }), []);
  useEffect(() => {
    started.current = null;
    reported.current = dice.map(() => false);
    cued.current = false;
    finished.current = false;
    wake();
  }, [dice, wake]);
  useFrame(({ clock }) => {
    if (finished.current) return;
    started.current ??= clock.elapsedTime;
    const last = frameCount - 1;
    const f = still ? last : Math.min(last, (clock.elapsedTime - started.current) * FRAME_RATE);
    const i0 = Math.floor(f);
    const i1 = Math.min(last, i0 + 1);
    const t = f - i0;
    dice.forEach((die, n) => {
      const g = groups.current[n];
      if (!g) return;
      g.visible = f >= die.thrown;
      const p = die.frames;
      work.a.set(p[i0 * 7]!, p[i0 * 7 + 1]!, p[i0 * 7 + 2]!);
      work.b.set(p[i1 * 7]!, p[i1 * 7 + 1]!, p[i1 * 7 + 2]!);
      g.position.lerpVectors(work.a, work.b, t);
      work.qa.set(p[i0 * 7 + 3]!, p[i0 * 7 + 4]!, p[i0 * 7 + 5]!, p[i0 * 7 + 6]!);
      work.qb.set(p[i1 * 7 + 3]!, p[i1 * 7 + 4]!, p[i1 * 7 + 5]!, p[i1 * 7 + 6]!);
      g.quaternion.slerpQuaternions(work.qa, work.qb, t).multiply(die.remap);
      if (!reported.current[n] && f >= die.landed) {
        reported.current[n] = true;
        report.current.onLanded?.(n);
      }
    });
    if (!cued.current && cueAt !== undefined && f >= cueAt && !still) {
      cued.current = true;
      report.current.onCue?.();
    }
    if (f >= last) finished.current = true;
    invalidate();
  });
  return (
    <>
      {dice.map((_, n) => (
        <group key={n} ref={(g) => void (groups.current[n] = g)} visible={false}>
          {!hidden?.[n] && draw(n)}
        </group>
      ))}
    </>
  );
}

// ---- Framing -------------------------------------------------------------------------

/**
 * Points the camera down at the tray from in front, close enough that everything within `halfWidth`
 * of the middle (across) and `halfDepth` (front to back) fills the view, whatever the canvas's shape.
 */
export function FrameView({ halfWidth, halfDepth, height, pitch, aim = [0, 0, 0] }: { halfWidth: number; halfDepth: number; height: number; pitch: number; aim?: [number, number, number] }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  useLayoutEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const v = (camera.fov * Math.PI) / 360;
    const h = Math.atan(Math.tan(v) * aspect);
    // Seen at this pitch, the tray's depth and the figures' height shrink and grow on screen.
    const tall = Math.max(halfDepth * Math.sin(pitch), height * Math.cos(pitch) * 0.6);
    const distance = Math.max(halfWidth / Math.tan(h), tall / Math.tan(v)) * 1.02 + halfDepth * Math.cos(pitch) * 0.6;
    const target = new Vector3(...aim);
    camera.position.set(target.x, target.y + Math.sin(pitch) * distance, target.z + Math.cos(pitch) * distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size.width, size.height, halfWidth, halfDepth, height, pitch, aim[0], aim[1], aim[2]]);
  return null;
}

/** Makes every mesh inside cast a shadow on the felt and the table. */
export function CastShadows({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null);
  useFrame(() => {
    group.current?.traverse((o) => {
      if ((o as Mesh).isMesh) o.castShadow = true;
    });
  });
  return <group ref={group}>{children}</group>;
}
