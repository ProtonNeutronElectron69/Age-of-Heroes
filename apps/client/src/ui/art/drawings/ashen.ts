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

export const ASHEN: Record<string, Drawing> = {
  vorhal: solo(vorhal),
  "barrow-legion": squad([legionGuard, legionThrust, legionGuard, legionThrust]),
};
