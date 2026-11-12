import { arm, belt, disc, leg, limb, line, type P, part, pts, solo, squad, torso } from "../build";
import type { Drawing, Figure } from "../types";

/** A flat-topped hexagon, for energy shields. */
const hexagon = (c: P, r: number) =>
  pts(...Array.from({ length: 6 }, (_, i): P => [c[0] + r * Math.cos((i * Math.PI) / 3 + Math.PI / 6), c[1] + r * Math.sin((i * Math.PI) / 3 + Math.PI / 6)]));

/** Sentinel K-7: a heavy guardian machine with a deflector on one arm and a cannon for the other. */
const sentinelK7: Figure = {
  top: 28,
  bottom: 244,
  gear: ["jewel"],
  parts: [
    ...leg([84, 152], [80, 196], [76, 236], "metal", "armor", { toe: -1, w: 19 }),
    ...leg([116, 152], [120, 196], [124, 236], "metal", "armor", { toe: 1, w: 19 }),
    part("metal", pts([75, 138], [125, 138], [121, 160], [79, 160]), line([100, 140], [100, 158])),
    part("armor", limb([134, 88], [150, 112], 15)),
    part("metal", pts([140, 102], [190, 97], [192, 117], [143, 125]), `${line([156, 101], [158, 122])} ${line([172, 99], [174, 120])}`),
    part("glow", pts([188, 98.5], [194, 98], [196, 116], [190, 116.5])),
    part("armor", pts([66, 72], [134, 72], [126, 140], [74, 140]), `${line([72, 122], [128, 122])} ${line([84, 74], [88, 120])} ${line([116, 74], [112, 120])}`),
    part("metal", disc([100, 100], 12.5)),
    part("glow", disc([100, 100], 8)),
    part("metal", pts([92, 64], [108, 64], [110, 73], [90, 73])),
    part("armor", limb([64, 92], [52, 126], 14)),
    part("plate", pts([52, 64], [84, 64], [84, 96], [56, 96]), line([54, 78], [84, 78])),
    part("plate", pts([116, 64], [148, 64], [144, 96], [116, 96]), line([116, 78], [146, 78])),
    part("metal", disc([50, 132], 8.5)),
    part("jewel", hexagon([36, 128], 33), hexagon([36, 128], 23)),
    part("metal", limb([110, 46], [115, 28], 2.4)),
    part("glow", disc([115.4, 27], 2.8)),
    part("helmet", pts([85, 44], [115, 44], [118, 68], [82, 68])),
    part("glow", pts([88, 52], [112, 52], [112, 59], [88, 59])),
  ],
};

/** A sealed helmet with a lit visor: `look` is -1 for a head turned left, 0 for facing us. */
const sealedHelmet = (x: number, y: number, look: number) => [
  part("helmet", disc([x, y], 12.5), line([x - 12, y + 5], [x + 12, y + 5])),
  part("glow", look < 0 ? pts([x - 12, y - 4], [x + 3, y - 4], [x + 3, y + 1.5], [x - 12, y + 1.5]) : pts([x - 8.5, y - 4], [x + 8.5, y - 4], [x + 8.5, y + 1.5], [x - 8.5, y + 1.5])),
];

/** A shock gauntlet around a hand, knuckles toward `dir`. */
const gauntlet = (hand: P, dir: P) => {
  const [x, y] = hand;
  const knuckles: P = [x + dir[0] * 9, y + dir[1] * 9];
  return [part("metal", disc(hand, 10)), part("glow", limb([knuckles[0] - dir[1] * 7, knuckles[1] + dir[0] * 7], [knuckles[0] + dir[1] * 7, knuckles[1] - dir[0] * 7], 4.5))];
};

/** A Breacher closing in, fists up. */
const breacherCharging: Figure = (() => {
  const shL: P = [88, 88];
  const shR: P = [118, 86];
  const hipL: P = [92, 146];
  const hipR: P = [114, 146];
  return {
    top: 47,
    bottom: 244,
    gear: [],
    parts: [
      part("metal", pts([114, 84], [133, 82], [136, 121], [117, 123]), line([118, 96], [134, 94])),
      part("glow", pts([126, 100], [131, 99.5], [132, 114], [127, 114.5])),
      ...arm(shR, [126, 108], [100, 98], "armor", { hand: "metal", w: 10 }),
      ...gauntlet([100, 98], [-1, 0]),
      ...leg(hipL, [82, 194], [74, 238], "cloth", "plate", { toe: -1, w: 13 }),
      ...leg(hipR, [120, 194], [128, 238], "cloth", "plate", { toe: 1, w: 13 }),
      torso(shL, shR, hipL, hipR, "armor", `${line([88, 104], [118, 102])} ${line([102, 88], [103, 138])}`),
      belt(hipL, hipR, "metal"),
      part("plate", pts([78, 80], [98, 78], [98, 96], [76, 99])),
      ...arm(shL, [70, 106], [62, 82], "armor", { hand: "metal", w: 10 }),
      ...gauntlet([62, 82], [-0.5, -0.87]),
      ...sealedHelmet(103, 60, -1),
    ],
  };
})();

/** A Breacher standing ready, one gauntlet raised and charged. */
const breacherReady: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 45,
    bottom: 244,
    gear: [],
    parts: [
      ...leg(hipL, [85, 194], [82, 238], "cloth", "plate", { toe: -1, w: 13 }),
      ...leg(hipR, [115, 194], [118, 238], "cloth", "plate", { toe: 1, w: 13 }),
      torso(shL, shR, hipL, hipR, "armor", `${line([84, 104], [116, 104])} ${line([100, 88], [100, 138])}`),
      part("glow", disc([100, 96], 4)),
      belt(hipL, hipR, "metal"),
      ...arm(shL, [72, 112], [70, 138], "armor", { hand: "metal", w: 10 }),
      ...gauntlet([70, 138], [0, 1]),
      ...arm(shR, [136, 100], [140, 72], "armor", { hand: "metal", w: 10 }),
      ...gauntlet([140, 72], [0, -1]),
      part("plate", pts([72, 80], [94, 78], [94, 96], [70, 99])),
      part("plate", pts([106, 78], [128, 80], [130, 99], [106, 96])),
      ...sealedHelmet(100, 58, 0),
    ],
  };
})();

/** Proxima, the Shard Duelist: a slim machine in a full lunge, a blade of light leading. */
const proxima: Figure = (() => {
  const shL: P = [94, 92];
  const shR: P = [116, 90];
  const hipL: P = [96, 146];
  const hipR: P = [113, 146];
  return {
    top: 49,
    bottom: 244,
    gear: ["glow", "sash", "blade"],
    parts: [
      part("sash", "M112,82 Q140,78 168,96 Q150,92 134,96 Q150,104 160,120 Q140,104 114,94 Z"),
      ...arm(shR, [137, 82], [147, 62], "metal", { hand: "metal", w: 8 }),
      part("blade", pts([143, 60], [142, 46], [147, 54], [152, 46], [151, 60])),
      ...leg(hipR, [131, 190], [153, 238], "metal", "armor", { toe: 1, w: 11 }),
      ...leg(hipL, [75, 186], [67, 238], "metal", "armor", { toe: -1, w: 11 }),
      part("armor", pts([90, 88], [119, 86], [116, 124], [106, 150], [98, 150], [93, 124]), `${line([92, 106], [118, 104])} ${line([105, 88], [105, 148])}`),
      part("metal", pts([94, 142], [116, 142], [118, 152], [92, 152])),
      part("plate", pts([108, 80], [126, 82], [126, 98], [110, 96])),
      ...arm(shL, [73, 96], [54, 98], "metal", { hand: "metal", w: 8 }),
      part("plate", pts([84, 84], [102, 82], [100, 98], [82, 100])),
      part("metal", disc([52, 98], 6.5)),
      part("glow", limb([48, 97.4], [2, 90], 4, 1.2)),
      part("helmet", "M90,62 Q90,48 104,48 Q118,49 117,64 Q116,76 103,76 Q91,75 90,62 Z"),
      part("glow", pts([90, 59], [106, 59], [106, 64.5], [90.5, 64.5])),
      part("plate", "M110,50 Q124,40 134,44 Q124,48 116,58 Z"),
    ],
  };
})();

/** A Swarmling Drone: a ball of machinery on two rotors, its core lit. `eye` shifts the core to turn it. */
const drone = (eye: number): Figure => {
  const c: P = [100, 142];
  const rotor = (x: number) => [
    part("metal", limb([c[0] + (x < c[0] ? -14 : 14), c[1] - 16], [x, 110], 4.4)),
    part("jewel", `M${x - 26},${106} Q${x},${96} ${x + 26},${106} Q${x},${114} ${x - 26},${106} Z`),
    part("metal", disc([x, 107], 3)),
  ];
  return {
    top: 118,
    bottom: 188,
    hover: 56,
    gear: ["jewel"],
    parts: [
      ...rotor(66),
      ...rotor(134),
      part("metal", `${limb([88, 160], [80, 178], 4.4)} ${limb([80, 178], [88, 188], 3.4)}`),
      part("metal", `${limb([112, 160], [120, 178], 4.4)} ${limb([120, 178], [112, 188], 3.4)}`),
      part("armor", disc(c, 23), `M${c[0] - 22},${c[1] - 6} H${c[0] + 22} M${c[0] - 20},${c[1] + 11} H${c[0] + 20}`),
      part("plate", `M${c[0] - 20},${c[1] - 11} A23,23 0 0 1 ${c[0] + 20},${c[1] - 11} Z`),
      part("metal", disc([c[0] + eye, c[1] + 2], 11)),
      part("glow", disc([c[0] + eye, c[1] + 2], 7)),
      part("metal", limb([c[0], c[1] - 23], [c[0] + 3, c[1] - 36], 2.2)),
      part("glow", disc([c[0] + 3.4, c[1] - 37], 2.4)),
    ],
  };
};

/** A Reclaimer's carbine from stock to muzzle, with its lit cell. */
const carbine = (stock: P, muzzle: P) => [
  part("metal", limb(stock, muzzle, 6.4, 4.4)),
  part("glow", limb([stock[0] + (muzzle[0] - stock[0]) * 0.38, stock[1] + (muzzle[1] - stock[1]) * 0.38], [stock[0] + (muzzle[0] - stock[0]) * 0.62, stock[1] + (muzzle[1] - stock[1]) * 0.62], 2.6)),
];

/** A Reclaimer taking aim to the left. */
const reclaimerAiming: Figure = (() => {
  const shL: P = [92, 88];
  const shR: P = [118, 86];
  const hipL: P = [92, 146];
  const hipR: P = [114, 146];
  return {
    top: 47,
    bottom: 244,
    gear: ["blade"],
    parts: [
      part("metal", pts([114, 86], [131, 84], [134, 120], [117, 122]), line([117, 98], [132, 96])),
      ...leg(hipL, [84, 194], [76, 238], "cloth", "plate", { toe: -1, w: 13 }),
      ...leg(hipR, [118, 194], [126, 238], "cloth", "plate", { toe: 1, w: 13 }),
      torso(shL, shR, hipL, hipR, "armor", `${line([90, 104], [118, 102])} ${line([104, 88], [104, 138])}`),
      belt(hipL, hipR, "metal"),
      ...arm(shR, [129, 105], [106, 88], "armor", { hand: "metal" }),
      ...carbine([128, 84], [40, 78]),
      ...arm(shL, [78, 100], [68, 84], "armor", { hand: "metal" }),
      part("plate", pts([82, 80], [100, 78], [100, 95], [80, 98])),
      ...sealedHelmet(105, 61, -1),
    ],
  };
})();

/** A Reclaimer advancing, carbine low and a salvage claw for a hand. */
const reclaimerAdvancing: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 45,
    bottom: 244,
    gear: ["blade"],
    parts: [
      ...leg(hipL, [84, 194], [78, 238], "cloth", "plate", { toe: -1, w: 13 }),
      ...leg(hipR, [116, 194], [122, 238], "cloth", "plate", { toe: 1, w: 13 }),
      torso(shL, shR, hipL, hipR, "armor", `${line([84, 104], [116, 104])} ${line([100, 88], [100, 138])}`),
      belt(hipL, hipR, "metal"),
      ...carbine([126, 122], [58, 140]),
      ...arm(shR, [132, 110], [118, 124], "armor", { hand: "metal" }),
      ...arm(shL, [70, 110], [66, 134], "metal", { hand: "metal" }),
      part("blade", `${pts([62, 136], [52, 152], [60, 150], [64, 142])} ${pts([70, 136], [78, 152], [71, 150], [67, 142])}`),
      part("plate", pts([72, 80], [94, 78], [94, 96], [70, 99])),
      part("plate", pts([106, 78], [128, 80], [130, 99], [106, 96])),
      ...sealedHelmet(100, 58, 0),
    ],
  };
})();

/** A sidearm pointing left from a hand. */
const sidearm = (hand: P) => part("metal", pts([hand[0] - 26, hand[1] - 5], [hand[0] + 2, hand[1] - 5], [hand[0] + 2, hand[1] + 1], [hand[0] - 3, hand[1] + 1], [hand[0] - 4, hand[1] + 9], [hand[0] - 9, hand[1] + 9], [hand[0] - 8, hand[1] + 1], [hand[0] - 26, hand[1]]));

/** A jet's flame under a nozzle. */
const jetFlame = (x: number, y: number) => part("glow", pts([x - 7, y], [x + 7, y], [x + 4, y + 16], [x + 1, y + 9], [x - 1, y + 26], [x - 4, y + 12], [x - 6, y + 18]));

/** A Skyhook Raider swooping, sidearm levelled. */
const raiderSwooping: Figure = (() => {
  const shL: P = [90, 90];
  const shR: P = [116, 88];
  const hipL: P = [94, 148];
  const hipR: P = [114, 148];
  return {
    top: 49,
    bottom: 220,
    hover: 24,
    gear: ["glow"],
    parts: [
      part("metal", pts([112, 82], [136, 80], [140, 130], [116, 132]), `${line([116, 96], [137, 94])} ${line([117, 116], [139, 114])}`),
      jetFlame(128, 132),
      ...leg(hipR, [126, 184], [140, 212], "cloth", "plate", { toe: 1, w: 13 }),
      ...leg(hipL, [84, 186], [96, 214], "cloth", "plate", { toe: 1, w: 13 }),
      torso(shL, shR, hipL, hipR, "armor", `${line([90, 106], [118, 104])} ${line([103, 90], [104, 140])}`),
      belt(hipL, hipR, "metal"),
      ...arm(shR, [128, 110], [112, 122], "armor", { hand: "metal" }),
      ...arm(shL, [70, 96], [52, 94], "armor", { hand: "metal" }),
      sidearm([52, 94]),
      part("plate", pts([80, 82], [100, 80], [100, 97], [78, 100])),
      ...sealedHelmet(103, 62, -1),
    ],
  };
})();

/** A Skyhook Raider holding station on two shoulder jets. */
const raiderHovering: Figure = (() => {
  const shL: P = [84, 90];
  const shR: P = [116, 90];
  const hipL: P = [88, 148];
  const hipR: P = [112, 148];
  return {
    top: 47,
    bottom: 232,
    hover: 12,
    gear: ["glow"],
    parts: [
      part("metal", pts([62, 68], [80, 68], [80, 110], [64, 110]), line([63, 82], [80, 82])),
      part("metal", pts([120, 68], [138, 68], [136, 110], [120, 110]), line([120, 82], [137, 82])),
      jetFlame(72, 110),
      jetFlame(128, 110),
      ...leg(hipL, [86, 194], [84, 226], "cloth", "plate", { toe: -1, w: 13 }),
      ...leg(hipR, [114, 194], [116, 226], "cloth", "plate", { toe: 1, w: 13 }),
      torso(shL, shR, hipL, hipR, "armor", `${line([84, 106], [116, 106])} ${line([100, 90], [100, 140])}`),
      belt(hipL, hipR, "metal"),
      ...arm(shR, [130, 112], [114, 124], "armor", { hand: "metal" }),
      ...arm(shL, [72, 112], [92, 122], "armor", { hand: "metal" }),
      sidearm([92, 122]),
      part("plate", pts([74, 82], [94, 80], [94, 98], [72, 101])),
      part("plate", pts([106, 80], [126, 82], [128, 101], [106, 98])),
      ...sealedHelmet(100, 60, 0),
    ],
  };
})();

/** A Hollowsteel Hunter: a lean frame around an open chest, a blade for each forearm. `raise` lifts the leading blade. */
const hunter = (raise: number): Figure => {
  const shL: P = [96, 98];
  const shR: P = [120, 94];
  const handL: P = [56, 108 - raise];
  const handR: P = [134, 136];
  return {
    top: 62,
    bottom: 244,
    gear: ["blade"],
    parts: [
      part("metal", `${limb(shR, [142, 114], 7, 6)} ${limb([142, 114], handR, 6, 5)}`),
      part("blade", pts([130, 134], [138, 136], [124, 176])),
      part("metal", `${limb([120, 152], [136, 188], 9, 7)} ${limb([136, 188], [124, 216], 7, 6)} ${limb([124, 216], [140, 240], 6, 5)}`),
      part("armor", pts([132, 238], [150, 238], [154, 244], [128, 244])),
      part("metal", `${limb([104, 152], [88, 186], 9, 7)} ${limb([88, 186], [100, 214], 7, 6)} ${limb([100, 214], [84, 240], 6, 5)}`),
      part("armor", pts([72, 238], [92, 238], [92, 244], [66, 244])),
      part("armor", pts([90, 92], [124, 88], [126, 122], [118, 156], [102, 156], [94, 124]), line([96, 126], [124, 122])),
      part("boot", pts([100, 100], [118, 98], [118, 118], [102, 120])),
      part("glow", disc([109, 109], 5)),
      part("plate", pts([110, 84], [130, 86], [130, 102], [112, 100])),
      part("metal", `${limb(shL, [76, 118 - raise * 0.4], 7, 6)} ${limb([76, 118 - raise * 0.4], handL, 6, 5)}`),
      part("blade", pts([58, 104 - raise], [54, 112 - raise], [18, 92 - raise * 1.8])),
      part("plate", pts([84, 90], [104, 88], [102, 104], [82, 106])),
      part("metal", limb([104, 90], [98, 82], 5)),
      part("helmet", "M80,74 Q84,60 100,62 Q112,66 110,78 Q106,88 92,86 Q82,84 80,74 Z"),
      part("glow", pts([82, 73], [96, 70], [96, 76], [83, 78])),
      part("plate", "M104,64 Q118,58 126,64 Q116,66 110,74 Z"),
    ],
  };
};

/** Siege Walker Atlas: a two-legged gun platform, mortar tilted skyward, a gun pod on each flank. */
const atlas: Figure = {
  top: 4,
  bottom: 244,
  gear: ["jewel"],
  parts: [
    part("metal", `${limb([62, 56], [58, 32], 9)} ${limb([82, 56], [80, 38], 8)}`),
    part("jewel", "M52,30 q-8,-10 2,-16 q4,-10 16,-4 q10,-2 10,8 q6,8 -4,14 q-12,6 -24,-2 Z"),
    part("metal", `${limb([70, 150], [52, 190], 24, 19)}`),
    part("armor", `${limb([52, 190], [60, 230], 19, 24)}`),
    part("metal", pts([38, 228], [82, 228], [88, 244], [32, 244]), line([48, 236], [78, 236])),
    part("metal", `${limb([130, 150], [148, 190], 24, 19)}`),
    part("armor", `${limb([148, 190], [140, 230], 19, 24)}`),
    part("metal", pts([118, 228], [162, 228], [168, 244], [112, 244]), line([122, 236], [152, 236])),
    part("metal", `${disc([52, 190], 9)} ${disc([148, 190], 9)}`),
    part("metal", limb([110, 62], [150, 12], 22, 26)),
    part("plate", limb([144, 20], [152, 9], 30, 30)),
    part("boot", limb([150, 12], [152, 9.5], 20, 20)),
    part("metal", pts([12, 94], [36, 90], [36, 126], [12, 122]), `${line([12, 104], [36, 101])} ${line([12, 113], [36, 112])}`),
    part("boot", `${limb([12, 100], [2, 100], 4.4)} ${limb([12, 110], [2, 110], 4.4)} ${limb([12, 118], [2, 118], 4.4)}`),
    part("metal", pts([164, 90], [188, 94], [188, 122], [164, 126]), `${line([164, 101], [188, 104])} ${line([164, 112], [188, 113])}`),
    part("glow", `${disc([182, 100], 2.6)} ${disc([182, 108], 2.6)} ${disc([182, 116], 2.6)}`),
    part("armor", pts([44, 70], [156, 70], [168, 110], [156, 154], [44, 154], [32, 110]), `${line([32, 110], [168, 110])} ${line([64, 112], [60, 152])} ${line([136, 112], [140, 152])} ${line([100, 112], [100, 152])}`),
    part("plate", pts([52, 56], [148, 56], [156, 70], [44, 70])),
    part("boot", pts([66, 82], [134, 82], [130, 102], [70, 102])),
    part("glow", pts([70, 86], [130, 86], [127, 98], [73, 98]), `${line([90, 86], [90, 98])} ${line([110, 86], [110, 98])}`),
    part("crest", pts([92, 120], [108, 120], [108, 140], [100, 146], [92, 140])),
    part("metal", `${disc([70, 150], 10)} ${disc([130, 150], 10)}`),
  ],
};

export const NEXUS: Record<string, Drawing> = {
  "sentinel-k7": solo(sentinelK7, [3, 196]),
  "nexus-breachers": squad([breacherReady, breacherCharging, breacherCharging]),
  proxima: solo(proxima, [2, 168]),
  "swarmling-drones": squad([drone(0), drone(-7), drone(6), drone(-4)]),
  "nexus-reclaimers": squad([reclaimerAdvancing, reclaimerAiming, reclaimerAiming]),
  "skyhook-raiders": squad([raiderHovering, raiderSwooping, raiderSwooping]),
  // Their blades reach far forward, so on the tall side they stand further right than the standard column.
  "hollowsteel-hunters": squad([hunter(22), hunter(0)], {
    tall: [
      [102, 150, 0.66],
      [134, 246, 0.76],
    ],
  }),
  "siege-walker-atlas": solo(atlas, [2, 190]),
};
