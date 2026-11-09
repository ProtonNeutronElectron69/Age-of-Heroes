import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  hex,
  hexKey,
  moveOptions,
  placementKey,
  type GameState,
  type RulesContext,
  type Step,
} from "../src";
import { CARDS, apply, makeCtx, rowMap, setup, turnState, withOutcome } from "./fixtures";

const at = (q: number, elevation = 1) => ({ q, r: 0, elevation });
const step = (q: number, elevation = 1): Step => ({ hex: hex(q, 0), elevation });

/** A game on a row map, with p1's hero (p1:0#1) active at `start` and optional enemies. */
function rowGame(
  columns: [string, number][],
  start: { q: number; r: number; elevation: number },
  others: Record<string, { q: number; r: number; elevation: number }> = {},
  mode: "basic" | "advanced" = "basic",
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(rowMap(columns));
  const base = createGame(setup(2, { mapId: "test-row", mode }), ctx).state;
  return { ctx, state: turnState(base, "p1:0", { "p1:0#1": start, ...others }) };
}

const flat = (n: number, terrain = "grass"): [string, number][] => Array.from({ length: n }, () => [terrain, 1]);
const move = (state: GameState, path: Step[]) =>
  ({ type: "move", player: "p1", figureId: "p1:0#1", path }) as const;

describe("movement options", () => {
  it("reaches as far as Move allows on flat ground", () => {
    const { ctx, state } = rowGame(flat(9), at(0));
    const options = moveOptions(state, "p1:0#1", ctx);
    expect([...options.values()].map((o) => o.to.hex.q).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    expect(options.get(placementKey(step(5)))!.cost).toBe(5);
  });

  it("charges 1 extra per level climbed and nothing to go down", () => {
    const { ctx, state } = rowGame([["grass", 1], ["rock", 3], ["grass", 1], ["grass", 1]], at(0));
    const options = moveOptions(state, "p1:0#1", ctx);
    expect(options.get(placementKey(step(1, 3)))!.cost).toBe(3);
    expect(options.get(placementKey(step(2, 1)))!.cost).toBe(4);
    expect(options.get(placementKey(step(3, 1)))!.cost).toBe(5);
  });

  it("limits a single climb to the figure's Height in the Advanced game only", () => {
    // A fast Height 5 hero facing a 6-level cliff (cost 1 + 6 = 7, within Move 10).
    const fast = CARDS.map((c) =>
      c.id === "hero" ? { ...c, basic: { ...c.basic, move: 10 }, advanced: { ...c.advanced, move: 10 } } : c,
    );
    const ctx = makeCtx(rowMap([["grass", 1], ["rock", 7]]), fast);
    const game = (mode: "basic" | "advanced") =>
      turnState(createGame(setup(2, { mapId: "test-row", mode }), ctx).state, "p1:0", { "p1:0#1": at(0) });
    expect(moveOptions(game("basic"), "p1:0#1", ctx).has(placementKey(step(1, 7)))).toBe(true);
    expect(moveOptions(game("advanced"), "p1:0#1", ctx).has(placementKey(step(1, 7)))).toBe(false);
  });

  it("stops in water or swamp and charges 2 per wet hex", () => {
    const { ctx, state } = rowGame([["grass", 1], ["water", 1], ["swamp", 1], ["grass", 1]], at(0));
    const options = moveOptions(state, "p1:0#1", ctx);
    expect([...options.keys()]).toEqual([placementKey(step(1))]);
    expect(options.get(placementKey(step(1)))!.cost).toBe(2);
    // Starting in water: wet to wet does not stop, but costs 2 each.
    const wet = rowGame([["water", 1], ["swamp", 1], ["water", 1], ["grass", 1]], at(0));
    const fromWet = moveOptions(wet.state, "p1:0#1", wet.ctx);
    expect(fromWet.get(placementKey(step(2)))!.cost).toBe(4);
    expect(fromWet.get(placementKey(step(3)))!.cost).toBe(5);
  });

  it("gives +3 move when the whole move stays on road", () => {
    const { ctx, state } = rowGame([...flat(9, "road"), ["grass", 1]], at(0));
    const options = moveOptions(state, "p1:0#1", ctx);
    expect(options.has(placementKey(step(8)))).toBe(true);
    expect(options.has(placementKey(step(9)))).toBe(false); // leaving the road loses the bonus
  });

  it("passes through friends, never through or onto enemies, and never ends on a friend", () => {
    const { ctx, state } = rowGame(flat(6), at(0), { "p1:1#1": at(1), "p2:0#1": at(3) });
    const options = moveOptions(state, "p1:0#1", ctx);
    expect(options.has(placementKey(step(1)))).toBe(false);
    expect(options.has(placementKey(step(2)))).toBe(true);
    expect(options.has(placementKey(step(3)))).toBe(false);
    expect(options.has(placementKey(step(4)))).toBe(false);
  });

  it("prefers a path around lava when one exists", () => {
    // Two rows: the direct row has lava, the row below is safe but the same length.
    const map = rowMap(flat(4));
    map.pieces.push(
      { id: "lava", shape: "single", terrain: "lava", origin: hex(1, 0), rotation: 0, layer: 1 },
      { id: "s0", shape: "single", terrain: "grass", origin: hex(0, 1), rotation: 0, layer: 0 },
      { id: "s1", shape: "single", terrain: "grass", origin: hex(1, 1), rotation: 0, layer: 0 },
    );
    const ctx = makeCtx(map);
    const base = createGame(setup(2, { mapId: "test-row", mode: "basic" }), ctx).state;
    const state = turnState(base, "p1:0", { "p1:0#1": at(0) });
    const option = moveOptions(state, "p1:0#1", ctx).get(placementKey(step(2)))!;
    expect(option.hazards).toBe(0);
    expect(option.path.map((s) => hexKey(s.hex))).not.toContain("1,0");
  });
});

describe("move command", () => {
  it("moves the figure and records it", () => {
    const { ctx, state } = rowGame(flat(6), at(0));
    const r = apply(state, move(state, [step(1), step(2)]), ctx);
    expect(r.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(2, 0), elevation: 1 });
    expect(r.events[0]).toMatchObject({ type: "figureMoved", path: [step(1), step(2)] });
    expect(r.state.active!.moved).toEqual(["p1:0#1"]);
  });

  it("rejects bad paths", () => {
    const { ctx, state } = rowGame([...flat(7), ["water", 1], ["grass", 1]], at(0), { "p2:0#1": at(4) });
    const fails = (path: Step[]) => applyCommand(state, move(state, path), ctx);
    expect(fails([]).ok).toBe(false);
    expect(fails([step(2)]).error).toMatch(/cannot move/);
    expect(fails([step(1), step(2), step(3), step(4)]).error).toMatch(/enemy/);
    expect(fails([step(1), step(2), step(3), step(4), step(5), step(6)]).ok).toBe(false);
  });

  it("does not let a figure move twice or after attacking", () => {
    const { ctx, state } = rowGame(flat(6), at(0));
    const moved = apply(state, move(state, [step(1)]), ctx).state;
    expect(applyCommand(moved, move(moved, [step(2)]), ctx).error).toMatch(/already moved/);
    const attacked = { ...state, active: { ...state.active!, attacked: ["p1:0#1"] } };
    expect(applyCommand(attacked, move(attacked, [step(1)]), ctx).error).toMatch(/after attacking/);
  });

  it("only moves figures of the activated unit", () => {
    const { ctx, state } = rowGame(flat(6), at(0), { "p1:1#1": at(3) });
    const r = applyCommand(state, { type: "move", player: "p1", figureId: "p1:1#1", path: [step(4)] }, ctx);
    expect(r.error).toMatch(/activated unit/);
  });

  it("lava destroys on a low roll and is survived on a high one", () => {
    const { ctx, state } = rowGame([["grass", 1], ["lava", 1], ["grass", 1]], at(0));
    const cmd = move(state, [step(1), step(2)]);
    const burned = withOutcome(state, cmd, ctx, (ev) => ev.some((e) => e.type === "terrainRoll" && e.outcome === "destroyed"));
    const fig = burned.state.units[0]!.figures[0]!;
    expect(fig.destroyed).toBe(true);
    expect(burned.events.find((e) => e.type === "terrainRoll")).toMatchObject({ terrain: "lava" });
    expect(burned.events.some((e) => e.type === "figureDestroyed" && e.cause === "lava")).toBe(true);
    const roll = burned.events.find((e) => e.type === "terrainRoll");
    expect(roll?.type === "terrainRoll" && roll.roll).toBeLessThanOrEqual(12);

    const safe = withOutcome(state, cmd, ctx, (ev) => ev.some((e) => e.type === "terrainRoll" && e.outcome === "safe"));
    expect(safe.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(2, 0) });
  });

  it("moves play on when the active player's last figure dies on their own turn", () => {
    const ctx = makeCtx(rowMap([["grass", 1], ["lava", 1], ["grass", 1]]));
    const base = createGame(
      setup(3, { mapId: "test-row", mode: "basic", armies: { p1: ["hero"], p2: ["hero"], p3: ["hero"] } }),
      ctx,
    ).state;
    const state = turnState(base, "p1:0", { "p1:0#1": at(0), "p2:0#1": at(2) });
    // p3 has a figure off this row; it stays alive because it is not destroyed.
    const r = withOutcome(state, move(state, [step(1)]), ctx, (ev) => ev.some((e) => e.type === "figureDestroyed"));
    expect(r.state.players.find((p) => p.id === "p1")!.eliminated).toBe(true);
    expect(r.state.phase).toBe("turns");
    expect(r.state.active?.player).not.toBe("p1");
    expect(applyCommand(r.state, { type: "endTurn", player: r.state.active!.player }, ctx).ok).toBe(true);
  });

  it("ice slides a slipping figure one hex on and ends its move", () => {
    const { ctx, state } = rowGame([["grass", 1], ["ice", 1], ["grass", 1], ["grass", 1], ["grass", 1]], at(0));
    const cmd = move(state, [step(1), step(2), step(3)]);
    const slipped = withOutcome(state, cmd, ctx, (ev) => ev.some((e) => e.type === "terrainRoll" && e.outcome === "slipped"));
    expect(slipped.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(2, 0) });
    expect(slipped.events.some((e) => e.type === "figureSlid")).toBe(true);
    const fine = withOutcome(state, cmd, ctx, (ev) => ev.some((e) => e.type === "terrainRoll" && e.outcome === "safe"));
    expect(fine.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(3, 0) });
  });

  it("a slip that cannot slide leaves the figure on the ice", () => {
    const { ctx, state } = rowGame([["grass", 1], ["ice", 1], ["rock", 9]], at(0));
    const r = withOutcome(state, move(state, [step(1)]), ctx, (ev) => ev.some((e) => e.type === "terrainRoll" && e.outcome === "slipped"));
    expect(r.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(1, 0) });
    expect(r.events.some((e) => e.type === "figureSlid")).toBe(false);
  });

  it("returns a slipping figure to a free spot if it would stop on a friend", () => {
    // Friends stand on the ice (q2) and just past it (q3), so the slide is blocked
    // and the figure would be stuck on an occupied hex.
    const columns: [string, number][] = [["grass", 1], ["grass", 1], ["ice", 1], ["grass", 1], ["grass", 1], ["grass", 1]];
    const { ctx, state } = rowGame(columns, at(0), { "p1:1#1": at(2), "p1:1#2": at(3) });
    const r = withOutcome(state, move(state, [step(1), step(2), step(3), step(4)]), ctx, (ev) =>
      ev.some((e) => e.type === "terrainRoll" && e.outcome === "slipped"),
    );
    expect(r.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(1, 0) });
    expect(r.events.filter((e) => e.type === "figureSlid").at(-1)).toMatchObject({ to: step(1) });
  });
});
