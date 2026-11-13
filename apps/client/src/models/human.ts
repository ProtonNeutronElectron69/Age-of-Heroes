import { Vector3 } from "three";
import { ball, limb, place, spine } from "./build";
import type { Part, V3 } from "./types";

/**
 * A posable low-polygon person, for every unit that walks on two legs.
 * It is written 1 unit tall when standing straight (the top of the bare head),
 * facing +z, with its left side at +x. Give it where the hands and feet are
 * and the elbows and knees work themselves out.
 */
export interface HumanPose {
  /** The middle of the hips. Standing straight it is [0, 0.5, 0]. */
  pelvis?: V3;
  /** Turn the hips and legs to the figure's left, in degrees. */
  hips?: number;
  /** Lean the chest forward, in degrees. */
  lean?: number;
  /** Turn the chest to the figure's left, in degrees. */
  twist?: number;
  /** Turn the head further than the chest, in degrees. */
  look?: number;
  /** Where the hands are. */
  handL: V3;
  handR: V3;
  /** Where the soles are: y = 0 stands on the ground. */
  footL: V3;
  footR: V3;
  /** Which way an elbow or a knee points, when the usual way looks wrong. */
  elbowL?: V3;
  elbowR?: V3;
  kneeL?: V3;
  kneeR?: V3;
}

export interface HumanBuild {
  /** Half the width of the shoulders. A soldier is 0.175. */
  shoulders?: number;
  /** How thick the limbs and body are. 1 is a soldier; an elf is about 0.85. */
  bulk?: number;
}

export interface Human {
  readonly parts: Part[];
  /** Put parts on the chest: they are written around the middle of the hips, before any lean or twist. */
  readonly onChest: (parts: readonly Part[]) => Part[];
  /** Put parts on the head: they are written around the middle of the head. */
  readonly onHead: (parts: readonly Part[]) => Part[];
  readonly handL: V3;
  readonly handR: V3;
  /** The middle of the head, and how far it is turned to the left, in degrees. */
  readonly head: V3;
  readonly facing: number;
}

const UPPER_ARM = 0.17;
const FOREARM = 0.155;
const THIGH = 0.235;
const SHIN = 0.225;
const ANKLE = 0.045;
/** Radius of the bare head, and its height above the hips when standing straight. */
export const HEAD = 0.09;
const HEAD_AT: V3 = [0, 0.445, 0.014];

/** Where the middle joint of a two-part limb goes, bending towards `pole`. */
function bend(root: Vector3, target: Vector3, upper: number, lower: number, pole: Vector3): Vector3 {
  const reach = target.clone().sub(root);
  const length = Math.max(reach.length(), 1e-6);
  const stretch = Math.max(1, length / ((upper + lower) * 0.999));
  const a = upper * stretch;
  const b = lower * stretch;
  const dir = reach.normalize();
  const along = (a * a - b * b + length * length) / (2 * length);
  const out = Math.sqrt(Math.max(0, a * a - along * along));
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir));
  if (side.lengthSq() < 1e-9) side.set(0, 0, 1);
  return root.clone().addScaledVector(dir, along).addScaledVector(side.normalize(), out);
}

const v3 = (v: Vector3): V3 => [v.x, v.y, v.z];

export function human(pose: HumanPose, build: HumanBuild = {}): Human {
  const { pelvis = [0, 0.5, 0], hips = 0, lean = 0, twist = 0, look = 0 } = pose;
  const { shoulders = 0.175, bulk = 1 } = build;
  const k = bulk;

  const onHips = (parts: readonly Part[]) => place(parts, { at: pelvis, turn: [0, hips, 0] });
  const onChest = (parts: readonly Part[]) => place(parts, { at: pelvis, turn: [lean, twist, 0] });
  const chestPoint = (p: V3): Vector3 => {
    const rad = Math.PI / 180;
    return new Vector3(...p)
      .applyAxisAngle(new Vector3(1, 0, 0), lean * rad)
      .applyAxisAngle(new Vector3(0, 1, 0), twist * rad)
      .add(new Vector3(...pelvis));
  };
  const hipPoint = (x: number): Vector3 =>
    new Vector3(x, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), (hips * Math.PI) / 180).add(new Vector3(...pelvis));

  const parts: Part[] = [];

  // Hips and chest.
  parts.push(
    ...onHips([
      spine([
        [0, -0.06, 0.095 * k, 0.07 * k],
        [0, 0.01, 0.132 * k, 0.095 * k],
        [0, 0.12, 0.112 * k, 0.082 * k],
      ]),
    ]),
    ...onChest([
      spine([
        [0, 0.08, 0.112 * k, 0.082 * k],
        [0, 0.23, shoulders * 0.92, 0.108 * k],
        [0, 0.315, shoulders * 0.95, 0.088 * k],
        [0, 0.355, 0.07 * k, 0.06 * k],
      ]),
      limb([0, 0.33, 0], [0, 0.4, 0.008], 0.05 * k, 0.048 * k),
    ]),
  );

  // Head.
  const head = chestPoint(HEAD_AT);
  const facing = twist + look;
  const onHead = (list: readonly Part[]) => place(list, { at: v3(head), turn: [lean * 0.4, facing, 0] });
  parts.push(...onHead([ball([0, 0, 0], [HEAD * 0.93, HEAD * 1.04, HEAD])]));

  // Arms.
  for (const side of [1, -1] as const) {
    const shoulder = chestPoint([side * shoulders, 0.305, 0]);
    const hand = new Vector3(...(side === 1 ? pose.handL : pose.handR));
    const pole = new Vector3(...((side === 1 ? pose.elbowL : pose.elbowR) ?? [side * 0.5, -1, -0.6]));
    const elbow = bend(shoulder, hand, UPPER_ARM, FOREARM, pole);
    parts.push(
      ball(v3(shoulder), 0.066 * k, 0),
      limb(v3(shoulder), v3(elbow), 0.056 * k, 0.048 * k),
      ball(v3(elbow), 0.054 * k, 0),
      limb(v3(elbow), v3(hand), 0.048 * k, 0.04 * k),
      ball(v3(hand), 0.05, 0),
    );
  }

  // Legs.
  const forward = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), (hips * Math.PI) / 180);
  for (const side of [1, -1] as const) {
    const hip = hipPoint(side * 0.078);
    const sole = side === 1 ? pose.footL : pose.footR;
    const ankle = new Vector3(sole[0], sole[1] + ANKLE, sole[2]);
    const pole = new Vector3(...((side === 1 ? pose.kneeL : pose.kneeR) ?? v3(forward)));
    const knee = bend(hip, ankle, THIGH, SHIN, pole);
    parts.push(
      limb(v3(hip), v3(knee), 0.082 * k, 0.064 * k),
      ball(v3(knee), 0.07 * k, 0),
      limb(v3(knee), v3(ankle), 0.064 * k, 0.048 * k),
      ...place(
        [
          spine(
            [
              [-0.065, 0.036, 0.046, 0.034],
              [0.02, 0.042, 0.054, 0.042],
              [0.14, 0.026, 0.05, 0.026],
            ],
            { sides: 6 },
          ),
        ],
        { at: sole, turn: [0, hips + side * 12, 0] },
      ),
    );
  }

  return {
    parts,
    onChest,
    onHead,
    handL: pose.handL,
    handR: pose.handR,
    head: v3(head),
    facing,
  };
}
