import { both, limb, plate, spine } from "./build";
import type { Part } from "./types";

/** A leg as four points in z and y: where it leaves the body, the knee or hock, the fetlock and the hoof. */
export type HorseLeg = readonly [readonly [number, number], readonly [number, number], readonly [number, number], readonly [number, number]];

export interface HorsePose {
  readonly frontL: HorseLeg;
  readonly frontR: HorseLeg;
  readonly hindL: HorseLeg;
  readonly hindR: HorseLeg;
}

/** At a gallop: forelegs off the ground, hind legs driving. */
export const GALLOP: HorsePose = {
  frontL: [[0.3, 0.6], [0.47, 0.44], [0.53, 0.23], [0.6, 0.13]],
  frontR: [[0.3, 0.6], [0.42, 0.4], [0.32, 0.25], [0.26, 0.17]],
  hindL: [[-0.32, 0.62], [-0.37, 0.36], [-0.27, 0.1], [-0.25, 0]],
  hindR: [[-0.32, 0.62], [-0.47, 0.38], [-0.51, 0.12], [-0.49, 0]],
};

/** At a trot: one foreleg and the opposite hind leg lifted. */
export const TROT: HorsePose = {
  frontL: [[0.3, 0.6], [0.31, 0.34], [0.3, 0.09], [0.31, 0]],
  frontR: [[0.3, 0.6], [0.43, 0.42], [0.39, 0.22], [0.36, 0.13]],
  hindL: [[-0.32, 0.62], [-0.31, 0.39], [-0.4, 0.21], [-0.44, 0.13]],
  hindR: [[-0.32, 0.62], [-0.41, 0.36], [-0.37, 0.09], [-0.36, 0]],
};

const LEG_X = 0.118;

function leg(points: HorseLeg, x: number, hind: boolean): Part {
  const [a, b, c, d] = points;
  const thick = hind ? 0.115 : 0.095;
  return spine(
    [
      [a[0], a[1], 0.075, thick],
      [b[0], b[1], 0.052, 0.06],
      [c[0], c[1], 0.042, 0.046],
      [d[0], d[1] + 0.05, 0.056, 0.062],
      [d[0] + 0.014, d[1], 0.064, 0.07],
    ],
    { sides: 6, x },
  );
}

/**
 * A horse, written to the same scale as `human` (a standing rider is 1 tall):
 * its back is 0.89 high and it is 1.45 long from nose to tail.
 */
export function horse(pose: HorsePose): Part[] {
  return [
    // Barrel, from the rump to the chest.
    spine(
      [
        [-0.52, 0.76, 0.06, 0.07],
        [-0.46, 0.75, 0.15, 0.16],
        [-0.3, 0.73, 0.195, 0.18],
        [0, 0.72, 0.185, 0.17],
        [0.26, 0.73, 0.185, 0.19],
        [0.38, 0.78, 0.13, 0.16],
        [0.43, 0.8, 0.06, 0.08],
      ],
      { sides: 8 },
    ),
    // Neck and head.
    spine(
      [
        [0.26, 0.8, 0.125, 0.19],
        [0.43, 0.98, 0.095, 0.14],
        [0.55, 1.15, 0.072, 0.1],
      ],
      { sides: 6 },
    ),
    spine(
      [
        [0.5, 1.2, 0.055, 0.06],
        [0.6, 1.13, 0.08, 0.09],
        [0.75, 0.99, 0.06, 0.064],
        [0.83, 0.92, 0.05, 0.048],
      ],
      { sides: 6 },
    ),
    ...both([limb([0.05, 1.2, 0.53], [0.07, 1.31, 0.5], 0.03, 0, 4)]),
    // Mane and tail.
    plate(
      [
        [0.29, 0.98],
        [0.4, 1.1],
        [0.5, 1.24],
        [0.57, 1.22],
        [0.47, 1.05],
        [0.36, 0.92],
      ],
      0.05,
    ),
    spine(
      [
        [-0.5, 0.8, 0.04, 0.045],
        [-0.6, 0.75, 0.06, 0.07],
        [-0.66, 0.52, 0.07, 0.08],
        [-0.63, 0.3, 0.025, 0.035],
      ],
      { sides: 5 },
    ),
    leg(pose.frontL, LEG_X, false),
    leg(pose.frontR, -LEG_X, false),
    leg(pose.hindL, LEG_X, true),
    leg(pose.hindR, -LEG_X, true),
  ];
}
