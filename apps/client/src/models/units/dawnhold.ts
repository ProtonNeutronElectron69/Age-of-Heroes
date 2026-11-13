import { box, figure, gear, limb, mirror, place, plate, spine, squad } from "../build";
import { roundShield, spear } from "../gear";
import { human, type Human } from "../human";
import type { Part, UnitModel, V3 } from "../types";

/** Solenne, Herald of Dawn: winged and haloed, aloft with a pennoned spear. */
const solenne = (() => {
  const body = human(
    {
      pelvis: [0, 0.62, 0],
      lean: -4,
      handR: [-0.3, 0.86, 0.12],
      handL: [0.3, 1.0, 0.16],
      elbowL: [1, -0.5, -0.2],
      footL: [0.05, 0.14, 0.02],
      footR: [-0.06, 0.2, -0.04],
    },
    { shoulders: 0.16, bulk: 0.9 },
  );
  // Her gown trails down to the base, so she seems to hover.
  const gown = place(
    [
      spine([
        [0, 0.12, 0.11, 0.085],
        [-0.01, -0.1, 0.16, 0.125],
        [-0.05, -0.36, 0.18, 0.135],
        [-0.14, -0.56, 0.1, 0.06],
        [-0.2, -0.62, 0.03, 0.02],
      ]),
    ],
    { at: [0, 0.62, 0] },
  );
  const wing = place(
    [
      plate(
        [
          [0.03, 0.88],
          [0.26, 1.12],
          [0.52, 1.23],
          [0.74, 1.2],
          [0.7, 1.02],
          [0.76, 0.88],
          [0.6, 0.8],
          [0.62, 0.64],
          [0.44, 0.62],
          [0.42, 0.48],
          [0.24, 0.52],
          [0.05, 0.68],
        ],
        0.04,
        "front",
      ),
    ],
    { at: [0, 0, -0.1], turn: [0, 14, 0] },
  );
  const halo = gear(body.onHead([limb([0, 0.07, -0.11], [0, 0.07, -0.09], 0.16, 0.16, 10)]));
  const pennon = gear([
    plate(
      [
        [0.12, 1.32],
        [-0.12, 1.29],
        [-0.03, 1.235],
        [-0.14, 1.18],
        [0.12, 1.15],
      ],
      0.014,
      "side",
      -0.3,
    ),
  ]);
  return figure([...body.parts, ...gown, ...wing, ...mirror(wing), ...halo, ...spear([-0.3, 0.16, 0.11], [-0.3, 1.5, 0.14]), ...pennon], 6);
})();

const HUSCARL = { shoulders: 0.19, bulk: 1.15 };

/** A Huscarl's conical helm with its nose guard, his beard, fur mantle and mail. */
const huscarlKit = (body: Human, pelvis: V3): Part[] => [
  ...body.onHead([
    limb([0, 0.015, 0], [0, 0.18, 0], 0.102, 0.026, 8),
    box([0.028, 0.1, 0.022], [0, -0.01, 0.094]),
    limb([0, -0.05, 0.07], [0, -0.17, 0.09], 0.055, 0.012, 5),
  ]),
  ...body.onChest([
    spine(
      [
        [0, 0.375, 0.09, 0.085],
        [-0.01, 0.31, 0.225, 0.135],
        [-0.02, 0.235, 0.23, 0.14],
      ],
      { sides: 8 },
    ),
  ]),
  ...place(
    [
      spine(
        [
          [0, 0.12, 0.145, 0.105],
          [0, -0.15, 0.2, 0.155],
        ],
        { sides: 8 },
      ),
    ],
    { at: pelvis },
  ),
];

/** A bearded axe held near the foot of its haft, head up. */
function axe(at: V3, turn: V3): Part[] {
  return gear(
    place(
      [
        limb([0, -0.12, 0], [0, 0.42, 0], 0.019, 0.019, 5),
        plate(
          [
            [0.015, 0.41],
            [0.15, 0.47],
            [0.175, 0.36],
            [0.15, 0.25],
            [0.015, 0.31],
          ],
          0.026,
        ),
      ],
      { at, turn },
    ),
  );
}

/** A Huscarl with shield forward and axe raised. */
const huscarlStriking = (() => {
  const pelvis: V3 = [0, 0.48, 0];
  const body = human(
    {
      pelvis,
      lean: 6,
      twist: -15,
      look: 12,
      handL: [0.14, 0.66, 0.3],
      handR: [-0.33, 0.98, 0.02],
      elbowR: [-1, -0.3, -0.5],
      footL: [0.1, 0, 0.16],
      footR: [-0.11, 0, -0.12],
    },
    HUSCARL,
  );
  return [...body.parts, ...huscarlKit(body, pelvis), ...roundShield([0.14, 0.64, 0.37], 0.25, [0, 10, 0]), ...axe(body.handR, [20, 0, 15])];
})();

/** A Huscarl at rest, axe on his shoulder and shield at his side. */
const huscarlResting = (() => {
  const pelvis: V3 = [0, 0.5, 0];
  const body = human(
    {
      pelvis,
      handR: [-0.2, 0.78, 0.12],
      elbowR: [-0.6, -1, 0.3],
      handL: [0.27, 0.52, 0.04],
      footL: [0.1, 0, 0.03],
      footR: [-0.1, 0, -0.02],
    },
    HUSCARL,
  );
  return [...body.parts, ...huscarlKit(body, pelvis), ...roundShield([0.32, 0.5, 0.04], 0.25, [0, 90, 0]), ...axe(body.handR, [-62, 0, 0])];
})();

export const DAWNHOLD: Record<string, UnitModel> = {
  solenne: { figures: [solenne] },
  "stormwake-huscarls": { figures: squad([huscarlStriking, huscarlResting], 5) },
};
