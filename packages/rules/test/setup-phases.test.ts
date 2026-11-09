import { describe, expect, it } from "vitest";
import { applyCommand, createGame, currentDrafter, draftableCards, hex, hexKey, snakeOrder, waitingOn } from "../src";
import { apply, ctx, deployAll, fieldMap, makeCtx, nextDeploy, setup } from "./fixtures";

function draftGame(players = 3, armySize = 2) {
  return createGame(setup(players, { mode: "basic", armies: undefined, armySize }), ctx);
}

describe("snake draft", () => {
  it("reverses direction every round of picks", () => {
    expect(snakeOrder(["a", "b", "c"], 3)).toEqual(["a", "b", "c", "c", "b", "a", "a", "b", "c"]);
  });

  it("starts with a roll-off and follows the snake", () => {
    const { state, events } = draftGame(3, 2);
    expect(state.phase).toBe("draft");
    const started = events.find((e) => e.type === "draftStarted")!;
    expect(started.type === "draftStarted" && started.order[0]).toBe(state.draft!.order[0]);
    const first = state.draft!.order.slice(0, 3);
    expect(state.draft!.order).toEqual([...first, ...[...first].reverse()]);
    expect(waitingOn(state)).toEqual([first[0]]);
  });

  it("only lets the current drafter pick", () => {
    const { state } = draftGame();
    const other = state.players.find((p) => p.id !== currentDrafter(state))!.id;
    expect(applyCommand(state, { type: "draftPick", player: other, cardId: "hero" }, ctx).ok).toBe(false);
  });

  it("keeps unique units exclusive but common units unlimited", () => {
    let { state } = draftGame();
    state = apply(state, { type: "draftPick", player: currentDrafter(state)!, cardId: "unique" }).state;
    expect(draftableCards(state, ctx)).not.toContain("unique");
    const r = applyCommand(state, { type: "draftPick", player: currentDrafter(state)!, cardId: "unique" }, ctx);
    expect(r.ok).toBe(false);
    state = apply(state, { type: "draftPick", player: currentDrafter(state)!, cardId: "hero" }).state;
    state = apply(state, { type: "draftPick", player: currentDrafter(state)!, cardId: "hero" }).state;
    expect(state.units.filter((u) => u.cardId === "hero")).toHaveLength(2);
  });

  it("moves to deployment in pick order once every pick is made", () => {
    let { state } = draftGame(2, 2);
    while (state.phase === "draft") {
      state = apply(state, { type: "draftPick", player: currentDrafter(state)!, cardId: "hero" }).state;
    }
    expect(state.phase).toBe("deploy");
    expect(state.deploy!.queue.map((q) => q.unitId)).toEqual(state.draft!.picks.map((p) => p.unitId));
  });

  it("refuses picks that would not fit in the start zone, and skips players with no room", () => {
    // Test zones hold 4 figures: a 3-figure squad fits once, then only 1 more figure.
    let { state } = draftGame(2, 3);
    const first = currentDrafter(state)!;
    state = apply(state, { type: "draftPick", player: first, cardId: "squad" }).state;
    const second = currentDrafter(state)!;
    state = apply(state, { type: "draftPick", player: second, cardId: "squad" }).state;
    expect(currentDrafter(state)).toBe(second);
    expect(draftableCards(state, ctx, second)).not.toContain("squad");
    expect(applyCommand(state, { type: "draftPick", player: second, cardId: "squad" }, ctx).error).toMatch(/room for 1/);
    state = apply(state, { type: "draftPick", player: second, cardId: "hero" }).state;
    state = apply(state, { type: "draftPick", player: first, cardId: "hero" }).state;
    // Both zones are full, so the third round of picks is skipped.
    expect(state.phase).toBe("deploy");
  });

  it("rejects preset armies that do not fit", () => {
    expect(() => createGame(setup(2, { armies: { p1: ["squad", "squad"], p2: ["hero"] } }), ctx)).toThrow(/start zone/);
  });

  it("skips a player who concedes during the draft", () => {
    let { state } = draftGame(3, 2);
    const quitter = state.draft!.order[1]!;
    state = apply(state, { type: "concede", player: quitter }).state;
    while (state.phase === "draft") {
      expect(currentDrafter(state)).not.toBe(quitter);
      state = apply(state, { type: "draftPick", player: currentDrafter(state)!, cardId: "hero" }).state;
    }
    expect(state.units.some((u) => u.owner === quitter)).toBe(false);
  });
});

describe("deployment", () => {
  it("deploys each player in the zone the map's layout gives them", () => {
    const layoutCtx = makeCtx({ ...fieldMap(), layouts: { "2": [0, 3] } });
    const { state } = createGame(setup(2), layoutCtx);
    expect(state.players.map((p) => p.zone)).toEqual([0, 3]);
    const { state: deployed } = deployAll(state, layoutCtx);
    const zone3 = new Set(layoutCtx.board.startZone(3).map(hexKey));
    const p2 = deployed.units.filter((u) => u.owner === "p2").flatMap((u) => u.figures);
    expect(p2.every((f) => zone3.has(hexKey(f.position!.hex)))).toBe(true);
  });

  it("goes round the table by seat with preset armies", () => {
    const { state } = createGame(setup(3), ctx);
    expect(state.deploy!.queue.map((q) => q.unitId)).toEqual(["p1:0", "p2:0", "p3:0", "p1:1", "p2:1", "p3:1"]);
  });

  it("validates zone, order, spots and completeness", () => {
    const { state } = createGame(setup(2), ctx);
    const good = nextDeploy(state);
    if (good.type !== "deployUnit") throw new Error();
    const tryDeploy = (cmd: object) => applyCommand(state, { ...good, ...cmd } as never, ctx);
    expect(tryDeploy({}).ok).toBe(true);
    expect(tryDeploy({ player: "p2" }).ok).toBe(false);
    expect(tryDeploy({ unitId: "p1:1" }).ok).toBe(false);
    expect(tryDeploy({ placements: [] }).ok).toBe(false);
    const outside = { ...good.placements[0]!, hex: hex(4, 0) };
    expect(tryDeploy({ placements: [outside] }).error).toMatch(/start zone/);
    const wrongLevel = { ...good.placements[0]!, elevation: 3 };
    expect(tryDeploy({ placements: [wrongLevel] }).error).toMatch(/no ground/);
  });

  it("rejects stacking two figures on one spot", () => {
    let { state } = createGame(setup(2), ctx);
    state = apply(state, nextDeploy(state)).state; // p1 hero
    state = apply(state, nextDeploy(state)).state; // p2 hero
    const cmd = nextDeploy(state);
    if (cmd.type !== "deployUnit") throw new Error();
    const p1Hero = state.units.find((u) => u.id === "p1:0")!.figures[0]!.position!;
    const clash = cmd.placements.map((p, i) => (i === 0 ? { ...p, hex: p1Hero.hex, elevation: p1Hero.elevation } : p));
    expect(applyCommand(state, { ...cmd, placements: clash }, ctx).error).toMatch(/taken/);
  });

  it("starts round 1 when everyone is deployed", () => {
    const { state, events } = deployAll(createGame(setup(2), ctx).state);
    expect(state.phase).toBe("placeTokens");
    expect(state.round).toBe(1);
    expect(events.filter((e) => e.type === "roundStarted")).toEqual([{ type: "roundStarted", round: 1 }]);
    expect(state.units.every((u) => u.figures.every((f) => f.position))).toBe(true);
  });
});
