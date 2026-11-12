import { arm, belt, disc, head, leg, limb, line, type P, part, pts, solo, squad, torso } from "../build";
import type { Drawing, Figure } from "../types";

/** Captain Marisol Vance: bicorne and long coat, pistol levelled, sabre raised. */
const marisolVance: Figure = (() => {
  const shL: P = [86, 86];
  const shR: P = [115, 86];
  const hipL: P = [89, 146];
  const hipR: P = [112, 146];
  const pistolHand: P = [45, 89];
  const swordHand: P = [146, 77];
  return {
    top: 34,
    bottom: 244,
    gear: ["blade", "hilt", "crest", "cape"],
    tint: { hair: "#6e2f1b", cloth: "#e9e3d3" },
    parts: [
      part("cape", pts([82, 138], [119, 138], [134, 210], [106, 202], [100, 152], [95, 202], [66, 210]), line([88, 150], [78, 204]) + line([113, 150], [124, 204])),
      ...arm(shR, [137, 99], swordHand, "armor", { hand: "leather" }),
      part("blade", "M144.5,73 Q160,46 167,10 L170.5,12 Q165,48 149.5,76 Z", "M147,73 Q162,46 168.5,12"),
      part("hilt", limb([139, 71], [153, 80], 4.4)),
      ...leg(hipL, [81, 194], [73, 238], "cloth", "boot", { toe: -1 }),
      ...leg(hipR, [120, 194], [128, 238], "cloth", "boot", { toe: 1 }),
      torso(shL, shR, hipL, hipR, "armor", `${line([92, 84], [100, 112], [109, 84])} ${line([100, 112], [100, 138])} M95,120 h0.1 M95,130 h0.1 M105,120 h0.1 M105,130 h0.1`),
      belt(hipL, hipR),
      part("sash", pts([104, 140], [112, 140], [118, 172], [108, 170])),
      part("crest", pts([77, 81], [93, 80], [93, 88], [75, 91])),
      part("crest", pts([108, 80], [124, 81], [126, 91], [108, 88])),
      ...arm(shL, [65, 95], pistolHand, "armor", { hand: "leather" }),
      part("metal", pts([18, 85], [47, 85], [47, 90], [43, 90], [42, 98], [37, 98], [38, 90], [18, 89])),
      part("hair", pts([106, 50], [119, 54], [125, 78], [114, 72])),
      head([100, 58], -1),
      part("helmet", "M74,51 Q100,20 126,51 Q100,41 74,51 Z", "M82,47 Q100,36 118,47"),
      part("crest", "M110,37 Q125,24 121,9 Q112,22 106,35 Z"),
    ],
  };
})();

/** A shako with its peak: `look` is -1 for a head turned left, 0 for facing us. */
const shako = (x: number, y: number, look: number) => [
  part("helmet", pts([x - 11, y - 24], [x + 12, y - 24], [x + 12, y - 6], [x - 12, y - 6]), line([x - 12, y - 11], [x + 12, y - 11])),
  part("boot", look < 0 ? pts([x - 20, y - 6], [x + 12, y - 6], [x + 12, y - 2.5], [x - 18, y - 2.5]) : pts([x - 14, y - 6], [x + 14, y - 6], [x + 16, y - 2], [x - 16, y - 2])),
  part("jewel", disc([x, y - 15], 3.2)),
  part("crest", disc([x, y - 28], 4.2)),
];

/** A Rifleman taking aim to the left. */
const riflemanAiming: Figure = (() => {
  const shL: P = [92, 87];
  const shR: P = [118, 85];
  const hipL: P = [92, 146];
  const hipR: P = [114, 146];
  return {
    top: 34,
    bottom: 244,
    gear: ["blade", "wood", "leather"],
    tint: { cloth: "#d9d5c8" },
    parts: [
      part("leather", pts([112, 88], [129, 86], [133, 119], [116, 121]), line([114, 98], [131, 96])),
      ...leg(hipL, [84, 194], [76, 238], "cloth", "boot", { toe: -1 }),
      ...leg(hipR, [118, 194], [126, 238], "cloth", "boot", { toe: 1 }),
      torso(shL, shR, hipL, hipR, "armor", line([104, 86], [103, 138])),
      part("bone", limb([91, 86], [113, 142], 4.2)),
      part("bone", limb([117, 85], [93, 142], 4.2)),
      belt(hipL, hipR, "leather"),
      ...arm(shR, [129, 105], [106, 87], "armor"),
      part("wood", limb([128, 84], [72, 80], 6, 4.2)),
      part("metal", limb([98, 79.5], [30, 75.5], 2.8)),
      part("blade", pts([30, 74], [9, 74.5], [30, 77.5])),
      ...arm(shL, [78, 100], [64, 82], "armor"),
      head([106, 62], -1),
      ...shako(107, 60, -1),
    ],
  };
})();

/** A Rifleman at the ready, rifle held across the chest. */
const riflemanReady: Figure = (() => {
  const shL: P = [84, 86];
  const shR: P = [116, 86];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 32,
    bottom: 244,
    gear: ["blade", "wood", "leather"],
    tint: { cloth: "#d9d5c8", skin: "#c99a72" },
    parts: [
      ...leg(hipL, [86, 194], [84, 238], "cloth", "boot", { toe: -1 }),
      ...leg(hipR, [114, 194], [116, 238], "cloth", "boot", { toe: 1 }),
      torso(shL, shR, hipL, hipR, "armor", line([100, 86], [100, 138])),
      part("bone", limb([84, 86], [110, 142], 4.2)),
      part("bone", limb([116, 86], [90, 142], 4.2)),
      belt(hipL, hipR, "leather"),
      part("wood", limb([73, 153], [122, 71], 6, 4.4)),
      part("metal", limb([104, 100], [142, 37], 2.8)),
      part("blade", pts([140.5, 38], [151, 16], [144.5, 40])),
      ...arm(shL, [72, 111], [90, 125], "armor"),
      ...arm(shR, [132, 105], [115, 84], "armor"),
      head([100, 58]),
      ...shako(100, 56, 0),
    ],
  };
})();

/** Sister Maren Holloway: veil and apron over a field coat, a lantern raised, a pistol kept low. */
const sisterMaren: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 36,
    bottom: 244,
    gear: ["leather", "blade", "wood"],
    parts: [
      part("bone", "M84,64 Q82,38 100,36 Q118,38 116,64 L123,96 H77 Z"),
      part("boot", pts([84, 222], [98, 222], [98, 244], [76, 244])),
      part("boot", pts([102, 222], [116, 222], [124, 244], [102, 244])),
      part("armor", pts([81, 85], [119, 85], [130, 226], [70, 226]), `${line([78, 160], [72, 224])} ${line([122, 160], [128, 224])}`),
      part("bone", pts([90, 100], [110, 100], [114, 216], [86, 216]), line([100, 150], [100, 214])),
      belt(hipL, hipR, "leather"),
      part("leather", limb([86, 88], [120, 150], 3.6)),
      part("leather", pts([112, 146], [132, 144], [136, 172], [116, 174]), line([114, 154], [134, 152])),
      part("jewel", disc([125, 161], 3.4)),
      ...arm(shR, [132, 110], [142, 132], "armor"),
      part("metal", pts([138, 130], [146, 128], [158, 152], [153, 155], [146, 140], [142, 141])),
      ...arm(shL, [66, 100], [58, 76], "armor"),
      part("metal", pts([52, 50], [64, 50], [66, 56], [50, 56])),
      part("glow", pts([51, 56], [65, 56], [66, 74], [50, 74]), line([58, 57], [58, 73])),
      part("metal", pts([49, 74], [67, 74], [66, 78], [50, 78])),
      head([100, 60]),
      part("bone", "M87,58 Q86,42 100,40 Q114,42 113,58 Q106,50 100,50 Q94,50 87,58 Z"),
    ],
  };
})();

/** A Pikeman's breastplate over the coat. */
const breastplate = (shL: P, shR: P) =>
  part("metal", pts([shL[0] - 1, shL[1] - 1], [shR[0] + 1, shR[1] - 1], [shR[0] + 3, shR[1] + 34], [(shL[0] + shR[0]) / 2, shR[1] + 42], [shL[0] - 3, shL[1] + 34]), line([(shL[0] + shR[0]) / 2, shL[1]], [(shL[0] + shR[0]) / 2, shR[1] + 40]));

/** A Pikeman on guard, pike upright. */
const pikemanStanding: Figure = (() => {
  const shL: P = [84, 86];
  const shR: P = [116, 86];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 32,
    bottom: 244,
    gear: ["blade", "wood", "hilt"],
    tint: { cloth: "#d9d5c8" },
    parts: [
      part("hilt", limb([88, 142], [58, 182], 4.4)),
      ...leg(hipL, [86, 194], [84, 238], "cloth", "boot", { toe: -1 }),
      ...leg(hipR, [114, 194], [116, 238], "cloth", "boot", { toe: 1 }),
      torso(shL, shR, hipL, hipR, "armor"),
      breastplate(shL, shR),
      belt(hipL, hipR, "leather"),
      part("wood", limb([131, 241], [131, 2], 3.6)),
      part("blade", pts([131, -22], [136.5, 3], [125.5, 3])),
      ...arm(shR, [132, 108], [131, 126], "armor"),
      ...arm(shL, [70, 110], [82, 136], "armor"),
      head([100, 58]),
      ...shako(100, 56, 0),
    ],
  };
})();

/** A Pikeman braced low to receive a charge, pike slanting forward. */
const pikemanBraced: Figure = (() => {
  const shL: P = [92, 104];
  const shR: P = [118, 102];
  const hipL: P = [96, 158];
  const hipR: P = [117, 158];
  return {
    top: 52,
    bottom: 244,
    gear: ["blade", "wood"],
    tint: { cloth: "#d9d5c8", skin: "#c99a72" },
    parts: [
      ...leg(hipR, [130, 204], [140, 238], "cloth", "boot", { toe: 1 }),
      ...leg(hipL, [78, 200], [68, 238], "cloth", "boot", { toe: -1 }),
      torso(shL, shR, hipL, hipR, "armor"),
      breastplate(shL, shR),
      belt(hipL, hipR, "leather"),
      ...arm(shR, [126, 144], [106, 181], "armor"),
      part("wood", limb([148, 241], [8, 54], 3.6)),
      part("blade", pts([-8, 32], [11.5, 51], [4.5, 57])),
      ...arm(shL, [74, 120], [70, 137], "armor"),
      head([106, 78], -1),
      ...shako(107, 76, -1),
    ],
  };
})();

/** Sergeant Brannock: a burly sapper winding up to throw a satchel charge, its fuse lit. */
const brannock: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [118, 88];
  const hipL: P = [89, 146];
  const hipR: P = [113, 146];
  return {
    top: 38,
    bottom: 244,
    gear: ["leather", "wood", "blade", "glow"],
    tint: { hair: "#5a3a1e", cloth: "#8b8f98" },
    parts: [
      ...arm(shR, [140, 80], [148, 58], "armor", { w: 11 }),
      part("leather", pts([138, 32], [161, 35], [159, 59], [136, 56]), `${line([138, 44], [160, 47])} ${line([150, 34], [158, 22], [163, 27])}`),
      part("glow", disc([164, 26], 3.4)),
      part("wood", limb([120, 142], [136, 186], 3.8)),
      part("blade", pts([129, 177], [148, 172], [147, 191], [133, 190])),
      ...leg(hipL, [82, 194], [76, 238], "cloth", "boot", { toe: -1, w: 15 }),
      ...leg(hipR, [120, 194], [126, 238], "cloth", "boot", { toe: 1, w: 15 }),
      torso(shL, shR, hipL, hipR, "armor"),
      part("leather", pts([89, 98], [111, 98], [116, 178], [84, 178]), line([100, 150], [100, 176])),
      belt(hipL, hipR, "leather"),
      ...arm(shL, [66, 104], [54, 116], "armor", { w: 11 }),
      part("plate", pts([68, 77], [93, 75], [93, 97], [66, 101]), line([67, 89], [93, 86])),
      head([100, 60]),
      part("hair", pts([91, 65], [109, 65], [107, 80], [100, 85], [93, 80])),
      part("helmet", "M88,50 Q89,37 101,37 Q113,37 113,50 Z"),
      part("boot", pts([84, 50], [115, 49], [117, 54], [82, 56])),
    ],
  };
})();

/** A Grenadier's tall cap with its brass front. */
const mitreCap = (x: number, y: number) => [
  part("helmet", pts([x - 12, y - 5], [x - 10, y - 30], [x, y - 38], [x + 10, y - 30], [x + 12, y - 5])),
  part("crest", pts([x - 8, y - 6], [x - 7, y - 26], [x, y - 32], [x + 7, y - 26], [x + 8, y - 6]), line([x, y - 28], [x, y - 8])),
];

/** A grenade with its fuse burning. */
const grenade = (c: P) => [part("boot", disc(c, 7), line([c[0] + 3, c[1] - 6], [c[0] + 6, c[1] - 11])), part("glow", disc([c[0] + 6.6, c[1] - 12.4], 2.6))];

/** A Grenadier lobbing a grenade to the left. */
const grenadierLobbing: Figure = (() => {
  const shL: P = [90, 90];
  const shR: P = [116, 88];
  const hipL: P = [93, 146];
  const hipR: P = [114, 146];
  return {
    top: 25,
    bottom: 244,
    gear: ["boot", "glow", "leather"],
    tint: { cloth: "#d9d5c8" },
    parts: [
      ...arm(shR, [135, 72], [140, 48], "armor"),
      ...grenade([141, 38]),
      part("leather", pts([112, 128], [130, 126], [134, 152], [116, 154]), line([114, 136], [132, 134])),
      ...leg(hipR, [122, 194], [132, 238], "cloth", "boot", { toe: 1 }),
      ...leg(hipL, [82, 194], [72, 238], "cloth", "boot", { toe: -1 }),
      torso(shL, shR, hipL, hipR, "armor", line([103, 90], [103, 138])),
      part("bone", limb([90, 89], [112, 142], 4.2)),
      part("bone", limb([116, 88], [94, 142], 4.2)),
      belt(hipL, hipR, "leather"),
      ...arm(shL, [72, 98], [56, 92], "armor"),
      head([103, 63], -1),
      ...mitreCap(104, 61),
    ],
  };
})();

/** A Grenadier lighting a fuse from a slow match. */
const grenadierLighting: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 20,
    bottom: 244,
    gear: ["boot", "glow", "leather", "wood"],
    tint: { cloth: "#d9d5c8", skin: "#c99a72" },
    parts: [
      ...leg(hipL, [86, 194], [84, 238], "cloth", "boot", { toe: -1 }),
      ...leg(hipR, [114, 194], [116, 238], "cloth", "boot", { toe: 1 }),
      torso(shL, shR, hipL, hipR, "armor", line([100, 88], [100, 138])),
      part("bone", limb([84, 88], [110, 142], 4.2)),
      part("bone", limb([116, 88], [90, 142], 4.2)),
      belt(hipL, hipR, "leather"),
      ...arm(shL, [72, 112], [88, 122], "armor"),
      ...grenade([90, 113]),
      ...arm(shR, [130, 110], [112, 108], "armor"),
      part("wood", limb([113, 108], [100, 100], 2.2)),
      head([100, 58]),
      ...mitreCap(100, 56),
    ],
  };
})();

export const CONCORD: Record<string, Drawing> = {
  "marisol-vance": solo(marisolVance, [18, 172]),
  "harrow-riflemen": squad([riflemanAiming, riflemanReady, riflemanAiming]),
  "sister-maren": solo(sisterMaren),
  "gatewarden-pikemen": squad([pikemanStanding, pikemanBraced, pikemanBraced]),
  brannock: solo(brannock),
  "concord-grenadiers": squad([grenadierLighting, grenadierLobbing, grenadierLobbing]),
};
