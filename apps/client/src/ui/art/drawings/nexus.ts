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

export const NEXUS: Record<string, Drawing> = {
  // K-7 is broad: it stands smaller in the narrow window so its deflector and cannon both fit.
  "sentinel-k7": { ...solo(sentinelK7), tall: [{ figure: sentinelK7, dx: 40, dy: 48.8, scale: 0.8 }] },
  "nexus-breachers": squad([breacherReady, breacherCharging, breacherCharging]),
};
