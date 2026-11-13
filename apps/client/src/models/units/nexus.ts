import { ball, both, box, figure, gear, limb, place, spine, squad } from "../build";
import { HEAD, human, type Human } from "../human";
import type { Part, UnitModel, V3 } from "../types";

/** A Reclaimer's carbine, held at the grip and pointing along +z. */
function carbine(at: V3, turn: V3): Part[] {
  return gear(
    place(
      [
        box([0.055, 0.085, 0.4], [0, 0.035, 0.12]),
        box([0.045, 0.075, 0.17], [0, 0.015, -0.16]),
        limb([0, 0.045, 0.32], [0, 0.045, 0.52], 0.018, 0.018, 5),
        box([0.065, 0.065, 0.09], [0, -0.035, 0.2]),
      ],
      { at, turn },
    ),
  );
}

const RECLAIMER = { bulk: 1.05 };

/** A Reclaimer's helmet with its visor, shoulder plates and power pack. */
const reclaimerKit = (body: Human): Part[] => [
  ...body.onHead([ball([0, 0.012, -0.005], [HEAD * 1.14, HEAD * 1.14, HEAD * 1.16]), box([0.15, 0.045, 0.06], [0, 0.012, 0.085])]),
  ...body.onChest([
    ball([0.205, 0.335, 0], [0.095, 0.07, 0.1], 0),
    ball([-0.205, 0.335, 0], [0.095, 0.07, 0.1], 0),
    box([0.22, 0.27, 0.11], [0, 0.22, -0.155]),
    limb([0.07, 0.34, -0.17], [0.09, 0.5, -0.19], 0.022, 0.022, 4),
  ]),
];

/** A Reclaimer taking aim. */
const reclaimerAiming = (() => {
  const body = human(
    {
      hips: -20,
      twist: -32,
      look: 28,
      handR: [-0.1, 0.76, 0.14],
      handL: [0.04, 0.76, 0.36],
      footL: [0.08, 0, 0.16],
      footR: [-0.1, 0, -0.12],
    },
    RECLAIMER,
  );
  return [...body.parts, ...reclaimerKit(body), ...carbine(body.handR, [0, 32, 0])];
})();

/** A Reclaimer advancing, carbine low and a salvage claw for a hand. */
const reclaimerAdvancing = (() => {
  const body = human(
    {
      lean: 8,
      twist: 10,
      handR: [-0.23, 0.56, 0.16],
      handL: [0.22, 0.66, 0.32],
      footL: [0.09, 0, 0.2],
      footR: [-0.09, 0, -0.16],
    },
    RECLAIMER,
  );
  const claw = place(
    [
      ball([0, 0, 0], 0.07, 0),
      limb([0.02, 0.02, 0.03], [0.07, 0.04, 0.19], 0.026, 0, 4),
      limb([-0.02, 0.02, 0.03], [-0.07, 0.04, 0.19], 0.026, 0, 4),
      limb([0, -0.02, 0.03], [0, -0.07, 0.18], 0.026, 0, 4),
    ],
    { at: body.handL },
  );
  return [...body.parts, ...reclaimerKit(body), ...claw, ...carbine(body.handR, [14, 0, 0])];
})();

/** Siege Walker Atlas: a two-legged gun platform, mortar tilted skyward, a gun pod on each flank. */
const siegeWalkerAtlas = (() => {
  const legs = both([
    box([0.56, 0.56, 0.7], [0.95, 1.5, 0]),
    limb([0.95, 1.5, 0], [1.0, 0.95, -0.6], 0.26, 0.22, 6),
    ball([1.0, 0.95, -0.6], 0.29, 0),
    limb([1.0, 0.95, -0.6], [1.0, 0.34, 0.08], 0.22, 0.19, 6),
    box([0.44, 0.34, 0.46], [1.0, 0.32, 0.08]),
    // The foot: a long sole with a toe cap.
    spine(
      [
        [-0.42, 0.11, 0.3, 0.11],
        [0.5, 0.12, 0.36, 0.12],
        [0.92, 0.07, 0.3, 0.07],
      ],
      { sides: 6, x: 1.0 },
    ),
  ]);
  const hull = [
    box([1.5, 0.48, 1.0], [0, 1.52, 0]),
    spine(
      [
        [-1.15, 2.08, 0.5, 0.34],
        [-0.75, 2.14, 0.8, 0.52],
        [0.5, 2.14, 0.8, 0.52],
        [1.1, 2.0, 0.54, 0.36],
        [1.4, 1.9, 0.32, 0.2],
      ],
      { sides: 8 },
    ),
    // Sensor under the nose.
    ball([0, 1.78, 1.12], 0.17, 0),
  ];
  const mortar = [limb([0, 2.55, -0.2], [0, 2.76, -0.2], 0.54, 0.5, 8), limb([0, 2.66, -0.4], [0, 3.3, 0.1], 0.28, 0.32, 8)];
  const gunPods = both([
    box([0.36, 0.44, 1.1], [1.1, 2.1, 0.2]),
    limb([1.1, 2.17, 0.7], [1.1, 2.17, 1.55], 0.085, 0.085, 6),
    limb([1.1, 1.99, 0.7], [1.1, 1.99, 1.4], 0.065, 0.065, 6),
  ]);
  const exhausts = both([limb([0.42, 2.45, -0.95], [0.48, 2.95, -1.12], 0.11, 0.1, 6)]);
  return figure([...legs, ...hull, ...mortar, ...gunPods, ...exhausts], 10);
})();

export const NEXUS: Record<string, UnitModel> = {
  "siege-walker-atlas": { figures: [siegeWalkerAtlas] },
  "nexus-reclaimers": { figures: squad([reclaimerAiming, reclaimerAdvancing], 5) },
};
