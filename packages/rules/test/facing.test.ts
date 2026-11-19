import { describe, expect, it } from "vitest";
import { applyCommand, attackDice, attackProblem, createGame, hex, type GameState, type RulesContext } from "../src";
import { CARDS, apply, ctx, deployAll, makeCtx, rowMap, setup, turnState } from "./fixtures";

const at = (q: number, r = 1, elevation = 1) => ({ q, r, elevation });
const step = (q: number, r = 1, elevation = 1) => ({ hex: hex(q, r), elevation });

/** A turn of `unitId` in a game with facing, figures where given, facing as given (degrees). */
function game(
  unitId: string,
  positions: Record<string, { q: number; r: number; elevation: number }>,
  facings: Record<string, number> = {},
  c: RulesContext = ctx,
  facing = true,
): GameState {
  const base = createGame(setup(2, { facing, mapId: c.board.id }), c).state;
  const s = turnState(base, unitId, positions);
  for (const u of s.units) for (const f of u.figures) if (facings[f.id] !== undefined) f.facing = facings[f.id];
  return s;
}
const facingOf = (s: GameState, id: string) => s.units.flatMap((u) => u.figures).find((f) => f.id === id)!.facing;

describe("facing", () => {
  it("is set at deployment, towards the middle of the battlefield, in eighths", () => {
    const { state } = deployAll(createGame(setup(2, { facing: true }), ctx).state);
    for (const u of state.units) {
      for (const f of u.figures) {
        expect(f.facing! % 45).toBe(0);
        // Player 1 starts in the west and faces east-ish; player 2 the other way.
        if (u.owner === "p1") expect(f.facing).toBeGreaterThan(0);
        if (u.owner === "p1") expect(f.facing).toBeLessThan(180);
        if (u.owner === "p2") expect(f.facing).toBeGreaterThan(180);
      }
    }
  });

  it("is left out of games without the rule", () => {
    const { state } = deployAll(createGame(setup(2), ctx).state);
    expect(state.units.flatMap((u) => u.figures).every((f) => f.facing === undefined)).toBe(true);
    const s = game("p1:0", { "p1:0#1": at(2) }, {}, ctx, false);
    const moved = apply(s, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3)] }).state;
    expect(facingOf(moved, "p1:0#1")).toBeUndefined();
    const r = applyCommand(moved, { type: "face", player: "p1", figureId: "p1:0#1", facing: 90 }, ctx);
    expect(r.ok ? null : r.error).toBe("This game has no facing");
  });

  it("follows the last step of a move, snapped to the nearest eighth", () => {
    const s = game("p1:0", { "p1:0#1": at(2) }, { "p1:0#1": 270 });
    const east = apply(s, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3)] }).state;
    expect(facingOf(east, "p1:0#1")).toBe(90);
    // East, then down a row (+r): that last step bears 30 degrees, which snaps to 45.
    const turned = apply(s, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3), step(3, 2)] }).state;
    expect(facingOf(turned, "p1:0#1")).toBe(45);
  });

  it("can be turned after a move, in eighths, until the figure attacks", () => {
    const s = game("p1:0", { "p1:0#1": at(2), "p2:0#1": at(5) });
    const refuse = (state: GameState, facing: number, figureId = "p1:0#1") => {
      const r = applyCommand(state, { type: "face", player: "p1", figureId, facing }, ctx);
      return r.ok ? null : r.error;
    };
    expect(refuse(s, 180)).toMatch(/only after it moves/);

    const moved = apply(s, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3), step(4)] }).state;
    expect(refuse(moved, 30)).toMatch(/eight directions/);
    const r = apply(moved, { type: "face", player: "p1", figureId: "p1:0#1", facing: 225 });
    expect(r.events).toEqual([{ type: "figureFaced", figureId: "p1:0#1", facing: 225 }]);
    expect(facingOf(r.state, "p1:0#1")).toBe(225);
    // Turning again is fine; attacking ends it.
    const again = apply(r.state, { type: "face", player: "p1", figureId: "p1:0#1", facing: 90 }).state;
    const struck = apply(again, { type: "attack", player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" }).state;
    expect(refuse(struck, 180)).toMatch(/not once it has attacked/);
    // Only the active player's figures turn.
    const theirs = applyCommand(moved, { type: "face", player: "p2", figureId: "p2:0#1", facing: 0 }, ctx);
    expect(theirs.ok ? null : theirs.error).toBe("It is not your turn");
  });

  it("needs a ranged target in front, the side line included; melee strikes any side", () => {
    // The squad (range 6) at q2 and the enemy hero three hexes east of it.
    const facing = (deg: number) => game("p1:1", { "p1:1#1": at(2), "p2:0#1": at(5) }, { "p1:1#1": deg });
    expect(attackProblem(facing(90), "p1:1#1", "p2:0#1", ctx)).toBeNull();
    expect(attackProblem(facing(0), "p1:1#1", "p2:0#1", ctx)).toBeNull();
    expect(attackProblem(facing(270), "p1:1#1", "p2:0#1", ctx)).toBe("Out of view: a ranged attack needs the target in front");
    // Without the rule, facing is ignored.
    const old = game("p1:1", { "p1:1#1": at(2), "p2:0#1": at(5) }, { "p1:1#1": 270 }, ctx, false);
    expect(attackProblem(old, "p1:1#1", "p2:0#1", ctx)).toBeNull();
    // A melee attack does not need to face its target.
    const melee = game("p1:0", { "p1:0#1": at(4), "p2:0#1": at(5) }, { "p1:0#1": 270 });
    expect(attackProblem(melee, "p1:0#1", "p2:0#1", ctx)).toBeNull();
  });

  it("gives a melee attack from behind 2 more attack dice", () => {
    // The hero at q4 attacks the enemy hero at q5 from the west.
    const dice = (deg: number) => attackDice(game("p1:0", { "p1:0#1": at(4), "p2:0#1": at(5) }, { "p2:0#1": deg }), "p1:0#1", "p2:0#1", ctx);
    expect(dice(90)).toMatchObject({ attack: 5, attackBonus: 2 });
    expect(dice(90).notes).toContain("From behind +2 attack");
    expect(dice(270)).toMatchObject({ attack: 3, attackBonus: 0 });
    // Side on: the attacker is on the edge of the cone, which counts as in view.
    expect(dice(0)).toMatchObject({ attack: 3, attackBonus: 0 });
    expect(dice(135)).toMatchObject({ attack: 5 });
  });

  it("does not give a ranged attack the bonus", () => {
    const s = game("p1:1", { "p1:1#1": at(2), "p2:0#1": at(5) }, { "p1:1#1": 90, "p2:0#1": 90 });
    expect(attackDice(s, "p1:1#1", "p2:0#1", ctx)).toMatchObject({ attack: 2, attackBonus: 0 });
  });

  it("adds to the higher-ground bonus", () => {
    const c = makeCtx(rowMap([["grass", 2], ["grass", 1], ["grass", 1]]), CARDS);
    const s = game("p1:0", { "p1:0#1": { q: 0, r: 0, elevation: 2 }, "p2:0#1": { q: 1, r: 0, elevation: 1 } }, { "p2:0#1": 90 }, c);
    const d = attackDice(s, "p1:0#1", "p2:0#1", c);
    expect(d).toMatchObject({ attack: 6, attackBonus: 3 });
    expect(d.notes).toEqual(expect.arrayContaining(["Higher ground +1 attack", "From behind +2 attack"]));
  });
});
