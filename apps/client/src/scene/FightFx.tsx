import { HEX_SIZE, LEVEL_HEIGHT, hexToWorld } from "@aoh/rules";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  QuadraticBezierCurve3,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Sprite,
  type SpriteMaterial,
} from "three";
import { useReducedMotion } from "../motion";
import { useBoardActivity } from "./activity";
import type { FigureView } from "./Figures";
import { useWake } from "./wake";

/**
 * What the board shows of a fight (the play screen decides when):
 * - the attack intro: a red aura round each attacker and a blue one round each
 *   figure attacked, a red arrow arcing from attacker to target, and a bow (a shot
 *   from range) or crossed sword and shield (melee) over the pair;
 * - afterwards, a red number of wounds floating up from each figure hit.
 * Everything is drawn in board coordinates, inside `BoardScene`.
 */

export const ATTACK_RED = "#e53935";
export const DEFENSE_BLUE = "#2f8cff";

/** Where a figure stands, for the effects: the middle of its base, its feet and head heights, and how wide it is. */
export interface FigureAnchor {
  readonly x: number;
  readonly z: number;
  readonly base: number;
  readonly top: number;
  readonly radius: number;
}

export function anchorOf(f: FigureView): FigureAnchor {
  const at = f.spots.map((s) => hexToWorld(s.hex, HEX_SIZE));
  const x = at.reduce((n, p) => n + p.x, 0) / at.length;
  const z = at.reduce((n, p) => n + p.z, 0) / at.length;
  const base = Math.max(...f.spots.map((s) => s.elevation)) * LEVEL_HEIGHT;
  const spread = Math.max(0, ...at.map((p) => Math.hypot(p.x - x, p.z - z)));
  return { x, z, base, top: base + f.height * LEVEL_HEIGHT, radius: spread + 0.62 * HEX_SIZE };
}

/** Effects keep about the same size on screen however far the camera is (like pings). */
const SCALE_DISTANCE = 14;
function screenScale(camera: { position: Vector3 }, at: Vector3, center: { x: number; z: number }): number {
  const eye = scratchEye.copy(camera.position);
  eye.x += center.x;
  eye.z += center.z;
  return Math.min(4, Math.max(1, eye.distanceTo(at) / SCALE_DISTANCE));
}
const scratchEye = new Vector3();

// ---------------------------------------------------------------------------
// Textures, drawn once

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  if (g) draw(g, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** A vertical fade for the auras: bright at the base, gone at the top. */
let auraFade: CanvasTexture | null = null;
function auraTexture(): CanvasTexture {
  auraFade ??= canvasTexture(64, (g, n) => {
    // An alpha map reads the green channel: white shows, black hides.
    const grad = g.createLinearGradient(0, n, 0, 0);
    grad.addColorStop(0, "#f2f2f2");
    grad.addColorStop(0.55, "#595959");
    grad.addColorStop(1, "#000000");
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  });
  return auraFade;
}

function badge(g: CanvasRenderingContext2D, n: number): void {
  g.beginPath();
  g.arc(n / 2, n / 2, n * 0.46, 0, Math.PI * 2);
  g.fillStyle = "rgba(40, 8, 8, 0.85)";
  g.fill();
  g.lineWidth = n * 0.05;
  g.strokeStyle = ATTACK_RED;
  g.stroke();
}

function sword(g: CanvasRenderingContext2D, n: number, angle: number): void {
  g.save();
  g.translate(n / 2, n / 2);
  g.rotate(angle);
  g.fillStyle = "#e8edf2";
  g.beginPath();
  g.moveTo(-n * 0.035, n * 0.16);
  g.lineTo(-n * 0.035, -n * 0.27);
  g.lineTo(0, -n * 0.34);
  g.lineTo(n * 0.035, -n * 0.27);
  g.lineTo(n * 0.035, n * 0.16);
  g.closePath();
  g.fill();
  g.fillStyle = "#c9a227";
  g.fillRect(-n * 0.11, n * 0.15, n * 0.22, n * 0.045);
  g.fillStyle = "#6d4c2f";
  g.fillRect(-n * 0.025, n * 0.195, n * 0.05, n * 0.11);
  g.restore();
}

/** Crossed sword and shield: a blow in melee. */
let meleeIcon: CanvasTexture | null = null;
function meleeTexture(): CanvasTexture {
  meleeIcon ??= canvasTexture(128, (g, n) => {
    badge(g, n);
    sword(g, n, Math.PI / 4);
    sword(g, n, -Math.PI / 4);
    // The shield in front.
    g.beginPath();
    g.moveTo(n * 0.36, n * 0.4);
    g.lineTo(n * 0.64, n * 0.4);
    g.lineTo(n * 0.64, n * 0.55);
    g.quadraticCurveTo(n * 0.64, n * 0.7, n * 0.5, n * 0.77);
    g.quadraticCurveTo(n * 0.36, n * 0.7, n * 0.36, n * 0.55);
    g.closePath();
    g.fillStyle = "#b71c1c";
    g.fill();
    g.lineWidth = n * 0.03;
    g.strokeStyle = "#f5d76e";
    g.stroke();
  });
  return meleeIcon;
}

/** A drawn bow with an arrow on the string: a shot from range. */
let rangedIcon: CanvasTexture | null = null;
function rangedTexture(): CanvasTexture {
  rangedIcon ??= canvasTexture(128, (g, n) => {
    badge(g, n);
    g.save();
    g.translate(n / 2, n / 2);
    g.rotate(-Math.PI / 4);
    // The bow: an arc, its string pulled back to the arrow's nock.
    g.lineCap = "round";
    g.strokeStyle = "#c58b4a";
    g.lineWidth = n * 0.05;
    g.beginPath();
    g.arc(-n * 0.08, 0, n * 0.3, -Math.PI / 2.4, Math.PI / 2.4);
    g.stroke();
    const tipY = n * 0.3 * Math.sin(Math.PI / 2.4);
    const tipX = -n * 0.08 + n * 0.3 * Math.cos(Math.PI / 2.4);
    g.strokeStyle = "#e8edf2";
    g.lineWidth = n * 0.015;
    g.beginPath();
    g.moveTo(tipX, -tipY);
    g.lineTo(-n * 0.2, 0);
    g.lineTo(tipX, tipY);
    g.stroke();
    // The arrow.
    g.strokeStyle = "#e8edf2";
    g.lineWidth = n * 0.025;
    g.beginPath();
    g.moveTo(-n * 0.22, 0);
    g.lineTo(n * 0.32, 0);
    g.stroke();
    g.fillStyle = "#e8edf2";
    g.beginPath();
    g.moveTo(n * 0.38, 0);
    g.lineTo(n * 0.29, -n * 0.05);
    g.lineTo(n * 0.29, n * 0.05);
    g.closePath();
    g.fill();
    g.fillStyle = ATTACK_RED;
    g.fillRect(-n * 0.25, -n * 0.05, n * 0.08, n * 0.03);
    g.fillRect(-n * 0.25, n * 0.02, n * 0.08, n * 0.03);
    g.restore();
  });
  return rangedIcon;
}

const numberTextures = new Map<number, CanvasTexture>();
/** A wound count in red, outlined so it reads over any ground. */
function numberTexture(wounds: number): CanvasTexture {
  let t = numberTextures.get(wounds);
  if (!t) {
    t = canvasTexture(128, (g, n) => {
      g.font = `bold ${n * 0.72}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = n * 0.09;
      g.strokeStyle = "rgba(20, 0, 0, 0.9)";
      g.strokeText(String(wounds), n / 2, n * 0.54);
      g.fillStyle = "#ff3b30";
      g.fillText(String(wounds), n / 2, n * 0.54);
    });
    numberTextures.set(wounds, t);
  }
  return t;
}

// ---------------------------------------------------------------------------
// The attack intro

/** How the intro unfolds, in seconds: the auras rise, then the arrow arcs over, then the icon pops up. */
const AURA_RISE = 0.35;
const ARROW_START = 0.2;
const ARROW_FLIGHT = 0.7;
const ICON_START = 0.5;
const ICON_POP = 0.25;
/** Rings that climb each aura, one every this many seconds. */
const RING_PERIOD = 0.7;

function Aura({ anchor, color, born, reduced }: { anchor: FigureAnchor; color: string; born: number; reduced: boolean }) {
  const column = useRef<Group>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const rings = useRef<Group>(null);
  const height = Math.max(0.3, anchor.top - anchor.base);
  useFrame(() => {
    const t = (performance.now() - born) / 1000;
    const rise = reduced ? 1 : Math.min(1, t / AURA_RISE);
    if (column.current) {
      column.current.scale.y = Math.max(0.001, rise);
    }
    // A slow breath, so the aura feels alive.
    if (glow.current) glow.current.opacity = reduced ? 0.75 : 0.6 + 0.2 * Math.sin(t * 6);
    const g = rings.current;
    if (g) {
      g.children.forEach((ring, i) => {
        const phase = reduced ? (i + 0.5) / g.children.length : (t / RING_PERIOD + i / g.children.length) % 1;
        ring.position.y = phase * height * rise;
        ring.scale.setScalar(1 - 0.25 * phase);
        ((ring as Mesh).material as MeshBasicMaterial).opacity = 0.85 * (1 - phase);
      });
    }
  });
  return (
    <group position={[anchor.x, anchor.base + 0.02, anchor.z]}>
      {/* The column: open, lit from the base, fading out at the figure's height. */}
      <group ref={column}>
        <mesh raycast={() => null} position={[0, height / 2, 0]}>
          <cylinderGeometry args={[anchor.radius, anchor.radius * 1.05, height, 40, 1, true]} />
          <meshBasicMaterial
            ref={glow}
            color={color}
            alphaMap={auraTexture()}
            transparent
            opacity={0.7}
            side={DoubleSide}
            depthWrite={false}
            blending={AdditiveBlending}
            toneMapped={false} fog={false}
          />
        </mesh>
      </group>
      {/* A glow on the ground under the figure. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[anchor.radius * 0.6, anchor.radius * 1.15, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} side={DoubleSide} depthWrite={false} blending={AdditiveBlending} toneMapped={false} fog={false} />
      </mesh>
      <group ref={rings}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <ringGeometry args={[anchor.radius * 0.94, anchor.radius * 1.04, 40]} />
            <meshBasicMaterial color={color} transparent opacity={0.8} side={DoubleSide} depthWrite={false} blending={AdditiveBlending} toneMapped={false} fog={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const TUBE_SEGMENTS = 48;
const TUBE_SIDES = 8;

/** A red arrow arcing from the attacker's chest to the target's, drawn out along its path. */
function AttackArrow({ from, to, born, reduced, center }: { from: FigureAnchor; to: FigureAnchor; born: number; reduced: boolean; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const head = useRef<Mesh>(null);
  const tube = useRef<Mesh>(null);
  const { curve, geometry, width } = useMemo(() => {
    const start = new Vector3(from.x, from.base + (from.top - from.base) * 0.65, from.z);
    const end = new Vector3(to.x, to.base + (to.top - to.base) * 0.6, to.z);
    const apart = start.distanceTo(end);
    const mid = start.clone().lerp(end, 0.5);
    mid.y = Math.max(start.y, end.y) + 0.6 + apart * 0.35;
    const c = new QuadraticBezierCurve3(start, mid, end);
    // Thicker from further away, so the arc reads at any zoom.
    const w = 0.06 * HEX_SIZE * screenScale(camera, mid, center);
    return { curve: c, geometry: new TubeGeometry(c, TUBE_SEGMENTS, w, TUBE_SIDES, false), width: w };
    // Fixed when the intro starts.
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const at = useMemo(() => new Vector3(), []);
  const tangent = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const t = (performance.now() - born) / 1000;
    const u = reduced ? 1 : Math.min(1, Math.max(0, (t - ARROW_START) / ARROW_FLIGHT));
    // Ease out: the arrow slows as it reaches the target.
    const eased = 1 - (1 - u) * (1 - u);
    geometry.setDrawRange(0, Math.floor(eased * TUBE_SEGMENTS) * TUBE_SIDES * 6);
    if (tube.current) tube.current.visible = eased > 0.01;
    const h = head.current;
    if (h) {
      h.visible = eased > 0.01;
      curve.getPoint(Math.max(0.01, eased), at);
      curve.getTangent(Math.max(0.01, eased), tangent).normalize();
      h.position.copy(at);
      h.quaternion.setFromUnitVectors(UP, tangent);
      // Once it lands the head beats, like a pulse.
      const beat = u >= 1 && !reduced ? 1 + 0.18 * Math.max(0, Math.sin((t - ARROW_START - ARROW_FLIGHT) * 9)) : 1;
      h.scale.setScalar(beat);
    }
  });
  return (
    <>
      <mesh ref={tube} geometry={geometry} raycast={() => null} visible={false}>
        <meshBasicMaterial color={ATTACK_RED} toneMapped={false} fog={false} />
      </mesh>
      <mesh ref={head} raycast={() => null} visible={false}>
        <coneGeometry args={[width * 3.2, width * 8, 16]} />
        <meshBasicMaterial color={ATTACK_RED} toneMapped={false} fog={false} />
      </mesh>
    </>
  );
}
const UP = new Vector3(0, 1, 0);

/** The bow, or the sword and shield, floating over the middle of a fight. */
function FightIcon({ from, to, ranged, born, reduced, center }: { from: FigureAnchor; to: FigureAnchor; ranged: boolean; born: number; reduced: boolean; center: { x: number; z: number } }) {
  const camera = useThree((s) => s.camera);
  const sprite = useRef<Sprite>(null);
  const spot = useMemo(
    () => new Vector3((from.x + to.x) / 2, Math.max(from.top, to.top) + 0.9 * HEX_SIZE, (from.z + to.z) / 2),
    [from, to],
  );
  useFrame(() => {
    const s = sprite.current;
    if (!s) return;
    const t = (performance.now() - born) / 1000;
    const pop = reduced ? 1 : Math.min(1, Math.max(0, (t - ICON_START) / ICON_POP));
    // A small overshoot as it pops up.
    const grow = pop < 1 ? pop * (1.25 - 0.25 * pop) : 1;
    const size = 1.1 * HEX_SIZE * screenScale(camera, spot, center) * grow;
    s.scale.set(size, size, 1);
    s.position.set(spot.x, spot.y + (reduced ? 0 : 0.08 * Math.sin(t * 4)), spot.z);
    s.visible = pop > 0;
  });
  return (
    <sprite ref={sprite} raycast={() => null} renderOrder={20} visible={false}>
      <spriteMaterial map={ranged ? rangedTexture() : meleeTexture()} depthTest={false} transparent toneMapped={false} fog={false} />
    </sprite>
  );
}

export interface FightIntroProps {
  readonly pairs: readonly { readonly from: FigureAnchor; readonly to: FigureAnchor; readonly ranged: boolean }[];
  readonly attackers: readonly FigureAnchor[];
  readonly targets: readonly FigureAnchor[];
  /** Where the board's centre sits in the scene: the scene is moved by minus this. */
  readonly center: { x: number; z: number };
}

/** The attack intro. It plays for as long as it is drawn; the play screen times it. */
export function FightIntro({ pairs, attackers, targets, center }: FightIntroProps) {
  const reduced = useReducedMotion();
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const born = useMemo(() => performance.now(), []);
  useEffect(() => wake(), [wake]);
  // Animated throughout (the rings climb and the icon bobs); it is on screen for only two seconds.
  useFrame(() => {
    if (!reduced || performance.now() - born < 100) invalidate();
  });
  return (
    <>
      {attackers.map((a, i) => (
        <Aura key={`a${i}`} anchor={a} color={ATTACK_RED} born={born} reduced={reduced} />
      ))}
      {targets.map((a, i) => (
        <Aura key={`t${i}`} anchor={a} color={DEFENSE_BLUE} born={born} reduced={reduced} />
      ))}
      {pairs.map((p, i) => (
        <AttackArrow key={`r${i}`} from={p.from} to={p.to} born={born} reduced={reduced} center={center} />
      ))}
      {pairs.map((p, i) => (
        <FightIcon key={`i${i}`} from={p.from} to={p.to} ranged={p.ranged} born={born} reduced={reduced} center={center} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Wound numbers

/** How long a wound number floats, and how far it rises (in hexes). */
export const WOUND_SECONDS = 1.6;
const WOUND_RISE = 1.1 * HEX_SIZE;
/** How long the numbers wait for figures still hopping along a move, at most. */
const HOP_WAIT_SECONDS = 3;

export interface WoundNumber {
  readonly figureId: string;
  readonly wounds: number;
  /** The top of the figure's head, in board coordinates. */
  readonly at: { readonly x: number; readonly y: number; readonly z: number };
}

/**
 * One command's wound numbers: once no figure is hopping, `onStart` (the sparks and recoils at
 * high quality) and each floats up from its figure's head and fades. Then `onFloated` (the
 * destroyed figures shake or topple), and after `then` more seconds, `onDone`.
 */
export function WoundNumbers({
  numbers,
  center,
  then,
  onStart,
  onFloated,
  onDone,
}: {
  numbers: readonly WoundNumber[];
  center: { x: number; z: number };
  /** Seconds between the numbers fading and `onDone`. */
  then: number;
  onStart?: () => void;
  onFloated: () => void;
  onDone: () => void;
}) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const wake = useWake();
  const activity = useBoardActivity();
  const reduced = useReducedMotion();
  const sprites = useRef<(Sprite | null)[]>([]);
  const clock = useRef({ waited: 0, started: -1, floated: false, done: false });
  const report = useRef({ onStart, onFloated, onDone });
  report.current = { onStart, onFloated, onDone };
  const spot = useMemo(() => new Vector3(), []);
  // With no number to show (a figure lost to lava), go straight on to what comes next.
  const floatFor = numbers.length > 0 ? WOUND_SECONDS : 0;
  const counted = useRef(numbers.length);
  useEffect(() => {
    wake();
    activity.woundsShown += counted.current;
  }, []);
  useFrame((_, delta) => {
    const c = clock.current;
    if (c.done) return;
    invalidate();
    if (c.started < 0) {
      // Wait for a figure that moved (and fell, or was struck as it left) to land first.
      if (activity.hopping.size > 0 && c.waited < HOP_WAIT_SECONDS) {
        c.waited += Math.min(delta, 0.1);
        return;
      }
      c.started = performance.now();
      report.current.onStart?.();
    }
    const t = (performance.now() - c.started) / 1000;
    numbers.forEach((n, i) => {
      const s = sprites.current[i];
      if (!s) return;
      const u = Math.min(1, t / WOUND_SECONDS);
      spot.set(n.at.x, n.at.y + 0.6 * HEX_SIZE + (reduced ? 0.3 : u * WOUND_RISE), n.at.z);
      const size = 1.0 * HEX_SIZE * screenScale(camera, spot, center) * (reduced ? 1 : 1 + 0.25 * Math.max(0, 1 - u * 5));
      s.position.copy(spot);
      s.scale.set(size, size, 1);
      (s.material as SpriteMaterial).opacity = u < 0.6 ? 1 : Math.max(0, 1 - (u - 0.6) / 0.4);
      s.visible = u < 1;
    });
    if (!c.floated && t >= floatFor) {
      c.floated = true;
      report.current.onFloated();
    }
    if (t >= floatFor + then) {
      c.done = true;
      report.current.onDone();
    }
  });
  return (
    <>
      {numbers.map((n, i) => (
        <sprite
          key={n.figureId}
          ref={(s) => void (sprites.current[i] = s)}
          raycast={() => null}
          renderOrder={21}
          visible={false}
        >
          <spriteMaterial map={numberTexture(n.wounds)} depthTest={false} transparent toneMapped={false} fog={false} />
        </sprite>
      ))}
    </>
  );
}
