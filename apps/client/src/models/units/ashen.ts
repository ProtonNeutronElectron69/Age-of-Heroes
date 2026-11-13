import { ball, both, box, figure, gear, limb, place, plate, spine, squad } from "../build";
import { arrow, bow, roundShield, spear } from "../gear";
import { HEAD, human, type Human } from "../human";
import { DRAWN, loosing } from "../poses";
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

/** An orc's heavy jaw and tusks, written around the middle of the head. */
const ORC_JAW: Part[] = [box([0.15, 0.06, 0.11], [0, -0.08, 0.035]), ...both([limb([0.05, -0.065, 0.085], [0.06, -0.005, 0.11], 0.02, 0, 4)])];

/** Grubnak Skullcaller: a hulking orc shaman under a skull headdress, a war drum at his hip and a hex in his fist. */
const grubnak = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human(
    {
      pelvis,
      lean: 8,
      twist: 10,
      handR: [-0.36, 1.02, 0.1],
      elbowR: [-1, -0.3, -0.4],
      handL: [0.27, 0.56, 0.24],
      footL: [0.15, 0, 0.1],
      footR: [-0.15, 0, -0.08],
    },
    { shoulders: 0.23, bulk: 1.35 },
  );
  const headdress = body.onHead([
    ball([0, 0.05, -0.01], [HEAD * 1.2, HEAD * 0.95, HEAD * 1.22], 0),
    ...both([limb([0.08, 0.08, 0], [0.21, 0.2, -0.04], 0.038, 0, 4)]),
    ...ORC_JAW,
  ]);
  const hides = [
    ...body.onChest([
      spine(
        [
          [0, 0.375, 0.1, 0.09],
          [-0.01, 0.31, 0.265, 0.15],
          [-0.02, 0.23, 0.27, 0.155],
        ],
        { sides: 8 },
      ),
    ]),
    ...place(
      [
        spine(
          [
            [0, 0.12, 0.16, 0.12],
            [0, -0.18, 0.22, 0.17],
          ],
          { sides: 6 },
        ),
      ],
      { at: pelvis },
    ),
    // The war drum, slung at his left hip.
    limb([0.19, 0.44, 0.12], [0.36, 0.5, 0.16], 0.135, 0.135, 8),
  ];
  // The hex: shards of light bursting from his raised fist.
  const hex = gear(
    place(
      (
        [
          [0, 0.24, 0],
          [0.16, 0.14, 0.04],
          [-0.16, 0.14, 0.04],
          [0, 0.12, 0.18],
          [0, 0.12, -0.16],
        ] as V3[]
      ).map((d) => limb([d[0] * 0.3, d[1] * 0.3, d[2] * 0.3], d, 0.022, 0, 4)),
      { at: body.handR },
    ),
  );
  const drumstick = gear([limb([body.handL[0], body.handL[1] + 0.04, body.handL[2]], [body.handL[0] + 0.02, body.handL[1] - 0.12, body.handL[2] - 0.06], 0.016, 0.024, 5)]);
  return figure([...body.parts, ...headdress, ...hides, ...hex, ...drumstick], 6);
})();

/** A hood, up: it covers the head and hangs to a point behind. */
const hood = (body: Human): Part[] => body.onHead([ball([0, 0.008, -0.014], [HEAD * 1.16, HEAD * 1.2, HEAD * 1.2]), limb([0, 0.05, -0.05], [0, 0.0, -0.19], 0.055, 0, 5)]);

/** Morvane the Gravecaller: hooded and ragged, a skull-topped staff in one hand, grave-light in the other. */
const morvane = (() => {
  const pelvis: V3 = [0, 0.49, 0];
  const body = human(
    {
      pelvis,
      lean: 8,
      twist: -8,
      handR: [-0.28, 0.8, 0.16],
      handL: [0.25, 0.8, 0.24],
      elbowL: [1, -0.8, -0.2],
      footL: [0.08, 0, 0.06],
      footR: [-0.09, 0, -0.03],
    },
    { shoulders: 0.16, bulk: 0.9 },
  );
  const robes = [
    ...place(
      [
        spine(
          [
            [0, 0.12, 0.115, 0.085],
            [0, -0.1, 0.17, 0.13],
            [-0.02, -0.43, 0.23, 0.185],
          ],
          { sides: 7 },
        ),
        // Ragged ends at the hem.
        ...[20, 110, 200, 290].map((turn) => place([limb([0, -0.36, 0.17], [0, -0.48, 0.24], 0.05, 0, 4)], { turn: [0, turn, 0] })).flat(),
      ],
      { at: pelvis },
    ),
    ...body.onChest([
      spine(
        [
          [-0.07, 0.35, 0.13, 0.035],
          [-0.11, 0.1, 0.18, 0.04],
          [-0.17, -0.22, 0.2, 0.03],
        ],
        { sides: 6 },
      ),
    ]),
  ];
  const staff = gear([
    limb([-0.31, 0, 0.12], [-0.25, 1.22, 0.2], 0.02, 0.018, 5),
    // The skull on top.
    ball([-0.245, 1.3, 0.205], [0.075, 0.085, 0.085], 0),
    box([0.08, 0.04, 0.07], [-0.245, 1.215, 0.225]),
  ]);
  // Grave-light: a cold flame over his palm.
  const [x, y, z] = body.handL;
  const light = gear([ball([x, y + 0.1, z], 0.055, 0), limb([x, y + 0.11, z], [x + 0.02, y + 0.3, z], 0.045, 0, 5)]);
  return figure([...body.parts, ...hood(body), ...robes, ...staff, ...light], 5);
})();

/** A skeleton archer's jaw and rib cage, under a rotted hood with a short cape. */
const bonebowKit = (body: Human): Part[] => [
  ...body.onHead([box([0.1, 0.05, 0.09], [0, -0.085, 0.03])]),
  ...hood(body),
  ...body.onChest([
    ball([0, 0.23, 0.005], [0.125, 0.105, 0.085], 0),
    spine(
      [
        [-0.05, 0.36, 0.12, 0.05],
        [-0.09, 0.2, 0.16, 0.035],
        [-0.12, 0.06, 0.17, 0.02],
      ],
      { sides: 6 },
    ),
    limb([-0.07, 0.1, -0.1], [0.06, 0.4, -0.115], 0.036, 0.04, 6),
  ]),
];

/** A Bonebow Archer loosing. */
const bonebowLoosing = (() => {
  const body = human(loosing(), SKELETON);
  return [...body.parts, ...bonebowKit(body), ...bow(body.handL, 0.09), ...arrow(...DRAWN)];
})();

/** A Bonebow Archer nocking the next arrow, bow held low. */
const bonebowNocking = (() => {
  const body = human(
    {
      lean: 6,
      twist: -20,
      look: 16,
      handL: [0.2, 0.58, 0.2],
      handR: [0.02, 0.62, 0.16],
      footL: [0.09, 0, 0.08],
      footR: [-0.09, 0, -0.05],
    },
    SKELETON,
  );
  return [...body.parts, ...bonebowKit(body), ...bow(body.handL, 0, [0, 0, 35]), ...arrow(body.handR, [body.handL[0] + 0.03, body.handL[1] + 0.02, body.handL[2] + 0.02])];
})();

const RAIDER = { shoulders: 0.215, bulk: 1.25 };

/** A throwing axe held near the foot of its haft, head up and edge along +z. */
function hatchet(at: V3, turn: V3): Part[] {
  return gear(
    place(
      [
        limb([0, -0.08, 0], [0, 0.28, 0], 0.02, 0.02, 5),
        plate(
          [
            [0.012, 0.27],
            [0.13, 0.33],
            [0.155, 0.22],
            [0.13, 0.12],
            [0.012, 0.18],
          ],
          0.03,
        ),
      ],
      { at, turn },
    ),
  );
}

/** An Orc Raider's jaw and tusks, ears and crest of hair, a hide over one shoulder and a hide kilt, with a spare axe in the belt. */
const raiderKit = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    ...ORC_JAW,
    ...both([limb([0.075, 0.01, -0.01], [0.165, 0.06, -0.05], 0.03, 0, 4)]),
    plate(
      [
        [-0.13, 0],
        [-0.11, 0.15],
        [-0.02, 0.2],
        [0.06, 0.15],
        [0.085, 0.07],
      ],
      0.05,
    ),
  ]),
  ...body.onChest([ball([0.225, 0.34, 0], [0.13, 0.085, 0.135], 0)]),
  ...place(
    [
      spine(
        [
          [0, 0.12, 0.15, 0.112],
          [0, -0.17, 0.205, 0.158],
        ],
        { sides: 6 },
      ),
      ...hatchet([-0.2, 0.1, -0.06], [165, 0, 0]),
    ],
    { at: pelvis },
  ),
];

/** An Orc Raider winding up to hurl an axe. */
const raiderHurling = (() => {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human(
    {
      pelvis,
      lean: 6,
      twist: -38,
      look: 32,
      handR: [-0.3, 0.98, -0.26],
      elbowR: [-1, 0, -0.5],
      handL: [0.2, 0.8, 0.36],
      footL: [0.12, 0, 0.24],
      footR: [-0.14, 0, -0.2],
    },
    RAIDER,
  );
  return [...body.parts, ...raiderKit(body, pelvis), ...hatchet(body.handR, [-40, 0, 0])];
})();

/** An Orc Raider bellowing, an axe in each fist. */
const raiderBellowing = (() => {
  const pelvis: V3 = [0, 0.48, 0];
  const body = human(
    {
      pelvis,
      lean: -8,
      handR: [-0.34, 0.62, 0.14],
      elbowR: [-1, -0.3, -0.5],
      handL: [0.34, 0.66, 0.14],
      elbowL: [1, -0.3, -0.5],
      footL: [0.15, 0, 0.06],
      footR: [-0.15, 0, -0.02],
    },
    RAIDER,
  );
  return [...body.parts, ...raiderKit(body, pelvis), ...hatchet(body.handR, [0, -65, 24]), ...hatchet(body.handL, [0, 65, -24])];
})();

export const ASHEN: Record<string, UnitModel> = {
  marrowcoil: { figures: [marrowcoil] },
  "barrow-legion": { figures: squad([legionGuarding, legionLunging], 5) },
  vorhal: { figures: [vorhal] },
  "ghoul-pack": { figures: squad([ghoulLoping, ghoulShrieking], 4) },
  grubnak: { figures: [grubnak] },
  morvane: { figures: [morvane] },
  "bonebow-archers": { figures: squad([bonebowLoosing, bonebowNocking], 5) },
  "ruinmaw-raiders": { figures: squad([raiderHurling, raiderBellowing], 6) },
};
