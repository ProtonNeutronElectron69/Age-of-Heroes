import { contextFor, getMap } from "@aoh/content";
import {
  applyCommand,
  createGame,
  replayGame,
  type Command,
  type GameEvent,
  type GameSetup,
  type GameState,
  type RulesContext,
} from "@aoh/rules";
import { useSyncExternalStore } from "react";

/**
 * The local game session: setup, current state and the command log. Every
 * change goes through the rules engine. The setup and log are saved in the
 * browser so a game survives a page reload (the engine replays them).
 */
export interface Session {
  readonly setup: GameSetup;
  readonly ctx: RulesContext;
  readonly state: GameState;
  readonly commands: readonly Command[];
  /** Every event so far, oldest first. */
  readonly events: readonly GameEvent[];
  /** Events produced by the most recent command. */
  readonly lastEvents: readonly GameEvent[];
  readonly error: string | null;
}

const SAVE_KEY = "age-of-heroes:save:v1";

let session: Session | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function contextForSetup(setup: GameSetup): RulesContext {
  const map = getMap(setup.mapId);
  if (!map) throw new Error(`Unknown map ${setup.mapId}`);
  return contextFor(map).ctx;
}

function save(): void {
  try {
    if (session) {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ setup: session.setup, commands: session.commands }));
    } else {
      localStorage.removeItem(SAVE_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the game still works.
  }
}

export function startGame(setup: GameSetup): void {
  const ctx = contextForSetup(setup);
  const { state, events } = createGame(setup, ctx);
  session = { setup, ctx, state, commands: [], events, lastEvents: events, error: null };
  save();
  emit();
}

export function dispatch(command: Command): boolean {
  if (!session) return false;
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

export function endSession(): void {
  session = null;
  save();
  emit();
}

/** A saved game from an earlier visit, if there is one. */
export function savedGame(): { setup: GameSetup; commands: Command[] } | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as { setup: GameSetup; commands: Command[] }) : null;
  } catch {
    return null;
  }
}

export function resumeSavedGame(): boolean {
  const saved = savedGame();
  if (!saved) return false;
  try {
    const ctx = contextForSetup(saved.setup);
    const { state, events } = replayGame(saved.setup, saved.commands, ctx);
    session = { setup: saved.setup, ctx, state, commands: saved.commands, events, lastEvents: [], error: null };
    emit();
    return true;
  } catch {
    endSession();
    return false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSession(): Session | null {
  return useSyncExternalStore(subscribe, () => session);
}
