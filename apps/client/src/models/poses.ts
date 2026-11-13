import type { HumanPose } from "./human";
import type { V3 } from "./types";

/**
 * Taking aim along +z with a long gun or a crossbow: the right hand at the
 * grip and the left under the barrel. `kneeling` drops to the right knee.
 * The pose's `pelvis` is always set.
 */
export function aiming(kneeling: boolean): HumanPose & { pelvis: V3 } {
  const drop = kneeling ? 0.2 : 0;
  return {
    pelvis: [0, 0.5 - drop, 0],
    hips: kneeling ? 0 : -20,
    lean: kneeling ? 5 : 0,
    twist: -32,
    look: 28,
    handR: [-0.1, 0.78 - drop, 0.12],
    handL: [0.05, 0.79 - drop, 0.4],
    footL: kneeling ? [0.1, 0, 0.22] : [0.08, 0, 0.16],
    footR: kneeling ? [-0.09, 0, -0.24] : [-0.1, 0, -0.12],
    ...(kneeling ? { kneeL: [0, 1, 0.5] as V3, kneeR: [0, -1, 0.7] as V3 } : {}),
  };
}

/** How far to turn a gun held in the aiming pose, so that it lies along both hands. */
export const AIM_TURN: V3 = [0, 28, 0];

/**
 * An archer at full draw, side on, loosing along +z: the left hand holds the
 * bow out and the right is back at the cheek.
 */
export function loosing(): HumanPose {
  return {
    hips: -78,
    twist: -84,
    look: 78,
    handL: [0.03, 0.8, 0.47],
    handR: [-0.04, 0.85, 0.03],
    elbowR: [0, 0.35, -1],
    footL: [0.02, 0, 0.18],
    footR: [-0.03, 0, -0.17],
    kneeL: [-0.4, 0, 1],
    kneeR: [-1, 0, 0.2],
  };
}

/** The arrow on the string of an archer in the loosing pose: its nock and the neck of its head. */
export const DRAWN: readonly [V3, V3] = [
  [-0.04, 0.845, 0],
  [0.03, 0.81, 0.54],
];
