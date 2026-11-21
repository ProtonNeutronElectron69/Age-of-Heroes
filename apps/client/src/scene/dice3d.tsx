import { useFrame, useThree } from "@react-three/fiber";
import type { DieFace } from "@aoh/rules";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import {
  CanvasTexture,
  Float32BufferAttribute,
  IcosahedronGeometry,
  MeshStandardMaterial,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type Group,
} from "three";
import { CUBE_FACES, CUBE_NORMALS, type DieKind } from "./diceRoll";
import { useWake } from "./wake";

export type { DieKind };

/**
 * 3D dice that tumble and land on a result the rules have already rolled.
 * The engine rolls everything in one step; these only show it. The attack and
 * defense dice are thrown into a tray (`DiceTray`), played back from a throw
 * worked out in advance (`diceRoll.ts`); the initiative d20 is told its number
 * and where to land, and settles there. With reduced motion every die is drawn
 * already landed.
 */

// ---- Faces ----------------------------------------------------------------------

/** The skull and shield from the dice panel (24 by 24 drawings). */
const SKULL =
  "M12 3c-4.4 0-8 3.2-8 7.4 0 2.5 1.3 4.6 3.3 5.9V19c0 .6.4 1 1 1h1.2v-2h1.5v2h2v-2h1.5v2h1.2c.6 0 1-.4 1-1v-2.7c2-1.3 3.3-3.4 3.3-5.9C20 6.2 16.4 3 12 3Zm-3.2 9.6a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Zm6.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z";
const SHIELD = "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z";

/** Colours as in the dice panel: ivory with red skulls, pale blue with blue shields. */
const LOOK: Record<DieKind, { body: string; edge: string; mark: string }> = {
  attack: { body: "#f4f1ea", edge: "#cfc6b4", mark: "#e0503c" },
  defense: { body: "#cfe0f6", edge: "#9fb6d6", mark: "#2f7ad8" },
};

function faceTexture(kind: DieKind, face: DieFace): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext("2d")!;
  const look = LOOK[kind];
  g.fillStyle = look.edge;
  g.fillRect(0, 0, size, size);
  g.fillStyle = look.body;
  g.beginPath();
  g.roundRect(size * 0.04, size * 0.04, size * 0.92, size * 0.92, size * 0.14);
  g.fill();
  if (face !== "blank") {
    g.save();
    g.translate(size * 0.14, size * 0.14);
    g.scale((size * 0.72) / 24, (size * 0.72) / 24);
    g.fillStyle = look.mark;
    g.fill(new Path2D(face === "skull" ? SKULL : SHIELD));
    g.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

let cubeMaterials: Record<DieKind, MeshStandardMaterial[]> | null = null;
/** The six face materials of each kind of cube die, made once and shared. */
export function cubeMaterialsFor(kind: DieKind): MeshStandardMaterial[] {
  cubeMaterials ??= {
    attack: CUBE_FACES.attack.map((f) => new MeshStandardMaterial({ map: faceTexture("attack", f), roughness: 0.32 })),
    defense: CUBE_FACES.defense.map((f) => new MeshStandardMaterial({ map: faceTexture("defense", f), roughness: 0.32 })),
  };
  return cubeMaterials[kind];
}


// ---- The d20 ---------------------------------------------------------------------

export interface D20Face {
  /** Outward normal and the direction the number's top points, in the die's own space. */
  readonly normal: Vector3;
  readonly up: Vector3;
}

/** Each triangle's corner positions in its atlas cell (u, v), top corner first, anticlockwise. */
const CELL_CORNERS = [
  [0.5, 0.92],
  [0.06, 0.16],
  [0.94, 0.16],
] as const;
const ATLAS_COLUMNS = 5;
const ATLAS_ROWS = 4;

let d20: { geometry: IcosahedronGeometry; material: MeshStandardMaterial; faces: D20Face[] } | null = null;

/** The d20's shape, with atlas places for its numbers, and each face's normal and number direction (face i shows i + 1). */
export function d20Shape(): { geometry: IcosahedronGeometry; faces: D20Face[] } {
  const geometry = new IcosahedronGeometry(1, 0);
  const position = geometry.getAttribute("position");
  const uv: number[] = [];
  const faces: D20Face[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let f = 0; f < position.count / 3; f++) {
    a.fromBufferAttribute(position, f * 3);
    b.fromBufferAttribute(position, f * 3 + 1);
    c.fromBufferAttribute(position, f * 3 + 2);
    const normal = new Vector3().subVectors(b, a).cross(new Vector3().subVectors(c, a)).normalize();
    const up = a.clone().sub(b.clone().add(c).multiplyScalar(0.5)).normalize();
    faces.push({ normal, up });
    const col = f % ATLAS_COLUMNS;
    const row = Math.floor(f / ATLAS_COLUMNS);
    for (const [u, v] of CELL_CORNERS) uv.push((col + u) / ATLAS_COLUMNS, 1 - (row + 1 - v) / ATLAS_ROWS);
  }
  geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  return { geometry, faces };
}

/** The d20, with the numbers 1 to 20 painted on, made once and shared. */
function d20Parts() {
  if (d20) return d20;
  const { geometry, faces } = d20Shape();
  const cell = 160;
  const canvas = document.createElement("canvas");
  canvas.width = cell * ATLAS_COLUMNS;
  canvas.height = cell * ATLAS_ROWS;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#f4f1ea";
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#1b1405";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 ${Math.round(cell * 0.36)}px Georgia, "Times New Roman", serif`;
  for (let f = 0; f < faces.length; f++) {
    const x = (f % ATLAS_COLUMNS) * cell + cell / 2;
    // The triangle's middle sits a little below the cell's middle.
    const y = Math.floor(f / ATLAS_COLUMNS) * cell + cell * 0.6;
    const text = String(f + 1);
    g.fillText(text, x, y);
    // 6 and 9 are underlined, as on real dice.
    if (text === "6" || text === "9") g.fillRect(x - cell * 0.09, y + cell * 0.15, cell * 0.18, cell * 0.025);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.4, flatShading: true });
  d20 = { geometry, material, faces };
  return d20;
}

// ---- Landing --------------------------------------------------------------------

const WORLD_UP = new Vector3(0, 1, 0);

/** Turns a die so the face with `normal` points along `toward`, with its `up` as close to `screenUp` as it can be. */
function landing(normal: Vector3, up: Vector3 | null, toward: Vector3, screenUp: Vector3 | null, yaw: number): Quaternion {
  const q = new Quaternion().setFromUnitVectors(normal, toward);
  if (up && screenUp) {
    const turned = up.clone().applyQuaternion(q);
    const want = screenUp.clone().sub(toward.clone().multiplyScalar(screenUp.dot(toward))).normalize();
    const angle = Math.atan2(turned.clone().cross(want).dot(toward), turned.dot(want));
    q.premultiply(new Quaternion().setFromAxisAngle(toward, angle));
  } else {
    q.premultiply(new Quaternion().setFromAxisAngle(toward, yaw));
  }
  return q;
}

/** A small repeatable random source, so a die tumbles the same way each time it is drawn. */
function random(seed: number): () => number {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

interface Throw {
  /** Where the die lands, and seconds after the roll starts that it begins to fall. */
  readonly at: readonly [number, number, number];
  readonly delay?: number;
  /** How long the tumble takes. */
  readonly duration?: number;
  /** How many times it bounces as it lands (2 by default); a longer roll can bounce more. */
  readonly bounces?: number;
  /** Seed for its path and spin. */
  readonly seed: number;
  /** A new value throws the die again, even if it lands on the same face. */
  readonly throwKey?: unknown;
  /** Drawn already landed (reduced motion, or a skipped roll). */
  readonly still?: boolean;
  /** Called once, when it has landed. */
  readonly onLanded?: () => void;
}

/** How long a die tumbles unless told otherwise, in seconds. */
const DEFAULT_TUMBLE = 1.1;

/** Moves a die from above and to the side of its spot to the spot, tumbling into its landing turn. */
function useTumble(group: RefObject<Group | null>, final: Quaternion, t: Throw) {
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const path = useMemo(() => {
    const r = random(t.seed);
    const axis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    // A longer roll spins for longer too, so it does not look slowed down.
    const turns = (2 + Math.floor(r() * 2)) * Math.max(1, (t.duration ?? DEFAULT_TUMBLE) / DEFAULT_TUMBLE);
    return { axis, turns, from: new Vector3(t.at[0] + (r() - 0.5) * 4, t.at[1] + 3.5, t.at[2] + 2 + r() * 2) };
  }, [t.seed, t.at, t.duration]);
  const started = useRef<number | null>(null);
  const landed = useRef(false);
  const onLanded = useRef(t.onLanded);
  onLanded.current = t.onLanded;
  const spin = useMemo(() => new Quaternion(), []);
  useEffect(() => {
    started.current = null;
    landed.current = false;
    wake();
  }, [final, t.still, t.throwKey, wake]);
  useFrame(({ clock }) => {
    const g = group.current;
    if (!g || landed.current) return;
    started.current ??= clock.elapsedTime;
    const duration = t.duration ?? DEFAULT_TUMBLE;
    const since = clock.elapsedTime - started.current - (t.delay ?? 0);
    const u = t.still ? 1 : Math.min(1, Math.max(0, since / duration));
    // A die waiting its turn is not shown yet, rather than hanging where it will be thrown from.
    g.visible = t.still === true || since >= 0;
    const ease = 1 - (1 - u) ** 3;
    g.position.lerpVectors(path.from, new Vector3(...t.at), ease);
    // Bounces as it lands, each lower than the last.
    const bounces = t.bounces ?? 2;
    g.position.y += Math.abs(Math.sin(u * Math.PI * (bounces + 0.5))) * (1 - u) ** (bounces > 2 ? 1.4 : 1) * 0.9;
    spin.setFromAxisAngle(path.axis, (1 - ease) * path.turns * Math.PI * 2);
    g.quaternion.copy(final).premultiply(spin);
    if (u >= 1) {
      landed.current = true;
      onLanded.current?.();
    }
    invalidate();
  });
}

/** How a cube die rests to show `face` on top: one of the sides with that face, turned a random way about the vertical. */
export function cubeLanding(kind: DieKind, face: DieFace, seed: number): Quaternion {
  const r = random(seed + 7);
  const sides = CUBE_FACES[kind].map((f, i) => (f === face ? i : -1)).filter((i) => i >= 0);
  const side = sides[Math.floor(r() * sides.length)]!;
  return landing(CUBE_NORMALS[side]!, null, WORLD_UP, null, r() * Math.PI * 2);
}

/** The face a cube die shows on top when turned by `q`. */
export function cubeTopFace(kind: DieKind, q: Quaternion): DieFace {
  let best = 0;
  let bestUp = -Infinity;
  CUBE_NORMALS.forEach((n, i) => {
    const up = n.clone().applyQuaternion(q).y;
    if (up > bestUp) {
      bestUp = up;
      best = i;
    }
  });
  return CUBE_FACES[kind][best]!;
}

/** How a d20 rests to show `value` (1 to 20) towards `toward`, its number upright. */
export function d20Landing(faces: readonly D20Face[], value: number, toward: Vector3): Quaternion {
  const face = faces[Math.min(19, Math.max(0, value - 1))]!;
  return landing(face.normal, face.up, toward.clone().normalize(), WORLD_UP, 0);
}

/** A d20 that lands showing `value` (1 to 20) to a camera in direction `toward` from it. */
export function D20Die({ value, toward, ...t }: { value: number; toward: readonly [number, number, number] } & Throw) {
  const group = useRef<Group>(null);
  const parts = d20Parts();
  const final = useMemo(() => d20Landing(parts.faces, value, new Vector3(...toward)), [value, toward[0], toward[1], toward[2]]);
  useTumble(group, final, t);
  return (
    <group ref={group} position={[t.at[0], t.at[1] + 3.5, t.at[2]]} visible={t.still === true || !t.delay}>
      <mesh geometry={parts.geometry} material={parts.material} />
    </group>
  );
}

/** Soft light for a dice tray: an ambient fill and one warm key light from above. */
export function TrayLights() {
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[3, 8, 5]} intensity={2.2} />
    </>
  );
}
