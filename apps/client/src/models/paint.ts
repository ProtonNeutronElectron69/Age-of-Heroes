import { Color } from "three";
import { MODEL_GREY, type ColorScheme } from "./colors";

/**
 * What a part of a detailed figure is painted as. `coat` is the main colour: a uniform, armour,
 * scales or fur take the scheme's model colour (faction or player), so an army still reads at a
 * glance. The rest are natural colours, or shades of the main one.
 */
export type Paint =
  | "coat" | "facing" | "skin" | "hair" | "powder" | "hat" | "gold" | "steel" | "wood"
  | "leather" | "boot" | "white" | "black" | "sash" | "glove" | "blanket" | "eye"
  | "lacquer" | "lace" | "hakama" | "tabi" | "kimono" | "obi"
  | "fur" | "stripe" | "mane" | "belly" | "horn" | "glow" | "glowGreen" | "leaf" | "wing" | "wingbone"
  | "bone" | "ironDark" | "mail" | "pelt" | "beard" | "hairLight" | "machine" | "glowCyan" | "coatDark" | "tunic"
  | "bark" | "moss" | "straw";

export interface PaintLook {
  readonly color: string;
  readonly metalness: number;
  readonly roughness: number;
  /** It gives off its own light: eyes, fire. */
  readonly glow: boolean;
}

/** Whose figure it is and how it is coloured. `main` is the scheme's model colour (`figureColors`). */
export interface PaintContext {
  readonly scheme: ColorScheme;
  readonly main: string;
  readonly faction: string;
}

const blend = (a: string, b: string, t: number) => `#${new Color(a).lerp(new Color(b), t).getHexString()}`;
const look = (color: string, roughness = 0.7, metalness = 0, glow = false): PaintLook => ({ color, roughness, metalness, glow });

/** The colour and finish of one paint. In the grey scheme every part is grey, like an unpainted miniature. */
export function paintLook(p: Paint, { scheme, main, faction }: PaintContext): PaintLook {
  if (scheme === "grey") return look(MODEL_GREY);
  switch (p) {
    case "coat": return look(main);
    // The Concord's red facings show on a blue coat; on a player's colour, buff ones.
    case "facing": return look(faction === "Iron Concord" && scheme === "faction" ? "#a8322b" : "#e8e0c8");
    case "skin": return look("#d9a988");
    case "hair": return look("#2a1f19");
    case "powder": return look("#d6d2c8");
    case "hat": return look("#1d1d22");
    case "gold": return look("#e0b85a", 0.4, 0.25);
    case "steel": return look("#c8d0d8", 0.3, 0.3);
    // House Kagero's spear shafts are lacquered.
    case "wood": return faction === "House Kagero" ? look("#4a2016", 0.4) : look("#7a4a28");
    case "leather": return look("#6d4a2c");
    case "boot": return look("#1f1a17", 0.4);
    case "white": return look("#ece8de");
    case "black": return look("#1c1c1f", 0.45);
    case "sash": return look("#b22a2a");
    case "glove": return look("#eae4d4");
    case "blanket": return look("#7c8798");
    case "eye": return look("#141414");
    case "lacquer": return look("#18181b", 0.3);
    case "lace": return look("#ecdcae");
    case "hakama": return look("#2e3240");
    case "tabi": return look("#efece4");
    case "kimono": return look("#3d2b33");
    case "obi": return look("#d4a94e", 0.5);
    case "fur": return look(blend(main, "#6b5a48", 0.45));
    case "stripe": return look(blend(main, "#000000", 0.6));
    case "mane": return look(blend(main, "#3b2f26", 0.55));
    case "belly": return look("#e3cf9e");
    case "horn": return look("#e8dfc6", 0.5);
    case "glow": return look("#ffb02e", 0.7, 0, true);
    case "glowGreen": return look("#c8ff5a", 0.7, 0, true);
    case "leaf": return look("#5d9a3c");
    case "wing": return look("#c0612a", 0.6);
    case "wingbone": return look(blend(main, "#000000", 0.35));
    case "bone": return look("#d8ceb0", 0.6);
    case "ironDark": return look("#4a4d52", 0.45, 0.2);
    case "mail": return look("#8d939b", 0.4, 0.25);
    case "pelt": return look("#8a6a4a");
    case "beard": return look("#9a5a2a");
    case "hairLight": return look("#d9c27a");
    case "machine": return look("#3c4149", 0.45, 0.15);
    case "glowCyan": return look("#5ff0ff", 0.7, 0, true);
    // A darker shade of the main colour: a cloak or a lining.
    case "coatDark": return look(blend(main, "#000000", 0.4));
    // A tunic under a cloak: the main colour turned towards a woodland brown.
    case "tunic": return look(blend(main, "#5a4a30", 0.5));
    case "bark": return look("#5e4834", 0.8);
    // Moss on bark: the main colour turned towards a moss green.
    case "moss": return look(blend(main, "#55762f", 0.55), 0.85);
    case "straw": return look("#c9a865", 0.75);
  }
}
