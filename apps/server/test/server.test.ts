import { MAPS, contextFor } from "@aoh/content";
import { stateFromView, type ServerMessage } from "@aoh/protocol";
import {
  currentDeployment,
  currentDrafter,
  deploymentPlacements,
  draftableCards,
  livingUnitsOf,
  replayGame,
  type Command,
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

  static async connect(): Promise<Client> {
    const socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
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

const settings = (extra: object = {}) => ({ mode: "basic", roundLimit: 3, armySize: 1, map, ...extra });

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

    // Acting for someone else is refused.
    const drafter = currentDrafter(current())!;
    const other = drafter === "p1" ? "p2" : "p1";
    const refused = clients.get(other)!.next("error");
    clients.get(other)!.send({ t: "command", command: { type: "draftPick", player: drafter, cardId: "sentinel-k7" } });
    expect((await refused).message).toMatch(/only act for yourself/);

    // Draft and deploy.
    while (current().phase === "draft") {
      const s = current();
      const p = currentDrafter(s)!;
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
