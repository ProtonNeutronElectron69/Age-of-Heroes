import type { ClientMessage, RoomInfo, RoomSettings, ServerMessage } from "@aoh/protocol";
import type { MapDefinition } from "@aoh/rules";
import { useSyncExternalStore } from "react";
import { applyServerGame, connectRemote, endOnlineSession, setOnlineReplay, setSessionError } from "./session";

/**
 * The connection to the game server: lobby state before the game, and the
 * pipe for commands and updates during it. Reconnects on its own, using the
 * secret token the server gave this player, so a dropped connection or a page
 * reload puts the player back in their seat.
 */

export type OnlineStatus = "idle" | "connecting" | "lobby" | "playing";

export interface OnlineState {
  readonly status: OnlineStatus;
  readonly serverUrl: string;
  readonly code: string | null;
  /** This device's player id, or null when watching. */
  readonly me: string | null;
  readonly room: RoomInfo | null;
  readonly map: MapDefinition | null;
  readonly connected: boolean;
  readonly error: string | null;
}

const SEAT_KEY = "age-of-heroes:online:v1";
const SERVER_KEY = "age-of-heroes:server:v1";
const NAME_KEY = "age-of-heroes:name:v1";
/** Close code the server uses when a newer connection takes over the same seat. */
const REPLACED = 4000;

interface SavedSeat {
  serverUrl: string;
  code: string;
  token: string;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // Storage unavailable: online play still works, it just cannot rejoin after a reload.
  }
}

/** The server to use: the last one typed in, the one this build was made for, or a local one in development. */
export function defaultServerUrl(): string {
  try {
    const last = localStorage.getItem(SERVER_KEY);
    if (last) return last;
  } catch {
    // ignore
  }
  const built = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (built) return built;
  return location.hostname === "localhost" || location.hostname === "127.0.0.1" ? "ws://localhost:8080/ws" : "";
}

/**
 * Accept what people tend to paste: a bare host, an http(s) address or a
 * ws(s) address, with or without the /ws path.
 */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) url = url.replace(/^http/i, "ws");
  else if (!/^wss?:\/\//i.test(url)) {
    const local = /^(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
    url = `${local ? "ws" : "wss"}://${url}`;
  }
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/" || parsed.pathname === "") parsed.pathname = "/ws";
    return parsed.toString();
  } catch {
    return url;
  }
}

/** The name this device last played under online. */
export function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

let state: OnlineState = {
  status: "idle",
  serverUrl: "",
  code: null,
  me: null,
  room: null,
  map: null,
  connected: false,
  error: null,
};
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
/** What to send whenever the socket (re)opens. */
let hello: ClientMessage | null = null;
let token: string | null = null;
let retries = 0;
let retryTimer: number | null = null;
let leaving = false;
/** True from opening a socket until the server says which room we are in. */
let awaitingWelcome = false;
/** When the current attempt to get into a room began. */
let connectStarted = 0;
/** How long to keep trying to reach a server before giving up. A sleeping free server can take a minute to wake. */
const CONNECT_PATIENCE_MS = 90_000;

function set(patch: Partial<OnlineState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function send(message: ClientMessage): boolean {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(message));
  return true;
}

connectRemote((command) => send({ t: "command", command }));

function open(url: string, first: ClientMessage): void {
  leaving = false;
  hello = first;
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  socket?.close();
  let ws: WebSocket;
  try {
    ws = new WebSocket(url);
  } catch {
    set({ status: "idle", error: "That server address is not valid" });
    return;
  }
  socket = ws;
  set({ serverUrl: url, connected: false, error: null, status: state.status === "idle" ? "connecting" : state.status });
  ws.onopen = () => {
    retries = 0;
    awaitingWelcome = true;
    set({ connected: true });
    if (hello) send(hello);
  };
  ws.onmessage = (e) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(e.data)) as ServerMessage;
    } catch {
      return;
    }
    receive(msg);
  };
  ws.onclose = (e) => {
    if (socket !== ws) return;
    set({ connected: false });
    if (leaving || state.status === "idle") return;
    if (e.code === REPLACED) {
      // The same seat was opened in another tab or window; let that one have it.
      disconnect(false);
      set({ error: "This seat was opened in another tab or window." });
      return;
    }
    retries += 1;
    if (state.status === "connecting" && Date.now() - connectStarted > CONNECT_PATIENCE_MS) {
      // Never got in: the address is wrong or the server is down. Stop and say so.
      disconnect();
      set({ error: `Could not reach a game server at ${url}` });
      return;
    }
    // Come back to the same seat (or keep watching) after a short, growing delay.
    const delay = Math.min(10000, 500 * 2 ** Math.min(retries, 5));
    retryTimer = window.setTimeout(() => open(url, hello ?? first), delay);
  };
}

function receive(msg: ServerMessage): void {
  switch (msg.t) {
    case "welcome": {
      awaitingWelcome = false;
      token = msg.token;
      if (msg.token) {
        write(SEAT_KEY, { serverUrl: state.serverUrl, code: msg.code, token: msg.token } satisfies SavedSeat);
        hello = { t: "rejoin", code: msg.code, token: msg.token };
      } else {
        hello = { t: "spectate", code: msg.code };
      }
      write(SERVER_KEY, state.serverUrl);
      set({
        code: msg.code,
        me: msg.playerId,
        room: msg.room,
        map: msg.map,
        status: msg.room.started ? "playing" : "lobby",
        error: null,
      });
      return;
    }
    case "room":
      set({ room: msg.room });
      return;
    case "game":
      if (state.map) applyServerGame(state.map, state.me, msg.view, msg.events);
      set({ status: "playing" });
      return;
    case "replay":
      setOnlineReplay(msg.replay);
      return;
    case "error":
      if (state.status === "connecting" || awaitingWelcome) {
        // Joining failed (no such room, room full, the game was cleared...): give up rather than retry.
        disconnect();
        set({ error: msg.message });
      } else if (state.status === "playing") {
        setSessionError(msg.message);
      } else {
        set({ error: msg.message });
      }
      return;
  }
}

function begin(url: string, first: ClientMessage, name?: string): void {
  const address = normalizeServerUrl(url);
  if (!address) {
    set({ error: "Enter the game server's address first" });
    return;
  }
  if (name !== undefined) write(NAME_KEY, name);
  connectStarted = Date.now();
  retries = 0;
  set({ status: "connecting", error: null });
  open(address, first);
}

export function createRoom(url: string, name: string, settings: RoomSettings): void {
  begin(url, { t: "create", name, settings }, name);
}

export function joinRoom(url: string, code: string, name: string): void {
  begin(url, { t: "join", code, name }, name);
}

export function spectateRoom(url: string, code: string): void {
  begin(url, { t: "spectate", code });
}

/** A seat from an earlier visit, if any. */
export function savedSeat(): SavedSeat | null {
  return readJson<SavedSeat>(SEAT_KEY);
}

export function rejoinSaved(): boolean {
  const seat = savedSeat();
  if (!seat) return false;
  begin(seat.serverUrl, { t: "rejoin", code: seat.code, token: seat.token });
  return true;
}

export function startRoom(): void {
  if (!send({ t: "start" })) set({ error: "Not connected to the game server" });
}

function disconnect(forgetSeat = true): void {
  leaving = true;
  awaitingWelcome = false;
  if (retryTimer !== null) window.clearTimeout(retryTimer);
  retryTimer = null;
  socket?.close();
  socket = null;
  token = null;
  hello = null;
  retries = 0;
  if (forgetSeat) write(SEAT_KEY, null);
  set({ status: "idle", code: null, me: null, room: null, map: null, connected: false, error: null });
  endOnlineSession();
}

/** Leave the room (conceding if the game is under way) and forget the seat. */
export function leaveOnline(): void {
  send({ t: "leave" });
  disconnect();
}

/** Back to the menu after a finished game, without conceding anything. */
export function closeOnline(): void {
  disconnect();
}

export function clearOnlineError(): void {
  set({ error: null });
}

export function hasSeatToken(): boolean {
  return token !== null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOnline(): OnlineState {
  return useSyncExternalStore(subscribe, () => state);
}
