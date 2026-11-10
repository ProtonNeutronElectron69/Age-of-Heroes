import type { UnitCard } from "@aoh/rules";
import { footprintSize } from "@aoh/rules";

/**
 * A simple, exact model of how strong a unit is in the Advanced game, used to
 * set and check point costs. It uses dice probabilities (no randomness):
 *
 * - Offense: expected wounds per attack against an average defender
 *   (3 defense dice), boosted for longer range.
 * - Durability: expected number of average attacks (3 attack dice) needed to
 *   destroy the figure.
 * - A figure's value is the geometric mean of the two, adjusted for Move and
 *   abilities; a unit's value is its figures' total.
 *
 * Point costs should be roughly proportional to value. The model ignores the
 * map and tactics, so it is a sanity check, not the final word.
 */

const REFERENCE_DEFENSE = 3;
const REFERENCE_ATTACK = 3;

/** Rough worth of each ability as a multiplier on the unit's value. */
export const ABILITY_VALUE: Readonly<Record<string, number>> = {
  flying: 1.25,
  trample: 1.1,
  "smoke-step": 1.1,
  "massed-volley": 1.15,
  // Support abilities help other figures, so they are worth more than their holder's own stats suggest.
  "grove-song": 1.45,
  "rally-the-line": 1.25,
  "deflector-field": 1.2,
  "hidden-in-the-leaves": 1.1,
  "moss-armor": 1.05,
  brace: 1.1,
  "answering-blade": 1.1,
  "thick-hide": 1.1,
  "salvage-protocol": 1.15,
  "field-dressing": 1.35,
  "ember-spit": 1.2,
  "mortar-barrage": 1.2,
  "lantern-gaze": 1.55,
};

function binomial(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(exactly k successes in n dice) with a 1/2 chance per die (3 of 6 faces). */
function successes(n: number, k: number): number {
  return binomial(n, k) / 2 ** n;
}

/** Probability of each number of wounds (index = wounds) for one attack. */
export function woundDistribution(attackDice: number, defenseDice: number): number[] {
  const dist = Array.from({ length: attackDice + 1 }, () => 0);
  for (let h = 0; h <= attackDice; h++) {
    for (let b = 0; b <= defenseDice; b++) {
      dist[Math.max(0, h - b)]! += successes(attackDice, h) * successes(defenseDice, b);
    }
  }
  return dist;
}

export function expectedWounds(attackDice: number, defenseDice: number): number {
  return woundDistribution(attackDice, defenseDice).reduce((sum, p, w) => sum + p * w, 0);
}

export interface UnitValue {
  readonly offense: number;
  readonly durability: number;
  readonly mobility: number;
  readonly abilities: number;
  readonly value: number;
}

export function unitValue(card: UnitCard): UnitValue {
  const a = card.advanced;
  const offense = expectedWounds(a.attack, REFERENCE_DEFENSE) * (1 + 0.08 * Math.min(a.range - 1, 7));
  const durability = a.life / Math.max(0.05, expectedWounds(REFERENCE_ATTACK, a.defense));
  const mobility = (1 + 0.07 * (a.move - 5)) * (footprintSize(card.footprint) > 1 ? 0.95 : 1);
  const abilities = a.abilities.reduce((m, ab) => m * (ABILITY_VALUE[ab.id] ?? 1.1), 1);
  const value = card.figureCount * Math.sqrt(offense * durability) * mobility * abilities;
  return { offense, durability, mobility, abilities, value };
}

export interface BalanceRow {
  readonly card: UnitCard;
  readonly value: number;
  /** What the model says the unit should cost, on the roster's own scale. */
  readonly fair: number;
  /** Actual points divided by fair points. */
  readonly ratio: number;
}

/** Compare every card's points with the model, scaled so the roster's total is unchanged. */
export function balanceReport(cards: readonly UnitCard[]): BalanceRow[] {
  const values = cards.map((c) => unitValue(c).value);
  const scale = cards.reduce((s, c) => s + c.advanced.points, 0) / values.reduce((s, v) => s + v, 0);
  return cards.map((card, i) => {
    const fair = values[i]! * scale;
    return { card, value: values[i]!, fair, ratio: card.advanced.points / fair };
  });
}

/** A plain-text table of the report. */
export function formatBalanceReport(rows: readonly BalanceRow[]): string {
  const lines = ["Unit                              Points   Fair   Ratio"];
  for (const r of [...rows].sort((a, b) => b.ratio - a.ratio)) {
    lines.push(
      `${r.card.name.padEnd(34)}${String(r.card.advanced.points).padStart(6)}${Math.round(r.fair)
        .toString()
        .padStart(7)}${r.ratio.toFixed(2).padStart(8)}`,
    );
  }
  return lines.join("\n");
}
