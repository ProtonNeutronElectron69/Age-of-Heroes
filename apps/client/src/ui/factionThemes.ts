/** Which emblem a faction's cards carry. The glyphs live in `hexCardArt.tsx`. */
export type EmblemId = "gear" | "haze" | "leaf" | "nodes" | "skull" | "sun" | "star";

/** The colours a faction's unit cards are painted in. */
export interface FactionTheme {
  /** Frame and banner colour, with a lighter and a darker shade for edges. */
  primary: string;
  primaryLight: string;
  primaryDark: string;
  /** The darkest tone: stat rows, the emblem seal, the hit zone window. */
  deep: string;
  /** Trim: pinlines, numerals and emblem glyphs. */
  accent: string;
  accentLight: string;
  /** The rules text panel and the stat plate. */
  paper: string;
  paperShade: string;
  /** Text on paper, and the colour of ability names. */
  ink: string;
  heading: string;
  /** Text on the primary colour. */
  onPrimary: string;
  /** The backdrop behind unit art, top to bottom. */
  art: readonly [string, string];
  emblem: EmblemId;
}

const THEMES: Record<string, FactionTheme> = {
  "Iron Concord": {
    primary: "#234573",
    primaryLight: "#4470ac",
    primaryDark: "#142947",
    deep: "#0f1d33",
    accent: "#cfa64e",
    accentLight: "#f0d591",
    paper: "#ece6d6",
    paperShade: "#cfc6ae",
    ink: "#1b2230",
    heading: "#1c3c69",
    onPrimary: "#f4f1e6",
    art: ["#5d86bd", "#1a3358"],
    emblem: "gear",
  },
  "House Kagero": {
    primary: "#a01f2c",
    primaryLight: "#d24a52",
    primaryDark: "#5e0f18",
    deep: "#17100f",
    accent: "#dcb866",
    accentLight: "#f6dfa3",
    paper: "#f0e7d8",
    paperShade: "#d6c7ae",
    ink: "#241a18",
    heading: "#8a1622",
    onPrimary: "#fbf1e2",
    art: ["#c9545a", "#3a1014"],
    emblem: "haze",
  },
  "Verdant Court": {
    primary: "#2d6136",
    primaryLight: "#5b9a58",
    primaryDark: "#17381f",
    deep: "#0f2415",
    accent: "#dcb74c",
    accentLight: "#f3df96",
    paper: "#ebe8d1",
    paperShade: "#cdcba6",
    ink: "#1c2418",
    heading: "#245029",
    onPrimary: "#f3f2df",
    art: ["#79ad68", "#1d4526"],
    emblem: "leaf",
  },
  "Nexus Collective": {
    primary: "#147a7c",
    primaryLight: "#3db6b1",
    primaryDark: "#0b4648",
    deep: "#1b2227",
    accent: "#b5ece4",
    accentLight: "#e4fbf7",
    paper: "#e2e9e7",
    paperShade: "#bccac7",
    ink: "#1a2226",
    heading: "#0e5f61",
    onPrimary: "#eefaf8",
    art: ["#4fb9b5", "#1f3138"],
    emblem: "nodes",
  },
  "Ashen Host": {
    primary: "#54397f",
    primaryLight: "#8465b3",
    primaryDark: "#2c1c47",
    deep: "#1a1129",
    accent: "#ddd5bd",
    accentLight: "#f6f1e0",
    paper: "#e7e2d6",
    paperShade: "#c7bfb0",
    ink: "#211c28",
    heading: "#47306d",
    onPrimary: "#f1ecdf",
    art: ["#8a70b4", "#231735"],
    emblem: "skull",
  },
  "Dawnhold Covenant": {
    primary: "#ece1c0",
    primaryLight: "#fbf5e0",
    primaryDark: "#c4ae77",
    deep: "#3b2c10",
    accent: "#d4951c",
    accentLight: "#f7cf6b",
    paper: "#fbf7ea",
    paperShade: "#e3d8b8",
    ink: "#2b220f",
    heading: "#8a5d0b",
    onPrimary: "#3a2b0d",
    art: ["#f6e2a4", "#c58b2a"],
    emblem: "sun",
  },
};

/** Units of a faction that has no theme yet still get a card. */
const FALLBACK: FactionTheme = {
  primary: "#4a5568",
  primaryLight: "#7c8799",
  primaryDark: "#2b3340",
  deep: "#171c24",
  accent: "#d9dde3",
  accentLight: "#f4f6f8",
  paper: "#e8e6df",
  paperShade: "#c8c5ba",
  ink: "#1d2026",
  heading: "#3a4352",
  onPrimary: "#f2f3f5",
  art: ["#8a95a6", "#2b3340"],
  emblem: "star",
};

export function factionTheme(faction: string): FactionTheme {
  return THEMES[faction] ?? FALLBACK;
}
