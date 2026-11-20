import { ball, both, box, figure, gear, limb, place, plate, spine, squad } from "../build";
import { bow } from "../gear";
import { human, type Human } from "../human";
import type { Paint } from "../paint";
import { AIM_TURN, aiming } from "../poses";
import type { FigureModel, Part, UnitModel, V3 } from "../types";

/**
 * The Sunken Hive's figures: swamp aliens with long swept-back skulls. Each builder makes the
 * painted, detailed figure; `detail` adds the fine parts (eyes, plates, sacs). The classic model is
 * the same shape without the fine parts or paint, so both looks keep one pose, Height and fit.
 */

const paint = (parts: readonly Part[], p: Paint): Part[] => parts.map((x) => ({ ...x, paint: p }));
const bare = (parts: readonly Part[]): Part[] => parts.map(({ paint: _, ...rest }) => rest);

/** The paints of `human()`'s parts in order: hips, chest, neck, head, each arm, each leg. */
function alienBody(b: Human, look: { hips?: Paint; chest?: Paint; arm?: Paint; thigh?: Paint; shin?: Paint } = {}): Part[] {
  const order: Paint[] = [look.hips ?? "coatDark", look.chest ?? "coat", "alien", "alien"];
  for (let s = 0; s < 2; s++) order.push(look.arm ?? "alien", look.arm ?? "alien", "alien", "alien", "alien");
  for (let s = 0; s < 2; s++) order.push(look.thigh ?? "alien", "alien", look.shin ?? "coatDark", "coatDark");
  return b.parts.map((p, i) => ({ ...p, paint: order[i] ?? "coat" }));
}

/** A long skull swept back and up from the face, with feeding tendrils under the jaw. */
function alienHead(b: Human, detail: boolean, size = 1): Part[] {
  const s = size;
  return b.onHead([
    ...paint(
      [
        spine(
          [
            [0.075 * s, -0.015 * s, 0.062 * s, 0.062 * s],
            [0, 0.025 * s, 0.09 * s, 0.092 * s],
            [-0.11 * s, 0.07 * s, 0.08 * s, 0.075 * s],
            [-0.21 * s, 0.1 * s, 0.05 * s, 0.048 * s],
            [-0.29 * s, 0.12 * s, 0.014 * s, 0.014 * s],
          ],
          { sides: 7 },
        ),
        ...[-1, 0, 1].map((x) => limb([x * 0.032 * s, -0.06 * s, 0.05 * s], [x * 0.05 * s, -0.16 * s, 0.075 * s], 0.017 * s, 0.006 * s, 4)),
      ],
      "alien",
    ),
    ...(detail
      ? paint(
          [-1, 1].map((x) => place([box([0.036 * s, 0.013 * s, 0.014 * s])], { at: [x * 0.036 * s, 0.006 * s, 0.084 * s], turn: [0, x * -12, x * 16] })[0]!),
          "glowGreen",
        )
      : []),
  ]);
}

/** A ridge of plates down the back, written on the chest. */
const backRidge = (b: Human, n = 3): Part[] =>
  b.onChest(paint(Array.from({ length: n }, (_, i) => limb([0, 0.12 + i * 0.09, -0.08], [0, 0.15 + i * 0.09, -0.16], 0.03, 0, 4)), "horn"));

// ---------- Hive Spawn ----------

/** A spine gun: a living barrel, a glowing feed sac on top. It points along +z. */
function spineGun(at: V3, turn: V3, detail: boolean): Part[] {
  return gear(
    place(
      [
        ...paint([limb([0, 0.02, -0.16], [0, 0.04, 0.56], 0.045, 0.022, 6)], "bone"),
        ...paint([ball([0, 0.085, 0.06], [0.045, 0.05, 0.1], 0)], "glowGreen"),
        ...(detail ? paint([0.18, 0.3, 0.42].map((z) => limb([0, 0.04, z - 0.02], [0, 0.04, z + 0.02], 0.038, 0.034, 6)), "coatDark") : []),
      ],
      { at, turn },
    ),
  );
}

function spawnPose(kneeling: boolean, detail: boolean): Part[] {
  const pose = aiming(kneeling);
  const body = human(pose, { shoulders: 0.16, bulk: 0.88 });
  return [
    ...alienBody(body),
    ...alienHead(body, detail),
    ...(detail ? backRidge(body) : []),
    ...(detail ? body.onChest(paint([limb([0.14, 0.32, 0.07], [-0.12, 0.06, 0.1], 0.024, 0.024, 4)], "leather")) : []),
    ...spineGun(body.handR, AIM_TURN, detail),
  ];
}

// ---------- Vothrek the Overmind ----------

function vothrekPose(detail: boolean): Part[] {
  const pelvis: V3 = [0, 0.49, 0];
  const body = human({ pelvis, handL: [0.09, 0.84, 0.24], handR: [-0.09, 0.84, 0.24], elbowL: [1, -0.4, -0.3], elbowR: [-1, -0.4, -0.3], footL: [0.08, 0, 0.04], footR: [-0.08, 0, -0.02] }, { shoulders: 0.16, bulk: 0.9 });
  const robe = place(paint([spine([[0, 0.12, 0.118, 0.088], [0, -0.12, 0.17, 0.14], [-0.01, -0.47, 0.25, 0.21]], { sides: 8 })], "coatDark"), { at: pelvis });
  // The swollen brain-skull, ridged down the middle.
  const brain = body.onHead([
    ...paint([ball([0, 0.1, -0.03], [0.15, 0.17, 0.17], 1)], "brain"),
    ...paint([-1, 0, 1].map((x) => limb([x * 0.03, -0.05, 0.05], [x * 0.05, -0.17, 0.08], 0.018, 0.006, 4)), "alien"),
    ...(detail
      ? [
          ...paint([spine([[0.12, 0.15, 0.012, 0.02], [0, 0.27, 0.014, 0.024], [-0.15, 0.2, 0.012, 0.02]], { sides: 4 })], "coatDark"),
          ...paint([ball([0, 0.1, 0.155], 0.022, 0)], "glowGreen"),
          ...paint([-1, 1].map((x) => box([0.04, 0.014, 0.014], [x * 0.04, 0.0, 0.085])), "glowGreen"),
        ]
      : []),
  ]);
  const mantle = body.onChest(paint([spine([[0, 0.38, 0.2, 0.12], [0, 0.31, 0.24, 0.15], [0, 0.24, 0.2, 0.13]], { sides: 8 })], "coat"));
  const orb = gear([...paint([ball([0, 0.9, 0.3], 0.07, 1)], "glowGreen")]);
  const sash = detail ? place(paint([spine([[0, 0.06, 0.135, 0.105], [0, 0.11, 0.13, 0.1]], { sides: 8 })], "gold"), { at: pelvis }) : [];
  return [...alienBody(body, { hips: "coatDark", arm: "coatDark" }), ...robe, ...mantle, ...brain, ...orb, ...sash];
}

// ---------- Ixaru Mirestrider ----------

/** The strider: a fat body on four stilt legs and a long neck reaching forward and down. */
function strider(detail: boolean): Part[] {
  const legs: Part[] = [];
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]] as const) {
    const hip: V3 = [x * 0.15, 0.96, z * 0.19];
    const knee: V3 = [x * 0.34, 1.22, z * 0.28];
    const foot: V3 = [x * 0.28, 0.02, z * 0.34];
    legs.push(...paint([limb(hip, knee, 0.055, 0.042, 5), ball(knee, 0.048, 0), limb(knee, foot, 0.04, 0.022, 5)], "leather"));
    if (detail) legs.push(...paint([ball(foot, [0.05, 0.02, 0.05], 0)], "black"));
  }
  return [
    ...paint([ball([0, 1.0, -0.02], [0.23, 0.17, 0.33], 1)], "coat"),
    ...paint([spine([[0.24, 1.02, 0.07, 0.07], [0.36, 0.98, 0.055, 0.055], [0.44, 0.88, 0.045, 0.045], [0.48, 0.78, 0.04, 0.04]], { sides: 6 })], "alien"),
    ...paint([ball([0, 0.78, 0.54], [0.05, 0.05, 0.09], 0)], "alien"),
    ...(detail ? paint([ball([0.03, 0.8, 0.59], 0.014, 0), ball([-0.03, 0.8, 0.59], 0.014, 0)], "glowGreen") : []),
    ...(detail ? paint([ball([0, 0.92, -0.03], [0.2, 0.1, 0.3], 0)], "belly") : []),
    ...(detail ? paint([-0.18, -0.06, 0.06, 0.18].map((z) => limb([0, 1.1, z], [0, 1.2, z - 0.04], 0.03, 0, 4)), "horn") : []),
    ...legs,
  ];
}

function ixaruPose(detail: boolean): Part[] {
  const pelvis: V3 = [0, 1.18, -0.02];
  const body = human(
    {
      pelvis,
      hips: 0,
      twist: -70,
      look: 66,
      handL: [0.03, 1.5, 0.42],
      handR: [-0.04, 1.54, 0.04],
      elbowR: [0, 0.35, -1],
      footL: [0.17, 0.96, 0.08],
      footR: [-0.17, 0.96, 0.08],
      kneeL: [1, 0, 1],
      kneeR: [-1, 0, 1],
    },
    { shoulders: 0.15, bulk: 0.82 },
  );
  const spineBow = gear(paint(bow(body.handL, 0.4), "bone"));
  const bolt = gear(paint([limb([-0.04, 1.545, 0.0], [0.03, 1.5, 0.52], 0.008, 0.008, 3), limb([0.03, 1.5, 0.52], [0.035, 1.5, 0.58], 0.016, 0, 4)], "glowGreen"));
  const saddle = paint([box([0.22, 0.05, 0.22], [0, 1.12, -0.02])], "leather");
  return [...strider(detail), ...saddle, ...alienBody(body, { thigh: "coatDark" }), ...alienHead(body, detail, 0.9), ...spineBow, ...bolt];
}

// ---------- Gulpmaw ----------

function gulpmawPose(detail: boolean): Part[] {
  return [
    // A pear-shaped body, the wide jaw in front and the eyes on top.
    ...paint([ball([0, 0.42, -0.04], [0.36, 0.42, 0.36], 1)], "alien"),
    ...paint([ball([0, 0.44, 0.17], [0.3, 0.17, 0.2], 1)], "alien"),
    ...paint([ball([0, 0.37, 0.24], [0.24, 0.07, 0.13], 0)], "black"),
    ...paint(both([ball([0.13, 0.78, 0.08], 0.075, 0)]), "alien"),
    ...paint(both([limb([0.24, 0.36, 0.2], [0.26, 0.04, 0.3], 0.07, 0.05, 5)]), "alien"),
    ...paint(both([ball([0.27, 0.22, -0.12], [0.12, 0.18, 0.2], 0)]), "alien"),
    ...paint(both([ball([0.27, 0.03, 0.34], [0.07, 0.03, 0.09], 0)]), "alien"),
    // The tongue lashing out.
    ...gear(paint([spine([[0.24, 0.38, 0.06, 0.025], [0.42, 0.3, 0.05, 0.02], [0.56, 0.16, 0.06, 0.02], [0.62, 0.09, 0.035, 0.015]], { sides: 6 })], "tongue")),
    ...(detail
      ? [
          ...paint(both([ball([0.13, 0.8, 0.13], 0.035, 0)]), "glowGreen"),
          ...paint([ball([0, 0.36, 0.0], [0.33, 0.34, 0.32], 0)], "belly"),
          ...paint([-0.3, -0.18, -0.06, 0.06].map((z) => limb([0, 0.76 + z * 0.3, z], [0, 0.86 + z * 0.3, z - 0.06], 0.045, 0, 4)), "horn"),
          ...paint([-1, -0.5, 0.5, 1].map((x) => limb([x * 0.14, 0.41, 0.27], [x * 0.14, 0.35, 0.29], 0.016, 0, 3)), "bone"),
        ]
      : []),
  ];
}

// ---------- Murk Stalkers ----------

/** A curved bone blade growing from the forearm, along +z from the hand. */
const armBlade = (at: V3, turn: V3): Part[] =>
  gear(place(paint([plate([[0, -0.03], [0.1, 0.02], [0.3, 0.12], [0.42, 0.24], [0.26, 0.08], [0.06, 0.03]], 0.02)], "bone"), { at, turn }));

function stalkerPose(lunging: boolean, detail: boolean): Part[] {
  const body = lunging
    ? human({ pelvis: [0, 0.4, 0.02], lean: 30, twist: -10, look: 8, handL: [0.24, 0.62, 0.36], handR: [-0.2, 0.9, 0.1], elbowR: [-1, -0.2, -0.6], footL: [0.1, 0, 0.26], footR: [-0.1, 0, -0.24] }, { shoulders: 0.15, bulk: 0.78 })
    : human({ pelvis: [0, 0.45, 0], lean: 12, handL: [0.3, 0.86, 0.14], handR: [-0.3, 0.86, 0.14], elbowL: [1, -0.5, -0.3], elbowR: [-1, -0.5, -0.3], footL: [0.12, 0, 0.1], footR: [-0.12, 0, -0.08] }, { shoulders: 0.15, bulk: 0.78 });
  return [
    ...alienBody(body, { chest: "coat", hips: "coatDark" }),
    ...alienHead(body, detail),
    ...(detail ? backRidge(body, 4) : []),
    ...armBlade(body.handL, lunging ? [-10, 30, 0] : [-60, 20, 0]),
    ...armBlade(body.handR, lunging ? [-70, -20, 0] : [-60, -20, 0]),
  ];
}

// ---------- Spore Lobbers ----------

/** The launching tube, its mouth along +z, and the spore sac on the back. */
function lobberPose(loading: boolean, detail: boolean): Part[] {
  const pelvis: V3 = [0, 0.5, 0];
  const body = loading
    ? human({ pelvis, twist: 14, handL: [0.16, 0.72, 0.2], handR: [-0.14, 0.62, 0.22], footL: [0.09, 0, 0.06], footR: [-0.09, 0, -0.04] }, { shoulders: 0.17, bulk: 0.95 })
    : human({ pelvis, hips: -15, twist: -20, look: 18, handL: [0.03, 0.9, 0.26], handR: [-0.1, 0.88, 0.02], footL: [0.09, 0, 0.14], footR: [-0.1, 0, -0.1] }, { shoulders: 0.17, bulk: 0.95 });
  const tubeFrom: V3 = loading ? [-0.16, 0.66, -0.1] : [-0.14, 0.92, -0.2];
  const tubeTo: V3 = loading ? [0.2, 0.86, 0.36] : [0.08, 1.0, 0.44];
  const tube = gear([
    ...paint([limb(tubeFrom, tubeTo, 0.06, 0.07, 7)], "coatDark"),
    ...(loading || detail ? paint([ball(tubeTo, 0.055, 0)], "glowGreen") : []),
  ]);
  const sac = body.onChest([
    ...paint([ball([0, 0.26, -0.18], [0.15, 0.17, 0.11], 1)], "coat"),
    ...(detail ? paint([ball([0.06, 0.3, -0.27], 0.035, 0), ball([-0.05, 0.2, -0.27], 0.03, 0)], "glowGreen") : []),
    ...(detail ? paint([limb([0.15, 0.33, 0.06], [-0.13, 0.08, 0.09], 0.024, 0.024, 4)], "leather") : []),
  ]);
  return [...alienBody(body), ...alienHead(body, detail), ...sac, ...tube];
}

// ---------- Ulshae, Brood Tender ----------

function ulshaePose(detail: boolean): Part[] {
  const pelvis: V3 = [0, 0.47, 0];
  const body = human({ pelvis, lean: 14, look: -6, handR: [-0.26, 0.74, 0.14], handL: [0.2, 0.62, 0.26], elbowL: [1, -0.6, -0.2], footL: [0.08, 0, 0.06], footR: [-0.08, 0, -0.03] }, { shoulders: 0.155, bulk: 0.9 });
  const robe = place(paint([spine([[0, 0.12, 0.116, 0.086], [0, -0.12, 0.165, 0.135], [-0.02, -0.45, 0.22, 0.19]], { sides: 7 })], "coatDark"), { at: pelvis });
  // A cluster of brood sacs on the back.
  const sacs = body.onChest([
    ...paint([ball([0.04, 0.3, -0.16], [0.12, 0.13, 0.1], 0), ball([-0.08, 0.18, -0.15], [0.09, 0.1, 0.08], 0), ball([0.07, 0.12, -0.13], [0.08, 0.08, 0.07], 0)], "coat"),
    ...(detail ? paint([ball([0.04, 0.3, -0.25], 0.03, 0), ball([-0.08, 0.18, -0.22], 0.025, 0)], "glowGreen") : []),
  ]);
  const staff = gear([...paint([limb([-0.28, 0, 0.12], [-0.25, 1.18, 0.16], 0.02, 0.016, 5)], "wood"), ...paint([ball([-0.25, 1.24, 0.16], 0.07, 1)], "glowGreen")]);
  const [x, y, z] = body.handL;
  const ooze = gear(paint([ball([x, y + 0.05, z + 0.02], [0.06, 0.07, 0.06], 0), limb([x, y - 0.02, z + 0.02], [x + 0.01, y - 0.14, z + 0.03], 0.025, 0.004, 4)], "glowGreen"));
  return [...alienBody(body, { arm: "coatDark" }), ...robe, ...alienHead(body, detail, 0.95), ...sacs, ...staff, ...ooze];
}

// ---------- Fen Leapers ----------

/** A frog-hound on all fours. `spring` stretches it out in a leap. */
function leaperPose(spring: number, detail: boolean): Part[] {
  const lift = spring * 0.12;
  const body = spine(
    [
      [-0.3, 0.32 + lift, 0.07, 0.07],
      [-0.18, 0.36 + lift, 0.13, 0.12],
      [0.02, 0.38 + lift, 0.13, 0.12],
      [0.18, 0.4 + lift, 0.1, 0.1],
      [0.26, 0.44 + lift, 0.07, 0.07],
    ],
    { sides: 7 },
  );
  // The head: a wide flat snout.
  const head = spine(
    [
      [0.24, 0.46 + lift, 0.07, 0.06],
      [0.34, 0.47 + lift, 0.1, 0.065],
      [0.46, 0.43 + lift, 0.08, 0.04],
      [0.52, 0.41 + lift, 0.04, 0.02],
    ],
    { sides: 6 },
  );
  const hind = (side: 1 | -1): Part[] => {
    const hip: V3 = [side * 0.11, 0.3 + lift, -0.18];
    const knee: V3 = [side * 0.17, 0.3 + lift * 0.5, -0.02 - spring * 0.12];
    const foot: V3 = [side * 0.13, lift * 0.2, -0.24 - spring * 0.16];
    return [ball([side * 0.1, 0.32 + lift, -0.18], [0.07, 0.09, 0.12], 0), limb(hip, knee, 0.06, 0.04, 5), limb(knee, foot, 0.04, 0.025, 5), ball(foot, [0.04, 0.02, 0.07], 0)];
  };
  const fore = (side: 1 | -1): Part[] => {
    const shoulder: V3 = [side * 0.1, 0.34 + lift, 0.16];
    const foot: V3 = [side * 0.12, lift * 0.6, 0.26 + spring * 0.14];
    return [limb(shoulder, foot, 0.045, 0.025, 5), ball(foot, [0.035, 0.02, 0.05], 0)];
  };
  return [
    ...paint([body], "alien"),
    ...paint([head], "alien"),
    ...paint([...hind(1), ...hind(-1), ...fore(1), ...fore(-1)], "alien"),
    ...paint([spine([[-0.24, 0.42 + lift, 0.05, 0.02], [0, 0.48 + lift, 0.08, 0.025], [0.2, 0.47 + lift, 0.05, 0.02]], { sides: 5 })], "coat"),
    ...(detail
      ? [
          ...paint(both([ball([0.06, 0.52 + lift, 0.36], 0.03, 0)]), "glowGreen"),
          ...paint([-0.16, -0.04, 0.08].map((z) => limb([0, 0.48 + lift, z], [0, 0.57 + lift, z - 0.04], 0.025, 0, 4)), "horn"),
          ...paint([ball([0, 0.36 + lift, 0.02], [0.1, 0.06, 0.18], 0)], "belly"),
        ]
      : []),
  ];
}

// ---------- The units ----------

/** A unit's poses in each look: the classic one plain, the detailed one painted. */
function both2(build: (detail: boolean) => Part[][], finish: (poses: Part[][]) => FigureModel[]): { classic: UnitModel; detailed: UnitModel } {
  return { classic: { figures: finish(build(false).map(bare)) }, detailed: { figures: finish(build(true)) } };
}
const hero = (height: number) => (poses: Part[][]) => [figure(poses[0]!, height)];
const band = (height: number) => (poses: Part[][]) => squad(poses, height);

const UNITS: Record<string, { classic: UnitModel; detailed: UnitModel }> = {
  "hive-spawn": both2((d) => [spawnPose(false, d), spawnPose(true, d)], band(5)),
  vothrek: both2((d) => [vothrekPose(d)], hero(6)),
  ixaru: both2((d) => [ixaruPose(d)], hero(7)),
  gulpmaw: both2((d) => [gulpmawPose(d)], hero(6)),
  "murk-stalkers": both2((d) => [stalkerPose(false, d), stalkerPose(true, d)], band(5)),
  "spore-lobbers": both2((d) => [lobberPose(false, d), lobberPose(true, d)], band(4)),
  ulshae: both2((d) => [ulshaePose(d)], hero(5)),
  "fen-leapers": both2((d) => [leaperPose(0, d), leaperPose(1, d)], band(3)),
};

/** The classic models. */
export const HIVE: Record<string, UnitModel> = Object.fromEntries(Object.entries(UNITS).map(([id, u]) => [id, u.classic]));

/** The detailed, painted models. */
export const HIVE_DETAILED: Record<string, UnitModel> = Object.fromEntries(Object.entries(UNITS).map(([id, u]) => [id, u.detailed]));
