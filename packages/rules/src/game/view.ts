import { deepClone } from "../clone";
import type { GameEvent, GameState, PlayerId, TokenAssignment, TokenId } from "./types";

/**
 * What one player is allowed to see. Other players' unrevealed tokens are
 * hidden, and the RNG state is removed so nobody can predict future rolls.
 * A server sends only views; hot-seat play uses them behind the pass screen.
 */
export interface PlayerView extends Omit<GameState, "tokens" | "rng"> {
  readonly viewer: PlayerId | null;
  /** Visible token placements: all of the viewer's own, only revealed ones for others. */
  readonly tokens: Record<PlayerId, Partial<TokenAssignment>>;
  readonly tokensPlaced: Record<PlayerId, boolean>;
}

export function viewFor(state: GameState, viewer: PlayerId | null): PlayerView {
  const { tokens, rng: _rng, ...rest } = deepClone(state);
  const visible: Record<PlayerId, Partial<TokenAssignment>> = {};
  const placed: Record<PlayerId, boolean> = {};
  for (const p of state.players) {
    const assignment = tokens[p.id];
    placed[p.id] = assignment !== null && assignment !== undefined;
    if (!assignment) {
      visible[p.id] = {};
    } else if (p.id === viewer) {
      visible[p.id] = { ...assignment };
    } else {
      const shown: Partial<TokenAssignment> = {};
      for (const t of state.revealed[p.id] ?? []) shown[t as TokenId] = assignment[t as TokenId];
      visible[p.id] = shown;
    }
  }
  return { ...rest, viewer, tokens: visible, tokensPlaced: placed };
}

/** Events carry no secret information yet; this is where per-player filtering will go. */
export function eventsFor(events: readonly GameEvent[], _viewer: PlayerId | null): GameEvent[] {
  return [...events];
}
