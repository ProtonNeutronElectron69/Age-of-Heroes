import { DEFAULT_GLYPHS, type GlyphKind, type GlyphTuning } from "@aoh/rules";
import { TUNING } from "./tuning";

/** How each glyph looks and is called. What it does is in the rules; the numbers are in TUNING. */
export interface GlyphInfo {
  readonly kind: GlyphKind;
  readonly name: string;
  /** Its colour on the board once known, and in the held glyphs panel. */
  readonly color: string;
  /** A one-letter mark for the tile and the panel until art exists. */
  readonly mark: string;
}

export const GLYPHS: Readonly<Record<GlyphKind, GlyphInfo>> = {
  attack: { kind: "attack", name: "Glyph of Fury", color: "#c0392b", mark: "A" },
  defense: { kind: "defense", name: "Glyph of the Bulwark", color: "#2e6fb5", mark: "D" },
  initiative: { kind: "initiative", name: "Glyph of the Herald", color: "#d4a017", mark: "I" },
  range: { kind: "range", name: "Glyph of the Hawk", color: "#3b9c9c", mark: "R" },
  move: { kind: "move", name: "Glyph of the Stag", color: "#5a9e3c", mark: "M" },
  heal: { kind: "heal", name: "Glyph of Mending", color: "#7cc576", mark: "H" },
  summon: { kind: "summon", name: "Glyph of Resurrection", color: "#e08a2c", mark: "S" },
  wound: { kind: "wound", name: "Glyph of Blight", color: "#8e44ad", mark: "W" },
  negate: { kind: "negate", name: "Glyph of Undoing", color: "#9aa3ad", mark: "N" },
  pit: { kind: "pit", name: "Glyph of the Pit", color: "#6b4f32", mark: "P" },
  curse: { kind: "curse", name: "Glyph of Doom", color: "#3a1f3f", mark: "C" },
};

/** What a glyph does, in plain words, with the tuned numbers. */
export function glyphEffect(kind: GlyphKind, t: GlyphTuning = TUNING.glyphs ?? DEFAULT_GLYPHS): string {
  switch (kind) {
    case "attack":
      return `+${t.attack} attack die for one of your units until it is destroyed.`;
    case "defense":
      return `+${t.defense} defense die for one of your units until it is destroyed.`;
    case "initiative":
      return `+${t.initiative} to your next initiative roll, rerolls included, then it is spent. Lost if the unit you put it on is destroyed first.`;
    case "range":
      return `+${t.range} range for normal attacks, until it is destroyed, for one of your units with a Range above 1.`;
    case "move":
      return `+${t.move} move for one of your units until it is destroyed.`;
    case "heal":
      return "Heals every wound on one of your units.";
    case "summon":
      return `Resurrects one of your destroyed units, unwounded, each figure on a free spot within ${t.summonRange} hexes of another of your figures.`;
    case "wound":
      return "An enemy squad takes a wound on every figure; an enemy hero loses half the Life it has left (at least 1).";
    case "negate":
      return "Cancels the stat glyph on one enemy unit.";
    case "pit":
      return `A trap: the figure that picks it up takes ${t.pitWounds} ${t.pitWounds === 1 ? "wound" : "wounds"}.`;
    case "curse":
      return `A trap: the figure that picks it up is destroyed at the end of its player's turn ${t.curseTurns} turns later.`;
  }
}
