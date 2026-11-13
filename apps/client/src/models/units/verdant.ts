import { ball, both, box, figure, gear, limb, mirror, place, plate, spine, squad } from "../build";
import { flightStand } from "../gear";
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
  return [
    ...body.parts,
    ...ears(body),
    ...hood,
    ...cloak(body, 0.1),
    ...quiver(body),
    ...bow(body.handL, 0.09),
    ...arrow([-0.04, 0.845, 0], [0.03, 0.81, 0.54]),
  ];
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
  return [
    ...body.parts,
    ...hood,
    ...mantle,
    ...cloak(body, 0),
    ...quiver(body),
    ...bow(body.handL, 0, [0, 12, 0]),
    ...arrow([-0.22, 0.5, 0.09], [-0.26, 0.2, 0.3]),
  ];
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

/** Cinderjaw, Wyrmling of the Glade: a young dragon on the wing, its tail trailing to the ground. */
const cinderjaw = (() => {
  const body = [
    spine([
      [-0.25, 0.75, 0.2, 0.2],
      [-0.05, 0.95, 0.31, 0.29],
      [0.2, 1.2, 0.31, 0.28],
      [0.36, 1.4, 0.2, 0.2],
    ]),
    // Neck.
    spine(
      [
        [0.32, 1.36, 0.18, 0.18],
        [0.46, 1.6, 0.13, 0.13],
        [0.6, 1.78, 0.11, 0.11],
      ],
      { sides: 6 },
    ),
    // Tail, curling down to rest on the base.
    spine(
      [
        [-0.22, 0.78, 0.19, 0.19],
        [-0.45, 0.5, 0.13, 0.13],
        [-0.5, 0.25, 0.09, 0.09],
        [-0.35, 0.07, 0.06, 0.055],
        [-0.08, 0.03, 0.03, 0.025],
      ],
      { sides: 6 },
    ),
  ];
  const head = [
    spine(
      [
        [0.5, 1.82, 0.13, 0.12],
        [0.7, 1.84, 0.16, 0.14],
        [0.93, 1.76, 0.1, 0.08],
        [1.03, 1.72, 0.06, 0.04],
      ],
      { sides: 6 },
    ),
    // The jaw hangs open.
    spine(
      [
        [0.62, 1.72, 0.12, 0.035],
        [0.96, 1.6, 0.05, 0.02],
      ],
      { sides: 5 },
    ),
    ...both([limb([0.09, 1.92, 0.56], [0.17, 2.0, 0.3], 0.05, 0, 4)]),
  ];
  const legs = both([
    limb([0.2, 0.8, -0.15], [0.32, 0.52, 0.1], 0.12, 0.085, 5),
    limb([0.32, 0.52, 0.1], [0.3, 0.3, -0.04], 0.085, 0.05, 5),
    limb([0.3, 0.3, -0.04], [0.32, 0.22, 0.12], 0.05, 0, 4),
    limb([0.26, 1.22, 0.25], [0.35, 1.02, 0.46], 0.075, 0.05, 5),
    limb([0.35, 1.02, 0.46], [0.34, 0.9, 0.56], 0.05, 0, 4),
  ]);
  const wing = place(
    [
      plate(
        [
          [0.12, 1.36],
          [0.4, 1.76],
          [0.74, 1.98],
          [0.95, 1.88],
          [0.85, 1.6],
          [0.95, 1.4],
          [0.7, 1.26],
          [0.72, 1.06],
          [0.45, 1.06],
          [0.15, 1.16],
        ],
        0.04,
        "front",
      ),
    ],
    { at: [0, 0, 0.05], turn: [0, 25, 0] },
  );
  return figure([...body, ...head, ...legs, ...wing, ...mirror(wing)], 7);
})();

/** A Mossback Treefolk: a walking trunk under a crown of leaves. `reach` is how far its right bough lifts. */
function treefolk(reach: number): Part[] {
  return [
    // Trunk.
    spine(
      [
        [0, 0.3, 0.31, 0.29],
        [0.02, 0.85, 0.26, 0.24],
        [0, 1.4, 0.31, 0.28],
        [0, 1.72, 0.22, 0.2],
      ],
      { sides: 7 },
    ),
    // Root legs.
    ...both([limb([0.15, 0.45, 0], [0.3, 0, 0.06], 0.18, 0.2, 6), limb([0.3, 0.07, 0.06], [0.44, 0, 0.32], 0.1, 0.03, 5), limb([0.3, 0.07, 0.06], [0.5, 0, -0.14], 0.09, 0.03, 5)]),
    // The left bough hangs; the right one lifts.
    limb([0.27, 1.36, 0], [0.56, 1.06, 0.16], 0.115, 0.085, 5),
    limb([0.56, 1.06, 0.16], [0.64, 0.7, 0.3], 0.085, 0.055, 5),
    limb([0.64, 0.7, 0.3], [0.6, 0.5, 0.42], 0.05, 0, 4),
    limb([0.64, 0.7, 0.3], [0.74, 0.54, 0.3], 0.05, 0, 4),
    limb([-0.27, 1.4, 0], [-0.6, 1.4 + reach * 0.2, 0.12], 0.115, 0.085, 5),
    limb([-0.6, 1.4 + reach * 0.2, 0.12], [-0.72, 1.2 + reach * 0.72, 0.24], 0.085, 0.055, 5),
    limb([-0.72, 1.2 + reach * 0.72, 0.24], [-0.7, 1.05 + reach * 0.98, 0.36], 0.05, 0, 4),
    limb([-0.72, 1.2 + reach * 0.72, 0.24], [-0.84, 1.1 + reach * 0.86, 0.22], 0.05, 0, 4),
    // A heavy brow and a knot for a nose.
    box([0.4, 0.07, 0.1], [0, 1.42, 0.25]),
    limb([0, 1.34, 0.26], [0, 1.2, 0.36], 0.06, 0.03, 5),
    // The crown of leaves.
    ball([0, 2.04, 0], [0.56, 0.38, 0.52], 1),
    ball([0.4, 1.86, 0.12], 0.26, 0),
    ball([-0.38, 1.9, -0.14], 0.28, 0),
    ball([0.05, 1.88, -0.36], 0.25, 0),
  ];
}

/** A thorn held like a dart, point along +y. */
const thorn = (at: V3, turn: V3): Part[] => gear(place([limb([0, -0.03, 0], [0, 0.18, 0], 0.022, 0, 4)], { at, turn }));

/**
 * A fae in the air on a flight stand: slight, long-eared, with two pairs of
 * wings and a skirt of petals. The Briar Sprites and their queen share it.
 */
function fae(hands: { handL: V3; handR: V3; elbowR?: V3 }, build: { shoulders: number; bulk: number }): { body: Human; parts: Part[] } {
  const pelvis: V3 = [0, 0.75, 0];
  const body = human({ pelvis, lean: 6, ...hands, footL: [0.04, 0.3, 0.04], footR: [-0.05, 0.37, -0.05] }, build);
  const wing = place(
    [
      plate(
        [
          [0.03, 1.12],
          [0.28, 1.4],
          [0.56, 1.44],
          [0.62, 1.24],
          [0.4, 1.08],
          [0.1, 1.02],
        ],
        0.022,
        "front",
      ),
      plate(
        [
          [0.03, 1.02],
          [0.36, 1.0],
          [0.52, 0.8],
          [0.34, 0.68],
          [0.1, 0.86],
        ],
        0.022,
        "front",
      ),
    ],
    { at: [0, 0, -0.08], turn: [0, 20, 0] },
  );
  const petals = place(
    [
      spine(
        [
          [0, 0.1, 0.1, 0.08],
          [0, -0.15, 0.21, 0.18],
        ],
        { sides: 6 },
      ),
    ],
    { at: pelvis },
  );
  return { body, parts: [...body.parts, ...ears(body), ...wing, ...mirror(wing), ...petals, ...flightStand([0, 0.7, -0.05])] };
}

const SPRITE = { shoulders: 0.135, bulk: 0.75 };

/** A Briar Sprite winding up to throw a thorn. */
const spriteThrowing = (() => {
  const sprite = fae({ handL: [0.24, 1.0, 0.22], handR: [-0.28, 1.3, -0.08], elbowR: [-1, -0.2, -0.6] }, SPRITE);
  return [...sprite.parts, ...thorn(sprite.body.handR, [40, 0, 0])];
})();

/** A Briar Sprite hovering, a thorn ready in each hand. */
const spriteHovering = (() => {
  const sprite = fae({ handL: [0.28, 0.95, 0.14], handR: [-0.28, 0.95, 0.14] }, SPRITE);
  return [...sprite.parts, ...thorn(sprite.body.handL, [70, 0, -20]), ...thorn(sprite.body.handR, [70, 0, 20])];
})();

/** Queen Ilyth of the Thorns: small and winged like her sprites, crowned in briar, a burst of thorns at her hand. */
const queenIlyth = (() => {
  const queen = fae({ handL: [0.28, 1.08, 0.25], handR: [-0.26, 0.9, 0.05] }, { shoulders: 0.14, bulk: 0.8 });
  const crown = queen.body.onHead([
    limb([0, 0.05, 0], [0, 0.085, 0], 0.092, 0.098, 8),
    ...[0, 60, 120, 180, 240, 300].flatMap((turn) => place([limb([0, 0.08, 0.088], [0, 0.17, 0.11], 0.022, 0, 4)], { turn: [0, turn, 0] })),
  ]);
  const burst = gear(
    place(
      (
        [
          [0, 0, 0.24],
          [0.14, 0.11, 0.16],
          [-0.14, 0.11, 0.16],
          [0, 0.2, 0.12],
          [0.12, -0.12, 0.16],
          [-0.12, -0.12, 0.16],
        ] as V3[]
      ).map((d) => limb([d[0] * 0.3, d[1] * 0.3, d[2] * 0.3], d, 0.02, 0, 4)),
      { at: queen.body.handL },
    ),
  );
  return figure([...queen.parts, ...crown, ...burst], 4);
})();

export const VERDANT: Record<string, UnitModel> = {
  "glade-wardens": { figures: squad([wardenLoosing, wardenWatching], 5) },
  "old-rootback": { figures: [oldRootback] },
  cinderjaw: { figures: [cinderjaw] },
  "mossback-treefolk": { figures: squad([treefolk(0), treefolk(1)], 8) },
  "queen-ilyth": { figures: [queenIlyth] },
  "briar-sprites": { figures: squad([spriteThrowing, spriteHovering], 3) },
};
