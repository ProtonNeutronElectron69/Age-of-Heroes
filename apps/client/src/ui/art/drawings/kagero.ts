import { type AimStance, arm, belt, disc, head, KNEELING_AIM, leg, limb, line, type P, part, pts, solo, squad, STANDING_AIM, torso } from "../build";
import type { Drawing, Figure } from "../types";

/** Lady Asagiri the Unbowed: a samurai in full armour, sword raised at her shoulder. */
const ladyAsagiri: Figure = {
  top: 25,
  bottom: 244,
  gear: ["blade", "hilt", "crest", "jewel", "hair"],
  parts: [
    { role: "hair", d: "M110,44 C134,44 152,62 158,96 C147,80 132,72 113,68 Z", lines: "M118,54 C134,58 146,70 152,84" },
    // Legs: wide stance.
    { role: "cloth", d: "M72,145 L100,150 L87,199 L60,193 Z", lines: "M84,150 L74,195" },
    { role: "cloth", d: "M102,150 L130,145 L143,193 L117,199 Z", lines: "M118,150 L130,195" },
    { role: "plate", d: "M61,191 L87,197 L81,236 L57,233 Z", lines: "M60,204 L85,209 M59,217 L83,222" },
    { role: "plate", d: "M117,197 L143,191 L148,233 L126,236 Z", lines: "M119,209 L145,204 M122,222 L146,217" },
    { role: "boot", d: "M55,232 L82,235 L82,244 L43,244 Q46,236 55,232 Z" },
    { role: "boot", d: "M125,235 L150,232 Q160,236 163,244 L125,244 Z" },
    // Skirt of plates.
    { role: "plate", d: "M77,113 L94,113 L92,151 L69,146 Z", lines: "M74,126 L93,128 M71,137 L92,140" },
    { role: "plate", d: "M108,113 L123,113 L133,146 L110,151 Z", lines: "M109,128 L127,126 M110,140 L131,137" },
    { role: "plate", d: "M93,113 L109,113 L111,154 L91,154 Z", lines: "M92,127 H110 M92,140 H110" },
    // Body.
    { role: "armor", d: "M83,64 L117,64 L122,110 L78,110 Z", lines: "M92,66 L90,108 M100,66 V108 M108,66 L110,108 M81,82 H119 M80,96 H120" },
    { role: "sash", d: "M77,105 L123,105 L124,116 L76,116 Z" },
    { role: "sash", d: "M82,114 L74,140 L83,137 L90,116 Z" },
    // The far arm, then the sword in front of it.
    { role: "cloth", d: "M131,88 L144,95 L135,113 L123,108 Z" },
    { role: "plate", d: "M114,60 L140,62 L145,97 L116,93 Z", lines: "M115,71 L142,73 M116,82 L144,85" },
    { role: "blade", d: "M126.5,92.5 Q146,56 167,6 L171,9 Q152,60 132.5,96 Z", lines: "M130,93 Q149,57 169,8" },
    { role: "hilt", d: "M120.5,90 L138.5,97 L137,101 L119,94 Z" },
    { role: "hilt", d: "M115,121 L122,123.5 L132,99 L125.5,96.5 Z", lines: "M118,114 L124,117 M121,107 L127,110" },
    // The near arm across the chest.
    { role: "cloth", d: "M65,93 L77,88 L121,98 L120,112 L70,110 Z", lines: "M84,91 L82,110 M98,94 L97,111" },
    { role: "skin", d: "M117,103 a5.5,5.5 0 1 0 11,0 a5.5,5.5 0 1 0 -11,0 Z" },
    { role: "skin", d: "M114,113 a5.5,5.5 0 1 0 11,0 a5.5,5.5 0 1 0 -11,0 Z" },
    { role: "plate", d: "M60,62 L86,60 L84,93 L55,97 Z", lines: "M58,73 L85,71 M57,85 L84,82" },
    // Head.
    { role: "plate", d: "M84,38 L68,57 L78,65 L91,50 Z", lines: "M79,45 L87,53 M74,51 L83,59" },
    { role: "plate", d: "M116,38 L132,57 L122,65 L109,50 Z", lines: "M121,45 L113,53 M126,51 L117,59" },
    { role: "skin", d: "M90,40 H110 V53 Q100,63 90,53 Z", lines: "M92.5,46.5 H97.5 M102.5,46.5 H107.5" },
    { role: "crest", d: "M97,30 C91,21 83,13 76,1 C77,16 83,27 93,34 Z" },
    { role: "crest", d: "M103,30 C109,21 117,13 124,1 C123,16 117,27 107,34 Z" },
    { role: "helmet", d: "M81,42 A19,17.5 0 0 1 119,42 L113,45.5 H87 Z", lines: "M100,25 V44 M90,28 L92,44 M110,28 L108,44" },
    { role: "jewel", d: "M95,31 a5,5 0 1 0 10,0 a5,5 0 1 0 -10,0 Z" },
  ],
};

/** Lady Suzume of the Long Bow: a tall bow at full draw, hair and headband streaming. */
const ladySuzume: Figure = (() => {
  const shL: P = [94, 88];
  const shR: P = [118, 86];
  const hipL: P = [93, 146];
  const hipR: P = [115, 146];
  return {
    top: 47,
    bottom: 244,
    gear: ["wood", "blade", "leather", "sash"],
    tint: { cloth: "#27304f" },
    parts: [
      part("hair", "M110,54 C134,58 150,84 152,124 C142,104 130,92 114,84 Z", "M118,64 C132,74 142,92 146,108"),
      part("leather", pts([116, 118], [128, 114], [138, 150], [126, 154]), line([119, 126], [131, 122])),
      part("wood", pts([118, 104], [121, 103], [126, 117], [122, 118])),
      ...leg(hipR, [122, 194], [130, 238], "cloth", "cloth", { toe: 1, w: 17, boot: "boot" }),
      ...leg(hipL, [86, 194], [78, 238], "cloth", "cloth", { toe: -1, w: 17, boot: "boot" }),
      torso(shL, shR, hipL, hipR, "armor", `${line([98, 86], [108, 116], [114, 84])} ${line([108, 116], [107, 138])}`),
      part("plate", pts([90, 90], [106, 92], [104, 122], [88, 118]), line([89, 104], [105, 107])),
      belt(hipL, hipR),
      ...arm(shR, [146, 86], [125, 93], "armor"),
      part("wood", "M63,20 Q30,104 61,198 L64,196.5 Q38,104 66,22 Z", "M64.5,21 L125,93 L62.5,197"),
      part("wood", limb([125, 92.4], [38, 98.6], 2.2)),
      part("blade", pts([25, 99.6], [39, 94.6], [39, 102.6])),
      ...arm(shL, [76, 96], [57, 99], "armor"),
      head([104, 62], -1),
      part("hair", "M94,56 Q98,46 108,48 Q117,51 115,64 Q110,56 102,56 Z"),
      part("sash", limb([93.5, 57], [115, 59], 3.4)),
      part("sash", "M114,58 Q128,60 136,72 L132,74 Q124,66 113,63 Z"),
    ],
  };
})();

/** A flat war hat with the house badge. */
const warHat = (x: number, y: number) => [
  part("helmet", pts([x - 22, y - 5], [x, y - 21], [x + 22, y - 5], [x + 18, y - 2], [x - 18, y - 2]), line([x - 11, y - 12], [x + 11, y - 12])),
  part("jewel", disc([x, y - 10], 3)),
];

/** Shoulder guards and the skirt of plates, for a guard standing square. */
const guardPlates = (shL: P, shR: P, hipL: P, hipR: P) => [
  part("plate", pts([hipL[0] - 8, hipL[1]], [hipL[0] + 9, hipL[1]], [hipL[0] + 7, hipL[1] + 34], [hipL[0] - 14, hipL[1] + 30]), line([hipL[0] - 10, hipL[1] + 14], [hipL[0] + 8, hipL[1] + 16])),
  part("plate", pts([hipR[0] - 9, hipR[1]], [hipR[0] + 8, hipR[1]], [hipR[0] + 14, hipR[1] + 30], [hipR[0] - 7, hipR[1] + 34]), line([hipR[0] - 8, hipR[1] + 16], [hipR[0] + 10, hipR[1] + 14])),
  part("plate", pts([shL[0] - 20, shL[1] - 8], [shL[0] + 4, shL[1] - 10], [shL[0] + 2, shL[1] + 16], [shL[0] - 24, shL[1] + 20]), line([shL[0] - 22, shL[1] + 4], [shL[0] + 3, shL[1] + 1])),
  part("plate", pts([shR[0] - 4, shR[1] - 10], [shR[0] + 20, shR[1] - 8], [shR[0] + 24, shR[1] + 20], [shR[0] - 2, shR[1] + 16]), line([shR[0] - 3, shR[1] + 1], [shR[0] + 22, shR[1] + 4])),
];

/** A Lotus Guard on watch: spear grounded, a hand on the sword at her hip. */
const lotusGuardWatching: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 39,
    bottom: 244,
    gear: ["wood", "blade", "hilt"],
    parts: [
      part("hilt", limb([86, 142], [50, 178], 4.6)),
      ...leg(hipL, [86, 194], [83, 238], "cloth", "plate", { toe: -1, boot: "boot" }),
      ...leg(hipR, [114, 194], [117, 238], "cloth", "plate", { toe: 1, boot: "boot" }),
      torso(shL, shR, hipL, hipR, "armor", `${line([92, 88], [91, 138])} ${line([100, 88], [100, 138])} ${line([108, 88], [109, 138])} ${line([81, 104], [119, 104])} ${line([80, 120], [120, 120])}`),
      belt(hipL, hipR),
      part("wood", limb([133, 240], [118, 26], 3.6)),
      part("blade", pts([117, 4], [123.5, 27], [112.5, 27.8])),
      ...arm(shR, [132, 108], [126, 128], "cloth"),
      ...arm(shL, [70, 112], [84, 138], "cloth"),
      part("hilt", limb([92, 136], [78, 150], 4.2)),
      ...guardPlates(shL, shR, hipL, hipR),
      head([100, 60]),
      ...warHat(100, 58),
    ],
  };
})();

/** A Lotus Guard striking: sword high in both hands, stepping in to the left. */
const lotusGuardStriking: Figure = (() => {
  const shL: P = [90, 90];
  const shR: P = [116, 88];
  const hipL: P = [93, 146];
  const hipR: P = [114, 146];
  return {
    top: 41,
    bottom: 244,
    gear: ["blade", "hilt"],
    tint: { skin: "#d9a97f" },
    parts: [
      ...arm(shR, [128, 60], [112, 38], "cloth"),
      ...leg(hipR, [123, 192], [133, 238], "cloth", "plate", { toe: 1, boot: "boot" }),
      ...leg(hipL, [81, 194], [69, 238], "cloth", "plate", { toe: -1, boot: "boot" }),
      torso(shL, shR, hipL, hipR, "armor", `${line([98, 90], [98, 138])} ${line([107, 89], [108, 138])} ${line([88, 106], [119, 104])} ${line([88, 122], [119, 120])}`),
      belt(hipL, hipR),
      ...guardPlates(shL, shR, hipL, hipR),
      head([103, 63], -1),
      ...warHat(103, 61),
      part("blade", "M108,34 Q134,14 164,6 L165,10 Q136,19 111,38 Z", "M110,35 Q136,16 164,8"),
      part("hilt", limb([104, 30], [114, 42], 4.2)),
      ...arm(shL, [82, 62], [106, 38], "cloth"),
    ],
  };
})();

const STRAW = "#c9a55a";

/** A wide straw hat. */
const strawHat = (x: number, y: number) => part("wood", pts([x - 27, y - 3], [x, y - 23], [x + 27, y - 3], [x + 22, y], [x - 22, y]), `${line([x - 14, y - 12], [x + 14, y - 12])} ${line([x, y - 23], [x, y - 2])}`);

/** Kenzo the Lantern Monk: robed and bead-hung, a paper lantern swinging from his staff. */
const kenzo: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  return {
    top: 37,
    bottom: 244,
    gear: ["wood", "glow", "boot"],
    tint: { wood: STRAW, skin: "#d9a97f" },
    parts: [
      part("leather", pts([84, 236], [98, 236], [98, 244], [78, 244])),
      part("leather", pts([102, 236], [116, 236], [122, 244], [102, 244])),
      part("armor", pts([81, 85], [119, 85], [128, 238], [72, 238]), `${line([100, 150], [100, 236])} ${line([88, 150], [83, 236])} ${line([112, 150], [117, 236])}`),
      part("cloth", pts([80, 86], [96, 85], [124, 150], [121, 164], [106, 150], [76, 100])),
      belt([88, 146], [112, 146], "cloth"),
      part("hilt", limb([135, 241], [130, 26], 3.8)),
      part("hilt", limb([130, 28], [153, 30], 2.6)),
      part("boot", pts([144, 32], [160, 32], [158, 37], [146, 37])),
      part("glow", pts([144, 37], [160, 37], [163, 62], [141, 62]), `${line([143.5, 45], [160.5, 45])} ${line([142.5, 54], [161.5, 54])}`),
      part("boot", pts([145, 62], [159, 62], [157, 67], [147, 67])),
      ...arm(shR, [131, 110], [134, 128], "armor"),
      ...arm(shL, [72, 110], [96, 108], "armor"),
      part("skin", pts([93, 92], [99, 92], [99, 110], [93, 110])),
      part("jewel", `${disc([88, 92], 2.6)} ${disc([92, 98], 2.6)} ${disc([98, 102], 2.6)} ${disc([104, 100], 2.6)} ${disc([109, 95], 2.6)} ${disc([112, 89], 2.6)}`),
      head([100, 62]),
      strawHat(100, 58),
    ],
  };
})();

const RONIN_TINT = { wood: STRAW, armor: "#3d4257", cloth: "#22202a" };

/** A Ronin coiled to draw: low, a hand on the hilt. */
const roninDrawing: Figure = (() => {
  const shL: P = [92, 98];
  const shR: P = [118, 96];
  const hipL: P = [96, 154];
  const hipR: P = [116, 154];
  return {
    top: 46,
    bottom: 244,
    gear: ["wood", "blade", "hilt"],
    tint: RONIN_TINT,
    parts: [
      part("hilt", limb([100, 144], [146, 166], 4.6)),
      ...leg(hipR, [128, 198], [140, 238], "cloth", "cloth", { toe: 1, w: 17, boot: "leather" }),
      ...leg(hipL, [80, 196], [68, 238], "cloth", "cloth", { toe: -1, w: 17, boot: "leather" }),
      torso(shL, shR, hipL, hipR, "armor", `${line([98, 96], [108, 124], [114, 94])} ${line([108, 124], [108, 146])}`),
      belt(hipL, hipR),
      ...arm(shL, [86, 122], [104, 146], "armor"),
      part("hilt", limb([100, 144], [76, 132], 4)),
      part("crest", limb([97, 139], [101, 149], 3.4)),
      ...arm(shR, [114, 124], [84, 136], "armor"),
      head([104, 72], -1),
      strawHat(104, 69),
    ],
  };
})();

/** A Ronin waiting, blade loose at his side. */
const roninWaiting: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 36,
    bottom: 244,
    gear: ["wood", "blade", "hilt"],
    tint: { ...RONIN_TINT, skin: "#d9a97f", armor: "#4a3f3a" },
    parts: [
      part("hilt", limb([88, 144], [56, 176], 4.6)),
      ...leg(hipL, [85, 194], [82, 238], "cloth", "cloth", { toe: -1, w: 17, boot: "leather" }),
      ...leg(hipR, [115, 194], [118, 238], "cloth", "cloth", { toe: 1, w: 17, boot: "leather" }),
      torso(shL, shR, hipL, hipR, "armor", `${line([90, 86], [102, 118], [110, 86])} ${line([102, 118], [101, 138])}`),
      belt(hipL, hipR),
      ...arm(shL, [72, 112], [84, 136], "armor"),
      part("blade", "M127,141 L131.5,139 Q150,176 163,216 L158.5,216 Q146,178 127,141 Z", "M129.5,141 Q148,177 161,215"),
      part("crest", limb([124, 138], [134, 143], 3.4)),
      ...arm(shR, [130, 112], [128, 134], "armor"),
      head([100, 60]),
      strawHat(100, 57),
    ],
  };
})();

/** A Teppo Gunner in one of the aiming stances, the match glowing at the lock. */
const teppoGunner = (j: AimStance, skin?: string): Figure => ({
  top: j.head[1] - 23,
  bottom: 244,
  gear: ["wood", "glow", "leather"],
  tint: skin ? { skin } : {},
  parts: [
    part("leather", pts([j.hipR[0] - 2, j.hipR[1] - 8], [j.hipR[0] + 12, j.hipR[1] - 10], [j.hipR[0] + 18, j.hipR[1] + 18], [j.hipR[0] + 4, j.hipR[1] + 20])),
    ...leg(j.hipR, j.kneeR, j.footR, "cloth", "plate", { toe: 1, boot: "boot" }),
    ...leg(j.hipL, j.kneeL, j.footL, "cloth", "plate", { toe: -1, boot: "boot" }),
    torso(
      j.shL,
      j.shR,
      j.hipL,
      j.hipR,
      "armor",
      `${line([j.shL[0] + 8, j.shL[1]], [j.hipL[0] + 6, j.hipL[1] - 8])} ${line([j.shR[0] - 8, j.shR[1]], [j.hipR[0] - 6, j.hipR[1] - 8])} ${line([j.shL[0] - 2, j.shL[1] + 18], [j.shR[0] + 3, j.shR[1] + 18])} ${line([j.shL[0] - 3, j.shL[1] + 36], [j.shR[0] + 4, j.shR[1] + 36])}`,
    ),
    belt(j.hipL, j.hipR),
    ...arm(j.shR, j.elbowR, j.handR, "cloth"),
    part("wood", limb(j.stock, j.grip, 6.6, 4.8)),
    part("metal", limb(j.breech, j.muzzle, 3.4)),
    part("glow", disc([j.breech[0] + 6, j.breech[1] - 5], 2.6)),
    ...arm(j.shL, j.elbowL, j.handL, "cloth"),
    head(j.head, -1),
    ...warHat(j.head[0] + 1, j.head[1] - 2),
  ],
});

const ONI_RED = "#c2412f";

/** The Ashfang Oni: a horned brute in a striped pelt, an iron-studded club hefted high. */
const ashfangOni: Figure = (() => {
  const shL: P = [72, 92];
  const shR: P = [128, 92];
  const hipL: P = [84, 150];
  const hipR: P = [116, 150];
  return {
    top: 30,
    bottom: 244,
    gear: ["hilt", "jewel"],
    tint: { skin: ONI_RED, cape: "#d9a441" },
    parts: [
      part("hair", pts([84, 50], [116, 50], [126, 92], [74, 92])),
      ...arm(shR, [150, 96], [152, 66], "skin", { w: 16 }),
      part("hilt", limb([150, 74], [166, 2], 9, 17)),
      part("jewel", `${disc([160, 40], 2.4)} ${disc([166, 22], 2.4)} ${disc([158, 20], 2.4)} ${disc([153, 54], 2.2)}`),
      ...leg(hipL, [78, 198], [72, 238], "skin", "skin", { toe: -1, w: 19 }),
      ...leg(hipR, [122, 198], [128, 238], "skin", "skin", { toe: 1, w: 19 }),
      part("skin", pts([68, 88], [132, 88], [122, 152], [78, 152]), `${line([100, 98], [100, 142])} ${line([82, 114], [100, 122], [118, 114])}`),
      part("cape", pts([76, 144], [124, 144], [132, 186], [120, 178], [110, 192], [100, 180], [90, 192], [80, 178], [68, 186]), `${line([84, 150], [80, 172])} ${line([96, 150], [94, 176])} ${line([108, 150], [110, 176])} ${line([118, 150], [122, 172])}`),
      part("sash", pts([78, 142], [122, 142], [123, 150], [77, 150])),
      part("jewel", `${disc([84, 96], 3)} ${disc([92, 102], 3)} ${disc([100, 105], 3)} ${disc([108, 102], 3)} ${disc([116, 96], 3)}`),
      ...arm(shL, [56, 118], [64, 146], "skin", { w: 16 }),
      part("skin", disc([100, 64], 14), `${line([91, 61], [97, 63])} ${line([103, 63], [109, 61])}`),
      part("skin", pts([88, 70], [112, 70], [108, 84], [92, 84])),
      part("bone", `${pts([92, 80], [89, 66], [96, 78])} ${pts([108, 80], [111, 66], [104, 78])}`),
      part("hair", "M86,62 Q84,46 100,46 Q116,46 114,62 Q108,54 100,56 Q92,54 86,62 Z"),
      part("bone", `${pts([89, 52], [80, 30], [96, 48])} ${pts([111, 52], [120, 30], [104, 48])}`),
    ],
  };
})();

export const KAGERO: Record<string, Drawing> = {
  "lady-asagiri": solo(ladyAsagiri),
  "lady-suzume": solo(ladySuzume, [25, 153]),
  "crimson-lotus-guard": squad([lotusGuardWatching, lotusGuardStriking, lotusGuardWatching]),
  kenzo: solo(kenzo),
  "shirokage-ronin": squad([roninWaiting, roninDrawing, roninDrawing]),
  "teppo-gunners": squad([teppoGunner(STANDING_AIM), teppoGunner(KNEELING_AIM, "#d9a97f"), teppoGunner(KNEELING_AIM)]),
  "ashfang-oni": solo(ashfangOni),
};
