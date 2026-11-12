import { arm, belt, disc, head, leg, limb, line, type P, part, pts, solo, squad, torso } from "../build";
import type { Drawing, Figure } from "../types";

/** Dame Rowena Ashgrove: plate armour, sword raised, a sun on her shield. */
const dameRowena: Figure = (() => {
  const shL: P = [84, 86];
  const shR: P = [116, 86];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 36,
    bottom: 244,
    gear: ["blade", "hilt", "crest", "cape", "leather"],
    tint: { hair: "#7a4a22", cape: "#b8322f" },
    parts: [
      part("cape", pts([80, 84], [120, 84], [140, 216], [60, 216]), line([70, 150], [64, 212]) + line([130, 150], [136, 212])),
      part("hair", pts([88, 50], [112, 50], [119, 88], [81, 88])),
      ...arm(shR, [137, 98], [142, 72], "plate", { hand: "metal" }),
      part("blade", pts([138.5, 66], [145.5, 66], [146, 16], [142, 5], [138, 16]), line([142, 64], [142, 10])),
      part("crest", pts([129, 63], [155, 63], [155, 68], [129, 68])),
      part("leather", pts([140, 68], [144, 68], [144, 82], [140, 82])),
      part("crest", disc([142, 84], 3.2)),
      ...leg(hipL, [86, 194], [84, 238], "armor", "plate", { toe: -1, w: 13 }),
      ...leg(hipR, [114, 194], [116, 238], "armor", "plate", { toe: 1, w: 13 }),
      part("plate", pts([81, 140], [119, 140], [125, 170], [75, 170]), line([94, 142], [91, 168]) + line([106, 142], [109, 168])),
      torso(shL, shR, hipL, hipR, "armor", `${line([100, 86], [100, 138])} ${line([84, 104], [100, 112], [116, 104])}`),
      belt(hipL, hipR),
      part("plate", pts([88, 74], [112, 74], [116, 86], [84, 86])),
      part("plate", pts([106, 77], [128, 79], [130, 99], [108, 96]), line([108, 87], [129, 89])),
      ...arm(shL, [71, 106], [80, 124], "plate", { hand: "metal" }),
      part("plate", pts([72, 79], [94, 77], [92, 96], [70, 99]), line([71, 89], [92, 87])),
      part("armor", "M46,88 H92 V124 Q92,152 69,172 Q46,152 46,124 Z", "M50,92 H88 V124 Q88,149 69,166 Q50,149 50,124 Z"),
      part("crest", disc([69, 124], 9), `${line([69, 108], [69, 100])} ${line([83, 114], [89, 108])} ${line([55, 114], [49, 108])} ${line([69, 140], [69, 148])} ${line([82, 134], [87, 140])} ${line([56, 134], [51, 140])}`),
      head([100, 58]),
      part("plate", "M87,56 Q86,38 100,36 Q114,38 113,56 L109,51 H91 Z", line([100, 36], [100, 51])),
      part("crest", "M100,37 Q103,22 117,17 Q111,30 107,42 Z"),
    ],
  };
})();

/** A round shield, quartered in the faction's colours, with its boss. */
const roundShield = (c: P, r: number) => [
  part("armor", disc(c, r)),
  part("crest", `M${c[0]},${c[1]} L${c[0]},${c[1] - r} A${r},${r} 0 0 1 ${c[0] + r},${c[1]} Z M${c[0]},${c[1]} L${c[0]},${c[1] + r} A${r},${r} 0 0 1 ${c[0] - r},${c[1]} Z`),
  part("metal", disc(c, r * 0.26)),
];

/** A conical helm with a nose guard. */
const helm = (x: number, y: number) => [
  part("metal", `M${x - 12},${y - 5} Q${x - 12},${y - 23} ${x},${y - 27} Q${x + 12},${y - 23} ${x + 12},${y - 5} Z`, line([x, y - 27], [x, y - 6])),
  part("metal", pts([x - 1.8, y - 6], [x + 1.8, y - 6], [x + 1.8, y + 6], [x - 1.8, y + 6])),
];

const beard = (x: number, y: number) => part("hair", pts([x - 9, y + 5], [x + 9, y + 5], [x + 6, y + 20], [x, y + 25], [x - 6, y + 20]));

/** A Huscarl with shield forward and axe raised. */
const huscarlStriking: Figure = (() => {
  const shL: P = [86, 88];
  const shR: P = [118, 88];
  const hipL: P = [90, 146];
  const hipR: P = [113, 146];
  return {
    top: 33,
    bottom: 244,
    gear: ["blade", "wood", "crest"],
    tint: { hair: "#b5651d", cape: "#8a6a3a" },
    parts: [
      ...arm(shR, [139, 85], [144, 60], "metal"),
      part("wood", limb([146, 76], [136, 14], 4.2)),
      part("blade", "M138,17 Q117,9 110,27 Q124,32 136,32 Z", "M116,26 Q126,24 136,26"),
      ...leg(hipL, [84, 194], [78, 238], "cloth", "leather", { toe: -1 }),
      ...leg(hipR, [118, 194], [123, 238], "cloth", "leather", { toe: 1 }),
      part("cape", pts([83, 140], [120, 140], [126, 174], [78, 174]), line([94, 148], [92, 172]) + line([108, 148], [111, 172])),
      torso(shL, shR, hipL, hipR, "metal", `${line([84, 98], [120, 98])} ${line([84, 110], [120, 110])} ${line([85, 122], [119, 122])} ${line([86, 134], [118, 134])}`),
      belt(hipL, hipR, "leather"),
      part("leather", pts([80, 80], [124, 80], [128, 94], [76, 94]), line([88, 82], [86, 93]) + line([102, 82], [102, 93]) + line([116, 82], [118, 93])),
      head([102, 60]),
      beard(102, 60),
      ...helm(102, 60),
      ...arm(shL, [70, 108], [80, 120], "metal"),
      ...roundShield([70, 122], 27),
    ],
  };
})();

/** A Huscarl at rest, axe on his shoulder and shield at his side. */
const huscarlResting: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [111, 146];
  return {
    top: 33,
    bottom: 244,
    gear: ["blade", "wood", "crest"],
    tint: { hair: "#d9b25a", cape: "#8a6a3a", skin: "#f0d2b4" },
    parts: [
      part("wood", limb([112, 112], [152, 38], 4.2)),
      part("blade", "M149,42 Q170,34 176,54 Q162,58 151,56 Z", "M158,52 Q166,48 172,52"),
      ...leg(hipL, [85, 194], [82, 238], "cloth", "leather", { toe: -1 }),
      ...leg(hipR, [114, 194], [117, 238], "cloth", "leather", { toe: 1 }),
      part("cape", pts([81, 140], [118, 140], [123, 174], [76, 174]), line([92, 148], [90, 172]) + line([106, 148], [109, 172])),
      torso(shL, shR, hipL, hipR, "metal", `${line([82, 98], [118, 98])} ${line([82, 110], [118, 110])} ${line([83, 122], [117, 122])} ${line([84, 134], [116, 134])}`),
      belt(hipL, hipR, "leather"),
      part("leather", pts([78, 80], [122, 80], [126, 94], [74, 94]), line([86, 82], [84, 93]) + line([100, 82], [100, 93]) + line([114, 82], [116, 93])),
      ...arm(shR, [133, 106], [124, 90], "metal"),
      head([100, 60]),
      beard(100, 60),
      ...helm(100, 60),
      ...arm(shL, [70, 112], [74, 132], "metal"),
      ...roundShield([66, 136], 27),
    ],
  };
})();

/** A kettle helm with its wide brim. */
const kettleHelm = (x: number, y: number) => [
  part("metal", `M${x - 12},${y - 6} Q${x - 11},${y - 23} ${x},${y - 25} Q${x + 11},${y - 23} ${x + 12},${y - 6} Z`, line([x, y - 25], [x, y - 7])),
  part("metal", pts([x - 19, y - 6], [x + 19, y - 6], [x + 22, y - 1.5], [x - 22, y - 1.5])),
];

const TABARD = "#b8322f";

/** The red tabard with a sun, worn over mail. */
const tabard = (x: number) => [
  part("cape", pts([x - 11, 86], [x + 11, 86], [x + 15, 172], [x - 15, 172]), line([x, 150], [x, 170])),
  part("crest", disc([x, 112], 6)),
];

/** A Crossbowman taking aim to the left. */
const crossbowmanAiming: Figure = (() => {
  const shL: P = [92, 88];
  const shR: P = [118, 86];
  const hipL: P = [92, 146];
  const hipR: P = [114, 146];
  return {
    top: 37,
    bottom: 244,
    gear: ["wood", "blade", "leather"],
    tint: { cape: TABARD },
    parts: [
      part("leather", pts([112, 140], [124, 138], [132, 172], [120, 175]), line([114, 148], [126, 146])),
      ...leg(hipL, [84, 194], [76, 238], "cloth", "leather", { toe: -1 }),
      ...leg(hipR, [118, 194], [126, 238], "cloth", "leather", { toe: 1 }),
      torso(shL, shR, hipL, hipR, "metal", `${line([90, 100], [118, 98])} ${line([90, 114], [119, 112])} ${line([91, 128], [119, 126])}`),
      ...tabard(105),
      belt(hipL, hipR, "leather"),
      ...arm(shR, [129, 105], [106, 87], "metal"),
      part("wood", limb([128, 84], [62, 79], 6.4, 4.6)),
      part("metal", "M62,56 Q50,79 62,102 L65.4,100.5 Q55,79 65.4,57.5 Z", "M63.5,57 L98,81 L63.5,101"),
      part("blade", pts([48, 78.4], [63, 75], [63, 81.8])),
      ...arm(shL, [78, 100], [74, 83], "metal"),
      head([106, 62], -1),
      ...kettleHelm(106, 61),
    ],
  };
})();

/** A Crossbowman marching, the crossbow resting on his shoulder. */
const crossbowmanMarching: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 35,
    bottom: 244,
    gear: ["wood", "blade", "leather"],
    tint: { cape: TABARD, skin: "#c99a72" },
    parts: [
      part("wood", limb([114, 120], [148, 50], 6.4, 4.6)),
      part("metal", "M125,37 Q152,35 167,58 L163.6,60 Q150,40 126,40.5 Z", "M126,39 L148,50 L165,59"),
      part("leather", pts([70, 140], [82, 138], [80, 174], [66, 172]), line([69, 148], [81, 146])),
      ...leg(hipL, [85, 194], [80, 238], "cloth", "leather", { toe: -1 }),
      ...leg(hipR, [115, 194], [120, 238], "cloth", "leather", { toe: 1 }),
      torso(shL, shR, hipL, hipR, "metal", `${line([82, 100], [118, 100])} ${line([82, 114], [118, 114])} ${line([83, 128], [117, 128])}`),
      ...tabard(100),
      belt(hipL, hipR, "leather"),
      ...arm(shR, [134, 108], [124, 96], "metal"),
      ...arm(shL, [72, 112], [74, 136], "metal"),
      head([100, 60]),
      ...kettleHelm(100, 59),
    ],
  };
})();

/** One of Solenne's wings: `side` is -1 for the left wing, 1 for the right. */
const wing = (side: number) => {
  const x = (v: number) => 100 + side * v;
  return part(
    "bone",
    `M${x(8)},96 C${x(40)},44 ${x(72)},22 ${x(92)},40 C${x(78)},44 ${x(70)},54 ${x(68)},68 C${x(80)},66 ${x(88)},76 ${x(86)},92 C${x(74)},88 ${x(62)},96 ${x(58)},110 C${x(66)},112 ${x(68)},122 ${x(62)},134 C${x(46)},122 ${x(24)},122 ${x(8)},118 Z`,
    `M${x(14)},100 C${x(40)},64 ${x(66)},42 ${x(84)},42 M${x(16)},108 C${x(40)},84 ${x(62)},74 ${x(80)},78 M${x(16)},114 C${x(34)},104 ${x(48)},106 ${x(58)},118`,
  );
};

/** Solenne, Herald of Dawn: winged and haloed, aloft with a pennoned spear. */
const solenne: Figure = (() => {
  const shL: P = [86, 88];
  const shR: P = [114, 88];
  const hipL: P = [90, 144];
  const hipR: P = [110, 144];
  return {
    top: 38,
    bottom: 236,
    hover: 8,
    gear: ["bone", "blade", "wood", "glow", "cape", "crest"],
    tint: { hair: "#e3c877", cape: "#b8322f", wood: "#c9861a" },
    parts: [
      wing(-1),
      wing(1),
      part("hair", pts([89, 52], [111, 52], [117, 92], [83, 92])),
      part("wood", limb([136, 214], [152, 8], 3.6)),
      part("blade", pts([153.4, -14], [157.4, 9.6], [146.8, 8.8])),
      part("cape", "M150,22 L176,30 L166,40 L178,52 L148,48 Z"),
      part("skin", limb([94, 196], [92, 228], 7, 5)),
      part("skin", pts([88, 226], [96, 226], [94, 236], [86, 234])),
      part("skin", limb([108, 190], [114, 216], 7, 5)),
      part("skin", pts([110, 214], [118, 214], [120, 224], [112, 224])),
      part("armor", pts([84, 140], [116, 140], [124, 200], [112, 194], [104, 206], [96, 196], [86, 206], [78, 198]), `${line([94, 150], [90, 196])} ${line([106, 150], [110, 196])}`),
      torso(shL, shR, hipL, hipR, "armor", `${line([100, 88], [100, 138])} ${line([86, 104], [100, 112], [114, 104])}`),
      belt(hipL, hipR),
      part("plate", pts([74, 80], [94, 78], [94, 96], [72, 99])),
      part("plate", pts([106, 78], [126, 80], [128, 99], [106, 96])),
      ...arm(shR, [132, 108], [140, 128], "plate", { hand: "skin" }),
      ...arm(shL, [70, 106], [60, 86], "plate", { hand: "skin" }),
      part("glow", disc([56, 74], 7)),
      head([100, 62]),
      part("hair", "M88,60 Q88,48 100,48 Q112,48 112,60 Q106,54 100,56 Q94,54 88,60 Z"),
      part("glow", "M80,40 Q100,26 120,40 Q100,33 80,40 Z"),
    ],
  };
})();

/** Magister Orrin Vael: white-bearded in a scholar's robe, a book open in one hand and lightning leaping from the other. */
const orrinVael: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  return {
    top: 34,
    bottom: 244,
    gear: ["glow", "leather", "bone"],
    tint: { hair: "#ece9e1", cape: "#2f4a7a" },
    parts: [
      part("boot", pts([84, 236], [98, 236], [98, 244], [78, 244])),
      part("boot", pts([102, 236], [116, 236], [122, 244], [102, 244])),
      part("armor", pts([81, 85], [119, 85], [130, 238], [70, 238]), `${line([100, 150], [100, 236])} ${line([88, 150], [82, 236])} ${line([112, 150], [118, 236])}`),
      part("crest", pts([96, 100], [104, 100], [106, 236], [94, 236])),
      belt([88, 146], [112, 146]),
      ...arm(shR, [134, 104], [146, 82], "armor"),
      part("glow", pts([145, 80], [157, 60], [151, 58], [167, 36], [161, 34], [180, 8], [170, 38], [176, 40], [160, 62], [166, 64])),
      part("glow", `${disc([134, 60], 2.4)} ${disc([170, 70], 2)}`),
      ...arm(shL, [70, 108], [72, 124], "armor"),
      part("leather", pts([48, 110], [72, 104], [94, 112], [94, 132], [72, 126], [48, 130])),
      part("bone", pts([51, 108], [72, 103], [91, 110], [91, 127], [72, 121], [51, 126]), `${line([72, 103], [72, 121])} ${line([56, 112], [68, 109])} ${line([56, 118], [68, 115])} ${line([76, 109], [88, 113])} ${line([76, 115], [88, 119])}`),
      part("cape", pts([74, 82], [126, 82], [132, 112], [116, 104], [100, 112], [84, 104], [68, 112])),
      part("crest", disc([100, 96], 4)),
      head([100, 60]),
      part("hair", pts([90, 64], [110, 64], [112, 84], [106, 104], [100, 112], [94, 104], [88, 84])),
      part("hair", `${pts([88, 58], [84, 70], [90, 68])} ${pts([112, 58], [116, 70], [110, 68])}`),
      part("cape", "M87,56 Q86,38 100,34 Q114,38 113,56 Q106,50 100,50 Q94,50 87,56 Z"),
    ],
  };
})();

/** A great helm with a plume. `look` is -1 for a helm turned left, 0 for facing us. */
const greatHelm = (x: number, y: number, look: number) => [
  part("plate", pts([x - 12, y - 16], [x + 12, y - 16], [x + 13, y + 10], [x, y + 16], [x - 13, y + 10]), look === 0 ? line([x, y - 16], [x, y + 14]) : line([x - 6, y - 16], [x - 7, y + 12])),
  part("boot", look === 0 ? pts([x - 9, y - 4], [x + 9, y - 4], [x + 9, y - 1], [x - 9, y - 1]) : pts([x - 13, y - 4], [x + 2, y - 4], [x + 2, y - 1], [x - 13, y - 1])),
  part("crest", `M${x},${y - 16} Q${x + 4},${y - 32} ${x + 18},${y - 34} Q${x + 12},${y - 22} ${x + 8},${y - 15} Z`),
];

/** A small shield bearing the sun. */
const sunShield = (x: number, y: number) => [
  part("armor", `M${x - 19},${y - 26} H${x + 19} V${y + 2} Q${x + 19},${y + 22} ${x},${y + 36} Q${x - 19},${y + 22} ${x - 19},${y + 2} Z`, `M${x - 15},${y - 22} H${x + 15} V${y + 2} Q${x + 15},${y + 19} ${x},${y + 31} Q${x - 15},${y + 19} ${x - 15},${y + 2} Z`),
  part("crest", disc([x, y], 7)),
];

const KNIGHT_GEAR = ["blade", "wood", "crest", "cape"] as const;

/** A Silverlance Knight at attention, lance upright and pennon flying. */
const knightStanding: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  const hipL: P = [88, 146];
  const hipR: P = [112, 146];
  return {
    top: 26,
    bottom: 244,
    gear: KNIGHT_GEAR,
    tint: { cape: TABARD, wood: "#d8d2c4" },
    parts: [
      part("wood", limb([134, 241], [134, -4], 4)),
      part("blade", pts([134, -28], [139, -3], [129, -3])),
      part("cape", "M136,6 L164,12 L154,22 L166,32 L136,30 Z"),
      ...leg(hipL, [86, 194], [84, 238], "armor", "plate", { toe: -1, w: 13 }),
      ...leg(hipR, [114, 194], [116, 238], "armor", "plate", { toe: 1, w: 13 }),
      part("plate", pts([81, 140], [119, 140], [125, 170], [75, 170]), line([94, 142], [91, 168]) + line([106, 142], [109, 168])),
      torso(shL, shR, hipL, hipR, "armor", `${line([100, 86], [100, 138])} ${line([84, 104], [100, 112], [116, 104])}`),
      belt(hipL, hipR),
      ...arm(shR, [134, 108], [134, 128], "plate", { hand: "metal" }),
      part("plate", pts([106, 77], [128, 79], [130, 99], [108, 96])),
      ...arm(shL, [71, 106], [80, 124], "plate", { hand: "metal" }),
      part("plate", pts([72, 79], [94, 77], [92, 96], [70, 99])),
      ...sunShield(70, 122),
      ...greatHelm(100, 60, 0),
    ],
  };
})();

/** A Silverlance Knight charging left behind a levelled lance. */
const knightCharging: Figure = (() => {
  const shL: P = [90, 94];
  const shR: P = [116, 92];
  const hipL: P = [94, 150];
  const hipR: P = [114, 150];
  return {
    top: 32,
    bottom: 244,
    gear: KNIGHT_GEAR,
    tint: { cape: TABARD, wood: "#d8d2c4" },
    parts: [
      ...leg(hipR, [126, 194], [140, 238], "armor", "plate", { toe: 1, w: 13 }),
      ...leg(hipL, [78, 192], [66, 238], "armor", "plate", { toe: -1, w: 13 }),
      part("plate", pts([87, 144], [121, 144], [127, 172], [81, 172])),
      torso(shL, shR, hipL, hipR, "armor", `${line([103, 92], [104, 142])}`),
      belt(hipL, hipR),
      ...arm(shR, [128, 114], [116, 126], "plate", { hand: "metal" }),
      part("wood", limb([156, 132], [18, 112], 4.4, 3)),
      part("blade", pts([-6, 108.5], [19, 108], [18.5, 116])),
      part("cape", "M40,113 L46,90 L56,98 L64,86 L66,117 Z"),
      part("plate", pts([108, 82], [128, 84], [130, 103], [108, 100])),
      ...sunShield(84, 124),
      ...greatHelm(104, 66, -1),
    ],
  };
})();

const darkHaired = (figure: Figure): Figure => ({ ...figure, tint: { ...figure.tint, hair: "#3a2a20" } });

export const DAWNHOLD: Record<string, Drawing> = {
  "dame-rowena": solo(dameRowena),
  solenne: solo(solenne, [8, 192]),
  "orrin-vael": solo(orrinVael, [48, 180]),
  "silverlance-knights": squad([knightStanding, knightCharging, knightCharging]),
  "covenant-crossbowmen": squad([crossbowmanMarching, crossbowmanAiming, crossbowmanAiming]),
  "stormwake-huscarls": squad([huscarlResting, huscarlStriking, darkHaired(huscarlResting), darkHaired(huscarlStriking)]),
};
