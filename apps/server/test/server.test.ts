import { MAPS, contextFor } from "@aoh/content";
import { stateFromView, type ServerMessage } from "@aoh/protocol";
import {
  applyCommand,
  attackTargets,
  createGame,
  currentDeployment,
  currentDrafter,
  drafters,
  hexDistance,
  moveOptions,
  deploymentPlacements,
  draftableCards,
  livingUnitsOf,
  replayGame,
  type Command,
  type GameSetup,
  type GameState,
  type PlayerView,
} from "@aoh/rules";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { startGameServer, type GameServer } from "../src/server";

type GameMessage = Extract<ServerMessage, { t: "game" }>;

const map = MAPS.find((m) => m.id === "proving-grounds")!;
const { ctx } = contextFor(map);

let server: GameServer;
beforeAll(async () => {
  server = await startGameServer({ port: 0, host: "127.0.0.1" });
});
afterAll(async () => {
  await server.close();
});

/** A test client that records every message. */
class Client {
  readonly messages: ServerMessage[] = [];
  private waiters: { test: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }[] = [];
  private constructor(readonly socket: WebSocket) {
    socket.on("message", (data: Buffer) => {
      const m = JSON.parse(data.toString()) as ServerMessage;
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => {
        if (!w.test(m)) return true;
        w.resolve(m);
        return false;
      });
    });
  }

  static async connect(port = server.port): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    return new Client(socket);
  }

  send(message: object): void {
    this.socket.send(JSON.stringify(message));
  }

  /** The next matching message from now on (or an earlier unread one if `seen` is false). */
  next<T extends ServerMessage["t"]>(t: T, test: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true) {
    return new Promise<Extract<ServerMessage, { t: T }>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${t}`)), 3000);
      this.waiters.push({
        test: (m) => m.t === t && test(m as Extract<ServerMessage, { t: T }>),
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<ServerMessage, { t: T }>);
        },
      });
    });
  }

  /** A matching message already received, or the next one to arrive. */
  seen<T extends ServerMessage["t"]>(t: T, test: (m: Extract<ServerMessage, { t: T }>) => boolean = () => true) {
    const earlier = this.messages.find((m) => m.t === t && test(m as Extract<ServerMessage, { t: T }>));
    return earlier ? Promise.resolve(earlier as Extract<ServerMessage, { t: T }>) : this.next(t, test);
  }

  lastView(): PlayerView | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i]!;
      if (m.t === "game") return m.view;
    }
    return undefined;
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.once("close", () => resolve());
      this.socket.close();
    });
  }
}

/** 140 points: room for about one hero each, so the draft is short. */
const settings = (extra: object = {}) => ({ roundLimit: 3, budget: 140, map, ...extra });

async function room(players = 2) {
  const host = await Client.connect();
  const welcome = host.next("welcome");
  host.send({ t: "create", name: "Ana", settings: settings() });
  const w = await welcome;
  const others: { client: Client; playerId: string; token: string }[] = [];
  for (let i = 1; i < players; i++) {
    const c = await Client.connect();
    const cw = c.next("welcome");
    c.send({ t: "join", code: w.code, name: `Guest ${i}` });
    const welcomeOther = await cw;
    others.push({ client: c, playerId: welcomeOther.playerId!, token: welcomeOther.token! });
  }
  return { code: w.code, host: { client: host, playerId: w.playerId!, token: w.token! }, others };
}

/** Send a command from whichever client owns the acting player, and wait for everyone's update. */
async function act(clients: Map<string, Client>, command: Command): Promise<void> {
  const sender = clients.get(command.player)!;
  const updates = [...clients.values()].map((c) => c.next("game", (m) => !m.snapshot));
  sender.send({ t: "command", command });
  await Promise.all(updates);
}

/**
 * Play a game here, simply, until the acting figure can attack: the commands so far (to resume
 * on the server) and that attack. Everyone drafts the first card they can, and figures close in.
 */
function playUntilAttack(setup: GameSetup): { commands: Command[]; attack: Command } {
  let state = createGame(setup, ctx).state;
  const commands: Command[] = [];
  for (let n = 0; n < 3000; n++) {
    let command: Command;
    switch (state.phase) {
      case "draft": {
        const player = currentDrafter(state) ?? drafters(state)[0]!;
        const cards = draftableCards(state, ctx, player);
        command = state.units.some((u) => u.owner === player) || cards.length === 0 ? { type: "draftPass", player } : { type: "draftPick", player, cardId: cards[0]! };
        break;
      }
      case "deploy": {
        const { player, unitId } = currentDeployment(state)!;
        const unit = state.units.find((u) => u.id === unitId)!;
        const card = ctx.cards.get(unit.cardId)!;
        const taken: { hex: { q: number; r: number }; elevation: number }[] = [];
        const placements = unit.figures.map((f) => {
          const choice = deploymentPlacements(state, player, card, ctx, taken)[0]!;
          taken.push(...choice.spots);
          return { figureId: f.id, ...choice.placement };
        });
        command = { type: "deployUnit", player, unitId, placements };
        break;
      }
      case "placeTokens": {
        const player = state.players.find((p) => !p.eliminated && !state.tokens[p.id])!.id;
        const u = livingUnitsOf(state, player)[0]!.id;
        command = { type: "placeTokens", player, tokens: { "1": u, "2": u, "3": u, X: u } };
        break;
      }
      case "initiative": {
        const player = state.players.find((p) => !(state.initiativeReady ?? []).includes(p.id))!.id;
        command = { type: "rollInitiative", player };
        break;
      }
      case "turns": {
        const active = state.active!;
        const unit = state.units.find((u) => u.id === active.unitId)!;
        const f = unit.figures.find((x) => !x.destroyed && x.position && !active.attacked.includes(x.id));
        const targets = f ? attackTargets(state, f.id, ctx) : [];
        if (f && targets.length > 0) return { commands, attack: { type: "attack", player: active.player, figureId: f.id, targetId: targets[0]! } };
        const options = f && !active.moved.includes(f.id) ? [...moveOptions(state, f.id, ctx).values()] : [];
        if (options.length === 0) {
          command = { type: "endTurn", player: active.player };
          break;
        }
        const enemies = state.units.filter((u) => u.owner !== active.player).flatMap((u) => u.figures.filter((x) => x.position).map((x) => x.position!.hex));
        const gap = (o: (typeof options)[number]) => Math.min(...enemies.map((e) => hexDistance(e, o.to.hex)));
        command = { type: "move", player: active.player, figureId: f!.id, path: options.reduce((a, b) => (gap(b) < gap(a) ? b : a)).path };
        break;
      }
      default:
        throw new Error(`The game reached ${state.phase} without an attack`);
    }
    const result = applyCommand(state, command, ctx);
    if (!result.ok) throw new Error(result.error);
    state = result.state;
    commands.push(command);
  }
  throw new Error("No attack came up");
}

describe("rooms", () => {
  it("creates a room with a code and lets others join", async () => {
    const { code, host, others } = await room(2);
    expect(code).toMatch(/^[A-Z]{5}$/);
    expect(host.playerId).toBe("p1");
    expect(others[0]!.playerId).toBe("p2");
    const info = await host.client.seen("room", (m) => m.room.members.length === 2);
    expect(info.room.members.map((m) => [m.name, m.host, m.connected])).toEqual([
      ["Ana", true, true],
      ["Guest 1", false, true],
    ]);
    await host.client.close();
    await others[0]!.client.close();
  });

  it("only lets the host start, and only with a supported player count", async () => {
    const lonely = await Client.connect();
    const w = lonely.next("welcome");
    lonely.send({ t: "create", name: "Solo", settings: settings() });
    await w;
    const err = lonely.next("error");
    lonely.send({ t: "start" });
    expect((await err).message).toMatch(/players/);

    const { host, others } = await room(2);
    const guestErr = others[0]!.client.next("error");
    others[0]!.client.send({ t: "start" });
    expect((await guestErr).message).toMatch(/Only the host/);
    const snapshots = [host.client.next("game"), others[0]!.client.next("game")];
    host.client.send({ t: "start" });
    const [p1, p2] = (await Promise.all(snapshots)) as [GameMessage, GameMessage];
    expect(p1.snapshot).toBe(true);
    expect(p1.view.viewer).toBe("p1");
    expect(p2.view.viewer).toBe("p2");
    expect(p1.view.config.seed).toBe(0);
    expect(p1.view.phase).toBe("draft");
    for (const c of [lonely, host.client, others[0]!.client]) await c.close();
  });

  it("refuses bad requests with readable errors", async () => {
    const c = await Client.connect();
    let e = c.next("error");
    c.send({ nonsense: true });
    expect((await e).message).toMatch(/not understood/);
    e = c.next("error");
    c.socket.send("{not json");
    expect((await e).message).toMatch(/JSON/);
    e = c.next("error");
    c.send({ t: "join", code: "ZZZZZ", name: "X" });
    expect((await e).message).toMatch(/no room/);
    e = c.next("error");
    c.send({ t: "command", command: { type: "endTurn", player: "p1" } });
    expect((await e).message).toMatch(/Join a room/);
    await c.close();
  });

  it("answers the health check", async () => {
    const res = await fetch(`http://127.0.0.1:${server.port}/health`);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});

describe("a full online game", () => {
  it("keeps tokens secret, enforces who may act, reconnects, spectates and ends with a replay", async () => {
    const { code, host, others } = await room(2);
    const guest = others[0]!;
    const clients = new Map<string, Client>([
      ["p1", host.client],
      ["p2", guest.client],
    ]);
    const watcher = await Client.connect();
    const ww = watcher.next("welcome");
    watcher.send({ t: "spectate", code });
    expect((await ww).playerId).toBeNull();

    const started = [host.client.next("game"), guest.client.next("game"), watcher.next("game")];
    host.client.send({ t: "start" });
    await Promise.all(started);
    const current = (): GameState => stateFromView(host.client.lastView()!);

    // Online, everyone drafts at once.
    expect(current().config.draft).toBe("open");
    expect(drafters(current())).toEqual(["p1", "p2"]);
    // Acting for someone else is refused.
    const drafter = "p1";
    const other = "p2";
    const refused = clients.get(other)!.next("error");
    clients.get(other)!.send({ t: "command", command: { type: "draftPick", player: drafter, cardId: "sentinel-k7" } });
    expect((await refused).message).toMatch(/only act for yourself/);

    // Draft and deploy.
    while (current().phase === "draft") {
      const s = current();
      const p = drafters(s)[0]!;
      await act(clients, { type: "draftPick", player: p, cardId: draftableCards(s, ctx, p).find((id) => id === "sentinel-k7") ?? draftableCards(s, ctx, p)[0]! });
    }
    while (current().phase === "deploy") {
      const s = current();
      const { player, unitId } = currentDeployment(s)!;
      const unit = s.units.find((u) => u.id === unitId)!;
      const card = ctx.cards.get(unit.cardId)!;
      const taken: { hex: { q: number; r: number }; elevation: number }[] = [];
      const placements = unit.figures.map((f) => {
        const choice = deploymentPlacements(s, player, card, ctx, taken)[0]!;
        taken.push(...choice.spots);
        return { figureId: f.id, ...choice.placement };
      });
      await act(clients, { type: "deployUnit", player, unitId, placements });
    }

    // p1 places tokens: p2 and the spectator see that p1 placed them, but not where.
    const p1Unit = livingUnitsOf(current(), "p1")[0]!.id;
    await act(clients, { type: "placeTokens", player: "p1", tokens: { "1": p1Unit, "2": p1Unit, "3": p1Unit, X: p1Unit } });
    expect(host.client.lastView()!.tokens.p1).toEqual({ "1": p1Unit, "2": p1Unit, "3": p1Unit, X: p1Unit });
    expect(guest.client.lastView()!.tokensPlaced.p1).toBe(true);
    expect(guest.client.lastView()!.tokens.p1).toEqual({});
    expect(watcher.lastView()!.tokens.p1).toEqual({});
    expect(JSON.stringify(guest.client.messages)).not.toContain('"rng"');

    // The guest drops and comes back with their token.
    await guest.client.close();
    const back = await Client.connect();
    clients.set("p2", back);
    const rw = back.next("welcome");
    const snap = back.next("game", (m) => m.snapshot);
    back.send({ t: "rejoin", code, token: guest.token });
    expect((await rw).playerId).toBe("p2");
    expect((await snap).view.tokensPlaced.p1).toBe(true);
    const badRejoin = await Client.connect();
    const be = badRejoin.next("error");
    badRejoin.send({ t: "rejoin", code, token: "not-the-right-token" });
    expect((await be).message).toMatch(/not yours/);
    await badRejoin.close();

    // p2 places tokens too. Nobody's initiative is rolled until both players have rolled.
    const p2Unit = livingUnitsOf(current(), "p2")[0]!.id;
    await act(clients, { type: "placeTokens", player: "p2", tokens: { "1": p2Unit, "2": p2Unit, "3": p2Unit, X: p2Unit } });
    expect(current().phase).toBe("initiative");
    await act(clients, { type: "rollInitiative", player: "p1" });
    expect(back.lastView()!.initiativeReady).toEqual(["p1"]);
    expect(back.lastView()!.initiative).toBeNull();
    expect(JSON.stringify(back.messages)).not.toContain("initiativeRolled");
    await act(clients, { type: "rollInitiative", player: "p2" });
    expect(current().phase).toBe("turns");
    expect(current().initiative).toHaveLength(2);

    // Spectators cannot play.
    const se = watcher.next("error");
    watcher.send({ t: "command", command: { type: "concede", player: "p1" } });
    expect((await se).message).toMatch(/Spectators/);

    // p2 concedes: the game ends and everyone gets the replay.
    const replays = [host.client.next("replay"), back.next("replay"), watcher.next("replay")];
    await act(new Map([["p2", back]]), { type: "concede", player: "p2" });
    const [replay] = await Promise.all(replays);
    expect(host.client.lastView()!.phase).toBe("gameOver");
    expect(replay!.replay.setup.seed).not.toBe(0);
    const replayed = replayGame(replay!.replay.setup, replay!.replay.commands, ctx).state;
    expect(replayed.result).toEqual(host.client.lastView()!.result);

    for (const c of [host.client, back, watcher]) await c.close();
  });

  it("passes a ping to everyone else, at most once a second per player, and never from a spectator", async () => {
    const { code, host, others } = await room(2);
    const guest = others[0]!.client;
    const watcher = await Client.connect();
    const ww = watcher.next("welcome");
    watcher.send({ t: "spectate", code });
    await ww;
    const started = [host.client.next("game"), guest.next("game"), watcher.next("game")];
    host.client.send({ t: "start" });
    await Promise.all(started);

    const at = { x: 1.5, y: 0.6, z: -2 };
    const pinged = [guest.next("ping"), watcher.next("ping")];
    host.client.send({ t: "ping", at });
    for (const m of await Promise.all(pinged)) expect(m).toEqual({ t: "ping", player: host.playerId, at });

    // A second ping straight away is dropped. A message that does get through (the spectator's
    // refused command) shows the server has handled everything sent before it.
    host.client.send({ t: "ping", at: { x: 9, y: 0, z: 9 } });
    watcher.send({ t: "ping", at });
    const done = watcher.next("error");
    watcher.send({ t: "command", command: { type: "concede", player: host.playerId } });
    await done;
    const settled = guest.next("ping").then(() => "pinged", () => "quiet");
    expect(await settled).toBe("quiet");
    expect(guest.messages.filter((m) => m.t === "ping")).toHaveLength(1);
    expect(host.client.messages.some((m) => m.t === "ping")).toBe(false);

    // A ping that is not a point on the board is refused.
    const refused = host.client.next("error");
    host.client.send({ t: "ping", at: { x: "far", y: 0, z: 0 } });
    expect((await refused).message).toMatch(/not understood/);
    for (const c of [host.client, guest, watcher]) await c.close();
  });

  it("does not let new players join a game in progress", async () => {
    const { code, host, others } = await room(2);
    const started = host.client.next("game");
    host.client.send({ t: "start" });
    await started;
    const late = await Client.connect();
    const e = late.next("error");
    late.send({ t: "join", code, name: "Late" });
    expect((await e).message).toMatch(/already started/);
    for (const c of [late, host.client, others[0]!.client]) await c.close();
  });
});

describe("saving and resuming an online game", () => {
  it("lets only the host save, and resumes the game in a new room where players claim their armies", async () => {
    const { code, host, others } = await room(2);
    const guest = others[0]!;
    const started = host.client.next("game");
    host.client.send({ t: "start" });
    let state = stateFromView((await started).view);
    const clients = new Map([
      [host.playerId, host.client],
      [guest.playerId, guest.client],
    ]);
    const first = drafters(state)[0]!;
    await act(clients, { type: "draftPick", player: first, cardId: draftableCards(state, ctx, first)[0]! });
    state = stateFromView(host.client.lastView()!);

    // Only the host gets the file.
    const refused = guest.client.next("error");
    guest.client.send({ t: "save" });
    expect((await refused).message).toMatch(/Only the host/);
    const savedMsg = host.client.next("saved");
    host.client.send({ t: "save" });
    const record = (await savedMsg).record;
    expect(record.setup.seed).not.toBe(0);
    expect(record.commands).toHaveLength(1);
    expect(record.savedAt).toBeTruthy();
    expect(replayGame(record.setup, record.commands, ctx).state.units).toEqual(stateFromView(host.client.lastView()!).units);
    for (const c of [host.client, guest.client]) await c.close();
    void code;

    // Later: the host resumes it as the army they choose.
    const newHost = await Client.connect();
    const hw = newHost.next("welcome");
    newHost.send({ t: "resume", record: { ...record, name: "Tuesday game" }, playerId: guest.playerId });
    const hostWelcome = await hw;
    expect(hostWelcome.playerId).toBe(guest.playerId);
    expect(hostWelcome.room.resume?.name).toBe("Tuesday game");
    expect(hostWelcome.room.resume?.armies.map((a) => [a.playerId, a.taken])).toEqual([
      [host.playerId, false],
      [guest.playerId, true],
    ]);
    const tooSoon = newHost.next("error");
    newHost.send({ t: "start" });
    expect((await tooSoon).message).toMatch(/Waiting for Ana/);

    // A friend joins with the code and picks the other army.
    const friend = await Client.connect();
    const fw = friend.next("welcome");
    friend.send({ t: "join", code: hostWelcome.code, name: "Whoever" });
    const friendIn = await fw;
    expect(friendIn.playerId).toBeNull();
    expect(friendIn.room.resume).not.toBeNull();
    const taken = friend.next("error");
    friend.send({ t: "claim", playerId: guest.playerId });
    expect((await taken).message).toMatch(/already been taken/);
    const seated = friend.next("welcome");
    friend.send({ t: "claim", playerId: host.playerId });
    const friendSeat = await seated;
    expect(friendSeat.playerId).toBe(host.playerId);
    expect(friendSeat.token).toBeTruthy();
    const members = await newHost.seen("room", (m) => m.room.members.length === 2);
    expect(members.room.members.map((m) => [m.name, m.color])).toEqual(
      record.setup.players.map((p) => [p.name, p.color]),
    );

    // Carry on: same game, same position, and the log so far.
    const snapshots = [newHost.next("game"), friend.next("game")];
    newHost.send({ t: "start" });
    const [a, b] = (await Promise.all(snapshots)) as [GameMessage, GameMessage];
    expect(a.snapshot).toBe(true);
    expect(a.events.some((e) => e.type === "cardDrafted")).toBe(true);
    const resumed = stateFromView(a.view);
    expect(resumed.units).toEqual(state.units);
    expect(drafters(resumed)).toEqual(drafters(state));
    expect(b.view.viewer).toBe(host.playerId);
    const back = new Map([
      [host.playerId, friend],
      [guest.playerId, newHost],
    ]);
    const p = drafters(resumed)[0]!;
    await act(back, { type: "draftPick", player: p, cardId: draftableCards(resumed, ctx, p)[0]! });
    expect(stateFromView(newHost.lastView()!).units).toHaveLength(2);
    for (const c of [newHost, friend]) await c.close();
  });

  it("holds an attack show until every connected player has finished or skipped it", async () => {
    const setup: GameSetup = {
      seed: 21,
      mapId: map.id,
      roundLimit: null,
      budget: 140,
      draft: "open",
      initiative: "players",
      players: [
        { id: "p1", name: "Ana", color: "#e53935" },
        { id: "p2", name: "Bo", color: "#1e88e5" },
      ],
    };
    const { commands, attack } = playUntilAttack(setup);
    const record = { formatVersion: 1, setup, map, commands };
    const ana = await Client.connect();
    const aw = ana.next("welcome");
    ana.send({ t: "resume", record, playerId: "p1" });
    const anaIn = await aw;
    const bo = await Client.connect();
    const bw = bo.next("welcome");
    bo.send({ t: "join", code: anaIn.code, name: "Bo" });
    await bw;
    const seated = bo.next("welcome");
    bo.send({ t: "claim", playerId: "p2" });
    await seated;
    const watcher = await Client.connect();
    const ww = watcher.next("welcome");
    watcher.send({ t: "spectate", code: anaIn.code });
    await ww;
    const snapshots = [ana.next("game"), bo.next("game"), watcher.next("game")];
    ana.send({ t: "start" });
    const logged = ((await Promise.all(snapshots))[1] as GameMessage).events.length;
    const clients = new Map([
      ["p1", ana],
      ["p2", bo],
    ]);

    // The attack starts a show that both players are watching; everyone hears so.
    const opened = [ana.next("watching"), bo.next("watching"), watcher.next("watching")];
    await act(clients, attack);
    const shows = await Promise.all(opened);
    const game = bo.messages.filter((m): m is GameMessage => m.t === "game").at(-1)!;
    expect(game.events.some((e) => e.type === "attackRolled")).toBe(true);
    // The show is named by the length of the log once the attack happened, which every screen knows.
    const key = shows[0]!.show;
    expect(key).toBe(logged + game.events.length);
    for (const m of shows) expect([...m.waiting].sort()).toEqual(["p1", "p2"]);

    // A stale show and a spectator change nothing; the attacker skipping leaves Bo watching.
    watcher.send({ t: "watched", show: key });
    ana.send({ t: "watched", show: key - 1 });
    const one = bo.next("watching");
    ana.send({ t: "watched", show: key });
    expect((await one).waiting).toEqual(["p2"]);
    await watcher.seen("watching", (m) => m.waiting.length === 1);
    expect(watcher.messages.filter((m) => m.t === "watching").map((m) => (m as { waiting: string[] }).waiting.length)).toEqual([2, 1]);

    // Bo leaving the room for a moment counts as done: the show is over for everyone.
    const over = ana.next("watching");
    await bo.close();
    expect((await over).waiting).toEqual([]);
    for (const c of [ana, watcher]) await c.close();
  });

  it("refuses saves it cannot continue", async () => {
    const c = await Client.connect();
    const setup = {
      seed: 5,
      mapId: map.id,
      roundLimit: 3,
      budget: 140,
      players: [
        { id: "p1", name: "Ana", color: "#e53935" },
        { id: "p2", name: "Bo", color: "#1e88e5" },
      ],
    };
    const over = c.next("error");
    c.send({ t: "resume", record: { formatVersion: 1, setup, map, commands: [{ type: "concede", player: "p2" }] }, playerId: "p1" });
    expect((await over).message).toMatch(/already over/);
    const nobody = c.next("error");
    c.send({ t: "resume", record: { formatVersion: 1, setup, map, commands: [] }, playerId: "p9" });
    expect((await nobody).message).toMatch(/Choose one of the armies/);
    const broken = c.next("error");
    c.send({ t: "resume", record: { formatVersion: 1, setup, map, commands: [{ type: "endTurn", player: "p1" }] }, playerId: "p1" });
    expect((await broken).message).toMatch(/could not be loaded/);
    await c.close();
  });
});
