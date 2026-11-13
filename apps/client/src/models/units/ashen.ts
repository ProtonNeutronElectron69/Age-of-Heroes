import { ball, both, box, figure, limb, place, plate, spine, squad } from "../build";
import { roundShield, spear } from "../gear";
import { HEAD, human, type Human } from "../human";
import type { Part, UnitModel } from "../types";

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

export const ASHEN: Record<string, UnitModel> = {
  marrowcoil: { figures: [marrowcoil] },
  "barrow-legion": { figures: squad([legionGuarding, legionLunging], 5) },
};
