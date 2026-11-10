import { contextFor } from "@aoh/content";
import { stateFromView, type Replay } from "@aoh/protocol";
import {
  applyCommand,
  createGame,
  replayGame,
  type Command,
  type GameEvent,
  type GameSetup,
  type GameState,
  type MapDefinition,
  type PlayerView,
  type RulesContext,
} from "@aoh/rules";
import { useSyncExternalStore } from "react";
import { summarize, type SaveSummary } from "./saves";

/**
 * The game being played. A local (hot-seat) session runs the rules engine in
 * the browser and is saved so a reload can continue it. An online session
 * sends commands to the game server and shows what the server says this
 * player may see.
 */
export interface Session {
  readonly kind: "local" | "online";
  /** Online: the player on this device (null for a spectator). Local: null, everyone plays here. */
  readonly me: string | null;
  /** Online: set once the game is over and the server sends the full record. */
  readonly replay: Replay | null;
  readonly setup: GameSetup;
  /** The map is stored with the game, so custom maps can be resumed even if edited later. */
  readonly map: MapDefinition;
  readonly ctx: RulesContext;
  readonly state: GameState;
  readonly commands: readonly Command[];
  /** Every event so far, oldest first. */
  readonly events: readonly GameEvent[];
  /** Events produced by the most recent command. */
  readonly lastEvents: readonly GameEvent[];
  readonly error: string | null;
  /** Online: a command was sent and the server has not answered yet. Always false locally. */
  readonly pending: boolean;
}

const SAVE_KEY = "age-of-heroes:save:v2";

let session: Session | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function save(): void {
  if (session?.kind === "online") return; // online games live on the server
  try {
    if (session) {
      const saved: SavedGame = {
        setup: session.setup,
        map: session.map,
        commands: [...session.commands],
        summary: summarize(session.state, session.map),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(saved));
    } else {
      localStorage.removeItem(SAVE_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the game still works.
  }
}

export function startGame(setup: GameSetup, map: MapDefinition): void {
  const ctx = contextFor(map).ctx;
  const { state, events } = createGame(setup, ctx);
  session = {
    kind: "local",
    me: null,
    replay: null,
    setup,
    map,
    ctx,
    state,
    commands: [],
    events,
    lastEvents: events,
    error: null,
    pending: false,
  };
  save();
  emit();
}

// ---------------------------------------------------------------------------
// Online sessions (driven by online.ts)

let remoteSend: ((command: Command) => boolean) | null = null;

/** online.ts registers how commands reach the server (false when there is no connection). */
export function connectRemote(send: (command: Command) => boolean): void {
  remoteSend = send;
}

/**
 * Apply a game update from the server: one move's events, or (for a snapshot after
 * joining or reconnecting) the whole log so far, which replaces the one shown.
 */
export function applyServerGame(
  map: MapDefinition,
  me: string | null,
  view: PlayerView,
  events: GameEvent[],
  snapshot = false,
): void {
  const state = stateFromView(view);
  if (!session || session.kind !== "online") {
    const ctx = contextFor(map).ctx;
    const setup: GameSetup = {
      mode: state.config.mode,
      seed: 0,
      mapId: map.id,
      roundLimit: state.config.roundLimit,
      players: state.players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
    };
    session = {
      kind: "online",
      me,
      replay: null,
      setup,
      map,
      ctx,
      state,
      commands: [],
      events,
      // A catch-up is history: do not replay its dice.
      lastEvents: snapshot ? [] : events,
      error: null,
      pending: false,
    };
  } else {
    session = {
      ...session,
      me,
      state,
      events: snapshot ? events : [...session.events, ...events],
      lastEvents: snapshot ? [] : events,
      error: null,
      pending: false,
    };
  }
  emit();
}

export function setOnlineReplay(replay: Replay): void {
  if (session?.kind !== "online") return;
  session = { ...session, replay, setup: replay.setup, commands: replay.commands };
  emit();
}

export function setSessionError(message: string): void {
  if (!session) return;
  session = { ...session, error: message, pending: false };
  emit();
}

/** May the person at this device act for `player`? Always yes in a hot-seat game. */
export function canControl(s: Session, player: string | null | undefined): boolean {
  if (!player) return false;
  return s.kind === "local" || s.me === player;
}

/** The full record of a game, for download. Online games have it once the server sends it at the end. */
export function replayOf(s: Session): Replay | null {
  if (s.kind === "online") return s.replay;
  return { formatVersion: 1, setup: s.setup, map: s.map, commands: [...s.commands] };
}

export function dispatch(command: Command): boolean {
  if (!session) return false;
  if (session.kind === "online") {
    if (session.pending) return false;
    if (!remoteSend?.(command)) {
      session = { ...session, error: "Not connected to the game server. Try again once the connection is back." };
      emit();
      return false;
    }
    session = { ...session, pending: true, error: null };
    emit();
    return true;
  }
  const result = applyCommand(session.state, command, session.ctx);
  if (!result.ok) {
    session = { ...session, error: result.error };
    emit();
    return false;
  }
  session = {
    ...session,
    state: result.state,
    commands: [...session.commands, command],
    events: [...session.events, ...result.events],
    lastEvents: result.events,
    error: null,
  };
  save();
  emit();
  return true;
}

export function clearError(): void {
  if (session?.error) {
    session = { ...session, error: null };
    emit();
  }
}

/** Close a hot-seat game (and drop its save). Online games are left through online.ts. */
export function endSession(): void {
  if (session?.kind === "online") return endOnlineSession();
  session = null;
  save();
  emit();
}

/** Drop the online game from this device (the server keeps running it). */
export function endOnlineSession(): void {
  if (session?.kind !== "online") return;
  session = null;
  emit();
}

interface SavedGame {
  setup: GameSetup;
  map: MapDefinition;
  commands: Command[];
  /** Absent in saves from before named saves existed. */
  summary?: SaveSummary;
}

/** The unfinished hot-seat game from an earlier visit (kept automatically), if there is one. */
export function savedGame(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SavedGame) : null;
  } catch {
    return null;
  }
}

/** Continue the game kept automatically from an earlier visit. */
export function resumeSavedGame(): boolean {
  const saved = savedGame();
  if (!saved) return false;
  if (loadGame(saved) === null) return true;
  // It no longer replays (made by an older version of the rules): drop it.
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
  emit();
  return false;
}

/**
 * Start playing a game from its record (a named save, a save file or a
 * replay): every command is replayed, so it picks up exactly where it was.
 * The loaded game becomes the one kept automatically. Returns an error
 * message, or null when it worked.
 */
export function loadGame(record: { setup: GameSetup; map: MapDefinition; commands: readonly Command[] }): string | null {
  try {
    const ctx = contextFor(record.map).ctx;
    const { state, events } = replayGame(record.setup, record.commands, ctx);
    session = {
      kind: "local",
      me: null,
      replay: null,
      setup: record.setup,
      map: record.map,
      ctx,
      state,
      commands: [...record.commands],
      events,
      lastEvents: [],
      error: null,
      pending: false,
    };
    save();
    emit();
    return null;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return `This game could not be loaded. It may come from an older version of the rules. (${detail})`;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, () => session);
}
