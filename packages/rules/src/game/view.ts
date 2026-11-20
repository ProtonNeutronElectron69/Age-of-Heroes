import { deepClone } from "../clone";
import type { GameEvent, GameState, PlayerId, TokenAssignment } from "./types";

/**
 * What one player is allowed to see. Other players' unrevealed tokens are
 * hidden, and both the RNG state and the starting seed are removed: with the
 * seed and the moves so far, anyone could work out every future roll.
 * A server sends only views; hot-seat play uses them behind the pass screen.
 */
export interface PlayerView extends Omit<GameState, "tokens" | "rng" | "hiddenTokens"> {
  readonly viewer: PlayerId | null;
  /** Visible token placements: all of the viewer's own, only revealed ones for others. */
  readonly tokens: Record<PlayerId, Partial<TokenAssignment>>;
  readonly tokensPlaced: Record<PlayerId, boolean>;
  /**
   * The units holding each other player's unrevealed tokens, sorted, without the numbers: the
   * tokens lie face down on their cards, so where they are is no secret, only which is which.
   */
  readonly hiddenTokens: Record<PlayerId, string[]>;
}

export function viewFor(state: GameState, viewer: PlayerId | null): PlayerView {
  const { tokens, rng: _rng, ...rest } = deepClone(state);
  const visible: Record<PlayerId, Partial<TokenAssignment>> = {};
  const placed: Record<PlayerId, boolean> = {};
  const hidden: Record<PlayerId, string[]> = {};
  for (const p of state.players) {
    const assignment = tokens[p.id];
    placed[p.id] = assignment !== null && assignment !== undefined;
    if (!assignment) {
      visible[p.id] = {};
    } else if (p.id === viewer) {
      visible[p.id] = { ...assignment };
    } else {
      const shown: Partial<TokenAssignment> = {};
      const revealed = state.revealed[p.id] ?? [];
      for (const t of revealed) shown[t] = assignment[t];
      visible[p.id] = shown;
      hidden[p.id] = Object.entries(assignment)
        .filter(([t, unitId]) => unitId && !revealed.includes(t))
        .map(([, unitId]) => unitId!)
        .sort();
    }
  }
  // Glyphs lie face down: nobody sees what one on the board is, and only its holder sees a held one.
  if (rest.glyphs) {
    rest.glyphs.onBoard = rest.glyphs.onBoard.map((g) => ({ ...g, kind: null }));
    for (const id of Object.keys(rest.glyphs.held)) {
      if (id !== viewer) rest.glyphs.held[id] = rest.glyphs.held[id]!.map((g) => ({ ...g, kind: null }));
    }
  }
  delete rest.hiddenTokens;
  return { ...rest, config: { ...rest.config, seed: 0 }, viewer, tokens: visible, tokensPlaced: placed, hiddenTokens: hidden };
}

/** Events carry no secret information yet; this is where per-player filtering will go. */
export function eventsFor(events: readonly GameEvent[], _viewer: PlayerId | null): GameEvent[] {
  return [...events];
}
