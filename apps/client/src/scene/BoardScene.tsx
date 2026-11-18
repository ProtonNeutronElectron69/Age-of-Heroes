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
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  MOUSE,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type InstancedMesh,
  type Material,
  PerspectiveCamera,
} from "three";
import { TEST_MODE } from "../testMode";
import { HEX_GAP } from "./scale";
import { useBoardActivity } from "./activity";
import { useWake } from "./wake";

export interface Marker {
  readonly step: Step;
  readonly color: string;
  readonly opacity?: number;
  /** A marker that takes clicks: drawn as a see-through column this many levels tall, over any figure there. */
  readonly onClick?: () => void;
  readonly height?: number;
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
  /** Every pointer move over a cell, with the point under the pointer (board coordinates). */
  onCellPointer?: (cell: Cell, point: { x: number; z: number }) => void;
  /** Editor only: an invisible table top with a hex grid, for placing pieces on empty space. */
  ground?: GroundHandlers;
  /** "select": the left button is left free (for dragging out a box) and the right button turns the camera. */
  leftButton?: "camera" | "select";
  /** Move the camera to look at this point (board coordinates) whenever `key` changes. */
  focus?: CameraFocusRequest | null;
  /** Figure's-eye view: put the camera at `eye` looking at `look` (board coordinates). */
  eyeView?: { eye: Vec3; look: Vec3 } | null;
  /** A backdrop only: no camera controls or keyboard panning; the caller moves the camera. */
  still?: boolean;
  /** The colour behind everything (the room a gaming table stands in). */
  backdrop?: string;
  /** A figure is being dragged: report the hex under the pointer although a button is held. */
  dragging?: boolean;
  /** A middle click (not a drag) on the board: the surface under the pointer, and where on screen the click was. */
  onInspect?: (hit: HexInspect) => void;
  children?: ReactNode;
}

/** A hex the player middle-clicked, for its terrain tooltip. */
export interface HexInspect {
  readonly step: Step;
  readonly cell: Cell;
  /** Where the click was, in page coordinates. */
  readonly x: number;
  readonly y: number;
}

/** Eye view look speed: radians per pixel dragged, and per second with the arrow keys. */
const LOOK_DRAG = 0.005;
const LOOK_KEYS = 1.6;
/** How far eye view can look up or down, short of straight up or down. */
const LOOK_PITCH_LIMIT = Math.PI / 2 - 0.05;
/**
 * Eye view's vertical field of view, in degrees. The map camera's 45 is a long lens:
 * from a figure's eyes it made the battlefield look squashed together.
 */
const EYE_FOV = 70;

/**
 * Drives the camera from a figure's eye point, and puts it back afterwards.
 * It starts facing `look`; dragging or the arrow keys turn it all the way around.
 */
function EyeCamera({ view, center }: { view: { eye: Vec3; look: Vec3 }; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const dom = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const saved = useRef<{ position: Vector3; fov: number } | null>(null);
  const angles = useRef({ yaw: 0, pitch: 0 });
  const keys = useRef(new Set<string>());
  useEffect(() => {
    const lens = camera as PerspectiveCamera;
    saved.current = { position: camera.position.clone(), fov: lens.fov ?? 45 };
    if (lens.isPerspectiveCamera) {
      lens.fov = EYE_FOV;
      lens.updateProjectionMatrix();
    }
    return () => {
      if (!saved.current) return;
      camera.position.copy(saved.current.position);
      if (lens.isPerspectiveCamera) {
        lens.fov = saved.current.fov;
        lens.updateProjectionMatrix();
      }
    };
  }, [camera]);

  // Face the target whenever the eye or the target changes.
  const { eye, look } = view;
  useEffect(() => {
    const dx = look.x - eye.x;
    const dy = look.y - eye.y;
    const dz = look.z - eye.z;
    angles.current = { yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
    invalidate();
  }, [eye.x, eye.y, eye.z, look.x, look.y, look.z, invalidate]);

  // Drag anywhere on the board, or hold the arrow keys, to look around.
  useEffect(() => {
    let last: { x: number; y: number } | null = null;
    const turn = (dYaw: number, dPitch: number) => {
      const a = angles.current;
      a.yaw += dYaw;
      a.pitch = Math.max(-LOOK_PITCH_LIMIT, Math.min(LOOK_PITCH_LIMIT, a.pitch + dPitch));
      invalidate();
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
      wake();
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
  }, [dom, invalidate, wake]);

  const target = useMemo(() => new Vector3(), []);
  const drawn = useRef({ yaw: NaN, pitch: NaN });
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
    // Keep turning while an arrow key is held, and draw once more after the view last turned,
    // so the name tags (placed in the same frame, perhaps before the camera moved) catch up.
    const turned = a.yaw !== drawn.current.yaw || a.pitch !== drawn.current.pitch;
    drawn.current = { yaw: a.yaw, pitch: a.pitch };
    if (k.size > 0 || turned) invalidate();
  });
  return null;
}

/** WASD pan speed, as a share of the camera's distance from its target per second. */
const PAN_SPEED = 0.9;
/**
 * The camera's near plane, as a share of its distance from the point it looks at, and never
 * nearer than NEAR_LEAST. A fixed near plane of 0.1 left the depth buffer too coarse far out:
 * layers of the gaming table a hundredth of a unit apart flickered through each other.
 */
const NEAR_SHARE = 0.02;
const NEAR_LEAST = 0.1;

/** Keeps the near plane in step with the zoom (close in eye view, where the camera stands among the figures). */
function DepthRange({ eye }: { eye: boolean }) {
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3 } | null;
  useFrame(({ camera }) => {
    if (!(camera instanceof PerspectiveCamera)) return;
    const distance = !eye && controls ? camera.position.distanceTo(controls.target) : 0;
    const near = Math.max(NEAR_LEAST, distance * NEAR_SHARE);
    if (Math.abs(camera.near - near) <= near * 0.05) return;
    camera.near = near;
    camera.updateProjectionMatrix();
  });
  return null;
}

const PAN_KEYS: Record<string, [number, number]> = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };

/** Pans the map camera with W, A, S and D, relative to where the camera faces. */
function KeyboardPan() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: Vector3; update: () => void } | null;
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const held = useRef(new Set<string>());
  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in PAN_KEYS) || typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      held.current.add(k);
      wake();
    };
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase());
    const clear = () => held.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [wake]);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const move = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    if (!controls || held.current.size === 0) return;
    let ahead = 0;
    let side = 0;
    for (const k of held.current) {
      ahead += PAN_KEYS[k]![1];
      side += PAN_KEYS[k]![0];
    }
    if (ahead === 0 && side === 0) return;
    camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) return;
    forward.normalize();
    right.set(-forward.z, 0, forward.x);
    const speed = camera.position.distanceTo(controls.target) * PAN_SPEED * Math.min(delta, 0.1);
    move.copy(forward).multiplyScalar(ahead).addScaledVector(right, side).normalize().multiplyScalar(speed);
    camera.position.add(move);
    controls.target.add(move);
    controls.update();
    // Keep panning while a key is held.
    invalidate();
  });
  return null;
}

/** How close the camera comes when it jumps to a point. */
const FOCUS_DISTANCE = 16;
/**
 * How fast it gets there: the share of the remaining way covered each second is
 * 1 - e^-FOCUS_RATE, so most of a glide takes about 0.3 seconds at any frame rate.
 * After FOCUS_MAX_SECONDS it snaps the last bit.
 */
const FOCUS_RATE = 10;
const FOCUS_MAX_SECONDS = 0.8;
/** The longest the camera waits for hops to land (a long hop takes 2.4 seconds), in case one is never reported. */
const FOCUS_WAIT_SECONDS = 3;

/** A request to move the camera; a new `key` starts a move. */
export interface CameraFocusRequest {
  readonly point: Vec3;
  readonly key: number;
  /**
   * Also set the view: look from this direction (it need not be unit length) at this distance.
   * With `either`, look from this side or the opposite one, whichever is nearer the current view.
   */
  readonly frame?: { readonly from: Vec3; readonly distance: number; readonly either?: boolean };
  /**
   * Which parts of a framed move to make (all by default): move to the point,
   * turn to the frame's direction, and come to the frame's distance. What is
   * left out stays as the player set it.
   */
  readonly parts?: { readonly pan: boolean; readonly rotate: boolean; readonly zoom: boolean };
}

const ALL_PARTS = { pan: true, rotate: true, zoom: true } as const;

/**
 * Glides the map camera to look at a point. Without a frame it keeps its angle
 * and comes no further away than FOCUS_DISTANCE; with one it ends at the
 * frame's distance and direction, or makes only the parts asked for. It waits
 * while any figure is still hopping along a move, so the camera never leaves a
 * figure mid-move. Turning or zooming the camera by hand stops it.
 */
function CameraFocus({ focus, center }: { focus: CameraFocusRequest; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: Vector3;
    update: () => void;
    addEventListener?: (type: string, fn: () => void) => void;
    removeEventListener?: (type: string, fn: () => void) => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const activity = useBoardActivity();
  const goal = useRef<{
    target: Vector3;
    view: { direction: Vector3; distance: number; parts: NonNullable<CameraFocusRequest["parts"]> } | null;
    age: number;
    waited: number;
  } | null>(null);
  const { point, key, frame, parts } = focus;
  const setGoal = (g: typeof goal.current) => {
    goal.current = g;
    activity.gliding = g !== null;
  };
  useEffect(() => {
    const target = new Vector3(point.x - center.x, point.y, point.z - center.z);
    const view = frame
      ? { direction: new Vector3(frame.from.x, frame.from.y, frame.from.z).normalize(), distance: frame.distance, parts: parts ?? ALL_PARTS }
      : null;
    if (view && frame?.either && controls) {
      const now = camera.position.clone().sub(controls.target);
      if (now.x * view.direction.x + now.z * view.direction.z < 0) view.direction.set(-view.direction.x, view.direction.y, -view.direction.z);
    }
    setGoal({ target, view, age: 0, waited: 0 });
    wake();
    // Only a new key starts a move; the point is read when it does.
  }, [key]);
  useEffect(() => {
    if (!controls?.addEventListener) return;
    const stop = () => setGoal(null);
    controls.addEventListener("start", stop);
    return () => controls.removeEventListener?.("start", stop);
  }, [controls]);
  useEffect(() => () => void (activity.gliding = false), [activity]);
  const offset = useMemo(() => new Vector3(), []);
  useFrame((_, delta) => {
    const g = goal.current;
    if (!g || !controls) return;
    // Wait for every hop to land; the hopping figures draw those frames anyway.
    if (activity.hopping.size > 0 && g.waited < FOCUS_WAIT_SECONDS) {
      g.waited += delta;
      invalidate();
      return;
    }
    g.age += delta;
    const last = g.age >= FOCUS_MAX_SECONDS;
    const ease = last ? 1 : 1 - Math.exp(-FOCUS_RATE * Math.min(delta, 0.25));
    if (g.view) {
      const { direction, distance: wantedDistance, parts: p } = g.view;
      offset.copy(camera.position).sub(controls.target);
      let distance = offset.length();
      offset.normalize();
      if (p.pan) controls.target.lerp(g.target, ease);
      if (p.rotate) offset.lerp(direction, ease).normalize();
      if (p.zoom) distance += (wantedDistance - distance) * ease;
      camera.position.copy(controls.target).addScaledVector(offset, distance);
      controls.update();
      const there =
        (!p.pan || controls.target.distanceTo(g.target) < 0.02) &&
        (!p.rotate || offset.distanceTo(direction) < 0.002) &&
        (!p.zoom || Math.abs(distance - wantedDistance) < 0.02);
      if (last || there) setGoal(null);
      else invalidate();
      return;
    }
    offset.copy(camera.position).sub(controls.target);
    const distance = offset.length();
    const wanted = Math.min(distance, FOCUS_DISTANCE);
    controls.target.lerp(g.target, ease);
    offset.setLength(distance + (wanted - distance) * ease);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    if (last || (controls.target.distanceTo(g.target) < 0.02 && Math.abs(distance - wanted) < 0.02)) setGoal(null);
    else invalidate();
  });
  return null;
}

/** Camera smoothing: the share of the remaining movement applied each frame (1 means none). */
const CAMERA_DAMPING = 0.25;
const CAMERA_ZOOM_SPEED = 1.4;
/**
 * How near the camera may come to the point it looks at, and how far it may pull back: so many
 * board widths, or this far on a small board. Players can come close enough to look a figure in
 * the face and pull back far enough to see the whole table in its room. Browser tests (TEST_MODE)
 * keep the older, narrower limits.
 */
const CAMERA_NEAREST = TEST_MODE ? 6 : 2.5;
const CAMERA_FURTHEST_SPANS = TEST_MODE ? 2 : 4;
const CAMERA_FURTHEST_LEAST = TEST_MODE ? 60 : 140;

/** Pointer travel (pixels) beyond which a click is treated as a camera drag. */
const DRAG_PIXELS = 5;

/**
 * Middle click: finds the terrain under the pointer by casting a ray through
 * everything else (figures, markers, the table), so the hex under a figure can
 * be read too. A middle drag still zooms the camera; only a click inspects.
 */
function MiddleClickInspect({ board, onInspect }: { board: Board; onInspect: (hit: HexInspect) => void }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const report = useRef(onInspect);
  report.current = onInspect;
  useEffect(() => {
    const el = gl.domElement;
    const ray = new Raycaster();
    const ndc = new Vector2();
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 1) return;
      down = { x: e.clientX, y: e.clientY };
      // No autoscroll cursor.
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 1 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > DRAG_PIXELS) return;
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      for (const hit of ray.intersectObjects(scene.children, true)) {
        const cells = hit.object.userData.aohCells as readonly Cell[] | undefined;
        const cell = cells && hit.instanceId !== undefined ? cells[hit.instanceId] : undefined;
        if (!cell) continue;
        const step = surfaceForCell(board, cell);
        if (step) report.current({ step, cell, x: e.clientX, y: e.clientY });
        return;
      }
    };
    const noAutoscroll = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("mousedown", noAutoscroll);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("mousedown", noAutoscroll);
    };
  }, [gl, camera, scene, board]);
  return null;
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
  if (!Number.isFinite(minX)) return { x: 0, z: 0, span: 30 };
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ, 12) };
}

/** A material for scenery; a ghost (the editor's preview) is see-through. */
function SceneryMaterial({ color, ghost }: { color: string; ghost?: boolean }) {
  return <meshStandardMaterial color={color} flatShading transparent={ghost} opacity={ghost ? 0.55 : 1} depthWrite={!ghost} />;
}

/** The grey stone base under the smaller walls. */
const STONE_BASE = "#83878c";

/** A number from 0 to 1 that stays the same for one piece of scenery, so a ruin keeps its shape. */
function steady(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

const lighter = (hex: string, by: number) => {
  const c = new Color(hex);
  c.offsetHSL(0, 0, by);
  return `#${c.getHexString()}`;
};

/**
 * One piece of scenery. One-hex pieces stand on their hex; bigger ones (a large tree, the walls)
 * on all their hexes, each on a base.
 */
export function SceneryMesh({ spot, onClick, ghost }: { spot: ScenerySpot; onClick?: (spot: ScenerySpot) => void; ghost?: boolean }) {
  const { placement, rules } = spot;
  const base = placement.elevation * LEVEL_HEIGHT;
  const h = rules.height * LEVEL_HEIGHT;
  const handlers = onClick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > DRAG_PIXELS) return;
          e.stopPropagation();
          onClick(spot);
        },
      }
    : { raycast: () => null };
  const m = (color: string) => <SceneryMaterial color={color} ghost={ghost} />;

  // Bigger pieces stand centred on their hexes, turned along them, on a base for each hex.
  const cells = spot.cells.length > 0 ? spot.cells : [placement.hex];
  const points = cells.map((c) => hexToWorld(c, HEX_SIZE));
  const cx = points.reduce((t, p) => t + p.x, 0) / points.length;
  const cz = points.reduce((t, p) => t + p.z, 0) / points.length;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const yaw = -Math.atan2(last.z - first.z, last.x - first.x);
  // Trees and bigger pieces stand on a base filling each of their hexes.
  const plates = (cells.length > 1 || rules.id === "tree") && (
    <>
      {points.map((p, i) => (
        <mesh key={`b${i}`} position={[p.x - cx, 0.04, p.z - cz]} {...handlers}>
          <cylinderGeometry args={[HEX_SIZE * 0.9, HEX_SIZE * 0.9, 0.08, 6]} />
          {m(rules.id === "large-tree" || rules.id === "tree" ? "#7a5a36" : rules.id === "large-wall" ? lighter(rules.color, -0.12) : STONE_BASE)}
        </mesh>
      ))}
    </>
  );

  if (rules.id === "large-tree") {
    // A tall conifer of stacked tiers, widest at the bottom.
    const tiers = 6;
    const width = 1.45 * HEX_SIZE;
    return (
      <group position={[cx, base, cz]}>
        {plates}
        <mesh position={[0, h * 0.06, 0]} {...handlers}>
          <cylinderGeometry args={[0.22, 0.3, h * 0.12, 8]} />
          {m("#6d4c2f")}
        </mesh>
        {Array.from({ length: tiers }, (_, i) => {
          const f = i / tiers;
          const tall = (h * 0.95) / tiers + h * 0.08;
          return (
            <mesh key={i} position={[0, h * 0.06 + f * h * 0.82 + tall / 2, 0]} {...handlers}>
              <coneGeometry args={[width * (1 - f * 0.78), tall, 9]} />
              {m(lighter(rules.color, (i % 2 ? 0.03 : -0.02) + f * 0.05))}
            </mesh>
          );
        })}
      </group>
    );
  }

  // The length of a line of hexes, end to end, for walls drawn along it.
  const span = Math.hypot(last.x - first.x, last.z - first.z) + Math.sqrt(3) * HEX_SIZE * 0.9;

  if (rules.id === "low-wall") {
    // A low stone wall with a row of capstones along its top.
    const body = h * 0.82;
    const stones = Math.round(span / 0.5);
    const w = (span * 0.94) / stones;
    return (
      <group position={[cx, base, cz]}>
        {plates}
        <group rotation={[0, yaw, 0]}>
          <mesh position={[0, body / 2, 0]} {...handlers}>
            <boxGeometry args={[span * 0.94, body, 0.34 * HEX_SIZE]} />
            {m(rules.color)}
          </mesh>
          {Array.from({ length: stones }, (_, i) => (
            <mesh key={i} position={[-span * 0.47 + w * (i + 0.5), body + h * 0.08, 0]} {...handlers}>
              <boxGeometry args={[w * 0.92, h * 0.16, 0.44 * HEX_SIZE]} />
              {m(lighter(rules.color, i % 2 ? 0.06 : 0.1))}
            </mesh>
          ))}
        </group>
      </group>
    );
  }

  if (rules.id === "small-ruin") {
    // A broken wall: stretches of uneven height between thicker pillars.
    const parts = 5;
    const w = (span * 0.92) / parts;
    return (
      <group position={[cx, base, cz]}>
        {plates}
        <group rotation={[0, yaw, 0]}>
          {Array.from({ length: parts }, (_, i) => {
            const tall = h * (0.5 + 0.45 * steady(placement.id, i));
            return (
              <mesh key={i} position={[-span * 0.46 + w * (i + 0.5), tall / 2, 0]} {...handlers}>
                <boxGeometry args={[w * 1.01, tall, 0.36 * HEX_SIZE]} />
                {m(i % 2 ? rules.color : lighter(rules.color, -0.04))}
              </mesh>
            );
          })}
          {[-0.46, 0, 0.46].map((at, i) => {
            const tall = h * (0.85 + 0.15 * steady(placement.id, 10 + i));
            return (
              <mesh key={`p${i}`} position={[at * span, tall / 2, 0]} rotation={[0, 0, (steady(placement.id, 20 + i) - 0.5) * 0.08]} {...handlers}>
                <boxGeometry args={[0.34 * HEX_SIZE, tall, 0.5 * HEX_SIZE]} />
                {m(lighter(rules.color, 0.05))}
              </mesh>
            );
          })}
        </group>
      </group>
    );
  }

  if (rules.id === "large-wall") {
    // A ruined castle wall: a battlemented wall braced by tall broken pillars.
    const length = span;
    const body = h * 0.66;
    const thick = 0.5 * HEX_SIZE;
    return (
      <group position={[cx, base, cz]}>
        {plates}
        <group rotation={[0, yaw, 0]}>
          <mesh position={[0, body / 2, 0]} {...handlers}>
            <boxGeometry args={[length * 0.94, body, thick]} />
            {m(rules.color)}
          </mesh>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={`c${i}`} position={[-length * 0.42 + (length * 0.84 * i) / 8, body + h * 0.05, 0]} {...handlers}>
              <boxGeometry args={[length * 0.05, h * 0.1, thick]} />
              {m(lighter(rules.color, -0.03))}
            </mesh>
          ))}
          {[-0.47, -0.16, 0.16, 0.47].map((at, i) => {
            const tall = h * (0.82 + 0.18 * steady(placement.id, i));
            return (
              <group key={`p${i}`} position={[at * length, 0, 0]}>
                <mesh position={[0, tall / 2, 0]} {...handlers}>
                  <boxGeometry args={[0.36 * HEX_SIZE, tall, thick * 1.5]} />
                  {m(lighter(rules.color, 0.04))}
                </mesh>
                <mesh position={[0, tall, 0]} rotation={[0.5 * (steady(placement.id, 5 + i) - 0.5), 0.6, 0.4]} {...handlers}>
                  <boxGeometry args={[0.32 * HEX_SIZE, 0.32 * HEX_SIZE, 0.32 * HEX_SIZE]} />
                  {m(lighter(rules.color, 0.02))}
                </mesh>
              </group>
            );
          })}
        </group>
      </group>
    );
  }

  const r = (rules.radius ?? 0.6) * HEX_SIZE;
  return (
    <group position={[cx, base, cz]}>
      {plates}
      {rules.id === "tree" ? (
        <>
          <mesh position={[0, h * 0.15, 0]} {...handlers}>
            <cylinderGeometry args={[0.12, 0.16, h * 0.3, 8]} />
            {m("#6d4c2f")}
          </mesh>
          <mesh position={[0, h * 0.62, 0]} {...handlers}>
            <coneGeometry args={[r, h * 0.76, 8]} />
            {m(rules.color)}
          </mesh>
        </>
      ) : rules.shape === "prism" ? (
        points.map((p, i) => (
          <mesh key={i} position={[p.x - cx, h / 2, p.z - cz]} {...handlers}>
            <cylinderGeometry args={[HEX_SIZE * 0.86, HEX_SIZE * 0.86, h, 6]} />
            {m(rules.color)}
          </mesh>
        ))
      ) : (
        <mesh position={[0, h / 2, 0]} scale={[1, h / (2 * r), 1]} {...handlers}>
          <dodecahedronGeometry args={[r, 0]} />
          {m(rules.color)}
        </mesh>
      )}
    </group>
  );
}

interface CellHandlers {
  onSurfaceClick?: Props["onSurfaceClick"];
  onSurfaceHover?: Props["onSurfaceHover"];
  onCellPointer?: Props["onCellPointer"];
  dragging?: boolean;
}

/** Hexes of a bridge span are drawn full width, so the span reads as one piece; its outlines stay. */
const SPAN_SCALE = new Vector3(1 / HEX_GAP, 1, 1 / HEX_GAP);
const NO_SCALE = new Vector3(1, 1, 1);
const NO_TURN = new Quaternion();

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
  onCellPointer,
  dragging,
  center,
}: CellHandlers & {
  board: Board;
  cells: readonly Cell[];
  geometry: BufferGeometry;
  material: Material;
  center: { x: number; z: number };
}) {
  const mesh = useRef<InstancedMesh>(null);
  const hovered = useRef<number | null>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const matrix = new Matrix4();
    const at = new Vector3();
    cells.forEach((cell, i) => {
      const { x, z } = hexToWorld(cell.hex, HEX_SIZE);
      at.set(x, cell.layer * LEVEL_HEIGHT + LEVEL_HEIGHT / 2, z);
      m.setMatrixAt(i, matrix.compose(at, NO_TURN, board.isSpanPiece(cell.pieceId) ? SPAN_SCALE : NO_SCALE));
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.computeBoundingBox();
  }, [cells, board]);
  const cellAt = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId === undefined ? undefined : cells[e.instanceId]);
  return (
    <instancedMesh
      ref={mesh}
      args={[geometry, material, cells.length]}
      // Read by the middle-click inspector.
      userData={{ aohCells: cells }}
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
        if (e.buttons !== 0 && !dragging) return;
        if (onCellPointer) {
          const cell = cellAt(e);
          if (cell) onCellPointer(cell, { x: e.point.x + center.x, z: e.point.z + center.z });
        }
        if (e.instanceId === hovered.current) return;
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

/** Half the editor grid's size in hexes: about 200 x 200 world units, a square around the map. */
const GRID_COLUMNS = 57;
const GRID_ROWS = 66;

/** Hex outlines on the table around the map, so the editor shows where pieces can go. */
function HexGrid({ center }: { center: { x: number; z: number } }) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const c = worldToHex(center.x, center.z, HEX_SIZE);
    const corners = Array.from({ length: 6 }, (_, k) => {
      const a = (Math.PI / 3) * k + Math.PI / 6;
      return [Math.cos(a) * HEX_SIZE * 0.98, Math.sin(a) * HEX_SIZE * 0.98] as const;
    });
    for (let dr = -GRID_ROWS; dr <= GRID_ROWS; dr++) {
      for (let dq = -GRID_COLUMNS - Math.ceil(dr / 2); dq <= GRID_COLUMNS - Math.floor(dr / 2); dq++) {
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
  onCellPointer,
  ground,
  leftButton = "camera",
  focus,
  eyeView,
  still = false,
  backdrop = "#18202c",
  dragging = false,
  onInspect,
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
      <color attach="background" args={[backdrop]} />
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
              <planeGeometry args={[600, 600]} />
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
            onCellPointer={onCellPointer}
            dragging={dragging}
            center={center}
          />
        ))}
        <CellEdges cells={cells} geometry={geometry} />
        {scenery.map((spot) => (
          <SceneryMesh key={spot.placement.id} spot={spot} onClick={onSceneryClick} />
        ))}
        {markers.map((m, i) => {
          const { x, z } = hexToWorld(m.step.hex, HEX_SIZE);
          if (m.onClick) {
            const tall = (m.height ?? 1) * LEVEL_HEIGHT + 0.3;
            return (
              <mesh
                key={`${i}:${hexKey(m.step.hex)}@${m.step.elevation}`}
                geometry={markerGeometry}
                scale={[1.12, tall / 0.03, 1.12]}
                position={[x, m.step.elevation * LEVEL_HEIGHT + tall / 2, z]}
                onClick={(e) => {
                  e.stopPropagation();
                  m.onClick!();
                }}
              >
                <meshBasicMaterial color={m.color} transparent opacity={m.opacity ?? 0.35} depthWrite={false} />
              </mesh>
            );
          }
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
      {still ? null : eyeView ? <EyeCamera view={eyeView} center={center} /> : <KeyboardPan />}
      {!still && <DepthRange eye={!!eyeView} />}
      {focus && !eyeView && !still && <CameraFocus focus={focus} center={center} />}
      {onInspect && !still && <MiddleClickInspect board={board} onInspect={onInspect} />}
      {!still && <OrbitControls
        makeDefault
        enabled={!eyeView}
        // The default damping (0.05) lets the camera trail the pointer and drift after release.
        dampingFactor={CAMERA_DAMPING}
        zoomSpeed={CAMERA_ZOOM_SPEED}
        target={origin ? [0, 0, 0] : [-fitted.span * 0.1, 0, 0]}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={CAMERA_NEAREST}
        // The editor can pull back far enough to see its whole grid.
        maxDistance={ground ? 260 : Math.max(fitted.span * CAMERA_FURTHEST_SPANS, CAMERA_FURTHEST_LEAST)}
        mouseButtons={
          leftButton === "select"
            ? { LEFT: -1 as MOUSE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
            : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }
        }
      />}
    </>
  );
}
