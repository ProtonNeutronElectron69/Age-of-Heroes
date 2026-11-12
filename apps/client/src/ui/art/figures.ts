/**
 * Unit drawings. Each figure is a list of flat shapes, back to front, in a box
 * 200 wide and 250 tall with the feet on y = 244. A shape's role says what it
 * is, so one drawing can be painted in any art style and as a hit zone picture.
 * A unit's drawing places one or more figures in a box of the same size.
 */

export type Role =
  | "hair"
  | "skin"
  | "helmet"
  | "crest"
  | "jewel"
  | "armor"
  | "plate"
  | "cloth"
  | "cape"
  | "sash"
  | "wood"
  | "blade"
  | "hilt"
  | "boot";

export interface Part {
  role: Role;
  /** The outline. */
  d: string;
  /** Lines drawn inside the shape: lacing, plate edges, folds. */
  lines?: string;
}

export interface Figure {
  parts: readonly Part[];
  /** Top of the head and soles of the feet. The hit band is measured between them. */
  top: number;
  bottom: number;
  /** Roles that are gear, not body: never part of the hit zone. */
  gear: readonly Role[];
}

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

/** A Glade Warden loosing an arrow to the left: hood down, cloak streaming behind. */
const wardenLoosing: Figure = {
  top: 52,
  bottom: 244,
  gear: ["wood", "blade", "hilt", "cape"],
  parts: [
    { role: "cape", d: "M112,82 C140,96 156,140 160,198 L134,188 C132,150 126,116 112,96 Z", lines: "M124,100 C138,130 144,160 147,192" },
    { role: "wood", d: "M115,62 L120,60 L125,79 L120,80 Z M123,59 L128,57 L131,76 L127,77 Z" },
    { role: "hilt", d: "M118,78 L130,74 L142,112 L130,117 Z", lines: "M121,88 L133,84" },
    { role: "cloth", d: "M106,146 L126,144 L136,194 L118,198 Z" },
    { role: "boot", d: "M118,197 L136,193 L142,238 L124,239 Z M124,238 L142,237 L152,244 L124,244 Z" },
    { role: "cloth", d: "M90,146 L110,146 L104,198 L86,196 Z" },
    { role: "boot", d: "M86,195 L104,198 L100,239 L83,238 Z M83,237 L100,238 L100,244 L70,244 Q72,239 83,237 Z" },
    { role: "armor", d: "M94,86 L120,82 L127,148 L89,148 Z", lines: "M106,86 L108,138 M93,104 L123,101 M91,121 L125,119" },
    { role: "sash", d: "M89,138 L127,138 L128,148 L88,148 Z" },
    { role: "helmet", d: "M103,80 L122,77 L129,93 L105,91 Z" },
    { role: "cloth", d: "M112,86 L152,90 L152,101 L114,98 Z" },
    { role: "cloth", d: "M152,90 L153,101 L125,110 L121,101 Z" },
    { role: "wood", d: "M58,52 Q26,108 58,166 L61,164 Q36,108 61,54 Z", lines: "M59,53 L121,104 L59,165" },
    { role: "wood", d: "M34,106.4 L121,103 L121,105.4 L34,108.2 Z" },
    { role: "blade", d: "M23,107.5 L37,102.5 L37,112 Z" },
    { role: "cloth", d: "M108,88 L107,100 L60,112 L57,103 Z" },
    { role: "skin", d: "M51.5,107 a4.8,4.8 0 1 0 9.6,0 a4.8,4.8 0 1 0 -9.6,0 Z" },
    { role: "skin", d: "M117,104.5 a4.8,4.8 0 1 0 9.6,0 a4.8,4.8 0 1 0 -9.6,0 Z" },
    { role: "skin", d: "M91.5,66 a11.5,11.5 0 1 0 23,0 a11.5,11.5 0 1 0 -23,0 Z", lines: "M94.5,64.5 H99" },
    { role: "hair", d: "M95,56 Q110,45 119,60 Q126,78 119,96 L110,86 Q113,72 105,63 Q99,59 95,56 Z" },
    { role: "skin", d: "M106,65 L123,53 L113,71 Z" },
  ],
};

/** A Glade Warden on watch: hood up, bow grounded at her side, an arrow in the other hand. */
const wardenWatching: Figure = {
  top: 38,
  bottom: 244,
  gear: ["wood", "blade", "hilt", "cape"],
  parts: [
    { role: "cape", d: "M82,82 L118,82 L140,208 L60,208 Z", lines: "M70,150 L64,204 M130,150 L136,204" },
    { role: "cloth", d: "M83,146 L99,146 L98,198 L84,198 Z" },
    { role: "cloth", d: "M101,146 L117,146 L116,198 L102,198 Z" },
    { role: "boot", d: "M84,197 L98,197 L97,239 L82,239 Z M82,238 L97,238 L97,244 L72,244 Q74,240 82,238 Z" },
    { role: "boot", d: "M102,197 L116,197 L118,239 L103,239 Z M103,238 L118,238 Q126,240 128,244 L103,244 Z" },
    { role: "armor", d: "M84,86 L116,86 L120,148 L80,148 Z", lines: "M100,96 V138 M83,106 H117 M81,122 H119" },
    { role: "sash", d: "M80,138 L120,138 L121,148 L79,148 Z" },
    { role: "wood", d: "M82.5,138 L85,138 L79,197 L76.5,197 Z" },
    { role: "blade", d: "M77.5,208 L73,195 L82.5,195 Z" },
    { role: "cloth", d: "M86,88 L74,92 L68,128 L80,141 L88,134 L80,124 L88,104 Z" },
    { role: "skin", d: "M79.5,138 a4.8,4.8 0 1 0 9.6,0 a4.8,4.8 0 1 0 -9.6,0 Z" },
    { role: "wood", d: "M150,46 Q178,146 150,241 L147,239 Q170,146 147,48 Z", lines: "M148.5,48 V240" },
    { role: "cloth", d: "M114,88 L126,92 L159,140 L150,149 L120,112 Z" },
    { role: "skin", d: "M150,145 a5,5 0 1 0 10,0 a5,5 0 1 0 -10,0 Z" },
    { role: "helmet", d: "M83,76 Q81,42 100,38 Q119,42 117,76 L112,89 H88 Z", lines: "M100,38 V52" },
    { role: "skin", d: "M91,58 Q100,52 109,58 V70 Q100,80 91,70 Z", lines: "M93.5,64 H98 M102,64 H106.5" },
    { role: "skin", d: "M91,62 L78,51 L90,71 Z" },
    { role: "skin", d: "M109,62 L122,51 L110,71 Z" },
    { role: "jewel", d: "M96,91 a4,4 0 1 0 8,0 a4,4 0 1 0 -8,0 Z" },
  ],
};

/** Where a figure stands in a drawing: local (x, y) lands on (dx + scale * x, dy + scale * y). */
export interface Placed {
  figure: Figure;
  dx: number;
  dy: number;
  scale: number;
}

/**
 * A unit's drawing: its figures, back to front, arranged two ways. `tall` fits
 * the narrow art window of the Advanced side and the hit zone window; `wide`
 * spreads out across the Basic side. Both are laid out in the 200 by 250 box.
 */
export interface Drawing {
  tall: readonly Placed[];
  wide: readonly Placed[];
}

const solo = (figure: Figure): Drawing => {
  const cast = [{ figure, dx: 0, dy: 0, scale: 1 }];
  return { tall: cast, wide: cast };
};

export const DRAWINGS: Readonly<Record<string, Drawing>> = {
  "lady-asagiri": solo(ladyAsagiri),
  "glade-wardens": {
    // A column: the narrow window is about 160 across (x from 40 to 200).
    tall: [
      { figure: wardenLoosing, dx: 28, dy: -11, scale: 0.62 },
      { figure: wardenWatching, dx: 80, dy: 29, scale: 0.66 },
      { figure: wardenLoosing, dx: 27, dy: 65, scale: 0.74 },
    ],
    wide: [
      { figure: wardenLoosing, dx: -84, dy: 40, scale: 0.8 },
      { figure: wardenWatching, dx: 6, dy: 34, scale: 0.8 },
      { figure: wardenLoosing, dx: 58, dy: 24.4, scale: 0.9 },
    ],
  },
};

/** The box around every figure of an arrangement, for fitting it into a window. */
export function castBounds(cast: readonly Placed[]): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { figure, dx, dy, scale } of cast) {
    // Figures keep within about 20 to 180 across; gear can rise above the head.
    x0 = Math.min(x0, dx + 20 * scale);
    x1 = Math.max(x1, dx + 180 * scale);
    y0 = Math.min(y0, dy + Math.max(0, figure.top - 24) * scale);
    y1 = Math.max(y1, dy + figure.bottom * scale);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
