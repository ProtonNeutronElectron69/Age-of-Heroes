import { ball, box, figure, gear, limb, place, plate, spine, squad } from "../build";
import { GALLOP, TROT, horse, type HorsePose } from "../horse";
import { HEAD, human, type Human } from "../human";
import { AIM_TURN, aiming } from "../poses";
import { spear } from "../gear";
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
  const pose = aiming(kneeling);
  const body = human(pose);
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
    { at: pose.pelvis },
  );
  const pack = body.onChest([box([0.2, 0.17, 0.09], [0, 0.22, -0.145])]);
  return [...body.parts, ...hat, ...coat, ...pack, ...musket(body.handR, AIM_TURN)];
}

/** A Pikeman's helmet with its brim and comb, his breastplate and his coat. */
const pikemanKit = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ball([0, 0.03, 0], [HEAD * 1.1, HEAD * 0.95, HEAD * 1.12]),
    plate(
      [
        [0, 0.2],
        [0.115, 0.08],
        [0.125, -0.06],
        [0, -0.18],
        [-0.125, -0.06],
        [-0.115, 0.08],
      ],
      0.022,
      "top",
      0.03,
    ),
    plate(
      [
        [-0.1, 0.1],
        [0, 0.18],
        [0.1, 0.1],
      ],
      0.022,
    ),
  ]),
  ...body.onChest([ball([0, 0.215, 0.02], [0.17, 0.145, 0.125], 0)]),
  ...place(
    [
      spine([
        [0, 0.12, 0.118, 0.088],
        [-0.01, -0.04, 0.155, 0.12],
        [-0.03, -0.14, 0.17, 0.135],
      ]),
    ],
    { at: pelvis },
  ),
];

/** A Pikeman on guard, pike upright. */
const pikemanGuarding = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({
    pelvis,
    handR: [-0.27, 0.72, 0.1],
    handL: [0.2, 0.56, 0.06],
    elbowL: [1, -0.3, -0.6],
    footL: [0.09, 0, 0.04],
    footR: [-0.09, 0, -0.02],
  });
  return [...body.parts, ...pikemanKit(body, pelvis), ...spear([-0.27, 0, 0.1], [-0.27, 1.9, 0.1], 0.016)];
})();

/** A Pikeman braced low to receive a charge, pike slanting forward from his back foot. */
const pikemanBraced = (() => {
  const pelvis: V3 = [0, 0.36, 0];
  const body = human({
    pelvis,
    lean: 12,
    twist: -30,
    look: 26,
    handL: [-0.058, 0.58, 0.27],
    handR: [-0.082, 0.366, 0.052],
    footL: [0.08, 0, 0.3],
    footR: [-0.1, 0, -0.26],
  });
  return [...body.parts, ...pikemanKit(body, pelvis), ...spear([-0.12, 0.02, -0.3], [0, 1.1, 0.8], 0.016)];
})();

/** Sister Maren Holloway: veil and apron over a field coat, a lantern raised, a pistol kept low. */
const sisterMaren = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human(
    {
      pelvis,
      twist: 8,
      look: -6,
      handL: [0.27, 1.0, 0.16],
      elbowL: [1, -0.6, -0.2],
      handR: [-0.25, 0.54, 0.14],
      footL: [0.08, 0, 0.06],
      footR: [-0.09, 0, -0.03],
    },
    { shoulders: 0.16, bulk: 0.92 },
  );
  const veil = body.onHead([
    ball([0, 0.012, -0.014], [HEAD * 1.14, HEAD * 1.14, HEAD * 1.16]),
    spine(
      [
        [-0.06, 0, 0.1, 0.05],
        [-0.1, -0.16, 0.145, 0.04],
        [-0.13, -0.32, 0.155, 0.025],
      ],
      { sides: 6 },
    ),
  ]);
  const coat = place(
    [
      spine([
        [0, 0.12, 0.11, 0.082],
        [0, -0.1, 0.16, 0.125],
        [-0.01, -0.38, 0.2, 0.165],
      ]),
    ],
    { at: pelvis },
  );
  const satchel = body.onChest([box([0.09, 0.14, 0.16], [-0.17, 0.05, -0.02])]);
  const [x, y, z] = body.handL;
  const lantern = gear([limb([x, y - 0.02, z], [x, y - 0.08, z], 0.012, 0.012, 4), limb([x, y - 0.08, z], [x, y - 0.11, z], 0.02, 0.055, 6), box([0.085, 0.12, 0.085], [x, y - 0.17, z])]);
  const pistol = gear(place([box([0.04, 0.048, 0.22], [0, 0.03, 0.09]), box([0.038, 0.09, 0.048], [0, -0.03, -0.01])], { at: body.handR, turn: [25, 0, 0] }));
  return figure([...body.parts, ...veil, ...coat, ...satchel, ...lantern, ...pistol], 5);
})();

/** Sergeant Brannock: a burly sapper winding up to throw a satchel charge, its fuse lit. */
const brannock = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human(
    {
      pelvis,
      lean: 6,
      twist: -35,
      look: 30,
      handR: [-0.3, 0.95, -0.28],
      elbowR: [-1, 0, -0.5],
      handL: [0.2, 0.82, 0.36],
      footL: [0.1, 0, 0.24],
      footR: [-0.12, 0, -0.2],
    },
    { shoulders: 0.2, bulk: 1.25 },
  );
  const cap = body.onHead([
    limb([0, 0.05, 0], [0, 0.105, 0], 0.094, 0.086, 8),
    box([0.13, 0.02, 0.08], [0, 0.055, 0.1]),
    // A full beard.
    limb([0, -0.05, 0.065], [0, -0.17, 0.085], 0.06, 0.02, 5),
  ]);
  const apron = place(
    [
      spine(
        [
          [0, 0.13, 0.145, 0.105],
          [0.01, -0.06, 0.18, 0.14],
          [0.02, -0.24, 0.19, 0.15],
        ],
        { sides: 6 },
      ),
    ],
    { at: pelvis },
  );
  const tools = body.onChest([box([0.1, 0.12, 0.09], [0.19, 0.03, 0.02]), box([0.1, 0.12, 0.09], [-0.19, 0.03, -0.02])]);
  const [x, y, z] = body.handR;
  const charge = gear([box([0.17, 0.13, 0.1], [x, y - 0.03, z - 0.02]), limb([x + 0.05, y + 0.03, z - 0.02], [x + 0.09, y + 0.16, z - 0.05], 0.012, 0.008, 4)]);
  // A spade slung across his back.
  const spade = gear(
    body.onChest([
      limb([-0.14, 0.02, -0.13], [0.12, 0.42, -0.14], 0.016, 0.016, 5),
      plate(
        [
          [-0.06, 0],
          [0.06, 0],
          [0.07, 0.13],
          [0, 0.17],
          [-0.07, 0.13],
        ],
        0.016,
        "front",
        -0.14,
      ),
    ]),
  );
  return figure([...body.parts, ...cap, ...apron, ...tools, ...charge, ...spade], 5);
})();

/** A Grenadier's tall cap with its brass front, his coat and his pouch. */
const grenadierKit = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    plate(
      [
        [-0.09, 0.04],
        [-0.075, 0.2],
        [0, 0.28],
        [0.075, 0.2],
        [0.09, 0.04],
      ],
      0.05,
      "front",
      0.045,
    ),
    ball([0, 0.07, -0.03], [0.085, 0.09, 0.08], 0),
  ]),
  ...place(
    [
      spine([
        [0, 0.12, 0.118, 0.088],
        [-0.01, -0.04, 0.155, 0.12],
        [-0.04, -0.17, 0.175, 0.14],
      ]),
    ],
    { at: pelvis },
  ),
  ...body.onChest([box([0.12, 0.11, 0.08], [-0.16, 0.03, -0.06])]),
];

/** A grenade with its fuse. */
const grenade = (at: V3): Part[] => gear([ball(at, 0.05, 0), limb([at[0], at[1] + 0.04, at[2]], [at[0] + 0.02, at[1] + 0.1, at[2]], 0.01, 0.006, 4)]);

/** A Grenadier lobbing a grenade. */
const grenadierLobbing = (() => {
  const pelvis: V3 = [0, 0.49, 0];
  const body = human({
    pelvis,
    lean: -4,
    twist: -22,
    look: 18,
    handR: [-0.3, 1.02, -0.12],
    elbowR: [-1, -0.2, -0.5],
    handL: [0.2, 0.8, 0.3],
    footL: [0.09, 0, 0.2],
    footR: [-0.1, 0, -0.16],
  });
  return [...body.parts, ...grenadierKit(body, pelvis), ...grenade([body.handR[0], body.handR[1] + 0.07, body.handR[2]])];
})();

/** A Grenadier lighting a fuse from a slow match. */
const grenadierLighting = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human({
    pelvis,
    lean: 8,
    handL: [0.06, 0.7, 0.26],
    handR: [-0.09, 0.73, 0.23],
    footL: [0.09, 0, 0.05],
    footR: [-0.09, 0, -0.03],
  });
  const match = gear([limb(body.handR, [body.handR[0] + 0.1, body.handR[1] + 0.03, body.handR[2] + 0.06], 0.012, 0.008, 4)]);
  return [...body.parts, ...grenadierKit(body, pelvis), ...grenade([body.handL[0], body.handL[1] + 0.07, body.handL[2]]), ...match];
})();

export const CONCORD: Record<string, UnitModel> = {
  "marisol-vance": { figures: [marisolVance] },
  "brass-hussars": {
    figures: squad(
      [hussar(GALLOP, [-0.27, 0.89 * MOUNT + 0.64, 0.16], [30, 0, 14]), hussar(TROT, [-0.28, 0.89 * MOUNT + 0.46, 0.26], [48, 0, 10])],
      6,
    ),
  },
  "concord-fusiliers": { figures: squad([fusilier(false), fusilier(true)], 5) },
  "gatewarden-pikemen": { figures: squad([pikemanGuarding, pikemanBraced], 5) },
  "sister-maren": { figures: [sisterMaren] },
  brannock: { figures: [brannock] },
  "concord-grenadiers": { figures: squad([grenadierLobbing, grenadierLighting], 5) },
};
