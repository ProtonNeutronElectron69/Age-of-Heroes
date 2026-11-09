import { describe, expect, it } from "vitest";
import {
  DEFAULT_TUNING,
  applyCommand,
  attackProblem,
  createGame,
  elevationBonus,
  hex,
  moveOptions,
  placementKey,
  type GameEvent,
  type GameState,
  type RulesContext,
} from "../src";
import { CARDS, apply, ctx as fieldCtx, makeCtx, rowMap, setup, turnState, withOutcome } from "./fixtures";

const at = (q: number, elevation = 1) => ({ q, r: 0, elevation });
const step = (q: number, elevation = 1) => ({ hex: hex(q, 0), elevation });
const flat = (n: number): [string, number][] => Array.from({ length: n }, () => ["grass", 1]);

function game(
  columns: [string, number][],
  positions: Record<string, { q: number; r: number; elevation: number }>,
  activeUnit = "p1:0",
  mode: "basic" | "advanced" = "advanced",
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(rowMap(columns), CARDS);
  const base = createGame(setup(2, { mapId: "test-row", mode }), ctx).state;
  return { ctx, state: turnState(base, activeUnit, positions) };
}

const rolls = (events: GameEvent[], source: string) =>
  events.filter((e): e is Extract<GameEvent, { type: "attackRolled" }> => e.type === "attackRolled" && e.source === source);

describe("falling (Advanced)", () => {
  it("rolls 2 dice for a drop of at least Height, 4 for at least double", () => {
    const small = game([["rock", 7], ["grass", 1]], { "p1:0#1": at(0, 7) });
    const r = apply(small.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, small.ctx);
    expect(rolls(r.events, "fall")[0]).toMatchObject({ defense: [], attackerId: null });
    expect(rolls(r.events, "fall")[0]!.attack).toHaveLength(2);

    const big = game([["rock", 12], ["grass", 1]], { "p1:0#1": at(0, 12) });
    const r2 = apply(big.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, big.ctx);
    expect(rolls(r2.events, "fall")[0]!.attack).toHaveLength(4);
  });

  it("does not happen for short drops or in the Basic game", () => {
    const short = game([["rock", 5], ["grass", 1]], { "p1:0#1": at(0, 5) });
    expect(rolls(apply(short.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, short.ctx).events, "fall")).toHaveLength(0);
    const basic = game([["rock", 12], ["grass", 1]], { "p1:0#1": at(0, 12) }, "p1:0", "basic");
    expect(rolls(apply(basic.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, basic.ctx).events, "fall")).toHaveLength(0);
  });

  it("wounds the figure, and the search counts a fall as a hazard", () => {
    const g = game([["rock", 12], ["grass", 1]], { "p1:0#1": at(0, 12) });
    const r = withOutcome(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx, (ev) =>
      rolls(ev, "fall").some((x) => x.wounds >= 2),
    );
    expect(r.state.units[0]!.figures[0]!.wounds).toBeGreaterThanOrEqual(2);
    expect(moveOptions(g.state, "p1:0#1", g.ctx).get(placementKey(step(1)))!.hazards).toBe(1);
  });
});

describe("engagement and passing strikes (Advanced)", () => {
  it("strikes a figure that walks away from an engaged enemy", () => {
    const g = game(flat(5), { "p1:0#1": at(2), "p2:0#1": at(1) });
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3)] }, g.ctx);
    const strike = rolls(r.events, "passingStrike");
    expect(strike).toHaveLength(1);
    expect(strike[0]).toMatchObject({ attackerId: "p2:0#1", targetId: "p1:0#1", defense: [] });
    expect(strike[0]!.attack).toHaveLength(DEFAULT_TUNING.passingStrikeDice);
    expect(moveOptions(g.state, "p1:0#1", g.ctx).get(placementKey(step(3)))!.hazards).toBe(1);
  });

  it("has no passing strikes in the Basic game", () => {
    const g = game(flat(5), { "p1:0#1": at(2), "p2:0#1": at(1) }, "p1:0", "basic");
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3)] }, g.ctx);
    expect(rolls(r.events, "passingStrike")).toHaveLength(0);
  });

  it("does not engage across a big height difference", () => {
    // p1 stands at the foot of an 8-level cliff with an enemy on top: not engaged, so leaving draws no strike.
    const g = game([["grass", 1], ["grass", 1], ["rock", 8]], { "p1:0#1": at(1), "p2:0#1": at(2, 8) });
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(0)] }, g.ctx);
    expect(rolls(r.events, "passingStrike")).toHaveLength(0);
  });

  it("lets engaged figures attack only the enemies they are engaged with", () => {
    const g = game(flat(6), { "p1:1#1": at(0), "p2:0#1": at(1), "p2:1#1": at(4) }, "p1:1");
    expect(attackProblem(g.state, "p1:1#1", "p2:1#1", g.ctx)).toMatch(/engaged/);
    expect(attackProblem(g.state, "p1:1#1", "p2:0#1", g.ctx)).toBeNull();
    const basic = game(flat(6), { "p1:1#1": at(0), "p2:0#1": at(1), "p2:1#1": at(4) }, "p1:1", "basic");
    expect(attackProblem(basic.state, "p1:1#1", "p2:1#1", basic.ctx)).toBeNull();
  });

  it("needs engagement for melee", () => {
    const g = game([["grass", 1], ["rock", 8]], { "p1:0#1": at(0), "p2:0#1": at(1, 8) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx)).toMatch(/Too far above or below/);
  });
});

describe("height bonuses (Advanced)", () => {
  it("gives +1 for higher ground and +1 more when the gap is at least the lower figure's Height", () => {
    const t = DEFAULT_TUNING;
    expect(elevationBonus(3, 5, 1, 5, t)).toEqual({ attackBonus: 1, defenseBonus: 0 });
    expect(elevationBonus(7, 5, 1, 5, t)).toEqual({ attackBonus: 2, defenseBonus: 0 });
    expect(elevationBonus(1, 5, 3, 5, t)).toEqual({ attackBonus: 0, defenseBonus: 1 });
    expect(elevationBonus(1, 4, 6, 5, t)).toEqual({ attackBonus: 0, defenseBonus: 2 });
    expect(elevationBonus(2, 5, 2, 5, t)).toEqual({ attackBonus: 0, defenseBonus: 0 });
  });

  it("adds the bonus dice to a real attack, and not in the Basic game", () => {
    const columns: [string, number][] = [["rock", 3], ["grass", 1], ["grass", 1]];
    const adv = game(columns, { "p1:1#1": at(0, 3), "p2:0#1": at(2) }, "p1:1");
    const r = apply(adv.state, { type: "attack", player: "p1", figureId: "p1:1#1", targetId: "p2:0#1" }, adv.ctx);
    expect(rolls(r.events, "attack")[0]).toMatchObject({ attackBonus: 1, defenseBonus: 0 });
    expect(rolls(r.events, "attack")[0]!.attack).toHaveLength(2 + 1);
    const basic = game(columns, { "p1:1#1": at(0, 3), "p2:0#1": at(2) }, "p1:1", "basic");
    const b = apply(basic.state, { type: "attack", player: "p1", figureId: "p1:1#1", targetId: "p2:0#1" }, basic.ctx);
    expect(rolls(b.events, "attack")[0]).toMatchObject({ attackBonus: 0, defenseBonus: 0 });
  });
});

describe("strict line of sight (Advanced)", () => {
  it("lets figures in between block the view", () => {
    const pos = { "p1:1#1": at(0), "p1:0#1": at(1), "p2:0#1": at(2) };
    const adv = game(flat(3), pos, "p1:1");
    expect(attackProblem(adv.state, "p1:1#1", "p2:0#1", adv.ctx)).toMatch(/line of sight/);
    const basic = game(flat(3), pos, "p1:1", "basic");
    expect(attackProblem(basic.state, "p1:1#1", "p2:0#1", basic.ctx)).toBeNull();
  });
});

describe("Advanced draft", () => {
  it("drafts by card count until the points budget arrives", () => {
    const { state } = createGame(setup(2, { mode: "advanced", armies: undefined, armySize: 2 }), fieldCtx);
    expect(state.phase).toBe("draft");
    expect(state.draft!.order).toHaveLength(4);
  });
});

describe("Advanced turns", () => {
  it("allows attacking after moving", () => {
    const g = game(flat(6), { "p1:1#1": at(0), "p2:0#1": at(5) }, "p1:1");
    const moved = apply(g.state, { type: "move", player: "p1", figureId: "p1:1#1", path: [step(1)] }, g.ctx).state;
    expect(applyCommand(moved, { type: "attack", player: "p1", figureId: "p1:1#1", targetId: "p2:0#1" }, g.ctx).ok).toBe(true);
  });
});
