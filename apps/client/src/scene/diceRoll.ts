import type { DieFace } from "@aoh/rules";
import { Quaternion, Vector3 } from "three";

/**
 * A throw of the attack and defense dice into a tray, worked out in advance with a small
 * rigid-body simulation and then played back frame by frame (`DiceTray` in `scene/dice3d.tsx`).
 *
 * The rules have already rolled every face. The simulation throws plain cubes; once a cube has
 * come to rest, its drawing is turned by one of the cube's own symmetries (`remap`) so that the
 * face on top is the rolled one. The turn is fixed for the whole throw, so the tumble still looks
 * like the real thing and the result never changes.
 *
 * The attack dice are thrown from the attacker's end (-x), the defense dice from the defender's
 * (+x) once the attack dice have settled; by then the attack dice no longer move, so nothing
 * knocks them onto another face. The walls keep every die in the tray, away from the figures.
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

/** Edge length of a die. */
export const DIE_SIZE = 1;
const H = DIE_SIZE / 2;
const GRAVITY = 34;
/** Simulation steps per second, and how many make one recorded frame (60 a second). */
const STEPS = 240;
const PER_FRAME = 4;
export const FRAME_RATE = STEPS / PER_FRAME;
/** Pause after the attack dice settle before the defense dice are thrown, seconds. */
const DEFENSE_PAUSE = 0.35;
/** A group of dice is stopped where it is after this long, seconds; real throws settle well before. */
const SETTLE_LIMIT = 4;
/** Seconds between one die leaving the hand and the next. */
const STAGGER = 0.05;

const FLOOR = { friction: 0.36, bounce: 0.42 };
const WALL = { friction: 0.2, bounce: 0.58 };
const DIE = { friction: 0.08, bounce: 0.4 };

export interface DieSpec {
  readonly kind: DieKind;
  readonly face: DieFace;
}

export interface Tray {
  /** Half the inside length (along x, from the attacker to the defender) and half the inside depth. */
  readonly halfX: number;
  readonly halfZ: number;
}

/** A tray big enough for this many dice to land without piling up. */
export function trayFor(dice: number): Tray {
  const halfX = Math.min(5.2, Math.max(3.3, 3.0 + 0.15 * dice));
  const halfZ = Math.min(4, Math.max(2.4, 2.1 + 0.12 * dice));
  return { halfX, halfZ };
}

export interface DiePath {
  readonly kind: DieKind;
  readonly face: DieFace;
  /** Position (x, y, z) and turn (x, y, z, w) of the cube for each frame: 7 numbers a frame. */
  readonly frames: Float32Array;
  /** The frame it is thrown on (hidden before), and the frame it comes to rest on. */
  readonly thrown: number;
  readonly landed: number;
  /** Turns the cube's drawing so that the rolled face ends on top. */
  readonly remap: Quaternion;
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

interface Body {
  readonly spec: DieSpec;
  readonly group: 0 | 1;
  x: Vector3;
  q: Quaternion;
  v: Vector3;
  w: Vector3;
  /** The step it is thrown on. */
  start: number;
  asleep: boolean;
  /** Held still for good: the attack dice once the defense dice are thrown. */
  fixed: boolean;
  quiet: number;
  nudges: number;
  landedStep: number;
  frames: number[];
}

const CORNERS: Vector3[] = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) CORNERS.push(new Vector3(sx * H, sy * H, sz * H));
const UP = new Vector3(0, 1, 0);
const INV_MASS = 1;
/** A solid cube of mass 1 turns alike about every axis: I = m s² / 6. */
const INV_INERTIA = 6 / (DIE_SIZE * DIE_SIZE);

/** How flat a die lies: 1 when a face points straight up. */
function flatness(q: Quaternion): number {
  let best = 0;
  for (const n of CUBE_NORMALS) best = Math.max(best, n.clone().applyQuaternion(q).y);
  return best;
}

/** The turn that lays a die flat on its nearest face, keeping its heading. */
function laidFlat(q: Quaternion): Quaternion {
  let best = CUBE_NORMALS[0]!;
  let bestUp = -Infinity;
  for (const n of CUBE_NORMALS) {
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
  b.w.addScaledVector(p.clone().sub(b.x).cross(j), INV_INERTIA);
}

/** Corners of `a` pressing into the tray's floor and walls. */
function trayContacts(a: Body, tray: Tray, out: Contact[]) {
  for (const c of CORNERS) {
    const p = c.clone().applyQuaternion(a.q).add(a.x);
    if (p.y < 0) out.push({ a, b: null, n: new Vector3(0, 1, 0), p, depth: -p.y, ...FLOOR });
    if (p.x < -tray.halfX) out.push({ a, b: null, n: new Vector3(1, 0, 0), p, depth: -tray.halfX - p.x, ...WALL });
    if (p.x > tray.halfX) out.push({ a, b: null, n: new Vector3(-1, 0, 0), p, depth: p.x - tray.halfX, ...WALL });
    if (p.z < -tray.halfZ) out.push({ a, b: null, n: new Vector3(0, 0, 1), p, depth: -tray.halfZ - p.z, ...WALL });
    if (p.z > tray.halfZ) out.push({ a, b: null, n: new Vector3(0, 0, -1), p, depth: p.z - tray.halfZ, ...WALL });
  }
}

/**
 * Dice meet each other as balls a little wider than the cube, like the rounded corners of real
 * dice: a die can never sink into another, and one landing on another rolls off instead of
 * balancing there. Against the felt and the walls a die is a true cube, so it still tumbles and
 * comes to rest on a face.
 */
const DIE_REACH = DIE_SIZE * 0.6;

function diceContact(a: Body, b: Body, out: Contact[]) {
  const d = a.x.distanceTo(b.x);
  if (d >= DIE_REACH * 2 || d < 1e-6) return;
  const n = a.x.clone().sub(b.x).divideScalar(d);
  out.push({ a, b, n, p: b.x.clone().addScaledVector(n, d / 2), depth: DIE_REACH * 2 - d, ...DIE });
}

function solve(c: Contact, first: boolean) {
  const { a, b, n, p } = c;
  const rel = velocityAt(a, p);
  if (b) rel.sub(velocityAt(b, p));
  const vn = rel.dot(n);
  if (vn >= 0) return;
  const ra = p.clone().sub(a.x).cross(n);
  let k = INV_MASS + INV_INERTIA * ra.lengthSq();
  const bMoves = moving(b);
  if (bMoves) k += INV_MASS + INV_INERTIA * p.clone().sub(b!.x).cross(n).lengthSq();
  // Bounce only off a real knock, so resting dice do not jitter.
  const e = first && vn < -1.2 ? c.bounce : 0;
  const jn = (-(1 + e) * vn) / k;
  const tangent = rel.clone().addScaledVector(n, -vn);
  const slide = tangent.length();
  const impulse = n.clone().multiplyScalar(jn);
  if (slide > 1e-6) {
    tangent.divideScalar(slide);
    const rt = p.clone().sub(a.x).cross(tangent);
    let kt = INV_MASS + INV_INERTIA * rt.lengthSq();
    if (bMoves) kt += INV_MASS + INV_INERTIA * p.clone().sub(b!.x).cross(tangent).lengthSq();
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

/** Positions to throw `count` dice from, at the -x end (mirrored for the +x end): rows across the tray. */
function launchSpots(count: number, tray: Tray, r: () => number): Vector3[] {
  const across = Math.max(1, Math.floor((tray.halfZ * 2 - 0.6) / 1.25));
  return Array.from({ length: count }, (_, i) => {
    const row = Math.floor(i / across);
    const inRow = Math.min(across, count - row * across);
    const col = i % across;
    const z = (col - (inRow - 1) / 2) * 1.25 + (r() - 0.5) * 0.25;
    return new Vector3(-tray.halfX + 1.0 + row * 1.3, 2.4 + r() * 0.9 + row * 0.4, z);
  });
}

function randomTurn(r: () => number): Quaternion {
  // A uniformly random turn (Shoemake).
  const u1 = r(), u2 = r() * Math.PI * 2, u3 = r() * Math.PI * 2;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return new Quaternion(a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3));
}

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

/** Throw the attack dice, then the defense dice, into a tray sized for them. */
export function throwDice(attack: readonly DieFace[], defense: readonly DieFace[], seed: number): Throw {
  const tray = trayFor(attack.length + defense.length);
  const r = random(seed);
  const bodies: Body[] = [];
  const launch = (faces: readonly DieFace[], kind: DieKind, group: 0 | 1, startStep: number) => {
    const side = group === 0 ? 1 : -1;
    launchSpots(faces.length, tray, r).forEach((spot, i) => {
      // Thrown gently enough to come to rest in the thrower's half, clear of the other side's dice.
      const speed = (2.6 + r() * 3.8) * (tray.halfX / 4.5);
      const spinAxis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      bodies.push({
        spec: { kind, face: faces[i]! },
        group,
        x: new Vector3(spot.x * side, spot.y, spot.z),
        q: randomTurn(r),
        v: new Vector3(side * speed, -0.5 + r() * 1.5, (r() - 0.5) * 2 + spot.z * 0.3),
        w: spinAxis.multiplyScalar(12 + r() * 12),
        start: startStep + Math.round(i * STAGGER * STEPS),
        asleep: false,
        fixed: false,
        quiet: 0,
        nudges: 0,
        landedStep: -1,
        frames: [],
      });
    });
  };
  launch(attack, "attack", 0, 0);
  const dt = 1 / STEPS;
  const limit = Math.round(SETTLE_LIMIT * STEPS);
  let defenseStep = attack.length === 0 ? 0 : -1;
  let step = 0;
  const groupDone = (g: 0 | 1) => bodies.filter((b) => b.group === g).every((b) => b.asleep || b.fixed);
  /**
   * Lays a die flat on the felt and stops it, moving it to the nearest free spot if it would
   * overlap another die there. Only a die that has not come to rest by itself needs this: one still
   * rolling at the time limit, or one that keeps landing on another die.
   */
  const placeFlat = (b: Body) => {
    b.q.copy(laidFlat(b.q));
    b.x.y = H;
    b.v.set(0, 0, 0);
    b.w.set(0, 0, 0);
    const others = bodies.filter((o) => o !== b && step >= o.start && (o.asleep || o.fixed || o.landedStep >= 0));
    const free = (x: number, z: number) =>
      Math.abs(x) <= tray.halfX - H * 1.45 && Math.abs(z) <= tray.halfZ - H * 1.45 && others.every((o) => Math.hypot(o.x.x - x, o.x.z - z) >= DIE_REACH * 2);
    if (!free(b.x.x, b.x.z)) {
      search: for (let radius = 0.25; radius < 12; radius += 0.25) {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2;
          const x = b.x.x + Math.cos(a) * radius;
          const z = b.x.z + Math.sin(a) * radius;
          if (free(x, z)) {
            b.x.set(x, H, z);
            break search;
          }
        }
      }
    }
    b.asleep = true;
    b.landedStep = step;
  };
  /** Stops every die of a group (only after the time limit). */
  const settle = (g: 0 | 1) => {
    for (const b of bodies) if (b.group === g && !b.asleep) placeFlat(b);
  };
  if (defenseStep === 0) launch(defense, "defense", 1, 0);
  for (; ; step++) {
    // Record a frame for every die.
    if (step % PER_FRAME === 0) {
      for (const b of bodies) b.frames.push(b.x.x, b.x.y, b.x.z, b.q.x, b.q.y, b.q.z, b.q.w);
    }
    if (defenseStep < 0) {
      if (groupDone(0) || step >= limit) {
        settle(0);
        for (const b of bodies) b.fixed = true;
        defenseStep = step + Math.round(DEFENSE_PAUSE * STEPS);
        // The defense dice wait for their turn: their frames start now, hidden until thrown.
        const before = bodies.length;
        launch(defense, "defense", 1, defenseStep);
        for (const b of bodies.slice(before)) {
          const frames = Math.floor(step / PER_FRAME) + 1;
          for (let f = 0; f < frames; f++) b.frames.push(b.x.x, b.x.y, b.x.z, b.q.x, b.q.y, b.q.z, b.q.w);
        }
      }
    } else if (groupDone(1) || step >= defenseStep + limit) {
      settle(1);
      // A last frame, so the playback ends exactly at rest.
      for (const b of bodies) b.frames.push(b.x.x, b.x.y, b.x.z, b.q.x, b.q.y, b.q.z, b.q.w);
      break;
    }
    const live = bodies.filter((b) => step >= b.start && !b.asleep && !b.fixed);
    for (const b of live) {
      b.v.y -= GRAVITY * dt;
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
        b.w.multiplyScalar(1 - 2.2 * dt);
        b.v.x *= 1 - 0.8 * dt;
        b.v.z *= 1 - 0.8 * dt;
      }
      // Coming to rest.
      const still = touching && b.v.length() < 0.12 && b.w.length() < 0.25;
      b.quiet = still ? b.quiet + 1 : 0;
      if (b.quiet > STEPS * 0.15) {
        const perched = b.x.y > H + 0.1;
        if ((flatness(b.q) < 0.996 || perched) && b.nudges < 8) {
          // Leaning on a wall or lying on another die: a small knock to let it fall flat on the felt,
          // away from the die under it and towards the middle of the tray.
          b.nudges++;
          const away = new Vector3(-b.x.x, 0, -b.x.z).normalize().multiplyScalar(1.2);
          const under = bodies.find((o) => o !== b && step >= o.start && o.x.distanceTo(b.x) < DIE_SIZE * 1.5 && o.x.y < b.x.y - 0.3);
          if (under) away.add(new Vector3(b.x.x - under.x.x, 0, b.x.z - under.x.z).normalize().multiplyScalar(2.2));
          b.v.set(away.x + (r() - 0.5), 2.2, away.z + (r() - 0.5));
          b.w.set((r() - 0.5) * 6, (r() - 0.5) * 6, (r() - 0.5) * 6);
          b.quiet = 0;
        } else if (perched || flatness(b.q) < 0.996) {
          placeFlat(b);
        } else {
          b.q.copy(laidFlat(b.q));
          b.x.y = H;
          b.v.set(0, 0, 0);
          b.w.set(0, 0, 0);
          b.asleep = true;
          b.landedStep = step;
        }
      }
    }
  }
  const frameCount = bodies[0] ? bodies[0].frames.length / 7 : 1;
  const dice = bodies.map((b): DiePath => {
    const last = b.frames.length / 7 - 1;
    const rest = new Quaternion(b.frames[last * 7 + 3], b.frames[last * 7 + 4], b.frames[last * 7 + 5], b.frames[last * 7 + 6]);
    return {
      kind: b.spec.kind,
      face: b.spec.face,
      frames: new Float32Array(b.frames),
      thrown: Math.floor(b.start / PER_FRAME),
      // The first frame recorded after it came to rest.
      landed: Math.min(last, Math.ceil((b.landedStep + 1) / PER_FRAME)),
      remap: remapFor(b.spec.kind, b.spec.face, rest, r),
    };
  });
  return { tray, dice, defenseThrown: Math.floor(Math.max(0, defenseStep) / PER_FRAME), frameCount };
}
