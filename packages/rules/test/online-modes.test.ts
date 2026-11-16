import { describe, expect, it } from "vitest";
import { applyCommand, createGame, currentDrafter, drafters, draftableCards, replayGame, waitingOn, type Command } from "../src";
import { allOn, apply, ctx, deployAll, nextDeploy, setup } from "./fixtures";

/** An open draft (everyone picks at once). Test heroes cost 100, so 200 points is two heroes each. */
function openDraft(players = 2, budget: number | null = 200) {
  return createGame(setup(players, { armies: undefined, budget, draft: "open" }), ctx);
}

describe("open draft", () => {
  it("lets every player pick at once, in any order", () => {
    let { state } = openDraft(3);
    expect(currentDrafter(state)).toBeNull();
    expect(drafters(state)).toEqual(["p1", "p2", "p3"]);
    expect(waitingOn(state)).toEqual(["p1", "p2", "p3"]);
    // The same player may pick twice running.
    state = apply(state, { type: "draftPick", player: "p3", cardId: "hero" }).state;
    state = apply(state, { type: "draftPick", player: "p3", cardId: "squad" }).state;
    expect(state.units.filter((u) => u.owner === "p3")).toHaveLength(2);
  });

  it("lets each card be drafted by one player only, common cards too", () => {
    let { state } = openDraft();
    state = apply(state, { type: "draftPick", player: "p1", cardId: "hero" }).state;
    expect(draftableCards(state, ctx, "p2")).not.toContain("hero");
    const r = applyCommand(state, { type: "draftPick", player: "p2", cardId: "hero" }, ctx);
    expect(r.ok).toBe(false);
    expect(r.ok ? "" : r.error).toMatch(/already been drafted/);
    expect(applyCommand(state, { type: "draftPick", player: "p1", cardId: "hero" }, ctx).ok).toBe(false);
  });

  it("ends when every player is done, then deploys one unit each in turn from the roll-off winner", () => {
    // Test zones hold 4 figures each.
    let { state, events } = openDraft(2, null);
    const started = events.find((e) => e.type === "draftStarted");
    const [first, second] = (started?.type === "draftStarted" ? started.order : []) as [string, string];
    // The second player picks twice before the first picks at all.
    state = apply(state, { type: "draftPick", player: second, cardId: "hero" }).state;
    state = apply(state, { type: "draftPick", player: second, cardId: "unique" }).state;
    // A 3-figure squad leaves the first player room for 1 figure, and the only card left (Test Big) needs 2: they are done.
    const r = apply(state, { type: "draftPick", player: first, cardId: "squad" });
    state = r.state;
    expect(r.events.some((e) => e.type === "draftPassed" && e.player === first)).toBe(true);
    expect(drafters(state)).toEqual([second]);
    expect(applyCommand(state, { type: "draftPick", player: first, cardId: "big" }, ctx).ok).toBe(false);
    state = apply(state, { type: "draftPass", player: second }).state;
    expect(state.phase).toBe("deploy");
    expect(state.deploy!.queue.map((q) => q.player)).toEqual([first, second, second]);
  });

  it("finishes a player who has nothing left they can afford", () => {
    let { state } = openDraft(2, 100);
    state = apply(state, { type: "draftPick", player: "p1", cardId: "hero" }).state;
    expect(drafters(state)).toEqual(["p2"]);
  });
});

/** A 2-player game with preset armies where players roll their own initiative, deployed and waiting for tokens. */
function rollingGame() {
  const { state } = createGame(setup(2, { initiative: "players" }), ctx);
  return deployAll(state).state;
}

describe("initiative rolled by the players", () => {
  it("waits for every player to roll before rolling anything", () => {
    let state = rollingGame();
    state = apply(state, { type: "placeTokens", player: "p1", tokens: allOn("p1:0") }).state;
    const last = apply(state, { type: "placeTokens", player: "p2", tokens: allOn("p2:0") });
    state = last.state;
    expect(state.phase).toBe("initiative");
    expect(last.events.some((e) => e.type === "initiativeRolled")).toBe(false);
    expect(waitingOn(state)).toEqual(["p1", "p2"]);

    const one = apply(state, { type: "rollInitiative", player: "p2" });
    state = one.state;
    expect(one.events.map((e) => e.type)).toEqual(["initiativeReady"]);
    expect(state.initiative).toBeNull();
    expect(waitingOn(state)).toEqual(["p1"]);
    expect(applyCommand(state, { type: "rollInitiative", player: "p2" }, ctx).ok).toBe(false);

    const both = apply(state, { type: "rollInitiative", player: "p1" });
    expect(both.events.some((e) => e.type === "initiativeRolled")).toBe(true);
    expect(both.state.phase).toBe("turns");
    expect(both.state.initiativeReady).toBeUndefined();
  });

  it("refuses a roll outside the initiative phase, and rolls at once without it", () => {
    const waiting = rollingGame();
    expect(applyCommand(waiting, { type: "rollInitiative", player: "p1" }, ctx).ok).toBe(false);
    // Games that leave the option out roll as soon as the last tokens are down.
    let state = deployAll(createGame(setup(2), ctx).state).state;
    state = apply(state, { type: "placeTokens", player: "p1", tokens: allOn("p1:0") }).state;
    expect(apply(state, { type: "placeTokens", player: "p2", tokens: allOn("p2:0") }).state.phase).toBe("turns");
  });

  it("rolls once the only player still to roll concedes", () => {
    let state = createGame(setup(3, { initiative: "players" }), ctx).state;
    state = deployAll(state).state;
    for (const p of ["p1", "p2", "p3"]) state = apply(state, { type: "placeTokens", player: p, tokens: allOn(`${p}:0`) }).state;
    state = apply(state, { type: "rollInitiative", player: "p1" }).state;
    state = apply(state, { type: "rollInitiative", player: "p2" }).state;
    const r = apply(state, { type: "concede", player: "p3" });
    expect(r.state.phase).toBe("turns");
  });

  it("replays the same rolls from the command log", () => {
    const game = setup(2, { initiative: "players" });
    const commands: Command[] = [];
    let state = createGame(game, ctx).state;
    const run = (cmd: Command) => {
      commands.push(cmd);
      state = apply(state, cmd).state;
    };
    state = deployAll(state).state;
    for (const p of ["p1", "p2"]) run({ type: "placeTokens", player: p, tokens: allOn(`${p}:0`) });
    run({ type: "rollInitiative", player: "p2" });
    run({ type: "rollInitiative", player: "p1" });
    const deployCommands = deployCommandsOf(game);
    expect(replayGame(game, [...deployCommands, ...commands], ctx).state.initiative).toEqual(state.initiative);
  });
});

/** The deploy commands `deployAll` makes for a new game from this setup. */
function deployCommandsOf(game: ReturnType<typeof setup>): Command[] {
  let state = createGame(game, ctx).state;
  const out: Command[] = [];
  while (state.phase === "deploy") {
    const cmd = nextDeploy(state);
    out.push(cmd);
    state = apply(state, cmd).state;
  }
  return out;
}
