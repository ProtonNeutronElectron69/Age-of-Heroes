import { describe, expect, it } from "vitest";
import { applyCommand, createGame, tokenIdsFor, tokensToPlace, viewFor, type GameState } from "../src";
import { apply, ctx, deployAll, setup } from "./fixtures";

/** p1 drafts three heroes, p2 one; both under the "half" allowance and one token per unit. */
function placing(allowance = true): GameState {
  const s = setup(2, {
    armies: { p1: ["hero", "hero", "hero"], p2: ["hero"] },
    tokenRule: "onePerUnit",
    ...(allowance ? { tokenAllowance: "half" as const } : {}),
  });
  return deployAll(createGame(s, ctx).state).state;
}

describe("the token allowance", () => {
  it("gives each player half their army's cards in numbered tokens, rounded up, plus the bluff", () => {
    const s = placing();
    expect(s.phase).toBe("placeTokens");
    expect(s.tokenCounts).toEqual({ p1: 2, p2: 1 });
    expect(tokenIdsFor(s, "p1")).toEqual(["1", "2", "X"]);
    expect(tokenIdsFor(s, "p2")).toEqual(["1", "X"]);
    // One token on each unit: p1 places all three, p2 has one unit for its two tokens.
    expect(tokensToPlace(s, "p1")).toBe(3);
    expect(tokensToPlace(s, "p2")).toBe(1);
  });

  it("refuses tokens a player does not have, and runs the turns through each player's numbers", () => {
    const s = placing();
    const bad = applyCommand(s, { type: "placeTokens", player: "p1", tokens: { "1": "p1:0", "3": "p1:1", X: "p1:2" } }, ctx);
    expect(bad.ok ? null : bad.error).toBe("Your tokens are 1, 2 and X, each placed on a unit");
    let t = apply(s, { type: "placeTokens", player: "p1", tokens: { "1": "p1:0", "2": "p1:1", X: "p1:2" } }).state;
    const r = apply(t, { type: "placeTokens", player: "p2", tokens: { "1": "p2:0" } });
    t = r.state;
    const started = [...r.events];
    while (t.phase === "turns") {
      const step = apply(t, { type: "endTurn", player: t.active!.player });
      started.push(...step.events);
      t = step.state;
    }
    const turns = started.filter((e) => e.type === "turnStarted").map((e) => `${e.player}:${e.token}`);
    expect(turns.sort()).toEqual(["p1:1", "p1:2", "p2:1"]);
  });

  it("stays fixed when units are lost", () => {
    const s = placing();
    for (const f of s.units.find((u) => u.id === "p1:1")!.figures) {
      f.destroyed = true;
      f.position = null;
    }
    expect(tokenIdsFor(s, "p1")).toEqual(["1", "2", "X"]);
    expect(tokensToPlace(s, "p1")).toBe(2);
  });

  it("is left out of older games, which keep three numbered tokens", () => {
    const s = placing(false);
    expect(s.tokenCounts).toBeUndefined();
    expect(tokenIdsFor(s, "p1")).toEqual(["1", "2", "3", "X"]);
  });
});

describe("a player's view of the tokens", () => {
  it("shows where another player's hidden tokens lie, but not which is which", () => {
    let s = placing();
    s = apply(s, { type: "placeTokens", player: "p1", tokens: { "1": "p1:0", "2": "p1:1", X: "p1:2" } }).state;
    const before = viewFor(s, "p2");
    expect(before.tokens.p1).toEqual({});
    expect(before.hiddenTokens.p1).toEqual(["p1:0", "p1:1", "p1:2"]);
    expect(viewFor(s, "p1").tokens.p1).toEqual({ "1": "p1:0", "2": "p1:1", X: "p1:2" });
    s = apply(s, { type: "placeTokens", player: "p2", tokens: { "1": "p2:0" } }).state;
    // Once the round starts, revealed tokens show their numbers to everyone.
    const view = viewFor(s, "p2");
    for (const t of s.revealed.p1 ?? []) {
      expect(view.tokens.p1![t]).toBe(s.tokens.p1![t]);
      expect(view.hiddenTokens.p1).not.toContain(s.tokens.p1![t]);
    }
  });
});
