import { describe, expect, it } from "vitest";
import { applyCommand, attackProblem, attackTargets, createGame, type GameState, type RulesContext } from "../src";
import { CARDS, apply, makeCtx, rowMap, setup, turnState, withOutcome } from "./fixtures";

const at = (q: number, elevation = 1) => ({ q, r: 0, elevation });
const flat = (n: number): [string, number][] => Array.from({ length: n }, () => ["grass", 1]);

function duel(
  columns: [string, number][],
  positions: Record<string, { q: number; r: number; elevation: number }>,
  activeUnit = "p1:0",
  mode: "basic" | "advanced" = "basic",
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(rowMap(columns), CARDS);
  const base = createGame(setup(2, { mapId: "test-row", mode }), ctx).state;
  return { ctx, state: turnState(base, activeUnit, positions) };
}

const attackCmd = (figureId: string, targetId: string, player = "p1") =>
  ({ type: "attack", player, figureId, targetId }) as const;

describe("attacks", () => {
  it("needs the target within range", () => {
    const { ctx, state } = duel(flat(8), { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(2) });
    expect(attackTargets(state, "p1:0#1", ctx)).toEqual(["p2:0#1"]);
    expect(attackProblem(state, "p1:0#1", "p2:1#1", ctx)).toMatch(/range/);
  });

  it("needs line of sight", () => {
    const { ctx, state } = duel([["grass", 1], ["rock", 12], ["grass", 1], ["grass", 1]], {
      "p1:1#1": at(0),
      "p2:0#1": at(2),
    }, "p1:1");
    expect(attackProblem(state, "p1:1#1", "p2:0#1", ctx)).toMatch(/line of sight/);
  });

  it("cannot target friends or attack twice", () => {
    const { ctx, state } = duel(flat(4), { "p1:0#1": at(0), "p1:1#1": at(1), "p2:0#1": at(1) });
    expect(attackProblem(state, "p1:0#1", "p1:1#1", ctx)).toMatch(/own/);
    const r = withOutcome(state, attackCmd("p1:0#1", "p2:0#1"), ctx, () => true);
    expect(applyCommand(r.state, attackCmd("p1:0#1", "p2:0#1"), ctx).ok).toBe(false);
  });

  it("destroys on any wound in the Basic game", () => {
    const { ctx, state } = duel(flat(4), { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(3) });
    const r = withOutcome(state, attackCmd("p1:0#1", "p2:0#1"), ctx, (ev) =>
      ev.some((e) => e.type === "attackRolled" && e.wounds === 1),
    );
    expect(r.events.some((e) => e.type === "figureDestroyed" && e.figureId === "p2:0#1")).toBe(true);
    expect(r.state.units.find((u) => u.id === "p2:0")!.figures[0]!.position).toBeNull();
  });

  it("only destroys when wounds reach Life in the Advanced game", () => {
    const { ctx, state } = duel(flat(4), { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(3) }, "p1:0", "advanced");
    const r = withOutcome(state, attackCmd("p1:0#1", "p2:0#1"), ctx, (ev) =>
      ev.some((e) => e.type === "attackRolled" && e.wounds === 2),
    );
    const target = r.state.units.find((u) => u.id === "p2:0")!.figures[0]!;
    expect(target).toMatchObject({ wounds: 2, destroyed: false });
  });

  it("ends the game when the last enemy figure falls", () => {
    const { ctx, state } = duel(flat(3), { "p1:0#1": at(0), "p2:0#1": at(1) });
    // p2's squad never deployed in this test state, so mark it destroyed.
    for (const f of state.units.find((u) => u.id === "p2:1")!.figures) f.destroyed = true;
    const r = withOutcome(state, attackCmd("p1:0#1", "p2:0#1"), ctx, (ev) => ev.some((e) => e.type === "figureDestroyed"));
    expect(r.state.phase).toBe("gameOver");
    expect(r.state.result).toMatchObject({ winners: ["p1"], reason: "elimination" });
  });

  it("lets squad figures move and attack in any order, but each moves before its own attack", () => {
    const { ctx, state } = duel(flat(8), { "p1:1#1": at(0), "p1:1#2": at(1), "p2:0#1": at(4) }, "p1:1");
    const shot = withOutcome(state, attackCmd("p1:1#1", "p2:0#1"), ctx, (ev) =>
      ev.some((e) => e.type === "attackRolled" && e.wounds === 0),
    ).state;
    // The second figure can still move after its squadmate attacked.
    const moved = apply(shot, { type: "move", player: "p1", figureId: "p1:1#2", path: [{ hex: { q: 2, r: 0 }, elevation: 1 }] }, ctx);
    expect(moved.state.active!.moved).toEqual(["p1:1#2"]);
  });
});

describe("swamp", () => {
  it("rolls 1 attack die with no defense against figures ending a turn there", () => {
    const { ctx, state } = duel([["swamp", 1], ["grass", 1], ["grass", 1]], { "p1:0#1": at(0), "p2:0#1": at(2) });
    const hurt = withOutcome(state, { type: "endTurn", player: "p1" }, ctx, (ev) =>
      ev.some((e) => e.type === "attackRolled" && e.source === "swamp" && e.wounds === 1),
    );
    const roll = hurt.events.find((e) => e.type === "attackRolled")!;
    expect(roll).toMatchObject({ attackerId: null, targetId: "p1:0#1", defense: [] });
    expect(hurt.events.some((e) => e.type === "figureDestroyed" && e.cause === "swamp")).toBe(true);
  });

  it("does nothing to figures elsewhere", () => {
    const { ctx, state } = duel([["grass", 1], ["swamp", 1], ["grass", 1]], { "p1:0#1": at(0), "p2:0#1": at(2) });
    const r = apply(state, { type: "endTurn", player: "p1" }, ctx);
    expect(r.events.some((e) => e.type === "attackRolled")).toBe(false);
  });
});
