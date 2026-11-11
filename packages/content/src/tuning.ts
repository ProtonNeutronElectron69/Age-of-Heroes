import type { Tuning } from "@aoh/rules";

/** Rule numbers tuned by playtesting. See docs/RULES.md for what each one does. */
export const TUNING: Tuning = {
  falling: { minorDice: 2, majorDice: 4 },
  passingStrikeDice: 1,
  elevationBonus: { higher: 1, extreme: 1 },
  maxStraddle: 1,
  // Maps whose start zones grow: the most hexes of figures one army may draft (a 600-point army of
  // 4-figure squads needs 32).
  grownZoneSize: 40,
};
