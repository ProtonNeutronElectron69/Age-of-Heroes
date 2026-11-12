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

const darkHaired = (figure: Figure): Figure => ({ ...figure, tint: { ...figure.tint, hair: "#3a2a20" } });

export const DAWNHOLD: Record<string, Drawing> = {
  "dame-rowena": solo(dameRowena),
  "stormwake-huscarls": squad([huscarlResting, huscarlStriking, darkHaired(huscarlResting), darkHaired(huscarlStriking)]),
};
