import { SEAT_COLORS, contextFor } from "@aoh/content";
import {
  PROTOCOL_VERSION,
  clientMessageSchema,
  type ClientMessage,
  type Replay,
  type RoomInfo,
  type RoomSettings,
  type ServerMessage,
} from "@aoh/protocol";
import {
  applyCommand,
  createGame,
  eventsFor,
  replayGame,
  viewFor,
  type Command,
  type GameEvent,
  type GameSetup,
  type GameState,
  type RulesContext,
} from "@aoh/rules";
import { randomBytes, randomInt } from "node:crypto";
import type { RoomStore, StoredRoom } from "./store";

/** One connected browser. The transport (WebSocket) sits behind this. */
export interface Connection {
  send(message: ServerMessage): void;
  close(): void;
}

interface Member {
  readonly playerId: string;
  name: string;
  /** Secret that lets this player reconnect. */
  readonly token: string;
  conn: Connection | null;
}

interface Room {
  readonly code: string;
  readonly settings: RoomSettings;
  readonly ctx: RulesContext;
  readonly playerCounts: number[];
  members: Member[];
  hostId: string;
  spectators: Set<Connection>;
  nextPlayer: number;
  setup: GameSetup | null;
  state: GameState | null;
  commands: Command[];
  lastActive: number;
}

interface Seat {
  readonly room: Room;
  /** null for spectators. */
  readonly playerId: string | null;
}

export interface RoomManagerOptions {
  /** Most rooms at once (default 500). */
  readonly maxRooms?: number;
  /** Rooms with nobody connected are removed after this long (default 2 hours). */
  readonly idleMs?: number;
  readonly now?: () => number;
  /** Keeps rooms through a restart. Without one, rooms live only in memory. */
  readonly store?: RoomStore;
}

// Letters only, without ones that are easy to confuse (I, O).
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * All game rooms. Owns every game's true state and command log; players only
 * ever receive their own view. Transport-independent so it can be tested
 * without a network.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly seats = new Map<Connection, Seat>();
  private readonly maxRooms: number;
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly store: RoomStore | null;

  constructor(options: RoomManagerOptions = {}) {
    this.maxRooms = options.maxRooms ?? 500;
    this.idleMs = options.idleMs ?? 2 * 60 * 60 * 1000;
    this.now = options.now ?? Date.now;
    this.store = options.store ?? null;
    if (this.store) for (const stored of this.store.loadAll()) this.restore(stored);
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  /** Write any room changes still waiting to be stored. */
  flush(): void {
    this.store?.flush();
  }

  /** Rebuild a stored room: same code, seats and tokens; the game is replayed from its commands. */
  private restore(stored: StoredRoom): void {
    try {
      const { ctx } = contextFor(stored.settings.map);
      const state = stored.setup ? replayGame(stored.setup, stored.commands, ctx).state : null;
      this.rooms.set(stored.code, {
        code: stored.code,
        settings: stored.settings,
        ctx,
        playerCounts: ctx.board.playerCounts(),
        members: stored.members.map((m) => ({ playerId: m.playerId, name: m.name, token: m.token, conn: null })),
        hostId: stored.hostId,
        spectators: new Set(),
        nextPlayer: stored.nextPlayer,
        setup: stored.setup,
        state,
        commands: [...stored.commands],
        lastActive: stored.lastActive,
      });
    } catch (err) {
      // Made by an older version of the rules, most likely: it can no longer be replayed.
      console.warn(`Dropping stored room ${stored.code}: ${(err as Error).message}`);
      this.store?.remove(stored.code);
    }
  }

  /** Remember the room's current state, if rooms are being stored. */
  private persist(room: Room): void {
    if (!this.store || !this.rooms.has(room.code)) return;
    this.store.save({
      version: 1,
      code: room.code,
      settings: room.settings,
      members: room.members.map((m) => ({ playerId: m.playerId, name: m.name, token: m.token })),
      hostId: room.hostId,
      nextPlayer: room.nextPlayer,
      setup: room.setup,
      commands: [...room.commands],
      lastActive: room.lastActive,
    });
  }

  private dropRoom(code: string): void {
    this.rooms.delete(code);
    this.store?.remove(code);
  }

  /** Handle one raw message from a connection. Never throws. */
  handle(conn: Connection, raw: string): void {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return this.error(conn, "Messages must be JSON");
    }
    const parsed = clientMessageSchema.safeParse(data);
    if (!parsed.success) return this.error(conn, "That request was not understood");
    try {
      this.dispatch(conn, parsed.data);
    } catch (err) {
      this.error(conn, err instanceof Error ? err.message : "Something went wrong");
    }
  }

  /** The connection went away. Players keep their seat and can rejoin. */
  disconnect(conn: Connection): void {
    const seat = this.seats.get(conn);
    if (!seat) return;
    this.seats.delete(conn);
    const room = seat.room;
    room.spectators.delete(conn);
    const member = room.members.find((m) => m.conn === conn);
    if (member) member.conn = null;
    room.lastActive = this.now();
    this.persist(room);
    this.broadcastRoom(room);
  }

  /** Remove rooms nobody has been connected to for a while. */
  sweep(): void {
    const now = this.now();
    for (const [code, room] of this.rooms) {
      const anyone = room.members.some((m) => m.conn) || room.spectators.size > 0;
      if (!anyone && now - room.lastActive > this.idleMs) this.dropRoom(code);
    }
  }

  // -------------------------------------------------------------------------

  private dispatch(conn: Connection, msg: ClientMessage): void {
    switch (msg.t) {
      case "create":
        return this.create(conn, msg.name, msg.settings);
      case "join":
        return this.join(conn, msg.code, msg.name);
      case "rejoin":
        return this.rejoin(conn, msg.code, msg.token);
      case "spectate":
        return this.spectate(conn, msg.code);
      case "start":
        return this.start(conn);
      case "command":
        return this.command(conn, msg.command as Command);
      case "leave":
        return this.leave(conn);
    }
  }

  private create(conn: Connection, name: string, settings: RoomSettings): void {
    this.mustBeFree(conn);
    if (this.rooms.size >= this.maxRooms) throw new Error("The server is full; try again later");
    const { ctx, issues } = contextFor(settings.map);
    if (issues.some((i) => i.severity === "error")) throw new Error("That map has problems and cannot be played");
    const playerCounts = ctx.board.playerCounts();
    if (playerCounts.length === 0) throw new Error("That map has no start zones for 2 or more players");
    const room: Room = {
      code: this.newCode(),
      settings,
      ctx,
      playerCounts,
      members: [],
      hostId: "",
      spectators: new Set(),
      nextPlayer: 1,
      setup: null,
      state: null,
      commands: [],
      lastActive: this.now(),
    };
    this.rooms.set(room.code, room);
    const member = this.addMember(room, conn, name);
    room.hostId = member.playerId;
    this.persist(room);
    this.welcome(conn, room, member);
  }

  private join(conn: Connection, code: string, name: string): void {
    this.mustBeFree(conn);
    const room = this.room(code);
    if (room.state) throw new Error("That game has already started; you can watch it instead");
    if (room.members.length >= Math.max(...room.playerCounts)) throw new Error("That room is full");
    const member = this.addMember(room, conn, name);
    this.persist(room);
    this.welcome(conn, room, member);
    this.broadcastRoom(room);
  }

  private rejoin(conn: Connection, code: string, token: string): void {
    this.mustBeFree(conn);
    const room = this.room(code);
    const member = room.members.find((m) => m.token === token);
    if (!member) throw new Error("That seat is not yours");
    if (member.conn) {
      // An older tab or a dropped connection still holds the seat: replace it.
      const old = member.conn;
      this.seats.delete(old);
      old.close();
    }
    member.conn = conn;
    this.seats.set(conn, { room, playerId: member.playerId });
    room.lastActive = this.now();
    this.persist(room);
    this.welcome(conn, room, member);
    this.broadcastRoom(room);
  }

  private spectate(conn: Connection, code: string): void {
    this.mustBeFree(conn);
    const room = this.room(code);
    room.spectators.add(conn);
    this.seats.set(conn, { room, playerId: null });
    this.welcome(conn, room, null);
    this.broadcastRoom(room);
  }

  private start(conn: Connection): void {
    const { room, playerId } = this.seatOf(conn);
    if (playerId !== room.hostId) throw new Error("Only the host can start the game");
    if (room.state) throw new Error("The game has already started");
    const n = room.members.length;
    if (!room.playerCounts.includes(n)) {
      throw new Error(`This map is for ${room.playerCounts.join(", ")} players; there are ${n}`);
    }
    const s = room.settings;
    const setup: GameSetup = {
      mode: s.mode,
      seed: randomInt(0, 2 ** 31),
      mapId: s.map.id,
      roundLimit: s.roundLimit,
      players: room.members.map((m, i) => ({ id: m.playerId, name: m.name, color: SEAT_COLORS[i]! })),
      ...(s.mode === "advanced" && s.budget !== undefined
        ? { budget: s.budget, factionPure: s.factionPure ?? false }
        : { armySize: s.armySize ?? 3 }),
    };
    const { state, events } = createGame(setup, room.ctx);
    room.setup = setup;
    room.state = state;
    room.lastActive = this.now();
    this.persist(room);
    this.broadcastRoom(room);
    this.broadcastGame(room, events, true);
  }

  private command(conn: Connection, command: Command): void {
    const { room, playerId } = this.seatOf(conn);
    if (!playerId) throw new Error("Spectators cannot play");
    if (!room.state) throw new Error("The game has not started");
    if (command.player !== playerId) throw new Error("You can only act for yourself");
    const result = applyCommand(room.state, command, room.ctx);
    if (!result.ok) throw new Error(result.error);
    room.state = result.state;
    room.commands.push(command);
    room.lastActive = this.now();
    this.persist(room);
    this.broadcastGame(room, result.events, false);
    if (result.state.phase === "gameOver") this.broadcastReplay(room);
  }

  private leave(conn: Connection): void {
    const { room, playerId } = this.seatOf(conn);
    this.seats.delete(conn);
    room.spectators.delete(conn);
    if (playerId) {
      if (!room.state) {
        // Before the game: give up the seat.
        room.members = room.members.filter((m) => m.playerId !== playerId);
        if (room.members.length === 0) {
          this.dropRoom(room.code);
          return;
        }
        if (room.hostId === playerId) room.hostId = room.members[0]!.playerId;
      } else {
        // During the game: leaving concedes.
        const member = room.members.find((m) => m.playerId === playerId)!;
        member.conn = null;
        const p = room.state.players.find((x) => x.id === playerId);
        if (p && !p.eliminated && room.state.phase !== "gameOver") {
          const result = applyCommand(room.state, { type: "concede", player: playerId }, room.ctx);
          if (result.ok) {
            room.state = result.state;
            room.commands.push({ type: "concede", player: playerId });
            room.lastActive = this.now();
            this.broadcastGame(room, result.events, false);
            if (result.state.phase === "gameOver") this.broadcastReplay(room);
          }
        }
      }
    }
    this.persist(room);
    this.broadcastRoom(room);
  }

  // -------------------------------------------------------------------------

  private addMember(room: Room, conn: Connection, name: string): Member {
    const taken = new Set(room.members.map((m) => m.name));
    let unique = name;
    for (let n = 2; taken.has(unique); n++) unique = `${name} ${n}`;
    const member: Member = {
      playerId: `p${room.nextPlayer++}`,
      name: unique,
      token: randomBytes(18).toString("base64url"),
      conn,
    };
    room.members.push(member);
    this.seats.set(conn, { room, playerId: member.playerId });
    room.lastActive = this.now();
    return member;
  }

  private newCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 5; i++) code += CODE_LETTERS[randomInt(0, CODE_LETTERS.length)];
      if (!this.rooms.has(code)) return code;
    }
  }

  private room(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new Error(`There is no room ${code}`);
    return room;
  }

  private seatOf(conn: Connection): Seat {
    const seat = this.seats.get(conn);
    if (!seat) throw new Error("Join a room first");
    return seat;
  }

  private mustBeFree(conn: Connection): void {
    if (this.seats.has(conn)) throw new Error("Leave your current room first");
  }

  private info(room: Room): RoomInfo {
    const s = room.settings;
    return {
      code: room.code,
      mapName: s.map.name,
      mode: s.mode,
      roundLimit: s.roundLimit,
      armySize: s.mode === "advanced" && s.budget !== undefined ? null : (s.armySize ?? 3),
      budget: s.mode === "advanced" ? (s.budget ?? null) : null,
      factionPure: s.mode === "advanced" && (s.factionPure ?? false),
      members: room.members.map((m, i) => ({
        playerId: m.playerId,
        name: m.name,
        seat: i,
        color: SEAT_COLORS[i]!,
        connected: m.conn !== null,
        host: m.playerId === room.hostId,
      })),
      spectators: room.spectators.size,
      started: room.state !== null,
      playerCounts: room.playerCounts,
    };
  }

  private welcome(conn: Connection, room: Room, member: Member | null): void {
    conn.send({
      t: "welcome",
      protocol: PROTOCOL_VERSION,
      code: room.code,
      playerId: member?.playerId ?? null,
      token: member?.token ?? null,
      room: this.info(room),
      map: room.settings.map,
    });
    if (room.state) {
      conn.send({ t: "game", view: viewFor(room.state, member?.playerId ?? null), events: [], snapshot: true });
      if (room.state.phase === "gameOver") conn.send({ t: "replay", replay: this.replay(room) });
    }
  }

  private recipients(room: Room): { conn: Connection; viewer: string | null }[] {
    const list: { conn: Connection; viewer: string | null }[] = [];
    for (const m of room.members) if (m.conn) list.push({ conn: m.conn, viewer: m.playerId });
    for (const c of room.spectators) list.push({ conn: c, viewer: null });
    return list;
  }

  private broadcastRoom(room: Room): void {
    const info = this.info(room);
    for (const { conn } of this.recipients(room)) conn.send({ t: "room", room: info });
  }

  /** Everyone gets the game as they may see it: their own tokens, nobody else's, and no dice secrets. */
  private broadcastGame(room: Room, events: GameEvent[], snapshot: boolean): void {
    for (const { conn, viewer } of this.recipients(room)) {
      conn.send({ t: "game", view: viewFor(room.state!, viewer), events: eventsFor(events, viewer), snapshot });
    }
  }

  private replay(room: Room): Replay {
    return { formatVersion: 1, setup: room.setup!, map: room.settings.map, commands: room.commands };
  }

  private broadcastReplay(room: Room): void {
    const replay = this.replay(room);
    for (const { conn } of this.recipients(room)) conn.send({ t: "replay", replay });
  }

  private error(conn: Connection, message: string): void {
    conn.send({ t: "error", message });
  }
}
