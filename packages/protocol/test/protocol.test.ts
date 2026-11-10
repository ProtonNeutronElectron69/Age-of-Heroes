import { CARD_CATALOG, MAPS, contextFor } from "@aoh/content";
import { applyCommand, createGame, deepClone, replayGame, viewFor, type GameSetup } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { clientMessageSchema, commandSchema, parseReplay, stateFromView } from "../src";

const map = MAPS[0]!;

describe("message validation", () => {
  it("accepts well-formed commands and rejects junk", () => {
    expect(commandSchema.safeParse({ type: "endTurn", player: "p1" }).success).toBe(true);
    expect(
      commandSchema.safeParse({
        type: "move",
        player: "p1",
        figureId: "p1:0#1",
        path: [{ hex: { q: 1, r: 2 }, elevation: 1 }],
      }).success,
    ).toBe(true);
    expect(commandSchema.safeParse({ type: "move", player: "p1", figureId: "x", path: [] }).success).toBe(false);
    expect(commandSchema.safeParse({ type: "explode", player: "p1" }).success).toBe(false);
    expect(
      commandSchema.safeParse({ type: "placeTokens", player: "p1", tokens: { "1": "a", "2": "a", "3": "a", X: "a", Y: "b" } })
        .success,
    ).toBe(false);
  });

  it("normalises room codes and names", () => {
    const join = clientMessageSchema.parse({ t: "join", code: " abcde ", name: "  Ana  " });
    expect(join).toEqual({ t: "join", code: "ABCDE", name: "Ana" });
    expect(clientMessageSchema.safeParse({ t: "join", code: "AB1", name: "x" }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: "join", code: "ABCDE", name: "   " }).success).toBe(false);
  });

  it("validates the map inside create requests", () => {
    const settings = { mode: "basic", roundLimit: 5, armySize: 2, map };
    expect(clientMessageSchema.safeParse({ t: "create", name: "A", settings }).success).toBe(true);
    const broken = { ...settings, map: { ...map, pieces: [] } };
    expect(clientMessageSchema.safeParse({ t: "create", name: "A", settings: broken }).success).toBe(false);
  });
});

describe("views and replays", () => {
  const setup: GameSetup = {
    mode: "basic",
    seed: 99,
    mapId: map.id,
    roundLimit: 2,
    players: [
      { id: "p1", name: "A", color: "#f00" },
      { id: "p2", name: "B", color: "#00f" },
    ],
    armies: { p1: ["marisol-vance"], p2: ["lady-asagiri"] },
  };
  const { ctx } = contextFor(map);

  it("rebuilds a renderable state from a view, keeping hidden tokens hidden", () => {
    let s = createGame(setup, ctx).state;
    // Deploy both heroes and place p1's tokens.
    for (const [player, unitId] of [
      ["p1", "p1:0"],
      ["p2", "p2:0"],
    ] as const) {
      const zone = ctx.board.startZone(s.players.find((p) => p.id === player)!.zone);
      const spot = { hex: zone[0]!, elevation: ctx.board.topSurface(zone[0]!)!.elevation };
      const r = applyCommand(s, { type: "deployUnit", player, unitId, placements: [{ figureId: `${unitId}#1`, ...spot }] }, ctx);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const r = applyCommand(s, { type: "placeTokens", player: "p1", tokens: { "1": "p1:0", "2": "p1:0", "3": "p1:0", X: "p1:0" } }, ctx);
    if (!r.ok) throw new Error(r.error);
    s = r.state;
    const seenByP2 = stateFromView(viewFor(s, "p2"));
    expect(seenByP2.tokens.p1).toEqual({ "1": "", "2": "", "3": "", X: "" });
    expect(seenByP2.tokens.p2).toBeNull();
    expect(seenByP2.rng).toBe(0);
    expect(seenByP2.config.seed).toBe(0);
    const seenByP1 = stateFromView(viewFor(s, "p1"));
    expect(seenByP1.tokens.p1).toEqual({ "1": "p1:0", "2": "p1:0", "3": "p1:0", X: "p1:0" });
    expect(seenByP1.units).toEqual(deepClone(s.units));
    expect(CARD_CATALOG.size).toBeGreaterThan(0);
  });

  it("reads replay files and rejects broken ones", () => {
    const replay = parseReplay({ formatVersion: 1, setup, map, commands: [{ type: "concede", player: "p2" }] });
    expect(replayGame(replay.setup, replay.commands, ctx).state.phase).toBe("gameOver");
    expect(() => parseReplay({ formatVersion: 2, setup, map, commands: [] })).toThrow(/not a valid game file/);
    expect(() => parseReplay({ formatVersion: 1, setup: { ...setup, players: [] }, map, commands: [] })).toThrow();
  });
});
