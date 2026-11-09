import type { Tuning } from "@aoh/rules";

/** Rule numbers tuned by playtesting. See docs/RULES.md for what each one does. */
export const TUNING: Tuning = {
  falling: { minorDice: 2, majorDice: 4 },
  passingStrikeDice: 1,
  elevationBonus: { higher: 1, extreme: 1 },
  maxStraddle: 1,
};
