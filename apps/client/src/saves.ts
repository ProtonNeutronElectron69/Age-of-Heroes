import type { Replay } from "@aoh/protocol";
import type { GameState, MapDefinition, RulesMode } from "@aoh/rules";

/**
 * Named saves of hot-seat games, kept in this browser. A save is the game's
 * record (setup, map and commands); loading it replays the commands, so the
 * game continues exactly where it was. The same record can be downloaded as a
 * file and opened on another device, or watched as a replay.
 */

/** What the saved games list shows without replaying the game. */
export interface SaveSummary {
  readonly mapName: string;
  readonly mode: RulesMode;
  readonly players: readonly { readonly name: string; readonly color: string }[];
  /** "Draft", "Deployment", "Round 3" or "Game over". */
  readonly progress: string;
}

export interface SaveSlot {
  readonly id: string;
  readonly name: string;
  readonly savedAt: string;
  readonly summary: SaveSummary;
  readonly record: Replay;
}

const SLOTS_KEY = "age-of-heroes:saves:v1";
export const MAX_SAVE_NAME = 60;

export function progressOf(state: GameState): string {
  switch (state.phase) {
    case "draft":
      return "Draft";
    case "deploy":
      return "Deployment";
    case "gameOver":
      return "Game over";
    default:
      return `Round ${state.round}`;
  }
}

export function summarize(state: GameState, map: MapDefinition): SaveSummary {
  return {
    mapName: map.name,
    mode: state.config.mode,
    players: state.players.map((p) => ({ name: p.name, color: p.color })),
    progress: progressOf(state),
  };
}

/** A name to offer when saving: the map and how far the game has got. */
export function defaultSaveName(summary: SaveSummary): string {
  return `${summary.mapName}, ${summary.progress.toLowerCase()}`;
}

/** One line for lists: "Basic, Proving Grounds, Ann vs Bo, round 3". */
export function describeSummary(summary: SaveSummary): string {
  const mode = summary.mode === "basic" ? "Basic" : "Advanced";
  const players = summary.players.map((p) => p.name).join(" vs ");
  return `${mode}, ${summary.mapName}, ${players}, ${summary.progress.toLowerCase()}`;
}

export function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function listSaves(): SaveSlot[] {
  try {
    const raw = localStorage.getItem(SLOTS_KEY);
    const list = raw ? (JSON.parse(raw) as SaveSlot[]) : [];
    return Array.isArray(list) ? [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : [];
  } catch {
    return [];
  }
}

function writeSaves(list: readonly SaveSlot[]): string | null {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(list));
    return null;
  } catch {
    return "This browser has no room left for saves. Delete an old save, or download this one as a file instead.";
  }
}

/**
 * Save a game under a name. Saving again under a name that already exists
 * replaces that save. Returns an error message, or null when it worked.
 */
export function storeSave(name: string, record: Replay, summary: SaveSummary): string | null {
  const clean = name.trim().slice(0, MAX_SAVE_NAME) || defaultSaveName(summary);
  const savedAt = new Date().toISOString();
  const list = listSaves();
  const existing = list.find((s) => s.name === clean);
  const slot: SaveSlot = {
    id: existing?.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    savedAt,
    summary,
    record: { ...record, name: clean, savedAt },
  };
  return writeSaves([slot, ...list.filter((s) => s.id !== slot.id)]);
}

export function deleteSave(id: string): void {
  writeSaves(listSaves().filter((s) => s.id !== id));
}

/** Download a game record as a file: a save to continue later, or a replay to watch. */
export function downloadGameFile(record: Replay, label: string): void {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "game";
  const blob = new Blob([JSON.stringify(record)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `age-of-heroes-${slug}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
