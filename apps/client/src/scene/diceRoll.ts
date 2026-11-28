import type { DieFace } from "@aoh/rules";
import { IcosahedronGeometry, Matrix4, Quaternion, Vector3 } from "three";

/**
 * Throws of dice into a tray, worked out in advance with a small rigid-body simulation and then
 * played back frame by frame (`ThrownDice` in `scene/DiceTray.tsx`): an attack's cubes, and the
 * initiative d20s.
 *
 * The rules have already rolled every face. The simulation throws plain dice; once a die has
 * come to rest, its drawing is turned by one of the die's own symmetries (`remapFor`,
 * `d20RemapFor`) so that the face on top is the rolled one. The turn is fixed for the whole throw,
 * so the tumble still looks like the real thing and the result never changes.
 *
 * Dice are thrown in waves: each wave is thrown once the one before has settled. The attack dice
 * come in over the attacker's wall (-x, the left of the screen) and the defense dice over the
 * defender's (+x, the right). The walls keep every die in the tray, away from the figures.
 *
 * A die that has landed can still be knocked: a die that hits it wakes it, and it slides, spins
 * and rocks until it settles again. Its result was shown as it first landed, so it must keep the
 * same face on top: a throw in which a knock turns any die onto another face is thrown again
 * with the next seed (`settledThrow`). For cubes that is rare (about 1 big throw in 100). If a few
 * seeds all fail, the dice that turned over are pinned (once landed, nothing moves them) and the
 * throw is worked out again, until no die turns over; every other die is still knocked about.
 * Dice left lying in the tray from an earlier throw (initiative) follow the same rule; d20s roll
 * more easily than cubes, so they need it more often.
 *
 * Pure and repeatable: the same seed gives the same throw. No DOM.
 */

export type DieKind = "attack" | "defense";

/**
 * Which face each side of the cube shows, in Three.js box order (+x, -x, +y,
 * -y, +z, -z). Each mark is opposite a blank, so 3 marks and 3 blanks, as on the
 * rules' dice.
 */
export const CUBE_FACES: Record<DieKind, readonly DieFace[]> = {
  attack: ["skull", "blank", "skull", "blank", "skull", "blank"],
  defense: ["shield", "blank", "shield", "blank", "shield", "blank"],
};
export const CUBE_NORMALS: readonly Vector3[] = [
  new Vector3(1, 0, 0),
  new Vector3(-1, 0, 0),
  new Vector3(0, 1, 0),
  new Vector3(0, -1, 0),
  new Vector3(0, 0, 1),
  new Vector3(0, 0, -1),
];

/** Edge length of a cube die. */
export const DIE_SIZE = 1;
/** How far a d20's corners reach from its middle: a little bigger than a cube, as real d20s are. */
export const D20_RADIUS = 0.8;
/** How high the tray's walls stand above the felt; a thrown die passes over them. */
export const WALL_HEIGHT = 0.9;
const GRAVITY = 34;
/** Simulation steps per second, and how many make one recorded frame (60 a second). */
const STEPS = 240;
const PER_FRAME = 4;
export const FRAME_RATE = STEPS / PER_FRAME;
/** Pause after one wave of dice settles before the next is thrown, seconds. */
const WAVE_PAUSE = 0.35;
/** A wave of dice is stopped where it is after this long, seconds; real throws settle well before. */
const SETTLE_LIMIT = 6;
/** Seconds between one die leaving the hand and the next. */
const STAGGER = 0.06;

const FLOOR = { friction: 0.32, bounce: 0.52 };
const WALL = { friction: 0.18, bounce: 0.66 };
const DIE = { friction: 0.08, bounce: 0.5 };
/** A knock slower than this does not bounce, so resting dice do not jitter. */
const BOUNCE_FROM = 0.8;
/** How quickly the felt slows a rolling die, its spin and its slide, per second. */
const FELT_SPIN_DRAG = 1.9;
const FELT_SLIDE_DRAG = 0.65;

export interface DieSpec {
  readonly kind: DieKind;
  readonly face: DieFace;
}

export interface Tray {
  /** Half the inside length (along x, from the attacker to the defender) and half the inside depth. */
  readonly halfX: number;
  readonly halfZ: number;
}

/** A tray big enough for this many dice to land and roll about without piling up. */
export function trayFor(dice: number): Tray {
  const halfX = Math.min(6.2, Math.max(4, 3.6 + 0.18 * dice));
  const halfZ = Math.min(4.8, Math.max(2.9, 2.5 + 0.14 * dice));
  return { halfX, halfZ };
}

/** A die's recorded path through a throw. */
export interface PlayedDie {
  /** Position (x, y, z) and turn (x, y, z, w) of the die for each frame: 7 numbers a frame. */
  readonly frames: Float32Array;
  /** The frame it is thrown on (hidden before), and the frame it comes to rest on. */
  readonly thrown: number;
  readonly landed: number;
  /** Turns the die's drawing so that the rolled face ends on top. */
  readonly remap: Quaternion;
}

export interface DiePath extends PlayedDie {
  readonly kind: DieKind;
  readonly face: DieFace;
}

export interface Throw {
  readonly tray: Tray;
  readonly dice: readonly DiePath[];
  /** Frames: when the defense dice leave the hand, and the last frame of the throw. */
  readonly defenseThrown: number;
  readonly frameCount: number;
}

/** A small repeatable random source. */
function random(seed: number): () => number {
  let s = (Math.abs(Math.floor(seed)) % 2147483646) + 1;
  return () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ---- The dice's shapes ------------------------------------------------------------

/** What the simulation needs of a die's shape. */
interface Solid {
  /** The corners that touch the felt and the walls, in the die's own space. */
  readonly corners: readonly Vector3[];
  /** The faces' outward normals; every face has one opposite it, so a die resting on a face shows one on top. */
  readonly normals: readonly Vector3[];
  /** How high its middle stands when it lies on a face. */
  readonly rest: number;
  /**
   * Dice meet each other as balls a little wider than the die, like the rounded corners of real
   * dice: a die can never sink into another, and one landing on another rolls off instead of
   * balancing there. Against the felt and the walls a die keeps its true shape, so it still
   * tumbles and comes to rest on a face.
   */
  readonly reach: number;
  readonly invInertia: number;
}

const H = DIE_SIZE / 2;
const CUBE_CORNERS: Vector3[] = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CUBE_CORNERS.push(new Vector3(sx * H, sy * H, sz * H));

/** A solid cube of mass 1 turns alike about every axis: I = m s² / 6. */
const CUBE: Solid = { corners: CUBE_CORNERS, normals: CUBE_NORMALS, rest: H, reach: DIE_SIZE * 0.6, invInertia: 6 / (DIE_SIZE * DIE_SIZE) };

export interface D20Face {
  /** Outward normal and the direction the number's top points, in the die's own space. */
  readonly normal: Vector3;
  readonly up: Vector3;
}

let d20: { faces: D20Face[]; solid: Solid } | null = null;

/**
 * The d20's faces, in the order of Three.js's icosahedron (face i shows i + 1), and its shape for
 * the simulation, `D20_RADIUS` from middle to corner. A number's top points at its face's first corner.
 */
function d20Parts() {
  if (d20) return d20;
  const position = new IcosahedronGeometry(D20_RADIUS, 0).getAttribute("position");
  const faces: D20Face[] = [];
  const corners: Vector3[] = [];
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
    for (const p of [a, b, c]) if (!corners.some((q) => q.distanceTo(p) < 1e-4)) corners.push(p.clone());
  }
  const rest = a.dot(faces[faces.length - 1]!.normal);
  // A solid icosahedron of mass 1: I = 0.2894 m R², a little less than a ball as wide.
  const solid: Solid = { corners, normals: faces.map((f) => f.normal), rest, reach: D20_RADIUS * 0.88, invInertia: 1 / (0.2894 * D20_RADIUS * D20_RADIUS) };
  d20 = { faces, solid };
  return d20;
}

/** The d20's faces (face i shows i + 1). */
export function d20Faces(): readonly D20Face[] {
  return d20Parts().faces;
}

// ---- The simulation ----------------------------------------------------------------

interface Body {
  readonly solid: Solid;
  /** The end it is thrown from: -1 the attacker's (-x), 1 the defender's (+x). */
  readonly from: -1 | 1;
  x: Vector3;
  q: Quaternion;
  v: Vector3;
  w: Vector3;
  /** The step it is thrown on. */
  start: number;
  /** Still passing over its wall: that wall does not stop it yet. */
  entering: boolean;
  asleep: boolean;
  /** Held still for good: a pinned die lying in the tray from an earlier throw. */
  fixed: boolean;
  /** Once landed, it is never woken: it turned over in an earlier try of this throw. */
  readonly pinned: boolean;
  quiet: number;
  nudges: number;
  /** The step it first came to rest on, and the face it had on top then (-1 before). */
  landedStep: number;
  top: number;
  frames: number[];
}

const UP = new Vector3(0, 1, 0);
const INV_MASS = 1;

/** Which of a die's faces points most nearly up. */
function topFace(b: Body): number {
  let best = 0;
  let bestUp = -Infinity;
  b.solid.normals.forEach((n, i) => {
    const up = n.clone().applyQuaternion(b.q).y;
    if (up > bestUp) {
      bestUp = up;
      best = i;
    }
  });
  return best;
}

/** How flat a die lies: 1 when a face points straight up. */
function flatness(b: Body): number {
  let best = 0;
  for (const n of b.solid.normals) best = Math.max(best, n.clone().applyQuaternion(b.q).y);
  return best;
}

/** The turn that lays a die flat on its nearest face, keeping its heading. */
function laidFlat(q: Quaternion, normals: readonly Vector3[]): Quaternion {
  let best = normals[0]!;
  let bestUp = -Infinity;
  for (const n of normals) {
    const up = n.clone().applyQuaternion(q).y;
    if (up > bestUp) {
      bestUp = up;
      best = n;
    }
  }
  const top = best.clone().applyQuaternion(q);
  return new Quaternion().setFromUnitVectors(top, UP).multiply(q);
}

interface Contact {
  readonly a: Body;
  readonly b: Body | null;
  /** Normal pointing from b (or the wall) towards a. */
  readonly n: Vector3;
  readonly p: Vector3;
  readonly depth: number;
  readonly friction: number;
  readonly bounce: number;
}

const moving = (b: Body | null) => b !== null && !b.asleep && !b.fixed;

function velocityAt(b: Body, p: Vector3): Vector3 {
  return b.v.clone().add(b.w.clone().cross(p.clone().sub(b.x)));
}

function applyImpulse(b: Body, p: Vector3, j: Vector3) {
  b.v.addScaledVector(j, INV_MASS);
  b.w.addScaledVector(p.clone().sub(b.x).cross(j), b.solid.invInertia);
}

/** Corners of `a` pressing into the tray's floor and walls. A die coming in passes over its own wall. */
function trayContacts(a: Body, tray: Tray, out: Contact[]) {
  const left = !(a.entering && a.from === -1);
  const right = !(a.entering && a.from === 1);
  for (const c of a.solid.corners) {
    const p = c.clone().applyQuaternion(a.q).add(a.x);
    if (p.y < 0) out.push({ a, b: null, n: new Vector3(0, 1, 0), p, depth: -p.y, ...FLOOR });
    if (left && p.x < -tray.halfX) out.push({ a, b: null, n: new Vector3(1, 0, 0), p, depth: -tray.halfX - p.x, ...WALL });
    if (right && p.x > tray.halfX) out.push({ a, b: null, n: new Vector3(-1, 0, 0), p, depth: p.x - tray.halfX, ...WALL });
    if (p.z < -tray.halfZ) out.push({ a, b: null, n: new Vector3(0, 0, 1), p, depth: -tray.halfZ - p.z, ...WALL });
    if (p.z > tray.halfZ) out.push({ a, b: null, n: new Vector3(0, 0, -1), p, depth: p.z - tray.halfZ, ...WALL });
  }
}

function diceContact(a: Body, b: Body, out: Contact[]) {
  const d = a.x.distanceTo(b.x);
  const reach = a.solid.reach + b.solid.reach;
  if (d >= reach || d < 1e-6) return;
  const n = a.x.clone().sub(b.x).divideScalar(d);
  out.push({ a, b, n, p: b.x.clone().addScaledVector(n, b.solid.reach - (reach - d) / 2), depth: reach - d, ...DIE });
}

function solve(c: Contact, first: boolean) {
  const { a, b, n, p } = c;
  const rel = velocityAt(a, p);
  if (b) rel.sub(velocityAt(b, p));
  const vn = rel.dot(n);
  if (vn >= 0) return;
  const ra = p.clone().sub(a.x).cross(n);
  let k = INV_MASS + a.solid.invInertia * ra.lengthSq();
  const bMoves = moving(b);
  if (bMoves) k += INV_MASS + b!.solid.invInertia * p.clone().sub(b!.x).cross(n).lengthSq();
  // Bounce only off a real knock, so resting dice do not jitter.
  const e = first && vn < -BOUNCE_FROM ? c.bounce : 0;
  const jn = (-(1 + e) * vn) / k;
  const tangent = rel.clone().addScaledVector(n, -vn);
  const slide = tangent.length();
  const impulse = n.clone().multiplyScalar(jn);
  if (slide > 1e-6) {
    tangent.divideScalar(slide);
    const rt = p.clone().sub(a.x).cross(tangent);
    let kt = INV_MASS + a.solid.invInertia * rt.lengthSq();
    if (bMoves) kt += INV_MASS + b!.solid.invInertia * p.clone().sub(b!.x).cross(tangent).lengthSq();
    const jt = Math.min(slide / kt, c.friction * jn);
    impulse.addScaledVector(tangent, -jt);
  }
  applyImpulse(a, p, impulse);
  if (bMoves) applyImpulse(b!, p, impulse.clone().negate());
}

function separate(c: Contact) {
  const push = Math.max(0, c.depth - 0.002) * 0.5;
  if (push <= 0) return;
  if (moving(c.b)) {
    c.a.x.addScaledVector(c.n, push / 2);
    c.b!.x.addScaledVector(c.n, -push / 2);
  } else c.a.x.addScaledVector(c.n, push);
}

/**
 * Where to throw `count` dice from, at the -x end (mirrored for the +x end): just over the wall,
 * high enough to clear it, in rows across the tray, each row a little higher than the last.
 */
function launchSpots(count: number, tray: Tray, r: () => number): Vector3[] {
  const across = Math.max(1, Math.floor((tray.halfZ * 2 - 0.6) / 1.3));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / across);
    const inRow = Math.min(across, count - row * across);
    const col = i % across;
    const z = (col - (inRow - 1) / 2) * 1.3 + (r() - 0.5) * 0.25;
    return new Vector3(-tray.halfX - 0.2 - r() * 0.3, 3.3 + r() * 0.7 + row * 0.9, z);
  });
}

function randomTurn(r: () => number): Quaternion {
  // A uniformly random turn (Shoemake).
  const u1 = r(), u2 = r() * Math.PI * 2, u3 = r() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return new Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}

/** One die of a wave: its shape and the end it is thrown from. */
interface Toss {
  readonly solid: Solid;
  readonly from: -1 | 1;
}

/** A die already lying in the tray: where it is and how it is turned. */
export interface Resting {
  readonly at: Vector3;
  readonly turn: Quaternion;
}

interface Simulated {
  /** For each wave, each die's frames, the frames it was thrown and landed on, and how it lies at the end. */
  readonly paths: { frames: Float32Array; thrown: number; landed: number; rest: Quaternion }[][];
  /** The frame each wave is thrown on. */
  readonly waveThrown: number[];
  /** The frames of each die that was lying in the tray already: pushed about, or still. */
  readonly lying: Float32Array[];
  readonly frameCount: number;
  /** The dice (numbered as made: those lying first, then each wave's) that ended on another face than they first landed on. */
  readonly flipped: number[];
}

/**
 * Throws the waves of dice one after another into the tray, around any dice already lying in it.
 * Landed dice can be knocked about, except those `pinned` (by number, as in `flipped`).
 */
function simulate(tray: Tray, waves: readonly (readonly Toss[])[], r: () => number, lying: readonly { solid: Solid; at: Resting }[], pinned: ReadonlySet<number>): Simulated {
  const bodies: Body[] = [];
  let frames = 0;
  const pose = (b: Body) => b.frames.push(b.x.x, b.x.y, b.x.z, b.q.x, b.q.y, b.q.z, b.q.w);
  const body = (solid: Solid, from: -1 | 1, x: Vector3, q: Quaternion, start: number): Body => {
    const b: Body = { solid, from, x, q, v: new Vector3(), w: new Vector3(), start, entering: false, asleep: false, fixed: false, pinned: pinned.has(bodies.length), quiet: 0, nudges: 0, landedStep: -1, top: -1, frames: [] };
    bodies.push(b);
    return b;
  };
  const lyingBodies = lying.map((l) => {
    const b = body(l.solid, -1, l.at.at.clone(), l.at.turn.clone(), 0);
    // Asleep until something hits it, and holding the face it landed with in its own throw.
    b.asleep = true;
    b.landedStep = 0;
    b.top = topFace(b);
    b.fixed = b.pinned;
    return b;
  });
  const waveBodies: Body[][] = waves.map(() => []);
  const waveStep: number[] = waves.map(() => 0);
  const launch = (w: number, startStep: number) => {
    waveStep[w] = startStep;
    const tosses = waves[w]!;
    const thrown: Body[] = [];
    for (const from of [-1, 1] as const) {
      const mine = tosses.map((t, n) => (t.from === from ? n : -1)).filter((n) => n >= 0);
      launchSpots(mine.length, tray, r).forEach((spot, i) => {
        // Thrown hard enough to clear the wall, and to roll about well into the tray.
        const speed = (4.4 + r() * 2.2) * (tray.halfX / 5);
        const spinAxis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
        const b = body(tosses[mine[i]!]!.solid, from, new Vector3(spot.x * -from, spot.y, spot.z), randomTurn(r), startStep + Math.round(i * STAGGER * STEPS));
        b.v.set(-from * speed, 0.4 + r() * 1.4, (r() - 0.5) * 2 + spot.z * 0.25);
        b.w.copy(spinAxis.multiplyScalar(12 + r() * 12));
        b.entering = true;
        // Hidden until it is thrown: its frames so far hold it where it starts.
        for (let f = 0; f < frames; f++) pose(b);
        thrown[mine[i]!] = b;
      });
    }
    waveBodies[w] = thrown;
  };
  const dt = 1 / STEPS;
  const limit = Math.round(SETTLE_LIMIT * STEPS);
  let step = 0;
  /** Puts a die to sleep where it is, noting its first landing. */
  const rest = (b: Body) => {
    b.asleep = true;
    if (b.landedStep < 0) {
      b.landedStep = step;
      b.top = topFace(b);
    }
  };
  /**
   * Lays a die flat on the felt and stops it, moving it to the nearest free spot if it would
   * overlap another die there. Only a die that has not come to rest by itself needs this: one still
   * rolling at the time limit, or one that keeps landing on another die.
   */
  const placeFlat = (b: Body) => {
    b.q.copy(laidFlat(b.q, b.solid.normals));
    b.x.y = b.solid.rest;
    b.v.set(0, 0, 0);
    b.w.set(0, 0, 0);
    b.entering = false;
    const others = bodies.filter((o) => o !== b && step >= o.start && (o.asleep || o.fixed || o.landedStep >= 0));
    const edge = b.solid.reach * 1.25;
    const free = (x: number, z: number) =>
      Math.abs(x) <= tray.halfX - edge && Math.abs(z) <= tray.halfZ - edge && others.every((o) => Math.hypot(o.x.x - x, o.x.z - z) >= b.solid.reach + o.solid.reach);
    if (!free(b.x.x, b.x.z)) {
      search: for (let radius = 0.25; radius < 14; radius += 0.25) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const x = b.x.x + Math.cos(a) * radius;
          const z = b.x.z + Math.sin(a) * radius;
          if (free(x, z)) {
            b.x.set(x, b.solid.rest, z);
            break search;
          }
        }
      }
    }
    rest(b);
  };
  /** The next wave with dice in it after `w`, marking the empty ones on the way as thrown at `at`. */
  const nextWave = (w: number, at: number) => {
    let n = w + 1;
    while (n < waves.length && waves[n]!.length === 0) waveStep[n++] = at;
    return n;
  };
  let wave = nextWave(-1, 0);
  if (wave < waves.length) launch(wave, 0);
  for (; wave < waves.length; step++) {
    if (step % PER_FRAME === 0) {
      for (const b of bodies) pose(b);
      frames++;
    }
    // A wave is done once every die is still, those it knocked included.
    if (bodies.every((b) => b.asleep || b.fixed) || step >= waveStep[wave]! + limit) {
      for (const b of bodies) if (!b.asleep && !b.fixed) placeFlat(b);
      const at = step + Math.round(WAVE_PAUSE * STEPS);
      wave = nextWave(wave, at);
      if (wave < waves.length) launch(wave, at);
      else {
        // A last frame, so the playback ends exactly at rest.
        for (const b of bodies) pose(b);
        frames++;
        break;
      }
    }
    const live = bodies.filter((b) => step >= b.start && !b.asleep && !b.fixed);
    for (const b of live) {
      b.v.y -= GRAVITY * dt;
      if (b.entering && Math.abs(b.x.x) < tray.halfX - b.solid.reach) b.entering = false;
    }
    // Contacts: the tray, then other dice (live dice against any die already in the tray).
    const contacts: Contact[] = [];
    for (const a of live) {
      trayContacts(a, tray, contacts);
      for (const b of bodies) {
        if (b === a || step < b.start) continue;
        if (live.includes(b) && bodies.indexOf(b) < bodies.indexOf(a)) continue;
        diceContact(a, b, contacts);
      }
    }
    // A die that runs into one lying still wakes it, so it is pushed instead of acting as a wall.
    for (const c of contacts) {
      if (c.b && c.b.asleep && !c.b.fixed && !c.b.pinned && velocityAt(c.a, c.p).dot(c.n) < -0.05) {
        c.b.asleep = false;
        c.b.quiet = 0;
      }
    }
    for (let it = 0; it < 8; it++) for (const c of contacts) solve(c, it === 0);
    for (const c of contacts) separate(c);
    for (const b of live) {
      b.x.addScaledVector(b.v, dt);
      const w = b.w;
      const spin = new Quaternion(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 0).multiply(b.q);
      b.q.set(b.q.x + spin.x, b.q.y + spin.y, b.q.z + spin.z, b.q.w + spin.w).normalize();
      // Felt drags at a rolling die.
      const touching = contacts.some((c) => c.a === b);
      if (touching) {
        b.w.multiplyScalar(1 - FELT_SPIN_DRAG * dt);
        b.v.x *= 1 - FELT_SLIDE_DRAG * dt;
        b.v.z *= 1 - FELT_SLIDE_DRAG * dt;
      }
      // Coming to rest.
      const still = touching && b.v.length() < 0.12 && b.w.length() < 0.25;
      b.quiet = still ? b.quiet + 1 : 0;
      if (b.quiet > STEPS * 0.15) {
        const perched = b.x.y > b.solid.rest + 0.1;
        const leaning = flatness(b) < 0.996;
        if ((leaning || perched) && b.nudges < 8) {
          // Leaning on a wall or lying on another die: a small knock to let it fall flat on the felt,
          // away from the die under it and towards the middle of the tray.
          b.nudges++;
          const away = new Vector3(-b.x.x, 0, -b.x.z).normalize().multiplyScalar(1.2);
          const under = bodies.find((o) => o !== b && step >= o.start && o.x.distanceTo(b.x) < (o.solid.reach + b.solid.reach) * 1.25 && o.x.y < b.x.y - 0.3);
          if (under) away.add(new Vector3(b.x.x - under.x.x, 0, b.x.z - under.x.z).normalize().multiplyScalar(2.2));
          b.v.set(away.x + (r() - 0.5), 2.2, away.z + (r() - 0.5));
          b.w.set((r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6);
          b.quiet = 0;
        } else if (perched || leaning) {
          placeFlat(b);
        } else {
          b.q.copy(laidFlat(b.q, b.solid.normals));
          b.x.y = b.solid.rest;
          b.v.set(0, 0, 0);
          b.w.set(0, 0, 0);
          rest(b);
        }
      }
    }
  }
  const frameCount = Math.max(1, frames);
  const paths = waveBodies.map((list) =>
    list.map((b) => {
      const last = b.frames.length / 7 - 1;
      return {
        frames: new Float32Array(b.frames),
        thrown: Math.floor(b.start / PER_FRAME),
        // The first frame recorded after it first came to rest.
        landed: Math.min(last, Math.ceil((b.landedStep + 1) / PER_FRAME)),
        rest: new Quaternion(b.frames[last * 7 + 3], b.frames[last * 7 + 4], b.frames[last * 7 + 5], b.frames[last * 7 + 6]),
      };
    }),
  );
  const flipped = bodies.flatMap((b, i) => (b.landedStep >= 0 && topFace(b) !== b.top ? [i] : []));
  return { paths, waveThrown: waveStep.map((s) => Math.floor(s / PER_FRAME)), lying: lyingBodies.map((b) => new Float32Array(b.frames)), frameCount, flipped };
}

/** How many seeds to try for a throw in which no knock turns a landed die onto another face, before pinning. */
const TRIES = 4;
const NONE: ReadonlySet<number> = new Set();

/**
 * Simulates a throw with landed dice free to be knocked about, trying the next seed while a knock
 * turns one onto another face. After `TRIES` seeds it goes back to the first and pins the dice
 * that turned over, again and again, until none does: a pinned die never moves once landed, so
 * each try pins at least one more and it ends (with every die pinned, at worst). Returns the throw and its random source, which goes
 * on to choose the dice's remaps.
 */
function settledThrow(seed: number, run: (r: () => number, pinned: ReadonlySet<number>) => Simulated): { sim: Simulated; r: () => number } {
  for (let t = 0; t < TRIES; t++) {
    const r = random(seed + t * 7919);
    const sim = run(r, NONE);
    if (!sim.flipped.length) return { sim, r };
  }
  const pinned = new Set<number>();
  for (;;) {
    const r = random(seed);
    const sim = run(r, pinned);
    if (!sim.flipped.length) return { sim, r };
    const more = sim.flipped.filter((i) => !pinned.has(i));
    if (!more.length) break;
    for (const i of more) pinned.add(i);
  }
  // Never reached while a pinned die cannot move: pin every die, as dice once always were.
  const all = new Set(Array.from({ length: 1000 }, (_, i) => i));
  const r = random(seed);
  return { sim: run(r, all), r };
}

// ---- Attack and defense dice ---------------------------------------------------------

/**
 * The turn of a cube's drawing, applied before its body's turn, that shows `face` on top when the
 * body rests with turn `rest`: one of the cube's 24 symmetries, chosen with `r` among the sides
 * that carry the face.
 */
export function remapFor(kind: DieKind, face: DieFace, rest: Quaternion, r: () => number): Quaternion {
  const sides = CUBE_FACES[kind].map((f, i) => (f === face ? i : -1)).filter((i) => i >= 0);
  const side = sides[Math.floor(r() * sides.length) % sides.length]!;
  // Which of the body's own axes points up at rest.
  const inv = rest.clone().invert();
  const up = UP.clone().applyQuaternion(inv);
  let top = CUBE_NORMALS[0]!;
  for (const n of CUBE_NORMALS) if (n.dot(up) > top.dot(up)) top = n;
  const want = CUBE_NORMALS[side]!;
  const turn = new Quaternion().setFromUnitVectors(want, top);
  // A quarter turn about the top at random, so a face's picture is not always the same way round.
  const spin = new Quaternion().setFromAxisAngle(top, (Math.floor(r() * 4) * Math.PI) / 2);
  return spin.multiply(turn);
}

/** Throw the attack dice in from the left, then the defense dice in from the right, into a tray sized for them. */
export function throwDice(attack: readonly DieFace[], defense: readonly DieFace[], seed: number): Throw {
  const tray = trayFor(attack.length + defense.length);
  const waves = [attack.map(() => ({ solid: CUBE, from: -1 as const })), defense.map(() => ({ solid: CUBE, from: 1 as const }))];
  const { sim, r } = settledThrow(seed, (r, pinned) => simulate(tray, waves, r, [], pinned));
  const sides: [DieKind, readonly DieFace[]][] = [["attack", attack], ["defense", defense]];
  const dice = sides.flatMap(([kind, faces], w) =>
    sim.paths[w]!.map((p, i): DiePath => ({ kind, face: faces[i]!, frames: p.frames, thrown: p.thrown, landed: p.landed, remap: remapFor(kind, faces[i]!, p.rest, r) })),
  );
  return { tray, dice, defenseThrown: sim.waveThrown[1]!, frameCount: sim.frameCount };
}

// ---- Initiative d20s -------------------------------------------------------------------

/** The rotation that takes the frame (normal n1, up u1) to (n2, u2). */
function frameTurn(n1: Vector3, u1: Vector3, n2: Vector3, u2: Vector3): Quaternion {
  const from = new Matrix4().makeBasis(n1, u1, n1.clone().cross(u1));
  const to = new Matrix4().makeBasis(n2, u2, n2.clone().cross(u2));
  return new Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
}

/**
 * The turn of a d20's drawing, applied before its body's turn, that shows `value` on top when the
 * body rests with turn `rest`: one of the icosahedron's 60 symmetries. Of the three that put the
 * value on top, it takes the one whose number reads most nearly upright to a camera in front of
 * the tray (on the +z side, looking down).
 */
export function d20RemapFor(value: number, rest: Quaternion): Quaternion {
  const faces = d20Faces();
  const want = faces[Math.min(19, Math.max(0, value - 1))]!;
  const up = UP.clone().applyQuaternion(rest.clone().invert());
  let top = faces[0]!;
  for (const f of faces) if (f.normal.dot(up) > top.normal.dot(up)) top = f;
  let best = new Quaternion();
  let bestScore = -Infinity;
  for (let k = 0; k < 3; k++) {
    // Each of the top face's corners in turn as the number's top.
    const corner = top.up.clone().applyAxisAngle(top.normal, (k * Math.PI * 2) / 3);
    const score = -corner.clone().applyQuaternion(rest).z;
    if (score > bestScore) {
      bestScore = score;
      best = frameTurn(want.normal, want.up, top.normal, corner);
    }
  }
  return best;
}

export interface D20Path extends PlayedDie {
  readonly value: number;
}

export interface D20Throw {
  readonly dice: readonly D20Path[];
  /** The frames of each die that was lying in the tray, in the order given: the throw may push them about. */
  readonly lying: readonly Float32Array[];
  readonly frameCount: number;
}

/** Where a thrown die lies at the end of its throw. */
export function restingOf(die: PlayedDie): Resting {
  const f = die.frames.length - 7;
  const p = die.frames;
  return { at: new Vector3(p[f], p[f + 1], p[f + 2]), turn: new Quaternion(p[f + 3], p[f + 4], p[f + 5], p[f + 6]) };
}

/**
 * Throws d20s together into the tray, each from its own end (-1 the left, 1 the right), to land
 * showing their values. D20s already lying there can be knocked about, but keep their numbers on top.
 */
export function throwD20s(dice: readonly { value: number; from: -1 | 1 }[], tray: Tray, seed: number, lying: readonly Resting[] = []): D20Throw {
  const { solid } = d20Parts();
  const waves = [dice.map((d) => ({ solid, from: d.from }))];
  const { sim } = settledThrow(seed, (r, pinned) => simulate(tray, waves, r, lying.map((at) => ({ solid, at })), pinned));
  return {
    dice: (sim.paths[0] ?? []).map((p, i) => ({ value: dice[i]!.value, frames: p.frames, thrown: p.thrown, landed: p.landed, remap: d20RemapFor(dice[i]!.value, p.rest) })),
    lying: sim.lying,
    frameCount: sim.frameCount,
  };
}
