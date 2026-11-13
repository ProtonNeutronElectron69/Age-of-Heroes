import { ball, both, box, figure, gear, limb, place, plate, spine, squad } from "../build";
import { HEAD, human, type Human } from "../human";
import { AIM_TURN, aiming } from "../poses";
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

/** The Ashfang Oni: a horned brute in a striped pelt, an iron-studded club hefted high. */
const ashfangOni = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human(
    {
      pelvis,
      lean: 10,
      twist: -12,
      look: 10,
      handR: [-0.4, 1.06, 0.04],
      elbowR: [-1, -0.3, -0.4],
      handL: [0.32, 0.6, 0.28],
      footL: [0.17, 0, 0.14],
      footR: [-0.18, 0, -0.1],
    },
    { shoulders: 0.26, bulk: 1.5 },
  );
  const head = body.onHead([
    ...both([limb([0.055, 0.06, 0.03], [0.12, 0.22, 0.07], 0.034, 0, 4)]),
    // A heavy jaw with tusks.
    box([0.15, 0.06, 0.11], [0, -0.075, 0.035]),
    ...both([limb([0.05, -0.06, 0.085], [0.06, 0.0, 0.11], 0.02, 0, 4)]),
  ]);
  const pelt = [
    ...place(
      [
        spine(
          [
            [0, 0.12, 0.17, 0.125],
            [0, -0.06, 0.24, 0.18],
            [0, -0.2, 0.27, 0.2],
          ],
          { sides: 7 },
        ),
      ],
      { at: pelvis },
    ),
    // The pelt's shoulder, slung across the chest.
    ...body.onChest([ball([0.2, 0.34, 0], [0.13, 0.085, 0.13], 0)]),
  ];
  const club = gear(
    place([limb([0, -0.12, 0], [0, 0.24, 0], 0.03, 0.036, 6), limb([0, 0.24, 0], [0, 0.66, 0], 0.06, 0.11, 8), limb([0, 0.66, 0], [0, 0.72, 0], 0.11, 0.07, 8)], {
      at: body.handR,
      turn: [18, 0, 12],
    }),
  );
  return figure([...body.parts, ...head, ...pelt, ...club], 7);
})();

/** A Ronin: topknot, wide trousers and a long sword. `coiled` is low with a hand on the hilt; otherwise he waits, blade loose at his side. */
function ronin(coiled: boolean): Part[] {
  const pelvis: V3 = [0, coiled ? 0.4 : 0.5, 0];
  const body = human({
    pelvis,
    lean: coiled ? 20 : 2,
    twist: coiled ? 20 : -8,
    look: coiled ? -16 : 10,
    handR: coiled ? [0.12, 0.52, 0.14] : [-0.25, 0.5, 0.06],
    handL: coiled ? [0.18, 0.47, 0.02] : [0.21, 0.56, 0.08],
    footL: coiled ? [0.1, 0, -0.22] : [0.09, 0, 0.05],
    footR: coiled ? [-0.1, 0, 0.24] : [-0.1, 0, -0.03],
  });
  const topknot = body.onHead([limb([0, 0.075, -0.03], [0, 0.16, -0.08], 0.032, 0.022, 5)]);
  const trousers = place(
    [
      spine(
        [
          [0, 0.1, 0.13, 0.09],
          [0, -0.12, 0.2, 0.15],
          [0, coiled ? -0.28 : -0.4, 0.24, 0.18],
        ],
        { sides: 8 },
      ),
    ],
    { at: pelvis },
  );
  // Coiled, the sword is still in its scabbard at the hip.
  const sword = coiled ? gear([limb([0.14, 0.5, 0.24], [0.21, 0.41, -0.46], 0.024, 0.018, 5)]) : katana(body.handR, [112, 0, 0]);
  return [...body.parts, ...topknot, ...trousers, ...sword];
}

/** Kenzo the Lantern Monk: robed, under a wide straw hat, a paper lantern swinging from his staff. */
const kenzo = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({
    pelvis,
    lean: 3,
    handR: [-0.276, 0.75, 0.168],
    handL: [0.05, 0.72, 0.2],
    elbowL: [0.6, -1, 0],
    footL: [0.08, 0, 0.05],
    footR: [-0.09, 0, -0.02],
  });
  const hat = body.onHead([limb([0, 0.03, 0], [0, 0.15, 0], 0.25, 0.02, 10)]);
  const robe = [
    ...place(
      [
        spine([
          [0, 0.12, 0.125, 0.092],
          [0, -0.1, 0.175, 0.135],
          [0, -0.44, 0.23, 0.185],
        ]),
      ],
      { at: pelvis },
    ),
    // The fold of the robe across the chest, and its hanging sleeves.
    ...body.onChest([
      spine(
        [
          [0.02, 0.37, 0.085, 0.075],
          [0.03, 0.27, 0.16, 0.115],
        ],
        { sides: 6 },
      ),
    ]),
    ball([body.handL[0] + 0.04, body.handL[1] - 0.07, body.handL[2] - 0.06], [0.07, 0.1, 0.09], 0),
    ball([body.handR[0] + 0.02, body.handR[1] - 0.08, body.handR[2] - 0.07], [0.07, 0.1, 0.09], 0),
  ];
  const staff = gear([
    limb([-0.3, 0, 0.12], [-0.26, 1.25, 0.2], 0.018, 0.016, 5),
    limb([-0.26, 1.25, 0.2], [-0.25, 1.24, 0.37], 0.014, 0.012, 4),
    limb([-0.25, 1.24, 0.37], [-0.25, 1.14, 0.37], 0.007, 0.007, 3),
    ball([-0.25, 1.05, 0.37], [0.075, 0.1, 0.075], 0),
  ]);
  return figure([...body.parts, ...hat, ...robe, ...staff], 5);
})();

/** A Teppo Gunner firing a matchlock from one of the aiming stances, under a flat war hat. */
function teppoGunner(kneeling: boolean): Part[] {
  const pose = aiming(kneeling);
  const body = human(pose);
  const hat = body.onHead([limb([0, 0.035, 0], [0, 0.11, 0], 0.2, 0.03, 8)]);
  const armour = [
    ...body.onChest([box([0.05, 0.15, 0.14], [0.24, 0.25, 0]), box([0.05, 0.15, 0.14], [-0.24, 0.25, 0])]),
    ...place(
      [
        spine(
          [
            [0, 0.12, 0.135, 0.1],
            [0, -0.03, 0.19, 0.15],
            [0, kneeling ? -0.1 : -0.17, 0.22, 0.18],
          ],
          { sides: 6 },
        ),
      ],
      { at: pose.pelvis },
    ),
  ];
  const matchlock = gear(
    place([box([0.045, 0.07, 0.2], [0, 0, -0.13]), box([0.036, 0.045, 0.56], [0, 0.035, 0.24]), box([0.03, 0.035, 0.06], [-0.03, 0.065, 0.02])], {
      at: body.handR,
      turn: AIM_TURN,
    }),
  );
  return [...body.parts, ...hat, ...armour, ...matchlock];
}

export const KAGERO: Record<string, UnitModel> = {
  "lady-asagiri": { figures: [ladyAsagiri] },
  "hollow-reed-shinobi": { figures: squad([shinobiCrouched, shinobiBlowpipe], 4) },
  "ashfang-oni": { figures: [ashfangOni] },
  "shirokage-ronin": { figures: squad([ronin(true), ronin(false)], 5) },
  kenzo: { figures: [kenzo] },
  "teppo-gunners": { figures: squad([teppoGunner(false), teppoGunner(true)], 5) },
};
