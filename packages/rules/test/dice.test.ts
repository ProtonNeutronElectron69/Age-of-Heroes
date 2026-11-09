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
