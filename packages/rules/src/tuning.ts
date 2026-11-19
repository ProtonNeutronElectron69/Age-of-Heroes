/**
 * Rule numbers that playtesting may change. The engine uses these defaults
 * unless the rules context supplies its own (see @aoh/content).
 */
export interface Tuning {
  /** Falling: a drop of at least the figure's Height rolls `minorDice`; at least double its Height rolls `majorDice`. */
  readonly falling: { readonly minorDice: number; readonly majorDice: number };
  /** Attack dice each engaged enemy rolls when a figure walks away from it. */
  readonly passingStrikeDice: number;
  /** Extra dice for higher ground, and the further extra when the difference is at least the lower figure's Height. */
  readonly elevationBonus: { readonly higher: number; readonly extreme: number };
  /** Extra attack dice for a melee attack from behind the defender (games with facing). */
  readonly behindBonus?: number;
  /** How many levels the hexes of a multi-hex figure may differ by. */
  readonly maxStraddle: number;
  /**
   * Maps whose start zones grow: the most hexes of figures an army may draft. Zones
   * grow at deployment to fit what was drafted (default 40).
   */
  readonly grownZoneSize?: number;
  /** Glyph numbers (defaults in `DEFAULT_GLYPHS`). */
  readonly glyphs?: GlyphTuning;
}

export interface GlyphTuning {
  /** What each stat glyph adds while its card lives. Initiative is added to its player's initiative rolls. */
  readonly attack: number;
  readonly defense: number;
  readonly initiative: number;
  readonly range: number;
  readonly move: number;
  /** Wounds the pit trap deals to the figure that picks it up. */
  readonly pitWounds: number;
  /** How many of its player's turns a cursed figure survives after the one it was cursed in. */
  readonly curseTurns: number;
  /** How far from another of the player's figures a summoned unit may be placed, in hexes. */
  readonly summonRange: number;
}

export const DEFAULT_GLYPHS: GlyphTuning = { attack: 1, defense: 1, initiative: 8, range: 3, move: 2, pitWounds: 1, curseTurns: 2, summonRange: 3 };

export const DEFAULT_TUNING: Tuning = {
  falling: { minorDice: 2, majorDice: 4 },
  passingStrikeDice: 1,
  elevationBonus: { higher: 1, extreme: 1 },
  behindBonus: 2,
  maxStraddle: 1,
  grownZoneSize: 40,
  glyphs: DEFAULT_GLYPHS,
};
