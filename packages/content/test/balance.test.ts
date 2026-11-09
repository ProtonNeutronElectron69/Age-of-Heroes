import { describe, expect, it } from "vitest";
import { CARDS, balanceReport, expectedWounds, formatBalanceReport, woundDistribution } from "../src";

describe("dice math", () => {
  it("gives a proper probability distribution", () => {
    for (const [a, d] of [
      [1, 0],
      [3, 3],
      [5, 2],
    ] as const) {
      const dist = woundDistribution(a, d);
      expect(dist.reduce((s, p) => s + p, 0)).toBeCloseTo(1, 10);
    }
  });

  it("matches hand-worked values", () => {
    expect(expectedWounds(1, 0)).toBeCloseTo(0.5, 10);
    expect(expectedWounds(2, 0)).toBeCloseTo(1, 10);
    // 1 attack die vs 1 defense die: wound only on skull + blank = 1/4.
    expect(expectedWounds(1, 1)).toBeCloseTo(0.25, 10);
  });
});

describe("point costs", () => {
  it("are within 30% of what the balance model suggests for every unit", () => {
    const rows = balanceReport(CARDS);
    // Print the table with BALANCE_REPORT=1 (this package has no Node types, hence globalThis).
    const host = globalThis as { process?: { env?: Record<string, string | undefined> }; console?: { log: (s: string) => void } };
    if (host.process?.env?.BALANCE_REPORT) host.console?.log(formatBalanceReport(rows));
    for (const r of rows) {
      expect(r.ratio, `${r.card.name}: ${r.card.advanced.points} points, model says ${Math.round(r.fair)}`).toBeGreaterThan(0.7);
      expect(r.ratio, `${r.card.name}: ${r.card.advanced.points} points, model says ${Math.round(r.fair)}`).toBeLessThan(1.3);
    }
  });
});
