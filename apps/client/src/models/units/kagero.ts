import { ball, box, figure, gear, limb, place, plate, spine, squad } from "../build";
import { HEAD, human, type Human } from "../human";
import type { Part, UnitModel, V3 } from "../types";

/** A long sword held at the hilt, blade up, with a round guard. */
function katana(at: V3, turn: V3): Part[] {
  return gear(
    place(
      [
        plate(
          [
            [0.02, 0.06],
            [0.022, 0.32],
            [0.008, 0.52],
            [-0.036, 0.7],
            [-0.034, 0.52],
            [-0.022, 0.32],
            [-0.02, 0.06],
          ],
          0.024,
        ),
        limb([0, 0.04, 0], [0, 0.062, 0], 0.052, 0.052, 8),
        limb([0, -0.17, 0], [0, 0.04, 0], 0.019, 0.019, 5),
      ],
      { at, turn },
    ),
  );
}

/** Lady Asagiri the Unbowed: a samurai in full armour, sword raised at her shoulder. */
const ladyAsagiri = (() => {
  const body = human(
    {
      pelvis: [0, 0.47, 0],
      lean: 4,
      twist: -18,
      look: 14,
      handR: [-0.2, 0.74, 0.1],
      handL: [-0.11, 0.65, 0.15],
      elbowR: [-1, -0.2, -0.4],
      footL: [0.1, 0, 0.2],
      footR: [-0.12, 0, -0.16],
    },
    { bulk: 1.05 },
  );
  const helmet = body.onHead([
    ball([0, 0.022, 0], [HEAD * 1.14, HEAD * 1.02, HEAD * 1.16]),
    // The neck guard sweeps round the sides and back and leaves the face open.
    spine(
      [
        [-0.03, 0.03, 0.105, 0.11],
        [-0.085, -0.075, 0.2, 0.135],
      ],
      { sides: 8 },
    ),
    // The crest: a crescent on the brow.
    plate(
      [
        [-0.16, 0.22],
        [-0.085, 0.115],
        [0, 0.09],
        [0.085, 0.115],
        [0.16, 0.22],
        [0.065, 0.155],
        [0, 0.14],
        [-0.065, 0.155],
      ],
      0.022,
      "front",
      0.098,
    ),
  ]);
  const shoulderGuards = body.onChest([box([0.06, 0.2, 0.17], [0.255, 0.24, 0]), box([0.06, 0.2, 0.17], [-0.255, 0.24, 0])]);
  const skirt = place(
    [
      spine(
        [
          [0, 0.12, 0.14, 0.1],
          [0, -0.02, 0.2, 0.155],
          [0, -0.18, 0.24, 0.195],
        ],
        { sides: 6 },
      ),
    ],
    { at: [0, 0.47, 0] },
  );
  const scabbard = gear([limb([0.15, 0.53, 0.14], [0.21, 0.45, -0.34], 0.022, 0.018, 5)]);
  return figure([...body.parts, ...helmet, ...shoulderGuards, ...skirt, ...scabbard, ...katana(body.handR, [-10, 0, 8])], 5);
})();

const SHINOBI = { shoulders: 0.145, bulk: 0.8 };

/** The tails of a shinobi's head wrap, and the short sword across the back. */
const shinobiKit = (body: Human): Part[] => [
  ...body.onHead([limb([0, 0.02, -0.08], [0.04, -0.03, -0.22], 0.034, 0.008, 4)]),
  ...gear(body.onChest([limb([-0.14, 0.44, -0.105], [0.13, 0.08, -0.115], 0.018, 0.018, 4), box([0.05, 0.02, 0.05], [-0.09, 0.375, -0.108])])),
];

/** A Shinobi crouched low, a star just loosed and a knife held back. */
const shinobiCrouched = (() => {
  const body = human(
    {
      pelvis: [0, 0.3, -0.04],
      lean: 28,
      twist: -20,
      look: 15,
      handL: [0.12, 0.62, 0.38],
      handR: [-0.25, 0.42, -0.12],
      elbowR: [-1, 0, -0.5],
      footL: [0.1, 0, 0.2],
      footR: [-0.1, 0, -0.2],
    },
    SHINOBI,
  );
  const knife = gear(
    place(
      [
        plate(
          [
            [0.02, 0.03],
            [0.012, 0.16],
            [-0.014, 0.23],
            [-0.018, 0.03],
          ],
          0.016,
        ),
      ],
      { at: body.handR, turn: [-115, 0, 0] },
    ),
  );
  return [...body.parts, ...shinobiKit(body), ...knife];
})();

/** A Shinobi standing side-on with a reed blowpipe to her lips. */
const shinobiBlowpipe = (() => {
  const body = human(
    {
      hips: -72,
      twist: -78,
      look: 74,
      handL: [0.02, 0.9, 0.34],
      handR: [0, 0.9, 0.17],
      elbowR: [-0.3, -1, -0.3],
      footL: [0.02, 0, 0.15],
      footR: [-0.03, 0, -0.14],
      kneeL: [-0.4, 0, 1],
      kneeR: [-1, 0, 0.2],
    },
    SHINOBI,
  );
  const pipe = gear([limb([0, 0.905, 0.1], [0.025, 0.89, 0.68], 0.014, 0.014, 5)]);
  return [...body.parts, ...shinobiKit(body), ...pipe];
})();

export const KAGERO: Record<string, UnitModel> = {
  "lady-asagiri": { figures: [ladyAsagiri] },
  "hollow-reed-shinobi": { figures: squad([shinobiCrouched, shinobiBlowpipe], 4) },
};
