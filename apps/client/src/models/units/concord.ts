import { ball, box, figure, gear, limb, place, plate, spine, squad } from "../build";
import { GALLOP, TROT, horse, type HorsePose } from "../horse";
import { human } from "../human";
import type { Part, UnitModel, V3 } from "../types";

/** A sabre held at the grip, blade up. */
function sabre(at: V3, turn: V3): Part[] {
  return gear(
    place(
      [
        plate(
          [
            [0.028, 0.04],
            [0.03, 0.24],
            [0.012, 0.44],
            [-0.05, 0.6],
            [-0.04, 0.42],
            [-0.026, 0.22],
            [-0.026, 0.04],
          ],
          0.026,
        ),
        box([0.05, 0.028, 0.12], [0, 0.045, 0]),
        limb([0, -0.06, 0], [0, 0.04, 0], 0.02, 0.02, 5),
      ],
      { at, turn },
    ),
  );
}

/** Captain Marisol Vance: bicorne and long coat, pistol levelled, sabre raised. */
const marisolVance = (() => {
  const body = human({
    pelvis: [0, 0.49, 0],
    lean: 3,
    twist: -24,
    look: 20,
    handL: [0.1, 0.8, 0.38],
    handR: [-0.35, 0.98, -0.02],
    elbowR: [-1, -0.3, -0.5],
    footL: [0.09, 0, 0.15],
    footR: [-0.1, 0, -0.13],
  });
  const coat = place(
    [
      spine([
        [0, 0.13, 0.118, 0.088],
        [-0.005, -0.04, 0.165, 0.13],
        [-0.03, -0.22, 0.205, 0.175],
      ]),
    ],
    { at: [0, 0.49, 0], turn: [0, -8, 0] },
  );
  const bicorne = body.onHead([
    plate(
      [
        [-0.22, 0],
        [-0.13, 0.1],
        [0, 0.15],
        [0.13, 0.1],
        [0.22, 0],
        [0.12, 0.03],
        [0, 0.05],
        [-0.12, 0.03],
      ],
      0.15,
      "front",
    ),
    ball([0, 0.06, 0], [0.1, 0.05, 0.1], 0),
  ]);
  const epaulettes = body.onChest([box([0.1, 0.035, 0.13], [0.19, 0.352, 0]), box([0.1, 0.035, 0.13], [-0.19, 0.352, 0])]);
  const pistol = gear(place([box([0.042, 0.05, 0.25], [0, 0.03, 0.1]), box([0.04, 0.1, 0.05], [0, -0.03, -0.01])], { at: body.handL }));
  return figure([...body.parts, ...coat, ...bicorne, ...epaulettes, ...pistol, ...sabre(body.handR, [28, 0, 18])], 5);
})();

/** How much smaller than life the Hussars' horses are, so horse and rider stand Height 6. */
const MOUNT = 0.84;

/** A Brass Hussar: a rider in a tall fur cap on a horse, sabre out. */
function hussar(pose: HorsePose, sabreHand: V3, sabreTurn: V3): Part[] {
  const back = 0.89 * MOUNT;
  const rider = human({
    pelvis: [0, back + 0.05, -0.04],
    lean: 12,
    handL: [0.07, back + 0.2, 0.2],
    handR: sabreHand,
    elbowR: [-1, -0.4, -0.3],
    footL: [0.24, back - 0.4, 0.08],
    footR: [-0.24, back - 0.4, 0.08],
    kneeL: [0.9, 0.2, 1],
    kneeR: [-0.9, 0.2, 1],
  });
  const cap = rider.onHead([limb([0, 0.03, 0], [0, 0.17, 0], 0.098, 0.106, 8), ...gear([limb([0, 0.17, 0.04], [0, 0.3, 0.03], 0.032, 0.014, 5)])]);
  // The jacket slung from the left shoulder.
  const pelisse = rider.onChest([
    spine(
      [
        [-0.085, 0.34, 0.11, 0.034],
        [-0.13, 0.18, 0.135, 0.036],
        [-0.17, 0.02, 0.145, 0.022],
      ],
      { sides: 6, x: 0.07 },
    ),
  ]);
  const saddle = [box([0.36 * MOUNT, 0.04, 0.42], [0, back, -0.04])];
  return [...place(horse(pose), { scale: MOUNT }), ...saddle, ...rider.parts, ...cap, ...pelisse, ...sabre(rider.handR, sabreTurn)];
}

/** A musket with its bayonet fixed, held at the wrist of the stock and pointing along +z. */
function musket(at: V3, turn: V3): Part[] {
  return gear(
    place(
      [
        box([0.045, 0.075, 0.22], [0, 0, -0.14]),
        box([0.034, 0.045, 0.64], [0, 0.035, 0.27]),
        limb([0, 0.035, 0.58], [0, 0.035, 0.78], 0.013, 0, 4),
      ],
      { at, turn },
    ),
  );
}

/** A Concord Fusilier firing: cocked hat, coat tails and pack, musket levelled. `kneeling` takes the front rank's stance. */
function fusilier(kneeling: boolean): Part[] {
  const drop = kneeling ? 0.2 : 0;
  const pelvis: V3 = [0, 0.5 - drop, 0];
  const body = human({
    pelvis,
    hips: kneeling ? 0 : -20,
    lean: kneeling ? 5 : 0,
    twist: -32,
    look: 28,
    handR: [-0.1, 0.78 - drop, 0.12],
    handL: [0.05, 0.79 - drop, 0.4],
    footL: kneeling ? [0.1, 0, 0.22] : [0.08, 0, 0.16],
    footR: kneeling ? [-0.09, 0, -0.24] : [-0.1, 0, -0.12],
    ...(kneeling ? { kneeL: [0, 1, 0.5] as V3, kneeR: [0, -1, 0.7] as V3 } : {}),
  });
  const hat = body.onHead([
    // A cocked hat: three corners, one to the front.
    plate(
      [
        [0, 0.21],
        [0.18, -0.13],
        [-0.18, -0.13],
      ],
      0.04,
      "top",
      0.075,
    ),
    ball([0, 0.085, 0], [0.085, 0.05, 0.085], 0),
  ]);
  const coat = place(
    [
      spine([
        [0, 0.12, 0.118, 0.088],
        [-0.01, -0.04, 0.155, 0.12],
        [-0.04, kneeling ? -0.1 : -0.17, 0.175, 0.14],
      ]),
    ],
    { at: pelvis },
  );
  const pack = body.onChest([box([0.2, 0.17, 0.09], [0, 0.22, -0.145])]);
  return [...body.parts, ...hat, ...coat, ...pack, ...musket(body.handR, [0, 28, 0])];
}

export const CONCORD: Record<string, UnitModel> = {
  "marisol-vance": { figures: [marisolVance] },
  "brass-hussars": {
    figures: squad(
      [hussar(GALLOP, [-0.27, 0.89 * MOUNT + 0.64, 0.16], [30, 0, 14]), hussar(TROT, [-0.28, 0.89 * MOUNT + 0.46, 0.26], [48, 0, 10])],
      6,
    ),
  },
  "concord-fusiliers": { figures: squad([fusilier(false), fusilier(true)], 5) },
};
