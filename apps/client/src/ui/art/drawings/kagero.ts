import { arm, belt, disc, head, leg, limb, line, type P, part, pts, solo, squad, torso } from "../build";
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

export const KAGERO: Record<string, Drawing> = {
  "lady-asagiri": solo(ladyAsagiri),
  "lady-suzume": solo(ladySuzume, [25, 153]),
  "crimson-lotus-guard": squad([lotusGuardWatching, lotusGuardStriking, lotusGuardWatching]),
};
