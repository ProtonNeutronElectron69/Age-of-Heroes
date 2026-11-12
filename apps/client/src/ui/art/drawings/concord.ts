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

export const CONCORD: Record<string, Drawing> = {
  "marisol-vance": solo(marisolVance),
  "harrow-riflemen": squad([riflemanAiming, riflemanReady, riflemanAiming]),
};
