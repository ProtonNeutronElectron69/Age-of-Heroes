/**
 * Unit drawings. Each figure is a list of flat shapes, back to front, in a box
 * 200 wide and 250 tall with the feet on y = 244. A shape's role says what it
 * is, so one drawing can be painted in any art style and as a hit zone picture.
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
  | "sash"
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

export const FIGURES: Readonly<Record<string, Figure>> = {
  "lady-asagiri": ladyAsagiri,
};
