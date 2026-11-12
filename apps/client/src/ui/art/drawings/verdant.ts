import { squad } from "../build";
import type { Drawing, Figure } from "../types";

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

export const VERDANT: Record<string, Drawing> = {
  "glade-wardens": squad([wardenLoosing, wardenWatching, wardenLoosing]),
};
