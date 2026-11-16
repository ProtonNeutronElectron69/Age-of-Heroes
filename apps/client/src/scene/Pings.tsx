import { HEX_SIZE } from "@aoh/rules";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DoubleSide, Quaternion, Raycaster, Vector2, Vector3, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { useReducedMotion } from "../motion";
import { onPing, sendPing } from "../online";
import { useWake } from "./wake";

/**
 * Pings (online games): a player presses P and an arrow in their colour arcs
 * down onto the spot under their pointer, on every screen in the game. A ping
 * is not part of the game: it is never saved or replayed.
 */

/** How long a ping shows, in seconds: the arrow's flight, then a moment stuck in the ground. */
export const PING_SECONDS = 0.5;
const FLIGHT_SECONDS = 0.35;
/** The fewest milliseconds between two of this player's pings (the server holds them to it too). */
export const PING_COOLDOWN_MS = 1000;

/**
 * The arrow's size and flight with the camera close in: it starts this far to the viewer's left and
 * this high, and rises a little more on the way, landing at about 50 degrees. Everything grows with
 * the camera's distance (SCALE_DISTANCE and beyond), so a ping is as easy to see zoomed out.
 */
const ARROW_LENGTH = 1.3 * HEX_SIZE;
const ARC_SPAN = 3.5 * HEX_SIZE;
const ARC_RISE = 1.2 * HEX_SIZE;
const ARC_HUMP = 0.8 * HEX_SIZE;
const SCALE_DISTANCE = 14;
const MAX_SCALE = 6;

export interface PingView {
  readonly id: number;
  readonly color: string;
  /** Board coordinates. */
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * The P key: ping the spot under the pointer, at most once a second. The spot is
 * whatever the pointer is over on the board (terrain, a figure, the table); nothing
 * happens if the pointer is off the board or over a panel. Must sit inside the Canvas.
 */
export function PingInput({
  enabled,
  center,
  onPing,
}: {
  enabled: boolean;
  /** Where the board's centre sits in the scene: the scene is moved by minus this. */
  center: { x: number; z: number };
  onPing: (at: { x: number; y: number; z: number }) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const report = useRef(onPing);
  report.current = onPing;
  useEffect(() => {
    if (!enabled) return;
    const canvas = gl.domElement;
    const ray = new Raycaster();
    const ndc = new Vector2();
    let pointer: { x: number; y: number } | null = null;
    let last = -Infinity;
    const move = (e: PointerEvent) => (pointer = { x: e.clientX, y: e.clientY });
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "p" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      // Only over the board itself, not a panel or a dialog in front of it.
      if (!pointer || document.elementFromPoint(pointer.x, pointer.y) !== canvas) return;
      const now = performance.now();
      if (now - last < PING_COOLDOWN_MS) return;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(scene.children, true).find((h) => !h.object.userData.aohPing);
      if (!hit) return;
      last = now;
      report.current({ x: hit.point.x + center.x, y: hit.point.y, z: hit.point.z + center.z });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("keydown", key);
    };
  }, [enabled, gl, camera, scene, center]);
  return null;
}

const UP = new Vector3(0, 1, 0);

/** One ping: the arrow arcs in from the viewer's left and lands point first, then a ring flashes round it. */
function PingArrow({ ping, center }: { ping: PingView; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const reduced = useReducedMotion();
  const arrow = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const born = useRef(performance.now());
  const path = useMemo(() => {
    const end = new Vector3(ping.at.x, ping.at.y + 0.04, ping.at.z);
    // The board group is moved by minus the board's centre, so find the camera in board coordinates.
    const eye = camera.position.clone().add(new Vector3(center.x, 0, center.z));
    const scale = Math.min(MAX_SCALE, Math.max(1, eye.distanceTo(end) / SCALE_DISTANCE));
    // Fly in across the view, so every player sees the arc from the side.
    const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const start = end.clone().addScaledVector(right, -ARC_SPAN * scale).add(new Vector3(0, ARC_RISE * scale, 0));
    return { start, end, scale, hump: ARC_HUMP * scale };
    // The path is fixed when the ping appears.
  }, []);
  const at = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);
  const turn = useMemo(() => new Quaternion(), []);
  useEffect(() => wake(), [wake]);
  useFrame(() => {
    const g = arrow.current;
    const r = ring.current;
    if (!g || !r) return;
    const t = (performance.now() - born.current) / 1000;
    const done = t >= PING_SECONDS;
    // With reduced motion the arrow does not fly: it stands in the spot for the same time.
    const u = reduced ? 1 : Math.min(1, t / FLIGHT_SECONDS);
    const { start, end, scale, hump } = path;
    at.lerpVectors(start, end, u);
    at.y += hump * 4 * u * (1 - u);
    tangent.subVectors(end, start);
    tangent.y += hump * 4 * (1 - 2 * u);
    // Reduced motion: point straight down rather than along the last bit of the arc.
    if (reduced) tangent.set(0, -1, 0);
    g.position.copy(at);
    g.scale.setScalar(scale);
    // The model's tail is +Y and its tip -Y, so turn +Y to point back along the flight.
    g.quaternion.copy(turn.setFromUnitVectors(UP, tangent.normalize().negate()));
    g.visible = !done;
    // The ring flashes out from the spot once the arrow has landed.
    const landed = reduced ? t / PING_SECONDS : Math.max(0, (t - FLIGHT_SECONDS) / (PING_SECONDS - FLIGHT_SECONDS));
    r.visible = !done && (reduced || t >= FLIGHT_SECONDS);
    r.position.copy(end);
    r.scale.setScalar(scale * (0.5 + 1.1 * Math.min(1, landed)));
    (r.material as MeshBasicMaterial).opacity = 0.9 * (1 - Math.min(1, landed));
    // Keep drawing until the ping is over; the frame that finds it over draws it hidden.
    if (!done) invalidate();
  });
  const shaft = ARROW_LENGTH * 0.7;
  const head = ARROW_LENGTH * 0.3;
  return (
    <>
      {/* The arrow points along -Y from its tip at the origin, then is turned to fly along its path. */}
      <group ref={arrow} userData={{ aohPing: true }}>
        <mesh position={[0, head / 2, 0]} rotation={[Math.PI, 0, 0]} raycast={() => null} userData={{ aohPing: true }}>
          <coneGeometry args={[0.2 * HEX_SIZE, head, 12]} />
          <meshBasicMaterial color={ping.color} toneMapped={false} />
        </mesh>
        <mesh position={[0, head + shaft / 2, 0]} raycast={() => null} userData={{ aohPing: true }}>
          <cylinderGeometry args={[0.055 * HEX_SIZE, 0.055 * HEX_SIZE, shaft, 8]} />
          <meshBasicMaterial color={ping.color} toneMapped={false} />
        </mesh>
        <mesh position={[0, head + shaft, 0]} raycast={() => null} userData={{ aohPing: true }}>
          <boxGeometry args={[0.32 * HEX_SIZE, 0.22 * HEX_SIZE, 0.03 * HEX_SIZE]} />
          <meshBasicMaterial color={ping.color} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null} userData={{ aohPing: true }} visible={false}>
        <ringGeometry args={[0.45 * HEX_SIZE, 0.6 * HEX_SIZE, 32]} />
        <meshBasicMaterial color={ping.color} transparent opacity={0.9} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

/**
 * The pings on this screen: other players' as the server passes them on, and this
 * player's own at once, when `ping` sends it. Each one lasts PING_SECONDS.
 * Used by every online screen with a board (play and the draft map).
 */
export function useOnlinePings(me: string | null, colorOf: (player: string) => string) {
  const [pings, setPings] = useState<PingView[]>([]);
  const color = useRef(colorOf);
  color.current = colorOf;
  const next = useRef(0);
  const timers = useRef(new Set<number>());
  const show = useCallback((player: string, at: PingView["at"]) => {
    const id = ++next.current;
    setPings((list) => [...list, { id, color: color.current(player), at }]);
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setPings((list) => list.filter((p) => p.id !== id));
    }, PING_SECONDS * 1000 + 100);
    timers.current.add(timer);
  }, []);
  useEffect(() => {
    const stop = onPing((p) => show(p.player, p.at));
    const pending = timers.current;
    return () => {
      stop();
      for (const t of pending) window.clearTimeout(t);
    };
  }, [show]);
  /** Send this player's ping, and show it here straight away. */
  const ping = useCallback(
    (at: PingView["at"]) => {
      if (me && sendPing(at)) show(me, at);
    },
    [me, show],
  );
  return { pings, ping };
}

/** Every ping on screen. Place inside `BoardScene`, whose group is already in board coordinates. */
export function Pings({ pings, center }: { pings: readonly PingView[]; center: { x: number; z: number } }) {
  return (
    <>
      {pings.map((p) => (
        <PingArrow key={p.id} ping={p} center={center} />
      ))}
    </>
  );
}
