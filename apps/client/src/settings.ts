import { useSyncExternalStore } from "react";
import { COLOR_SCHEMES, type ColorScheme } from "./models";
import { TEST_MODE } from "./testMode";

/**
 * How the board draws figures, chosen by each player for their own screen and
 * kept in this browser. It changes nothing in the game itself.
 */
export interface DisplaySettings {
  /** Figure models on bases, or the plain tokens that show the hit band. */
  readonly figures: "models" | "tokens";
  /** How models and the rings round their bases are coloured. */
  readonly scheme: ColorScheme;
  /** The look of the main menu. */
  readonly menu: MenuStyle;
  /** The gaming table the board stands on. */
  readonly table: TableStyle;
  /** The look: detailed (textured tiles with bold outlines, textured scenery, painted figures where a unit has one) or classic (flat colours, plain figures). */
  readonly tiles: TileLook;
  /** How attacks and initiative show their dice. */
  readonly dice: DiceShow;
  /** Graphics quality: high turns every effect on (shadows, warmer light); low is the plainest and quickest. */
  readonly graphics: GraphicsQuality;
  /** The play screen's camera follows the acting figure: moving to it, turning to face the board, and zooming. */
  readonly autoPan: boolean;
  readonly autoRotate: boolean;
  readonly autoZoom: boolean;
  /** Whether music plays, and how loud (0 to 1). */
  readonly music: boolean;
  readonly musicVolume: number;
  /** Whether sound effects play, and how loud (0 to 1). */
  readonly sounds: boolean;
  readonly soundsVolume: number;
}

/**
 * How dice are shown: an attack zooms in on the fight with both units' cards and
 * models over a dimmed board and rolls 3D dice ("scene"), only the 3D dice roll
 * ("dice"), or the results appear at once ("none"). Initiative rolls a d20 for
 * each player unless this is "none".
 */
export type DiceShow = "scene" | "dice" | "none";
export const DICE_SHOWS: readonly { readonly id: DiceShow; readonly name: string }[] = [
  { id: "scene", name: "Full scene" },
  { id: "dice", name: "Dice only" },
  { id: "none", name: "None" },
];

/** Graphics quality. High (the default) turns every effect on; low draws the plainest board, for slow computers. */
export type GraphicsQuality = "low" | "high";
export const GRAPHICS_QUALITIES: readonly { readonly id: GraphicsQuality; readonly name: string }[] = [
  { id: "high", name: "High" },
  { id: "low", name: "Low" },
];

/** The two looks of the board's tiles. */
export type TileLook = "detailed" | "classic";
export const TILE_LOOKS: readonly { readonly id: TileLook; readonly name: string }[] = [
  { id: "detailed", name: "Detailed" },
  { id: "classic", name: "Classic" },
];

/** The three gaming tables. */
export type TableStyle = "tavern" | "felt" | "mat";
export const TABLE_STYLES: readonly { readonly id: TableStyle; readonly name: string }[] = [
  { id: "tavern", name: "Tavern oak" },
  { id: "felt", name: "Felt gaming table" },
  { id: "mat", name: "Play mat on a workbench" },
];

/** The main menu's four looks, all with the same choices. */
export type MenuStyle = "war-table" | "atlas" | "banner-hall" | "hex-command";
export const MENU_STYLES: readonly { readonly id: MenuStyle; readonly name: string }[] = [
  { id: "war-table", name: "War Table" },
  { id: "atlas", name: "Atlas" },
  { id: "banner-hall", name: "Banner Hall" },
  { id: "hex-command", name: "Hex Command" },
];

const KEY = "aoh.display";
const DEFAULTS: DisplaySettings = {
  figures: "models",
  scheme: "faction",
  menu: "war-table",
  table: "tavern",
  tiles: "detailed",
  dice: "scene",
  graphics: "high",
  autoPan: true,
  autoRotate: true,
  autoZoom: true,
  music: true,
  musicVolume: 0.6,
  sounds: true,
  soundsVolume: 0.7,
};

function load(): DisplaySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DisplaySettings>;
    return {
      figures: saved.figures === "tokens" ? "tokens" : "models",
      scheme: COLOR_SCHEMES.some((s) => s.id === saved.scheme) ? saved.scheme! : DEFAULTS.scheme,
      menu: MENU_STYLES.some((m) => m.id === saved.menu) ? saved.menu! : DEFAULTS.menu,
      table: TABLE_STYLES.some((t) => t.id === saved.table) ? saved.table! : DEFAULTS.table,
      tiles: saved.tiles === "classic" ? "classic" : "detailed",
      dice: DICE_SHOWS.some((d) => d.id === saved.dice) ? saved.dice! : DEFAULTS.dice,
      graphics: saved.graphics === "low" ? "low" : "high",
      autoPan: saved.autoPan !== false,
      autoRotate: saved.autoRotate !== false,
      autoZoom: saved.autoZoom !== false,
      music: saved.music !== false,
      musicVolume:
        typeof saved.musicVolume === "number" && saved.musicVolume >= 0 && saved.musicVolume <= 1 ? saved.musicVolume : DEFAULTS.musicVolume,
      sounds: saved.sounds !== false,
      soundsVolume:
        typeof saved.soundsVolume === "number" && saved.soundsVolume >= 0 && saved.soundsVolume <= 1 ? saved.soundsVolume : DEFAULTS.soundsVolume,
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
const listeners = new Set<() => void>();

export function setDisplay(change: Partial<DisplaySettings>): void {
  settings = { ...settings, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Kept for this visit only.
  }
  for (const l of listeners) l();
}

/** Switches the board between figure models and tokens (the T key on the play screen). */
export function toggleFigures(): void {
  setDisplay({ figures: settings.figures === "models" ? "tokens" : "models" });
}

/** Switches between the detailed and the classic look (the B key on the play screen). */
export function toggleTiles(): void {
  setDisplay({ tiles: settings.tiles === "detailed" ? "classic" : "detailed" });
}

/** The settings now, for code outside React (the music player). */
export function getDisplay(): DisplaySettings {
  return settings;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDisplay(): DisplaySettings {
  return useSyncExternalStore(subscribe, () => settings);
}

/**
 * The graphics quality this screen draws with: the player's choice, except that browser tests
 * always draw at low, so they stay quick without a graphics card, unless a test asks for high
 * (`window.__aohHighGraphics`, the graphics test).
 */
export function useGraphics(): GraphicsQuality {
  const chosen = useDisplay().graphics;
  if (TEST_MODE && !(typeof window !== "undefined" && window.__aohHighGraphics === true)) return "low";
  return chosen;
}

