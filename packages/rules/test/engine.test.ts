import { describe, expect, it } from "vitest";
import {
  Rng,
  applyCommand,
  deepClone,
  createGame,
  replayGame,
  rollInitiative,
  viewFor,
  type Command,
  type GameEvent,
  type GameState,
} from "../src";
import { allOn, ctx, setup } from "./fixtures";

function apply(state: GameState, cmd: Command): { state: GameState; events: GameEvent[] } {
  const r = applyCommand(state, cmd, ctx);
  if (!r.ok) throw new Error(r.error);
  return r;
}

function placeAll(state: GameState, chooser: (player: string) => Record<string, string>) {
  let s = state;
  const events: GameEvent[] = [];
  for (const p of s.players) {
    if (p.eliminated) continue;
    const r = apply(s, { type: "placeTokens", player: p.id, tokens: chooser(p.id) as never });
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/** Pass every turn until the round ends (or the game does). */
function passRound(state: GameState) {
  let s = state;
  const events: GameEvent[] = [];
  while (s.phase === "turns" && s.active) {
    const r = apply(s, { type: "endTurn", player: s.active.player });
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe("createGame", () => {
  it("creates units and figures for each army", () => {
    const { state } = createGame(setup(3), ctx);
    expect(state.players.map((p) => p.seat)).toEqual([0, 1, 2]);
    expect(state.units).toHaveLength(6);
    expect(state.units.find((u) => u.id === "p1:1")!.figures).toHaveLength(3);
    expect(state.phase).toBe("placeTokens");
  });

  it("accepts 2 to 6 players only", () => {
    expect(() => createGame(setup(1), ctx)).toThrow();
    expect(() => createGame(setup(7), ctx)).toThrow();
    expect(() => createGame(setup(6), ctx)).not.toThrow();
  });

  it("rejects unknown cards", () => {
    expect(() => createGame(setup(2, { armies: { p1: ["nope"], p2: ["hero"] } }), ctx)).toThrow(/Unknown card/);
  });
});

describe("token placement", () => {
  it("validates placements", () => {
    const { state } = createGame(setup(2), ctx);
    const bad = (tokens: Record<string, string>) =>
      applyCommand(state, { type: "placeTokens", player: "p1", tokens: tokens as never }, ctx);
    expect(bad({ "1": "p1:0", "2": "p1:0", "3": "p1:0" }).ok).toBe(false);
    expect(bad(allOn("p2:0")).ok).toBe(false);
    expect(bad(allOn("p1:0")).ok).toBe(true);
  });

  it("allows several tokens on one unit, and only one placement per round", () => {
    const { state } = createGame(setup(2), ctx);
    const s = apply(state, { type: "placeTokens", player: "p1", tokens: allOn("p1:1") }).state;
    expect(applyCommand(s, { type: "placeTokens", player: "p1", tokens: allOn("p1:0") }, ctx).ok).toBe(false);
  });

  it("starts turns with an initiative roll once everyone has placed", () => {
    const { state } = createGame(setup(2), ctx);
    const { state: s, events } = placeAll(state, (p) => allOn(`${p}:0`));
    expect(s.phase).toBe("turns");
    expect(events.some((e) => e.type === "initiativeRolled")).toBe(true);
    expect(s.active).toMatchObject({ token: "1", player: s.initiative![0] });
  });
});

describe("initiative", () => {
  it("passes to the left from the highest roller", () => {
    const { state } = createGame(setup(5), ctx);
    for (let seed = 0; seed < 50; seed++) {
      const { order, rolls } = rollInitiative(state, new Rng(seed));
      const first = state.players.findIndex((p) => p.id === order[0]);
      expect(order).toEqual([0, 1, 2, 3, 4].map((i) => state.players[(first + i) % 5]!.id));
      const lastRoll = (id: string) => rolls.find((r) => r.player === id)!.values.at(-1)!;
      const winnerRolls = rolls.find((r) => r.player === order[0])!.values;
      // The first player's final roll beats everyone it was tied with.
      for (const r of rolls) {
        if (r.player !== order[0] && r.values.length === winnerRolls.length) {
          expect(lastRoll(order[0]!)).toBeGreaterThan(lastRoll(r.player));
        }
      }
    }
  });

  it("rerolls ties for the highest roll", () => {
    const { state } = createGame(setup(6), ctx);
    let sawReroll = false;
    for (let seed = 0; seed < 300 && !sawReroll; seed++) {
      const { rolls } = rollInitiative(state, new Rng(seed));
      sawReroll = rolls.some((r) => r.values.length > 1);
    }
    expect(sawReroll).toBe(true);
  });
});

describe("round flow", () => {
  it("resolves token 1 for everyone, then 2, then 3, then reveals X", () => {
    const { state } = createGame(setup(3), ctx);
    const placed = placeAll(state, (p) => ({ "1": `${p}:0`, "2": `${p}:1`, "3": `${p}:0`, X: `${p}:1` }));
    const { state: end, events } = passRound(placed.state);
    const all = [...placed.events, ...events];
    const turns = all.filter((e) => e.type === "turnStarted");
    expect(turns.map((t) => t.token)).toEqual(["1", "1", "1", "2", "2", "2", "3", "3", "3"]);
    const order = placed.state.initiative!;
    expect(turns.slice(0, 3).map((t) => t.player)).toEqual(order);
    expect(all.filter((e) => e.type === "tokenRevealed" && e.token === "X")).toHaveLength(3);
    expect(end.round).toBe(2);
    expect(end.phase).toBe("placeTokens");
    expect(Object.values(end.tokens).every((t) => t === null)).toBe(true);
  });

  it("only the active player may end the turn", () => {
    const { state } = createGame(setup(2), ctx);
    const s = placeAll(state, (p) => allOn(`${p}:0`)).state;
    const other = s.players.find((p) => p.id !== s.active!.player)!.id;
    expect(applyCommand(s, { type: "endTurn", player: other }, ctx).ok).toBe(false);
  });

  it("loses a turn when the unit holding the token has been destroyed", () => {
    const { state } = createGame(setup(2), ctx);
    const s = placeAll(state, (p) => ({ "1": `${p}:0`, "2": `${p}:0`, "3": `${p}:1`, X: `${p}:0` })).state;
    // Simulate p1's squad being wiped out during the round.
    for (const f of s.units.find((u) => u.id === "p1:1")!.figures) f.destroyed = true;
    const { events } = passRound(s);
    expect(events).toContainEqual({ type: "turnLost", player: "p1", token: "3", unitId: "p1:1" });
    expect(events.filter((e) => e.type === "turnStarted" && e.player === "p1" && e.token === "3")).toHaveLength(0);
  });

  it("ends at the round limit and scores surviving points", () => {
    const { state } = createGame(setup(2, { roundLimit: 1 }), ctx);
    let s = placeAll(state, (p) => allOn(`${p}:0`)).state;
    // p2 loses one of three squad figures: 60 * 2/3 = 40 points.
    s.units.find((u) => u.id === "p2:1")!.figures[0]!.destroyed = true;
    const { state: end, events } = passRound(s);
    expect(end.phase).toBe("gameOver");
    expect(end.result).toEqual({ winners: ["p1"], reason: "roundLimit", scores: { p1: 160, p2: 140 } });
    expect(events.at(-1)?.type).toBe("gameOver");
  });

  it("scores surviving figures in the Basic game", () => {
    const { state } = createGame(setup(2, { roundLimit: 1, mode: "basic" }), ctx);
    const s = placeAll(state, (p) => allOn(`${p}:0`)).state;
    const end = passRound(s).state;
    expect(end.result?.scores).toEqual({ p1: 4, p2: 4 });
    expect(end.result?.winners).toEqual(["p1", "p2"]);
  });
});

describe("concession and elimination", () => {
  it("ends a two-player game when one concedes", () => {
    const { state } = createGame(setup(2), ctx);
    const r = apply(state, { type: "concede", player: "p2" });
    expect(r.state.phase).toBe("gameOver");
    expect(r.state.result).toMatchObject({ winners: ["p1"], reason: "elimination" });
  });

  it("skips a conceded player's remaining turns in a bigger game", () => {
    const { state } = createGame(setup(3), ctx);
    let s = placeAll(state, (p) => allOn(`${p}:0`)).state;
    const quitter = s.initiative![1]!;
    s = apply(s, { type: "endTurn", player: s.active!.player }).state;
    expect(s.active!.player).toBe(quitter);
    const r = apply(s, { type: "concede", player: quitter });
    expect(r.state.active!.player).not.toBe(quitter);
    const rest = passRound(r.state);
    expect(rest.events.some((e) => e.type === "turnStarted" && e.player === quitter)).toBe(false);
    expect(rest.state.round).toBe(2);
    // The next round only waits for the two remaining players.
    const next = placeAll(rest.state, (p) => allOn(`${p}:0`));
    expect(next.state.phase).toBe("turns");
    expect(next.state.initiative).toHaveLength(2);
  });
});

describe("determinism and hidden information", () => {
  it("replays a command log to the identical state", () => {
    const commands: Command[] = [];
    let s = createGame(setup(4), ctx).state;
    for (let round = 0; round < 3; round++) {
      for (const p of s.players) {
        const cmd: Command = { type: "placeTokens", player: p.id, tokens: allOn(`${p.id}:${round % 2}`) };
        commands.push(cmd);
        s = apply(s, cmd).state;
      }
      while (s.active) {
        const cmd: Command = { type: "endTurn", player: s.active.player };
        commands.push(cmd);
        s = apply(s, cmd).state;
      }
    }
    expect(replayGame(setup(4), commands, ctx).state).toEqual(s);
  });

  it("never mutates the input state", () => {
    const { state } = createGame(setup(2), ctx);
    const before = deepClone(state);
    apply(state, { type: "placeTokens", player: "p1", tokens: allOn("p1:0") });
    expect(state).toEqual(before);
  });

  it("hides other players' unrevealed tokens and the RNG", () => {
    const { state } = createGame(setup(2), ctx);
    const s = placeAll(state, (p) => ({ "1": `${p}:0`, "2": `${p}:1`, "3": `${p}:1`, X: `${p}:0` })).state;
    const first = s.initiative![0]!;
    const second = s.initiative![1]!;
    const view = viewFor(s, second);
    expect(view.tokens[second]).toEqual({ "1": `${second}:0`, "2": `${second}:1`, "3": `${second}:1`, X: `${second}:0` });
    expect(view.tokens[first]).toEqual({ "1": `${first}:0` });
    expect(view.tokensPlaced).toEqual({ [first]: true, [second]: true });
    expect("rng" in view).toBe(false);
    const spectator = viewFor(s, null);
    expect(spectator.tokens[second]).toEqual({});
  });
});
