import { describe, expect, it } from "vitest";
import { ATTACK_DIE, DEFENSE_DIE, Rng, countFaces, rollCombat, rollDice, seedFromString } from "../src";

describe("rng", () => {
  it("is deterministic for a seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const xs = Array.from({ length: 20 }, () => a.d20());
    const ys = Array.from({ length: 20 }, () => b.d20());
    expect(xs).toEqual(ys);
  });

  it("resumes from saved state", () => {
    const a = new Rng(7);
    a.float();
    a.float();
    const b = new Rng(a.state);
    expect(b.float()).toBe(a.float());
  });

  it("stays in range and covers every face", () => {
    const rng = new Rng(seedFromString("range"));
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.d20();
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(20);
      seen.add(v);
    }
    expect(seen.size).toBe(20);
  });
});

describe("dice", () => {
  it("rolls fairly: about half skulls, half shields, and every d20 face about as often", () => {
    const rng = new Rng(seedFromString("fair"));
    const n = 60000;
    // With 60,000 dice the share of marks lands within 1% of a half almost always (over 4 standard deviations).
    expect(Math.abs(countFaces(rollDice(rng, ATTACK_DIE, n), "skull") / n - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(countFaces(rollDice(rng, DEFENSE_DIE, n), "shield") / n - 0.5)).toBeLessThan(0.01);
    // The first die of games started from neighbouring seeds is fair too.
    let skulls = 0;
    for (let seed = 1; seed <= n; seed++) if (rollDice(new Rng(seed), ATTACK_DIE, 1)[0] === "skull") skulls++;
    expect(Math.abs(skulls / n - 0.5)).toBeLessThan(0.01);
    const d20 = new Array(21).fill(0);
    for (let i = 0; i < n; i++) d20[rng.d20()]++;
    for (let face = 1; face <= 20; face++) expect(Math.abs(d20[face] / n - 0.05)).toBeLessThan(0.006);
  });

  it("uses 3 skulls / 3 blanks and 3 shields / 3 blanks", () => {
    expect(countFaces(ATTACK_DIE.faces, "skull")).toBe(3);
    expect(countFaces(ATTACK_DIE.faces, "blank")).toBe(3);
    expect(countFaces(DEFENSE_DIE.faces, "shield")).toBe(3);
    expect(countFaces(DEFENSE_DIE.faces, "blank")).toBe(3);
  });

  it("rolls roughly half skulls over many dice", () => {
    const faces = rollDice(new Rng(99), ATTACK_DIE, 6000);
    const skulls = countFaces(faces, "skull");
    expect(skulls / 6000).toBeGreaterThan(0.46);
    expect(skulls / 6000).toBeLessThan(0.54);
  });

  it("turns excess skulls into wounds, never negative", () => {
    const rng = new Rng(5);
    for (let i = 0; i < 200; i++) {
      const roll = rollCombat(rng, 4, 3);
      expect(roll.attack).toHaveLength(4);
      expect(roll.defense).toHaveLength(3);
      expect(roll.wounds).toBe(Math.max(0, roll.hits - roll.blocks));
    }
    expect(rollCombat(rng, 2, 0).defense).toHaveLength(0);
  });
});
