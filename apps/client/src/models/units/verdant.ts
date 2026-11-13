import { ball, both, figure, gear, limb, place, plate, spine } from "../build";
import { HEAD, human, type Human } from "../human";
import type { Part, UnitModel, V3 } from "../types";

/** A longbow held at the grip, standing upright; `draw` is how far the tips are pulled back. */
function bow(at: V3, draw: number, turn: V3 = [0, 0, 0]): Part[] {
  const tip = 0.07 + draw;
  const wide = 0.034;
  return gear(
    place(
      [
        plate(
          [
            [-tip, -0.4],
            [-tip * 0.42, -0.24],
            [0.008, -0.08],
            [0.02, 0],
            [0.008, 0.08],
            [-tip * 0.42, 0.24],
            [-tip, 0.4],
            [-tip - wide * 0.7, 0.39],
            [-tip * 0.42 - wide, 0.23],
            [-wide, 0.08],
            [-wide * 0.8, 0],
            [-wide, -0.08],
            [-tip * 0.42 - wide, -0.23],
            [-tip - wide * 0.7, -0.39],
          ],
          0.036,
        ),
      ],
      { at, turn },
    ),
  );
}

function arrow(from: V3, to: V3): Part[] {
  const head: V3 = [to[0] + (to[0] - from[0]) * 0.1, to[1] + (to[1] - from[1]) * 0.1, to[2] + (to[2] - from[2]) * 0.1];
  return gear([limb(from, to, 0.012, 0.012, 4), limb(to, head, 0.028, 0, 4)]);
}

const WARDEN = { shoulders: 0.15, bulk: 0.84 };

const ears = (body: Human) => body.onHead(both([limb([0.074, 0, -0.005], [0.155, 0.09, -0.075], 0.03, 0, 4)]));

const quiver = (body: Human) =>
  body.onChest([limb([-0.08, 0.1, -0.115], [0.07, 0.4, -0.13], 0.042, 0.048, 6), limb([0.07, 0.4, -0.13], [0.1, 0.47, -0.133], 0.036, 0.04, 5)]);

function cloak(body: Human, sweep: number): Part[] {
  return body.onChest([
    spine(
      [
        [-0.07, 0.35, 0.12, 0.034],
        [-0.105 - sweep * 0.2, 0.18, 0.165, 0.04],
        [-0.14 - sweep * 0.6, -0.08, 0.2, 0.038],
        [-0.17 - sweep, -0.3, 0.22, 0.018],
      ],
      { sides: 6 },
    ),
  ]);
}

/** A Glade Warden loosing an arrow: side on, hood down, cloak streaming behind. */
const wardenLoosing = (() => {
  const body = human(
    {
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
    },
    WARDEN,
  );
  const hood = body.onChest([ball([0, 0.37, -0.09], [0.09, 0.06, 0.07], 0)]);
  return figure(
    [
      ...body.parts,
      ...ears(body),
      ...hood,
      ...cloak(body, 0.1),
      ...quiver(body),
      ...bow(body.handL, 0.09),
      ...arrow([-0.04, 0.845, 0], [0.03, 0.81, 0.54]),
    ],
    5,
  );
})();

/** A Glade Warden on watch: hood up, bow grounded at her side, an arrow in the other hand. */
const wardenWatching = (() => {
  const body = human(
    {
      twist: 10,
      look: 14,
      handL: [0.25, 0.5, 0.07],
      handR: [-0.22, 0.5, 0.09],
      footL: [0.085, 0, 0.03],
      footR: [-0.08, 0, -0.03],
    },
    WARDEN,
  );
  const hood = body.onHead([
    ball([0, 0.008, -0.014], [HEAD * 1.16, HEAD * 1.22, HEAD * 1.2]),
    limb([0, 0.05, -0.05], [0, 0.03, -0.17], 0.05, 0, 5),
  ]);
  const mantle = body.onChest([
    spine(
      [
        [0, 0.37, 0.08, 0.075],
        [-0.01, 0.31, 0.185, 0.12],
        [-0.02, 0.22, 0.2, 0.13],
      ],
      { sides: 8 },
    ),
  ]);
  return figure(
    [
      ...body.parts,
      ...hood,
      ...mantle,
      ...cloak(body, 0),
      ...quiver(body),
      ...bow(body.handL, 0, [0, 12, 0]),
      ...arrow([-0.22, 0.5, 0.09], [-0.26, 0.2, 0.3]),
    ],
    5,
  );
})();

/** A sapling growing on Old Rootback: a trunk and a few clumps of leaves. */
function sapling(foot: V3, top: V3, size: number): Part[] {
  return [
    limb(foot, top, size * 0.3, size * 0.2, 5),
    ball([top[0], top[1] + size * 0.45, top[2]], size, 0),
    ball([top[0] - size * 0.6, top[1], top[2] + size * 0.6], size * 0.7, 0),
    ball([top[0] + size * 0.6, top[1] + size * 0.05, top[2] - size * 0.5], size * 0.7, 0),
  ];
}

/** Old Rootback: a hill of a beast, moss and saplings growing on its back, tusks low to the ground. */
const oldRootback = (() => {
  const body = spine(
    [
      [-1.34, 0.84, 0.14, 0.14],
      [-1.16, 0.92, 0.46, 0.4],
      [-0.7, 1.02, 0.66, 0.56],
      [-0.1, 1.06, 0.7, 0.6],
      [0.5, 1.02, 0.66, 0.56],
      [0.92, 0.94, 0.54, 0.46],
      [1.16, 0.86, 0.42, 0.36],
    ],
    { sides: 10 },
  );
  // The mossy shell over its back: a dome whose rim stands proud of the body under it.
  const shell = spine(
    [
      [-1.3, 1.1, 0.2, 0.1],
      [-1.02, 1.2, 0.6, 0.42],
      [-0.5, 1.26, 0.8, 0.68],
      [0, 1.28, 0.83, 0.72],
      [0.5, 1.25, 0.76, 0.6],
      [0.88, 1.18, 0.5, 0.36],
      [1.04, 1.12, 0.2, 0.1],
    ],
    { sides: 10 },
  );
  const head = [
    spine(
      [
        [1.0, 0.84, 0.42, 0.38],
        [1.36, 0.74, 0.4, 0.36],
        [1.62, 0.62, 0.3, 0.25],
        [1.76, 0.55, 0.2, 0.15],
      ],
      { sides: 8 },
    ),
    // Brow plate.
    spine(
      [
        [1.0, 1.08, 0.3, 0.1],
        [1.36, 1.02, 0.36, 0.12],
        [1.6, 0.86, 0.24, 0.07],
      ],
      { sides: 6 },
    ),
  ];
  const tusks = both([limb([0.27, 0.54, 1.42], [0.42, 0.3, 1.74], 0.11, 0.09, 6), limb([0.42, 0.3, 1.74], [0.37, 0.6, 1.94], 0.09, 0, 6)]);
  const legs = both([
    limb([0.46, 0.8, 0.7], [0.55, 0.4, 0.82], 0.3, 0.26, 7),
    limb([0.55, 0.4, 0.82], [0.55, 0, 0.82], 0.26, 0.3, 7),
    limb([0.46, 0.8, -0.74], [0.56, 0.42, -0.88], 0.31, 0.26, 7),
    limb([0.56, 0.42, -0.88], [0.56, 0, -0.88], 0.26, 0.3, 7),
  ]);
  const tail = spine(
    [
      [-1.3, 0.88, 0.14, 0.14],
      [-1.5, 0.72, 0.09, 0.09],
      [-1.6, 0.5, 0.03, 0.03],
    ],
    { sides: 5 },
  );
  const saplings = [
    ...sapling([0.05, 1.9, -0.1], [0.1, 2.32, -0.04], 0.2),
    ...sapling([-0.32, 1.74, 0.46], [-0.4, 2.06, 0.52], 0.15),
    ...sapling([0.16, 1.78, -0.66], [0.2, 2.04, -0.74], 0.13),
  ];
  return figure([body, shell, ...head, ...tusks, ...legs, tail, ...saplings], 9);
})();

export const VERDANT: Record<string, UnitModel> = {
  "glade-wardens": { figures: [wardenLoosing, wardenWatching] },
  "old-rootback": { figures: [oldRootback] },
};
