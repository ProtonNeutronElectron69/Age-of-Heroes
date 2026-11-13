import { ball, both, box, figure, gear, limb, place, plate, spine, squad } from "../build";
import { roundShield, spear } from "../gear";
import { HEAD, human, type Human } from "../human";
import type { Part, UnitModel, V3 } from "../types";

const SKELETON = { shoulders: 0.15, bulk: 0.62 };

/** A skeleton's jaw, rib cage and crested helm. */
const legionKit = (body: Human): Part[] => [
  ...body.onHead([
    box([0.1, 0.05, 0.09], [0, -0.085, 0.03]),
    ball([0, 0.035, -0.005], [HEAD * 1.12, HEAD * 0.82, HEAD * 1.14], 0),
    plate(
      [
        [-0.12, 0.07],
        [-0.04, 0.2],
        [0.08, 0.17],
        [0.11, 0.08],
      ],
      0.024,
    ),
  ]),
  ...body.onChest([ball([0, 0.23, 0.005], [0.125, 0.105, 0.085], 0)]),
];

/** A Barrow Legion skeleton standing guard: spear upright, a shield on its arm. */
const legionGuarding = (() => {
  const body = human(
    {
      handR: [-0.27, 0.66, 0.1],
      handL: [0.2, 0.62, 0.2],
      footL: [0.09, 0, 0.04],
      footR: [-0.09, 0, -0.02],
    },
    SKELETON,
  );
  return [...body.parts, ...legionKit(body), ...spear([-0.27, 0, 0.1], [-0.27, 1.5, 0.1]), ...roundShield([0.22, 0.6, 0.27], 0.2, [0, 20, 0])];
})();

/** A Barrow Legion skeleton lunging with its spear. */
const legionLunging = (() => {
  const body = human(
    {
      pelvis: [0, 0.4, 0.04],
      lean: 22,
      twist: -25,
      look: 20,
      handR: [-0.14, 0.6, 0.26],
      handL: [0.2, 0.56, 0.34],
      footL: [0.08, 0, 0.3],
      footR: [-0.08, 0, -0.26],
    },
    SKELETON,
  );
  return [...body.parts, ...legionKit(body), ...spear([-0.17, 0.5, -0.4], [-0.1, 0.7, 0.74]), ...roundShield([0.22, 0.55, 0.4], 0.2, [0, 15, 0])];
})();

/** Marrowcoil, the Bone Wyrm: a serpent of vertebrae and plates, reared to strike with a horned skull. */
const marrowcoil = (() => {
  // The backbone, tail first: where each vertebra is and how thick. It winds along the ground, then rears.
  const bones: (readonly [x: number, y: number, z: number, r: number])[] = [];
  const along = 15;
  for (let i = 0; i <= along; i++) {
    const t = i / along;
    const r = 0.08 + 0.3 * t ** 0.7;
    bones.push([0.46 * Math.sin(t * Math.PI * 2.6) * (0.35 + 0.65 * t), r + 0.22 * t * (0.5 + 0.5 * Math.sin(t * 9 + 1)), -3.05 + 4.5 * t, r]);
  }
  bones.push([0.2, 0.9, 1.75, 0.36], [0.07, 1.34, 1.85, 0.32], [0, 1.7, 2.09, 0.27]);

  const parts: Part[] = [];
  bones.forEach(([x, y, z, r], i) => {
    const next = bones[i + 1];
    if (next) parts.push(limb([x, y, z], [next[0], next[1], next[2]], r * 0.72, next[3] * 0.72, 6));
    // Each vertebra: a knuckle with a spine on top.
    parts.push(ball([x, y, z], [r * 1.15, r * 1.15, r * 0.8], 0), limb([x, y + r * 0.8, z], [x, y + r * 2.2, z - r * 0.7], r * 0.42, 0, 4));
    // Rib plates along the thick of the body.
    if (i >= 6 && i <= along + 2) {
      for (const side of [1, -1]) {
        parts.push(limb([x + side * r * 0.7, y + r * 0.2, z], [x + side * r * 1.8, y - r * 0.75, z + r * 0.3], r * 0.34, 0, 4));
      }
    }
  });
  const skull = place(
    [
      spine(
        [
          [-0.24, 0.02, 0.19, 0.17],
          [0.05, 0.06, 0.24, 0.2],
          [0.36, -0.02, 0.16, 0.12],
          [0.6, -0.07, 0.09, 0.06],
        ],
        { sides: 6 },
      ),
      // The jaw hangs open.
      spine(
        [
          [-0.08, -0.17, 0.18, 0.045],
          [0.28, -0.29, 0.13, 0.04],
          [0.52, -0.36, 0.07, 0.025],
        ],
        { sides: 6 },
      ),
      ...both([limb([0.13, 0.16, -0.1], [0.32, 0.25, -0.58], 0.085, 0, 5), limb([0.1, -0.06, 0.5], [0.1, -0.2, 0.52], 0.03, 0, 4)]),
    ],
    { at: [0, 1.8, 2.31], turn: [22, 0, 0], scale: 1.15 },
  );
  return figure([...parts, ...skull], 6);
})();

/** Vorhal, the Unburied Lord: a crowned skull in old plate, both hands on a grounded greatsword. */
const vorhal = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human(
    {
      pelvis,
      handL: [0.03, 0.8, 0.21],
      handR: [-0.03, 0.74, 0.21],
      footL: [0.12, 0, 0.02],
      footR: [-0.12, 0, -0.02],
    },
    { shoulders: 0.19, bulk: 1.1 },
  );
  const crown = body.onHead([
    box([0.11, 0.05, 0.1], [0, -0.085, 0.03]),
    limb([0, 0.05, 0], [0, 0.1, 0], 0.094, 0.1, 8),
    ...[0, 72, 144, 216, 288].flatMap((turn) => place([limb([0, 0.09, 0.09], [0, 0.19, 0.1], 0.026, 0, 4)], { turn: [0, turn, 0] })),
  ]);
  const armour = [
    ...body.onChest([
      ball([0.21, 0.335, 0], [0.11, 0.08, 0.115], 0),
      ball([-0.21, 0.335, 0], [0.11, 0.08, 0.115], 0),
      // A tattered cloak down the back.
      spine(
        [
          [-0.08, 0.35, 0.14, 0.035],
          [-0.13, 0.1, 0.2, 0.04],
          [-0.19, -0.2, 0.23, 0.035],
          [-0.24, -0.44, 0.2, 0.015],
        ],
        { sides: 6 },
      ),
    ]),
    ...place(
      [
        spine(
          [
            [0, 0.12, 0.145, 0.105],
            [0, -0.16, 0.2, 0.15],
          ],
          { sides: 6 },
        ),
      ],
      { at: pelvis },
    ),
  ];
  // The greatsword stands point down in front of him.
  const greatsword = gear([
    plate(
      [
        [0, 0],
        [0.05, 0.09],
        [0.044, 0.66],
        [-0.044, 0.66],
        [-0.05, 0.09],
      ],
      0.022,
      "front",
      0.21,
    ),
    box([0.28, 0.034, 0.045], [0, 0.675, 0.21]),
    limb([0, 0.69, 0.21], [0, 0.86, 0.21], 0.02, 0.02, 5),
    ball([0, 0.885, 0.21], 0.034, 0),
  ]);
  return figure([...body.parts, ...crown, ...armour, ...greatsword], 6);
})();

/** Three claws on a ghoul's hand, reaching along +z. */
const claws = (at: V3, turn: V3): Part[] =>
  place([limb([0.03, 0.01, 0.02], [0.06, 0, 0.15], 0.022, 0, 4), limb([-0.03, 0.01, 0.02], [-0.06, 0, 0.15], 0.022, 0, 4), limb([0, -0.02, 0.02], [0, -0.05, 0.15], 0.022, 0, 4)], {
    at,
    turn,
  });

const GHOUL = { shoulders: 0.16, bulk: 0.78 };

/** A ghoul's open jaw and the knuckles of its spine. */
const ghoulKit = (body: Human): Part[] => [
  ...body.onHead([box([0.1, 0.045, 0.1], [0, -0.1, 0.04])]),
  ...body.onChest([limb([0, 0.3, -0.07], [0, 0.34, -0.14], 0.04, 0, 4), limb([0, 0.2, -0.08], [0, 0.23, -0.15], 0.04, 0, 4), limb([0, 0.1, -0.075], [0, 0.12, -0.14], 0.035, 0, 4)]),
];

/** A Ghoul loping forward, arms reaching. */
const ghoulLoping = (() => {
  const body = human(
    {
      pelvis: [0, 0.36, 0],
      lean: 45,
      handL: [0.17, 0.3, 0.42],
      handR: [-0.15, 0.36, 0.38],
      footL: [0.1, 0, 0.1],
      footR: [-0.1, 0, -0.25],
    },
    GHOUL,
  );
  return [...body.parts, ...ghoulKit(body), ...claws(body.handL, [20, 0, 0]), ...claws(body.handR, [20, 0, 0])];
})();

/** A Ghoul reared up and shrieking, claws spread. */
const ghoulShrieking = (() => {
  const body = human(
    {
      pelvis: [0, 0.42, 0],
      lean: -8,
      handL: [0.37, 0.78, 0.12],
      handR: [-0.37, 0.74, 0.14],
      elbowL: [1, -0.6, -0.3],
      elbowR: [-1, -0.6, -0.3],
      footL: [0.13, 0, 0.05],
      footR: [-0.12, 0, -0.06],
    },
    GHOUL,
  );
  return [...body.parts, ...ghoulKit(body), ...claws(body.handL, [-50, 30, 0]), ...claws(body.handR, [-50, -30, 0])];
})();

export const ASHEN: Record<string, UnitModel> = {
  marrowcoil: { figures: [marrowcoil] },
  "barrow-legion": { figures: squad([legionGuarding, legionLunging], 5) },
  vorhal: { figures: [vorhal] },
  "ghoul-pack": { figures: squad([ghoulLoping, ghoulShrieking], 4) },
};
