import { BLUFF_TOKEN, HEX_SIZE, hexToWorld, type Board, type GameState, type PlayerId, type RulesContext } from "@aoh/rules";
import type { TableMarker, TableUnit } from "./Table";
import { layoutTable, type Bounds, type TableLayout } from "./tableLayout";

/** The box round every hex of the board, in board coordinates. */
export function boardBounds(board: Board): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const half = (Math.sqrt(3) / 2) * HEX_SIZE;
  for (const h of board.hexes()) {
    const { x, z } = hexToWorld(h, HEX_SIZE);
    minX = Math.min(minX, x - half);
    maxX = Math.max(maxX, x + half);
    minZ = Math.min(minZ, z - HEX_SIZE);
    maxZ = Math.max(maxZ, z + HEX_SIZE);
  }
  return Number.isFinite(minX) ? { minX, maxX, minZ, maxZ } : { minX: -6, maxX: 6, minZ: -6, maxZ: 6 };
}

/**
 * The table for a game: each player's cards go on the side nearest the start
 * zone the map gave them. It depends only on who plays and which units they
 * drafted, so it stays put for the whole game.
 */
export function tableFor(state: GameState, ctx: RulesContext): TableLayout {
  const players = state.players.map((p) => {
    const zone = ctx.board.startZone(p.zone).map((h) => hexToWorld(h, HEX_SIZE));
    return {
      id: p.id,
      home: zone.length > 0 ? { x: zone.reduce((n, c) => n + c.x, 0) / zone.length, z: zone.reduce((n, c) => n + c.z, 0) / zone.length } : null,
      units: state.units.filter((u) => u.owner === p.id).map((u) => u.id),
    };
  });
  return layoutTable(boardBounds(ctx.board), players);
}

/** A key that changes only when `tableFor` would give a different table. */
export function tableKey(state: GameState): string {
  return state.players.map((p) => `${p.id}@${p.zone}:${state.units.filter((u) => u.owner === p.id).map((u) => u.id).join(",")}`).join("|");
}

/**
 * What lies on each unit's card: figures still to be deployed stand on it and
 * destroyed figures lie on it. `placing` lists figures being placed on the
 * board right now, which have left their card.
 */
export function tableUnits(
  state: GameState,
  ctx: RulesContext,
  colorOf: (player: string) => string,
  placing: ReadonlySet<string> = new Set(),
  viewer: TokenViewer = null,
): TableUnit[] {
  const markers = tokensOnCards(state, viewer);
  return state.units.map((unit) => ({
    unitId: unit.id,
    card: ctx.cards.get(unit.cardId)!,
    color: colorOf(unit.owner),
    figures: unit.figures.length,
    waiting: unit.figures.flatMap((f, i) => (!f.destroyed && !f.position && !placing.has(f.id) ? [i] : [])),
    destroyed: unit.figures.flatMap((f, i) => (f.destroyed ? [i] : [])),
    markers: markers.get(unit.id) ?? [],
    glyphs: (state.glyphs?.boosts ?? []).filter((b) => b.unitId === unit.id).map((b) => b.kind),
  }));
}

/** Whose token numbers this screen may show: one player's, every player's (a replay), or nobody's. */
export type TokenViewer = PlayerId | "all" | null;

/**
 * The activation tokens on each unit's card this round, as they lie on the table: face up (with
 * their number) where the viewer may know it, which is the viewer's own and any already revealed;
 * face down otherwise. A state rebuilt from an online view lists the other players' face-down
 * tokens in `hiddenTokens`, as it does not know their numbers.
 */
export function tokensOnCards(state: GameState, viewer: TokenViewer): Map<string, TableMarker[]> {
  const out = new Map<string, TableMarker[]>();
  const add = (unitId: string, marker: TableMarker) => out.set(unitId, [...(out.get(unitId) ?? []), marker]);
  for (const p of state.players) {
    const placed = state.tokens[p.id];
    if (!placed) continue;
    const revealed = state.revealed[p.id] ?? [];
    for (const [token, unitId] of Object.entries(placed)) {
      if (!unitId) continue;
      const known = viewer === "all" || viewer === p.id || revealed.includes(token);
      add(unitId, { player: p.id, label: known ? token : null });
    }
    for (const unitId of state.hiddenTokens?.[p.id] ?? []) add(unitId, { player: p.id, label: null });
  }
  // Lowest numbers first, the bluff after them and face-down tokens last, so nothing shows in which order hidden ones went down.
  const rank = (m: TableMarker) => (m.label === null ? 1e6 : m.label === BLUFF_TOKEN ? 1e5 : Number(m.label));
  for (const list of out.values()) list.sort((a, b) => rank(a) - rank(b));
  return out;
}
