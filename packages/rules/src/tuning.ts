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
  /** How many levels the hexes of a multi-hex figure may differ by. */
  readonly maxStraddle: number;
}

export const DEFAULT_TUNING: Tuning = {
  falling: { minorDice: 2, majorDice: 4 },
  passingStrikeDice: 1,
  elevationBonus: { higher: 1, extreme: 1 },
  maxStraddle: 1,
};
