import { arm, disc, leg, limb, line, type P, part, pts, solo, squad, torso } from "../build";
import type { Drawing, Figure, Part } from "../types";

/** A bare skull with lit or empty sockets. */
const skull = (x: number, y: number, eyes: "glow" | "boot"): Part[] => [
  part("bone", disc([x, y], 11)),
  part("bone", pts([x - 7.5, y + 6], [x + 7.5, y + 6], [x + 5.5, y + 16], [x - 5.5, y + 16]), `${line([x - 3, y + 10], [x - 3, y + 16])} ${line([x, y + 10], [x, y + 16])} ${line([x + 3, y + 10], [x + 3, y + 16])}`),
  part(eyes, disc([x - 4.6, y - 1], 2.8)),
  part(eyes, disc([x + 4.6, y - 1], 2.8)),
  part("boot", pts([x, y + 2.5], [x - 1.8, y + 6.5], [x + 1.8, y + 6.5])),
];

/** A small skull to top a staff. */
const skullTop = (x: number, y: number): Part[] => [
  part("bone", disc([x, y], 9)),
  part("bone", pts([x - 6, y + 5], [x + 6, y + 5], [x + 4.5, y + 14], [x - 4.5, y + 14])),
  part("glow", disc([x - 3.6, y - 0.5], 2.2)),
  part("glow", disc([x + 3.6, y - 0.5], 2.2)),
];

/** Vorhal, the Unburied Lord: a crowned skull in old plate, both hands on a grounded greatsword. */
const vorhal: Figure = (() => {
  const shL: P = [80, 86];
  const shR: P = [120, 86];
  const hipL: P = [88, 148];
  const hipR: P = [112, 148];
  return {
    top: 20,
    bottom: 244,
    gear: ["blade", "cape", "crest", "leather"],
    tint: { glow: "#a6f07c" },
    parts: [
      part(
        "cape",
        "M76,84 L124,84 L146,198 L135,216 L127,200 L118,224 L109,204 L100,228 L91,204 L82,224 L73,200 L65,216 L54,198 Z",
        line([70, 130], [62, 196]) + line([130, 130], [138, 196]),
      ),
      ...leg(hipL, [86, 196], [82, 238], "armor", "plate", { toe: -1, w: 14 }),
      ...leg(hipR, [114, 196], [118, 238], "armor", "plate", { toe: 1, w: 14 }),
      part("plate", pts([81, 142], [119, 142], [124, 172], [76, 172]), line([93, 144], [90, 170]) + line([107, 144], [110, 170])),
      torso(shL, shR, hipL, hipR, "armor", `${line([100, 88], [100, 140])} ${line([82, 102], [100, 108], [118, 102])} ${line([84, 118], [100, 124], [116, 118])}`),
      part("bone", pts([82, 138], [118, 138], [119, 146], [81, 146])),
      part("blade", pts([95.5, 136], [104.5, 136], [103.5, 224], [100, 238], [96.5, 224]), line([100, 138], [100, 230])),
      part("metal", pts([78, 130], [122, 130], [125, 136.5], [75, 136.5])),
      part("leather", pts([97.5, 110], [102.5, 110], [102.5, 131], [97.5, 131])),
      part("glow", disc([100, 107], 4.4)),
      ...arm(shL, [72, 114], [95, 126], "armor", { hand: "plate", w: 10 }),
      ...arm(shR, [128, 114], [105, 126], "armor", { hand: "plate", w: 10 }),
      part("bone", pts([70, 80], [60, 58], [80, 78])),
      part("bone", pts([130, 80], [140, 58], [120, 78])),
      part("plate", pts([64, 76], [92, 78], [93, 99], [68, 101]), line([66, 88], [92, 89])),
      part("plate", pts([108, 78], [136, 76], [132, 101], [107, 99]), line([108, 89], [134, 88])),
      ...skull(100, 56, "glow"),
      part("helmet", "M86,53 Q85,37 100,35 Q115,37 114,53 L110,48 H90 Z"),
      part("crest", pts([87, 42], [84, 22], [93, 37], [100, 18], [107, 37], [116, 22], [113, 42])),
    ],
  };
})();

const RUST = "#8c7461";

/** A Barrow Legion skeleton standing guard: spear upright, a split shield on its arm. */
const legionGuard: Figure = (() => {
  const shL: P = [86, 88];
  const shR: P = [114, 88];
  const hipL: P = [92, 146];
  const hipR: P = [108, 146];
  return {
    top: 37,
    bottom: 244,
    gear: ["blade", "wood", "cape"],
    tint: { metal: RUST, wood: "#6f5a45" },
    parts: [
      ...leg(hipL, [90, 194], [88, 238], "bone", "bone", { toe: -1, w: 8 }),
      ...leg(hipR, [110, 194], [112, 238], "bone", "bone", { toe: 1, w: 8 }),
      part("cape", pts([82, 84], [118, 84], [117, 150], [110, 164], [105, 150], [98, 166], [93, 150], [86, 162], [83, 148])),
      part("bone", pts([89, 92], [111, 92], [109, 118], [91, 118]), `${line([90, 98], [110, 98])} ${line([90, 104], [110, 104])} ${line([91, 110], [109, 110])} ${line([100, 92], [100, 118])}`),
      part("wood", limb([128, 240], [128, 22], 3.4)),
      part("blade", pts([128, 4], [133.5, 24], [122.5, 24])),
      ...arm(shR, [125, 110], [128, 128], "bone", { hand: "bone", w: 6.5 }),
      ...arm(shL, [74, 106], [78, 122], "bone", { hand: "bone", w: 6.5 }),
      part("wood", "M52,96 Q72,84 92,96 L90,140 Q72,158 54,140 Z", `${line([64, 92], [64, 148])} ${line([80, 92], [80, 148])} ${line([72, 88], [76, 104], [70, 116])}`),
      part("metal", disc([72, 120], 6.5)),
      ...skull(100, 60, "boot"),
      part("metal", "M88,56 Q88,39 100,37 Q112,39 112,56 Z", line([89, 51], [111, 51])),
    ],
  };
})();

/** A Barrow Legion skeleton lunging left with its spear. */
const legionThrust: Figure = (() => {
  const shL: P = [90, 90];
  const shR: P = [116, 88];
  const hipL: P = [96, 146];
  const hipR: P = [112, 146];
  return {
    top: 39,
    bottom: 244,
    gear: ["blade", "wood", "cape"],
    tint: { metal: RUST, wood: "#6f5a45" },
    parts: [
      part("cape", pts([112, 86], [134, 100], [146, 150], [136, 144], [134, 160], [124, 146], [118, 120])),
      ...leg(hipR, [124, 192], [136, 238], "bone", "bone", { toe: 1, w: 8 }),
      ...leg(hipL, [80, 194], [68, 238], "bone", "bone", { toe: -1, w: 8 }),
      part("cape", pts([86, 86], [120, 84], [120, 148], [113, 162], [107, 150], [100, 164], [95, 150], [88, 160])),
      part("bone", pts([91, 94], [113, 92], [112, 118], [94, 120]), `${line([92, 100], [112, 98])} ${line([93, 106], [112, 104])} ${line([94, 112], [112, 110])}`),
      ...arm(shR, [126, 108], [120, 102.5], "bone", { hand: "bone", w: 6.5 }),
      part("wood", limb([152, 105], [28, 97], 3.4)),
      part("blade", pts([8, 96], [29, 91.5], [29, 102.5])),
      ...arm(shL, [76, 106], [72, 100], "bone", { hand: "bone", w: 6.5 }),
      ...skull(102, 62, "boot"),
      part("metal", "M90,58 Q90,41 102,39 Q114,41 114,58 Z", line([91, 53], [113, 53])),
    ],
  };
})();

/** Morvane the Gravecaller: hooded and ragged, a skull-topped staff in one hand, grave-light in the other. */
const morvane: Figure = (() => {
  const shL: P = [84, 88];
  const shR: P = [116, 88];
  return {
    top: 32,
    bottom: 244,
    gear: ["wood", "glow", "bone"],
    tint: { glow: "#a6f07c", skin: "#d6c7b2", hair: "#b9b3a6" },
    parts: [
      part("boot", pts([86, 232], [98, 232], [98, 244], [78, 244])),
      part("boot", pts([102, 232], [114, 232], [122, 244], [102, 244])),
      part("armor", pts([81, 85], [119, 85], [131, 236], [123, 227], [115, 239], [107, 228], [99, 240], [91, 228], [83, 239], [76, 228], [69, 236]), `${line([100, 150], [100, 226])} ${line([88, 150], [82, 226])} ${line([112, 150], [118, 226])}`),
      part("bone", pts([86, 142], [114, 142], [115, 150], [85, 150])),
      part("wood", limb([65, 241], [70, 40], 4.2)),
      ...skullTop(70, 26),
      ...arm(shL, [70, 110], [67, 130], "armor", { hand: "skin" }),
      ...arm(shR, [134, 104], [146, 80], "armor", { hand: "skin" }),
      part("glow", disc([152, 64], 9)),
      part("glow", `${disc([166, 48], 3)} ${disc([140, 46], 2.4)} ${disc([170, 72], 2)}`),
      part("cape", pts([74, 82], [126, 82], [132, 110], [118, 104], [100, 114], [82, 104], [68, 110])),
      part("bone", disc([100, 100], 4.2)),
      part("cape", "M82,74 Q79,36 100,32 Q121,36 118,74 L112,92 H88 Z"),
      part("skin", "M91,58 Q100,50 109,58 V72 Q100,84 91,72 Z", `${line([93.5, 64], [98, 64])} ${line([102, 64], [106.5, 64])}`),
      part("hair", pts([94, 74], [106, 74], [103, 92], [100, 96], [97, 92])),
    ],
  };
})();

const ORC = "#7da35a";

/** Grubnak Skullcaller: a hulking orc shaman under a skull headdress, a war drum at his hip and a hex in his fist. */
const grubnak: Figure = (() => {
  const shL: P = [78, 90];
  const shR: P = [122, 90];
  const hipL: P = [87, 148];
  const hipR: P = [113, 148];
  return {
    top: 30,
    bottom: 244,
    gear: ["wood", "glow", "bone"],
    tint: { skin: ORC, glow: "#a6f07c", cloth: "#3a2a22" },
    parts: [
      ...arm(shR, [142, 96], [150, 70], "skin", { w: 13 }),
      part("glow", disc([154, 56], 9.5)),
      part("glow", `${disc([168, 42], 3)} ${disc([142, 38], 2.4)} ${disc([172, 64], 2)}`),
      ...leg(hipL, [82, 196], [76, 238], "cloth", "leather", { toe: -1, w: 16 }),
      ...leg(hipR, [118, 196], [124, 238], "cloth", "leather", { toe: 1, w: 16 }),
      part("skin", pts([75, 87], [125, 87], [119, 150], [81, 150]), `${line([100, 96], [100, 138])} ${line([86, 112], [100, 118], [114, 112])}`),
      part("leather", pts([80, 142], [120, 142], [128, 180], [116, 172], [108, 184], [100, 172], [92, 184], [84, 172], [72, 180])),
      part("bone", pts([82, 140], [118, 140], [119, 148], [81, 148])),
      part("wood", pts([108, 150], [140, 146], [142, 186], [112, 190]), `${line([110, 160], [141, 156])} ${line([111, 180], [142, 176])}`),
      part("bone", "M108,150 Q124,142 140,146 Q124,154 108,150 Z"),
      part("leather", pts([70, 78], [130, 78], [136, 100], [118, 94], [100, 104], [82, 94], [64, 100]), `${line([82, 82], [80, 94])} ${line([100, 82], [100, 102])} ${line([118, 82], [120, 94])}`),
      ...arm(shL, [62, 112], [70, 138], "skin", { w: 13 }),
      part("bone", limb([70, 140], [96, 160], 5, 4)),
      part("bone", disc([98, 162], 5)),
      part("skin", disc([100, 62], 12.5), `${line([93, 60], [98, 61])} ${line([102, 61], [107, 60])}`),
      part("skin", pts([90, 68], [110, 68], [107, 80], [93, 80])),
      part("bone", `${pts([92, 76], [90, 64], [96, 74])} ${pts([108, 76], [110, 64], [104, 74])}`),
      part("skin", `${pts([88, 58], [74, 52], [88, 66])} ${pts([112, 58], [126, 52], [112, 66])}`),
      part("bone", "M86,56 Q85,36 100,34 Q115,36 114,56 Q107,48 100,49 Q93,48 86,56 Z", `${line([95, 40], [95, 46])} ${line([105, 40], [105, 46])}`),
      part("bone", `${pts([88, 42], [78, 26], [94, 38])} ${pts([112, 42], [122, 26], [106, 38])}`),
    ],
  };
})();

/** A Bonebow Archer loosing to the left, under a rotted hood. */
const bonebowLoosing: Figure = (() => {
  const shL: P = [92, 90];
  const shR: P = [116, 88];
  const hipL: P = [96, 146];
  const hipR: P = [112, 146];
  return {
    top: 46,
    bottom: 244,
    gear: ["blade", "wood", "cape", "leather"],
    tint: { wood: "#6f5a45" },
    parts: [
      part("leather", pts([116, 84], [127, 80], [138, 116], [127, 120])),
      ...leg(hipR, [116, 194], [122, 238], "bone", "bone", { toe: 1, w: 8 }),
      ...leg(hipL, [90, 194], [84, 238], "bone", "bone", { toe: -1, w: 8 }),
      part("cape", pts([88, 86], [120, 84], [120, 148], [113, 162], [107, 150], [100, 164], [95, 150], [89, 160])),
      part("bone", pts([92, 94], [114, 92], [113, 118], [95, 120]), `${line([93, 100], [113, 98])} ${line([94, 106], [113, 104])} ${line([95, 112], [113, 110])}`),
      ...arm(shR, [140, 92], [122, 96], "bone", { hand: "bone", w: 6.5 }),
      part("wood", "M62,48 Q30,100 62,152 L65,150 Q38,100 65,50 Z", "M63.5,49 L122,96 L63.5,151"),
      part("wood", limb([122, 95.4], [40, 100.6], 2.2)),
      part("blade", pts([28, 101.4], [41, 96.6], [41, 104.6])),
      ...arm(shL, [76, 98], [60, 101], "bone", { hand: "bone", w: 6.5 }),
      ...skull(104, 64, "boot"),
      part("cape", "M92,62 Q90,46 104,44 Q120,46 118,66 L124,88 L112,82 Q114,62 104,54 Q96,54 92,62 Z"),
    ],
  };
})();

/** A Bonebow Archer nocking the next arrow, bow held low. */
const bonebowNocking: Figure = (() => {
  const shL: P = [86, 88];
  const shR: P = [114, 88];
  const hipL: P = [92, 146];
  const hipR: P = [108, 146];
  return {
    top: 42,
    bottom: 244,
    gear: ["blade", "wood", "cape", "leather"],
    tint: { wood: "#6f5a45" },
    parts: [
      part("leather", pts([110, 82], [121, 78], [132, 114], [121, 118])),
      part("wood", `${pts([112, 62], [116, 61], [120, 80], [116, 81])} ${pts([119, 60], [123, 59], [126, 77], [122, 78])}`),
      ...leg(hipL, [90, 194], [88, 238], "bone", "bone", { toe: -1, w: 8 }),
      ...leg(hipR, [110, 194], [112, 238], "bone", "bone", { toe: 1, w: 8 }),
      part("cape", pts([82, 84], [118, 84], [117, 150], [110, 164], [105, 150], [98, 166], [93, 150], [86, 162], [83, 148])),
      part("bone", pts([89, 92], [111, 92], [109, 118], [91, 118]), `${line([90, 98], [110, 98])} ${line([90, 104], [110, 104])} ${line([91, 110], [109, 110])}`),
      part("wood", "M58,96 Q46,150 70,196 L72.8,194 Q52,150 61,97 Z", "M59.5,97 L71.5,195"),
      ...arm(shL, [72, 112], [62, 140], "bone", { hand: "bone", w: 6.5 }),
      part("wood", limb([66, 150], [124, 118], 2.2)),
      part("blade", pts([54, 156.6], [66, 146], [69, 153])),
      ...arm(shR, [128, 104], [122, 119], "bone", { hand: "bone", w: 6.5 }),
      ...skull(100, 60, "boot"),
      part("cape", "M88,58 Q86,42 100,40 Q114,42 112,58 L118,84 L108,78 Q110,58 100,50 Q92,50 88,58 Z"),
    ],
  };
})();

/** An orc's head: heavy jaw, tusks, and a crest of hair. `look` is -1 for a head turned left, 0 for facing us. */
const orcHead = (x: number, y: number, look: number): Part[] => [
  part("skin", `${pts([x - 12, y - 4], [x - 26, y - 10], [x - 12, y + 4])} ${pts([x + 12, y - 4], [x + 26, y - 10], [x + 12, y + 4])}`),
  part("skin", disc([x, y], 12.5), look === 0 ? `${line([x - 7, y - 2], [x - 2, y - 1])} ${line([x + 2, y - 1], [x + 7, y - 2])}` : line([x - 9, y - 2], [x - 4, y - 1])),
  part("skin", pts([x - 10 + look * 2, y + 6], [x + 10 + look * 2, y + 6], [x + 7 + look * 2, y + 18], [x - 7 + look * 2, y + 18])),
  part("bone", `${pts([x - 8 + look * 2, y + 14], [x - 10 + look * 2, y + 2], [x - 4 + look * 2, y + 12])} ${pts([x + 8 + look * 2, y + 14], [x + 10 + look * 2, y + 2], [x + 4 + look * 2, y + 12])}`),
  part("hair", pts([x - 4, y - 10], [x - 2, y - 28], [x + 3, y - 14], [x + 8, y - 26], [x + 8, y - 10])),
];

/** A throwing axe from the hand toward `to`. */
const handAxe = (hand: P, to: P): Part[] => {
  const dx = (to[0] - hand[0]) / 30;
  const dy = (to[1] - hand[1]) / 30;
  const tip: P = [hand[0] + dx * 30, hand[1] + dy * 30];
  return [
    part("wood", limb([hand[0] - dx * 8, hand[1] - dy * 8], tip, 3.6)),
    part("blade", pts([tip[0] - dx * 9, tip[1] - dy * 9], [tip[0] - dx * 6 - dy * 15, tip[1] - dy * 6 + dx * 15], [tip[0] + dx * 4 - dy * 13, tip[1] + dy * 4 + dx * 13], [tip[0] + dx * 1, tip[1] + dy * 1])),
  ];
};

const RAIDER = { skin: ORC, cloth: "#3a2a22", cape: "#5b3a2a" };

/** An Orc Raider winding up to hurl an axe to the left. */
const orcHurling: Figure = (() => {
  const shL: P = [86, 92];
  const shR: P = [120, 90];
  const hipL: P = [90, 148];
  const hipR: P = [114, 148];
  return {
    top: 36,
    bottom: 244,
    gear: ["wood", "blade"],
    tint: RAIDER,
    parts: [
      ...arm(shR, [140, 76], [146, 52], "skin", { w: 12 }),
      ...handAxe([146, 52], [158, 22]),
      ...leg(hipR, [124, 196], [134, 238], "cloth", "leather", { toe: 1, w: 15 }),
      ...leg(hipL, [80, 196], [70, 238], "cloth", "leather", { toe: -1, w: 15 }),
      part("skin", pts([82, 88], [124, 86], [118, 150], [86, 150]), `${line([102, 96], [102, 140])} ${line([88, 112], [102, 118], [118, 110])}`),
      part("cape", pts([84, 142], [118, 142], [124, 176], [112, 170], [102, 180], [92, 170], [80, 176])),
      part("bone", pts([86, 140], [118, 140], [119, 148], [85, 148])),
      part("leather", limb([84, 90], [118, 142], 5)),
      ...arm(shL, [66, 102], [50, 94], "skin", { w: 12 }),
      part("leather", pts([74, 82], [96, 80], [94, 98], [72, 102])),
      ...orcHead(103, 64, -1),
    ],
  };
})();

/** An Orc Raider bellowing, an axe in each fist. */
const orcBellowing: Figure = (() => {
  const shL: P = [82, 92];
  const shR: P = [118, 92];
  const hipL: P = [88, 148];
  const hipR: P = [112, 148];
  return {
    top: 34,
    bottom: 244,
    gear: ["wood", "blade"],
    tint: { ...RAIDER, skin: "#6b9150" },
    parts: [
      ...leg(hipL, [82, 196], [76, 238], "cloth", "leather", { toe: -1, w: 15 }),
      ...leg(hipR, [118, 196], [124, 238], "cloth", "leather", { toe: 1, w: 15 }),
      part("skin", pts([78, 88], [122, 88], [116, 150], [84, 150]), `${line([100, 96], [100, 140])} ${line([86, 112], [100, 118], [114, 112])}`),
      part("cape", pts([82, 142], [118, 142], [124, 176], [112, 170], [100, 180], [88, 170], [76, 176])),
      part("bone", pts([84, 140], [116, 140], [117, 148], [83, 148])),
      part("leather", limb([116, 90], [84, 142], 5)),
      ...arm(shL, [62, 110], [56, 136], "skin", { w: 12 }),
      ...handAxe([56, 136], [36, 160]),
      ...arm(shR, [138, 110], [144, 136], "skin", { w: 12 }),
      ...handAxe([144, 136], [164, 160]),
      part("leather", pts([106, 80], [128, 82], [130, 102], [108, 98])),
      ...orcHead(100, 62, 0),
      part("boot", pts([94, 71], [106, 71], [104, 77], [96, 77])),
    ],
  };
})();

const GHOUL = { skin: "#a9b59c", cape: "#4a3f52", glow: "#a6f07c" };

/** Three claws on a hand, pointing along `dir`. */
const claws = (hand: P, dir: P) =>
  part(
    "bone",
    [-1, 0, 1]
      .map((k) => {
        const bx = hand[0] - dir[1] * k * 3.2;
        const by = hand[1] + dir[0] * k * 3.2;
        return pts([bx - dir[1] * 1.4, by + dir[0] * 1.4], [bx + dir[0] * 10, by + dir[1] * 10], [bx + dir[1] * 1.4, by - dir[0] * 1.4]);
      })
      .join(" "),
  );

/** A ghoul's bald head with lit eyes and an open jaw. */
const ghoulHead = (x: number, y: number, look: number): Part[] => [
  part("skin", disc([x, y], 11), ""),
  part("skin", pts([x - 7 + look * 4, y + 6], [x + 7 + look * 4, y + 6], [x + 5 + look * 5, y + 19], [x - 5 + look * 5, y + 19])),
  part("boot", pts([x - 4 + look * 4, y + 9], [x + 4 + look * 4, y + 9], [x + 3 + look * 5, y + 16], [x - 3 + look * 5, y + 16])),
  part("glow", look === 0 ? `${disc([x - 4.4, y - 1], 2.4)} ${disc([x + 4.4, y - 1], 2.4)}` : disc([x + look * 6, y - 1.5], 2.4)),
];

/** A Ghoul loping forward to the left, arms reaching. */
const ghoulLoping: Figure = (() => {
  const shL: P = [92, 132];
  const shR: P = [114, 126];
  const hipL: P = [110, 172];
  const hipR: P = [126, 168];
  return {
    top: 100,
    bottom: 244,
    gear: [],
    tint: GHOUL,
    parts: [
      ...arm(shR, [100, 160], [86, 190], "skin", { w: 8 }),
      claws([86, 190], [-0.5, 0.87]),
      ...leg(hipR, [142, 202], [134, 238], "skin", "skin", { toe: -1, w: 11 }),
      ...leg(hipL, [96, 206], [102, 238], "skin", "skin", { toe: -1, w: 11 }),
      part("skin", pts([88, 126], [116, 118], [132, 164], [106, 178]), `${line([96, 134], [112, 128])} ${line([100, 144], [118, 138])} ${line([104, 154], [122, 148])}`),
      part("cape", pts([104, 168], [132, 160], [140, 186], [128, 182], [124, 196], [114, 184], [106, 194])),
      ...arm(shL, [72, 160], [52, 176], "skin", { w: 8 }),
      claws([52, 176], [-0.87, 0.5]),
      ...ghoulHead(80, 112, -1),
    ],
  };
})();

/** A Ghoul reared up and shrieking, claws spread. */
const ghoulShrieking: Figure = (() => {
  const shL: P = [84, 126];
  const shR: P = [116, 126];
  const hipL: P = [90, 176];
  const hipR: P = [110, 176];
  return {
    top: 88,
    bottom: 244,
    gear: [],
    tint: { ...GHOUL, skin: "#9aa890" },
    parts: [
      ...leg(hipL, [74, 206], [80, 238], "skin", "skin", { toe: -1, w: 11 }),
      ...leg(hipR, [126, 206], [120, 238], "skin", "skin", { toe: 1, w: 11 }),
      part("skin", pts([80, 122], [120, 122], [114, 178], [86, 178]), `${line([88, 134], [112, 134])} ${line([89, 144], [111, 144])} ${line([90, 154], [110, 154])} ${line([100, 124], [100, 164])}`),
      part("cape", pts([86, 172], [114, 172], [120, 196], [110, 190], [100, 200], [90, 190], [80, 196])),
      ...arm(shL, [62, 122], [48, 98], "skin", { w: 8 }),
      claws([48, 98], [-0.3, -0.95]),
      ...arm(shR, [138, 122], [152, 98], "skin", { w: 8 }),
      claws([152, 98], [0.3, -0.95]),
      ...ghoulHead(100, 100, 0),
    ],
  };
})();

export const ASHEN: Record<string, Drawing> = {
  vorhal: solo(vorhal),
  morvane: solo(morvane),
  grubnak: solo(grubnak),
  "bonebow-archers": squad([bonebowNocking, bonebowLoosing, bonebowLoosing]),
  "ruinmaw-raiders": squad([orcBellowing, orcHurling, orcHurling]),
  "ghoul-pack": squad([ghoulShrieking, ghoulLoping, ghoulShrieking, ghoulLoping]),
  "barrow-legion": squad([legionGuard, legionThrust, legionGuard, legionThrust]),
};
