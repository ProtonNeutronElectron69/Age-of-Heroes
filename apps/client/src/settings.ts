import { useSyncExternalStore } from "react";
import { COLOR_SCHEMES, type ColorScheme } from "./models";

/**
 * How the board draws figures, chosen by each player for their own screen and
 * kept in this browser. It changes nothing in the game itself.
 */
export interface DisplaySettings {
  /** Figure models on bases, or the plain tokens that show the hit band. */
  readonly figures: "models" | "tokens";
  /** How models and the rings round their bases are coloured. */
  readonly scheme: ColorScheme;
}

const KEY = "aoh.display";
const DEFAULTS: DisplaySettings = { figures: "models", scheme: "faction" };

function load(): DisplaySettings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<DisplaySettings>;
    return {
      figures: saved.figures === "tokens" ? "tokens" : "models",
      scheme: COLOR_SCHEMES.some((s) => s.id === saved.scheme) ? saved.scheme! : DEFAULTS.scheme,
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = load();
const listeners = new Set<() => void>();

export function setDisplay(change: Partial<DisplaySettings>): void {
  settings = { ...settings, ...change };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Kept for this visit only.
  }
  for (const l of listeners) l();
}

/** Switches the board between figure models and tokens (the T key on the play screen). */
export function toggleFigures(): void {
  setDisplay({ figures: settings.figures === "models" ? "tokens" : "models" });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDisplay(): DisplaySettings {
  return useSyncExternalStore(subscribe, () => settings);
}
