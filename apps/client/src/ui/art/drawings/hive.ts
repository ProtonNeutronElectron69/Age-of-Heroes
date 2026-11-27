import { KNEELING_AIM, STANDING_AIM, type AimStance, arm, disc, held, leg, limb, line, type P, part, pts, solo, squad, torso } from "../build";
import type { Drawing, Figure, Part } from "../types";

/** Slick grey-green hide, acid green eyes and a dark harness. */
const LOOK = { skin: "#9db3a3", glow: "#d8ff6b", cloth: "#2e3523", leather: "#4c4a2c", jewel: "#e7a8d8" };

/**
 * A Hive alien's head: a long skull swept back from the face, two slit eyes and feeding
 * tendrils under the jaw. `look` is -1 for a head turned left, 0 for facing us.
 */
const alienHead = (x: number, y: number, look: number, size = 1): Part[] => {
  const s = (v: number) => v * size;
  if (look === 0) {
    return [
      part("skin", `M${x - s(11)},${y + s(2)} Q${x - s(15)},${y - s(22)} ${x},${y - s(28)} Q${x + s(15)},${y - s(22)} ${x + s(11)},${y + s(2)} Q${x},${y + s(12)} ${x - s(11)},${y + s(2)} Z`, line([x, y - s(26)], [x, y - s(10)])),
      part("glow", `${pts([x - s(9), y - s(5)], [x - s(2), y - s(2)], [x - s(8), y - s(1)])} ${pts([x + s(9), y - s(5)], [x + s(2), y - s(2)], [x + s(8), y - s(1)])}`),
      part("skin", `${limb([x - s(5), y + s(7)], [x - s(8), y + s(19)], s(3.4), s(1.4))} ${limb([x, y + s(8)], [x, y + s(21)], s(3.4), s(1.4))} ${limb([x + s(5), y + s(7)], [x + s(8), y + s(19)], s(3.4), s(1.4))}`),
    ];
  }
  // Turned left: the skull sweeps back and up to the right.
  return [
    part("skin", `M${x - s(12)},${y + s(3)} Q${x - s(13)},${y - s(14)} ${x + s(2)},${y - s(18)} Q${x + s(18)},${y - s(22)} ${x + s(26)},${y - s(30)} Q${x + s(22)},${y - s(8)} ${x + s(10)},${y + s(5)} Q${x - s(1)},${y + s(12)} ${x - s(12)},${y + s(3)} Z`, line([x + s(4), y - s(16)], [x + s(22), y - s(26)])),
    part("glow", pts([x - s(10), y - s(5)], [x - s(1), y - s(4)], [x - s(9), y - s(1)])),
    part("skin", `${limb([x - s(8), y + s(6)], [x - s(13), y + s(17)], s(3.2), s(1.4))} ${limb([x - s(2), y + s(8)], [x - s(4), y + s(20)], s(3.2), s(1.4))}`),
  ];
};

/** A spined ridge of plates down a back, from `a` to `b`. */
const ridge = (a: P, b: P, n: number, height: number): Part =>
  part(
    "crest",
    Array.from({ length: n }, (_, i) => {
      const t = (i + 0.5) / n;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      return pts([x - 4, y + 2], [x + 3, y - height], [x + 4, y + 2]);
    }).join(" "),
  );

/** A Hive Spawn aiming its spine gun to the left: a living barrel fed by a glowing sac. */
const spawn = (j: AimStance, skin?: string): Figure => ({
  top: j.head[1] - 30,
  bottom: 244,
  tint: { ...LOOK, ...(skin ? { skin } : {}) },
  parts: [
    ...leg(j.hipR, j.kneeR, j.footR, "skin", "plate", { toe: 1, boot: "cloth" }),
    ...leg(j.hipL, j.kneeL, j.footL, "skin", "plate", { toe: -1, boot: "cloth" }),
    torso(j.shL, j.shR, j.hipL, j.hipR, "armor", `${line([j.shL[0] + 2, j.shL[1] + 14], [j.shR[0] - 2, j.shR[1] + 14])} ${line([j.hipL[0], j.hipL[1] - 18], [j.hipR[0], j.hipR[1] - 18])}`),
    ridge([j.shR[0] + 2, j.shR[1] + 2], [j.hipR[0] + 4, j.hipR[1] - 8], 3, 9),
    part("leather", limb([j.shL[0], j.shL[1]], [j.hipR[0], j.hipR[1] - 4], 4.6)),
    ...arm(j.shR, j.elbowR, j.handR, "skin"),
    ...held(part("bone", `M${j.stock[0]},${j.stock[1] - 6} Q${j.breech[0]},${j.breech[1] - 9} ${j.muzzle[0] + 6},${j.muzzle[1] - 3} L${j.muzzle[0]},${j.muzzle[1] + 1} L${j.muzzle[0] + 6},${j.muzzle[1] + 4} Q${j.breech[0]},${j.breech[1] + 7} ${j.stock[0]},${j.stock[1] + 6} Z`, `${line([j.breech[0] - 12, j.breech[1] - 4], [j.breech[0] - 12, j.breech[1] + 4])} ${line([j.breech[0] - 24, j.breech[1] - 3], [j.breech[0] - 24, j.breech[1] + 3])}`)),
    ...held(part("glow", `M${j.breech[0] - 6},${j.breech[1] - 4} q4,-14 16,-12 q8,4 2,14 Z`)),
    ...held(part("jewel", disc([j.muzzle[0] - 2, j.muzzle[1]], 3))),
    ...arm(j.shL, j.elbowL, j.handL, "skin"),
    ...alienHead(j.head[0], j.head[1], -1),
  ],
});

/** Vothrek the Overmind: a robed alien under a swollen, ridged brain-skull, mind-light held between its hands. */
const vothrek: Figure = (() => {
  const shL: P = [80, 100];
  const shR: P = [120, 100];
  return {
    top: 6,
    bottom: 244,
    tint: { ...LOOK, skin: "#b4a9c6", jewel: "#d8ff6b" },
    parts: [
      part("cape", "M74,96 Q100,90 126,96 L146,236 L128,226 L116,240 L100,228 L84,240 L72,226 L54,236 Z", `${line([88, 120], [78, 228])} ${line([112, 120], [122, 228])} ${line([100, 130], [100, 226])}`),
      part("armor", pts([82, 96], [118, 96], [114, 156], [86, 156]), `${line([86, 112], [114, 112])} ${line([87, 126], [113, 126])} ${line([88, 140], [112, 140])}`),
      part("sash", pts([84, 150], [116, 150], [117, 160], [83, 160])),
      ...arm(shL, [66, 128], [84, 120], "cape", { w: 10 }),
      ...arm(shR, [134, 128], [116, 120], "cape", { w: 10 }),
      ...held(part("glow", disc([100, 116], 9), `${line([92, 108], [108, 124])} ${line([108, 108], [92, 124])}`)),
      ...held(part("glow", `${disc([86, 98], 2.4)} ${disc([116, 96], 2)} ${disc([100, 100], 1.6)}`)),
      part("plate", pts([72, 90], [128, 90], [124, 104], [76, 104])),
      // The swollen skull, its folds, and the feeding tendrils.
      part("skin", "M86,84 Q62,60 70,30 Q84,4 100,6 Q118,4 130,30 Q138,60 114,84 Q100,94 86,84 Z", `${line([100, 10], [100, 46])} ${line([80, 22], [90, 40], [84, 56])} ${line([120, 22], [110, 40], [116, 56])} ${line([74, 44], [86, 52])} ${line([126, 44], [114, 52])}`),
      part("jewel", disc([100, 52], 4)),
      part("glow", `${pts([86, 64], [97, 68], [87, 71])} ${pts([114, 64], [103, 68], [113, 71])}`),
      part("skin", `${limb([94, 80], [86, 98], 3.8, 1.6)} ${limb([100, 82], [100, 102], 3.8, 1.6)} ${limb([106, 80], [114, 98], 3.8, 1.6)}`),
    ],
  };
})();

/** Ixaru Mirestrider: riding a stilt-legged swamp strider, a spine bow drawn. */
const ixaru: Figure = (() => {
  const shL: P = [92, 66];
  const shR: P = [114, 64];
  return {
    top: 8,
    bottom: 244,
    tint: { ...LOOK, leather: "#6b5a3a", plate: "#c7b98a" },
    parts: [
      // The strider: four stilt legs, a fat body, and a long neck reaching forward and down.
      part("leather", `${limb([132, 128], [158, 176], 7, 5)} ${limb([158, 176], [150, 240], 5, 3)}`),
      part("leather", `${limb([86, 132], [62, 178], 7, 5)} ${limb([62, 178], [70, 240], 5, 3)}`),
      part("plate", "M70,120 Q74,96 106,98 Q146,96 156,116 Q160,136 140,146 Q106,154 82,146 Q66,138 70,120 Z", `${line([88, 104], [92, 144])} ${line([110, 100], [112, 150])} ${line([132, 102], [132, 146])}`),
      part("leather", `${limb([140, 134], [174, 172], 8, 5)} ${limb([174, 172], [178, 240], 5, 3)}`),
      part("leather", `${limb([92, 138], [92, 182], 8, 5)} ${limb([92, 182], [84, 240], 5, 3)}`),
      part("cloth", `${pts([144, 236], [184, 236], [186, 244], [140, 244])} ${pts([64, 236], [90, 236], [90, 244], [60, 244])}`),
      part("leather", "M76,118 Q54,108 42,124 L32,150 L40,152 L50,132 Q62,124 78,132 Z"),
      part("leather", "M44,146 Q30,148 22,160 L26,168 Q38,166 50,156 Z", line([24, 164], [44, 152])),
      part("glow", disc([34, 156], 2.4)),
      ridge([146, 104], [86, 104], 5, 10),
      // The rider.
      part("cloth", limb([106, 112], [96, 132], 11, 9)),
      part("cloth", `${limb([96, 130], [100, 150], 8, 7)} ${pts([94, 148], [106, 148], [106, 156], [88, 156])}`),
      torso(shL, shR, [96, 112], [112, 112], "armor", line([96, 84], [112, 84])),
      ...arm(shR, [128, 74], [118, 60], "skin"),
      ...held(part("bone", "M70,26 Q50,62 70,102 L74,100 Q56,62 74,28 Z", "M72,27 L118,60 L72,101")),
      ...held(part("bone", limb([118, 60], [56, 62], 2))),
      ...held(part("glow", pts([44, 62], [58, 57], [58, 67]))),
      ...arm(shL, [80, 66], [64, 62], "skin"),
      ...alienHead(104, 44, -1, 0.9),
    ],
  };
})();

/** Gulpmaw: a squat swamp beast, mouth gaping and tongue lashing out to the left. */
const gulpmaw: Figure = {
  top: 74,
  bottom: 244,
  tint: { ...LOOK, skin: "#7f9a6c", plate: "#4e6a3e", sash: "#d86a8a", bone: "#e7e0c2" },
  parts: [
    part("skin", `${limb([150, 180], [176, 208], 22, 14)} ${limb([176, 208], [168, 240], 13, 10)}`),
    part("bone", `${pts([156, 238], [184, 238], [186, 244], [150, 244])}`),
    part("skin", "M40,170 Q34,120 84,98 Q126,82 160,110 Q186,136 176,186 Q164,226 110,228 Q56,226 40,170 Z", `${line([118, 96], [126, 222])} ${line([92, 100], [80, 224])}`),
    part("plate", "M62,104 Q100,78 152,100 Q166,110 170,124 Q130,104 88,116 Q72,120 62,104 Z"),
    ridge([70, 104], [160, 112], 6, 12),
    part("bone", "M58,196 Q96,222 150,206 Q118,226 90,224 Q66,218 58,196 Z", `${line([80, 206], [82, 218])} ${line([100, 212], [100, 222])} ${line([120, 210], [118, 220])}`),
    // The gaping mouth, its teeth, and the tongue.
    part("cloth", "M30,132 Q60,124 88,144 Q60,176 26,170 Q36,152 30,132 Z"),
    part("bone", `${pts([34, 136], [40, 146], [44, 134])} ${pts([50, 132], [55, 143], [60, 132])} ${pts([66, 134], [70, 144], [76, 138])} ${pts([34, 166], [40, 158], [46, 168])} ${pts([52, 166], [58, 158], [62, 168])}`),
    ...held(part("sash", "M70,152 Q40,150 22,140 Q8,132 4,142 Q8,150 16,148 Q34,160 70,160 Z", line([12, 142], [60, 155]))),
    part("glow", `${disc([86, 114], 6.5)} ${disc([112, 104], 5.5)}`),
    part("cloth", `${pts([82, 110], [90, 114], [82, 118])} ${pts([109, 100], [116, 104], [109, 108])}`),
    part("skin", `${limb([70, 190], [52, 214], 18, 12)} ${limb([52, 214], [58, 240], 12, 9)}`),
    part("bone", pts([40, 238], [70, 238], [72, 244], [34, 244])),
  ],
};

/** A Murk Stalker, low and lean, blade-arms raised. `lunge` crouches it further and swings the blades forward. */
const stalker = (lunge: number): Figure => {
  const shL: P = [86 - lunge, 112 + lunge];
  const shR: P = [112 - lunge, 108 + lunge];
  const hipL: P = [98, 160];
  const hipR: P = [114, 158];
  const blade = (shoulder: P, elbow: P, hand: P, to: P): Part[] => [
    ...arm(shoulder, elbow, hand, "skin", { w: 8 }),
    ...held(part("bone", `M${hand[0]},${hand[1] - 3} Q${(hand[0] + to[0]) / 2},${(hand[1] + to[1]) / 2 - 12} ${to[0]},${to[1]} Q${(hand[0] + to[0]) / 2 + 4},${(hand[1] + to[1]) / 2 - 2} ${hand[0]},${hand[1] + 4} Z`)),
  ];
  return {
    top: 52 + lunge,
    bottom: 244,
    tint: { ...LOOK, skin: "#8aa79a" },
    parts: [
      ...leg(hipR, [136, 196], [128, 238], "skin", "plate", { toe: 1, w: 11, boot: "cloth" }),
      ...leg(hipL, [76, 194], [70, 238], "skin", "plate", { toe: -1, w: 11, boot: "cloth" }),
      torso(shL, shR, hipL, hipR, "armor", `${line([shL[0] + 4, shL[1] + 16], [shR[0] - 2, shR[1] + 16])} ${line([shL[0] + 8, shL[1] + 30], [shR[0], shR[1] + 30])}`),
      ridge([shR[0] + 4, shR[1]], [hipR[0] + 6, hipR[1] - 12], 3, 10),
      ...blade(shR, [138 - lunge, 98 + lunge], [146 - lunge * 2, 72 + lunge], [176 - lunge * 3, 34 + lunge * 2]),
      part("cloth", pts([92, 152], [122, 150], [126, 172], [114, 166], [106, 176], [96, 166], [88, 172])),
      ...blade(shL, [62 - lunge, 120], [44 - lunge, 104 + lunge], [14, 82 + lunge * 2]),
      ...alienHead(96 - lunge, 86 + lunge, -1),
    ],
  };
};

/** A Spore Lobber, a fat spore sac on its back and a launching tube over its shoulder. `loaded` shows a pod in the tube. */
const lobber = (j: AimStance, loaded: boolean): Figure => ({
  top: j.head[1] - 30,
  bottom: 244,
  tint: { ...LOOK, skin: "#a3b39a", wood: "#6a6040", jewel: "#cfe86a" },
  parts: [
    part("plate", `M${j.shR[0] - 2},${j.shR[1] - 6} Q${j.shR[0] + 34},${j.shR[1] - 18} ${j.shR[0] + 30},${j.shR[1] + 30} Q${j.shR[0] + 22},${j.shR[1] + 52} ${j.shR[0] - 2},${j.shR[1] + 40} Z`, `${line([j.shR[0] + 10, j.shR[1] - 6], [j.shR[0] + 12, j.shR[1] + 40])} ${line([j.shR[0] + 22, j.shR[1] - 4], [j.shR[0] + 22, j.shR[1] + 36])}`),
    part("glow", `${disc([j.shR[0] + 16, j.shR[1] + 8], 4)} ${disc([j.shR[0] + 22, j.shR[1] + 24], 3)}`),
    ...leg(j.hipR, j.kneeR, j.footR, "skin", "plate", { toe: 1, boot: "cloth" }),
    ...leg(j.hipL, j.kneeL, j.footL, "skin", "plate", { toe: -1, boot: "cloth" }),
    torso(j.shL, j.shR, j.hipL, j.hipR, "armor", line([j.shL[0] + 2, j.shL[1] + 16], [j.shR[0] - 2, j.shR[1] + 16])),
    ...arm(j.shR, j.elbowR, j.handR, "skin"),
    ...held(part("wood", limb([j.stock[0] + 10, j.stock[1] + 6], [j.muzzle[0] + 30, j.muzzle[1] - 18], 9, 11), line([j.breech[0], j.breech[1] - 10], [j.breech[0] + 2, j.breech[1] + 2]))),
    ...(loaded ? held(part("jewel", disc([j.muzzle[0] + 26, j.muzzle[1] - 20], 7), line([j.muzzle[0] + 22, j.muzzle[1] - 24], [j.muzzle[0] + 30, j.muzzle[1] - 16]))) : []),
    ...arm(j.shL, j.elbowL, j.handL, "skin"),
    ...alienHead(j.head[0], j.head[1], -1),
  ],
});

/** Ulshae, Brood Tender: hunched under a cluster of brood sacs, a bulb-topped staff in one hand and ooze in the other. */
const ulshae: Figure = (() => {
  const shL: P = [84, 104];
  const shR: P = [118, 100];
  return {
    top: 36,
    bottom: 244,
    tint: { ...LOOK, skin: "#a7b8b0", wood: "#5d5236", jewel: "#d8ff6b" },
    parts: [
      part("plate", "M112,92 Q150,70 158,110 Q166,146 132,152 Q116,150 112,128 Z", `${line([132, 84], [138, 148])} ${line([148, 92], [150, 140])}`),
      part("glow", `${disc([138, 104], 5)} ${disc([150, 126], 4)} ${disc([130, 132], 4.5)}`),
      part("cloth", "M80,100 Q100,94 122,100 L136,238 L118,230 L104,240 L92,230 L76,240 L64,232 Z", `${line([100, 130], [98, 228])} ${line([86, 130], [78, 228])}`),
      part("armor", pts([84, 98], [118, 96], [116, 150], [88, 150]), `${line([88, 112], [116, 110])} ${line([88, 126], [116, 124])}`),
      part("leather", pts([86, 146], [118, 144], [119, 154], [85, 156])),
      ...held(part("wood", limb([60, 242], [66, 46], 4))),
      ...held(part("jewel", disc([66, 38], 10), line([60, 32], [72, 44]))),
      ...held(part("glow", `${disc([52, 26], 2.4)} ${disc([80, 24], 2)}`)),
      ...arm(shL, [66, 120], [66, 132], "skin"),
      ...arm(shR, [136, 128], [124, 150], "skin"),
      ...held(part("glow", "M116,150 Q124,140 134,150 Q138,164 126,176 Q118,168 116,150 Z")),
      ...held(part("glow", `${disc([128, 186], 2.6)} ${disc([122, 196], 1.8)}`)),
      ...alienHead(100, 76, 0, 0.95),
    ],
  };
})();

/** A Fen Leaper, a little frog-hound of the Hive, mid-spring to the left. `lift` raises it off the ground. */
const leaper = (lift: number): Figure => {
  const y = 176 - lift;
  return {
    top: y - 46,
    bottom: 244,
    tint: { ...LOOK, skin: "#8eaa8a", plate: "#5a7448" },
    parts: [
      part("skin", `${limb([138, y + 8], [170, y + 30], 16, 9)} ${limb([170, y + 30], [150, Math.min(240, y + 64)], 9, 6)}`),
      part("skin", `M70,${y - 4} Q90,${y - 34} 132,${y - 22} Q160,${y - 10} 154,${y + 18} Q140,${y + 34} 100,${y + 30} Q76,${y + 26} 70,${y - 4} Z`, `${line([96, y - 24], [100, y + 28])} ${line([120, y - 24], [122, y + 30])}`),
      part("plate", `M78,${y - 10} Q100,${y - 32} 140,${y - 18} Q118,${y - 16} 96,${y - 4} Z`),
      ridge([90, y - 22], [140, y - 16], 4, 9),
      part("skin", `${limb([84, y + 16], [66, y + 40], 9, 6)} ${limb([66, y + 40], [52, Math.min(240, y + 64)], 6, 5)}`),
      part("skin", `M76,${y - 10} Q58,${y - 34} 34,${y - 24} L18,${y - 8} Q24,${y + 6} 44,${y + 4} Q62,${y + 8} 80,${y + 8} Z`),
      part("cloth", `M20,${y - 8} Q32,${y - 4} 52,${y - 6} Q34,${y + 2} 22,${y} Z`),
      part("bone", `${pts([26, y - 6], [29, y + 1], [32, y - 6])} ${pts([36, y - 6], [39, y + 1], [42, y - 6])}`),
      part("glow", `${disc([42, y - 22], 4)} ${disc([56, y - 26], 3.4)}`),
    ],
  };
};

export const HIVE: Record<string, Drawing> = {
  "hive-spawn": squad([spawn(STANDING_AIM), spawn(KNEELING_AIM, "#8fa697"), spawn(STANDING_AIM, "#8fa697"), spawn(KNEELING_AIM)]),
  vothrek: solo(vothrek),
  ixaru: solo(ixaru, [4, 190]),
  gulpmaw: solo(gulpmaw, [2, 196]),
  "murk-stalkers": squad([stalker(0), stalker(8), stalker(0)]),
  "spore-lobbers": squad([lobber(STANDING_AIM, false), lobber(KNEELING_AIM, true), lobber(STANDING_AIM, true)]),
  ulshae: solo(ulshae, [40, 168]),
  "fen-leapers": squad([leaper(10), leaper(30), leaper(0), leaper(22)], {
    tall: [
      [118, 126, 0.5],
      [82, 166, 0.55],
      [150, 192, 0.56],
      [100, 246, 0.64],
    ],
  }),
};
