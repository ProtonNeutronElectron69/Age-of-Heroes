import { Board } from "./board";
import { hexEquals, hexKey, type Hex } from "./hex";
import type { MapDefinition, PlacedPiece, SceneryPlacement } from "./schema";
import { MAX_PLAYERS } from "./schema";

/**
 * Pure functions for building maps. Each returns a new map definition and
 * never modifies its input, so an editor can keep an undo history.
 */

export function blankMap(id: string, name: string): MapDefinition {
  return { formatVersion: 1, id, name, description: "", pieces: [], scenery: [], startZones: [], layouts: {} };
}

function nextId(prefix: string, used: Iterable<string>): string {
  const taken = new Set(used);
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** The layer a piece lands on when dropped: on top of the highest terrain under any of its hexes. */
export function landingLayer(board: Board, cells: readonly Hex[]): number {
  let layer = 0;
  for (const h of cells) {
    const col = board.column(h);
    const top = col[col.length - 1];
    if (top) layer = Math.max(layer, top.layer + 1);
  }
  return layer;
}

/** Hexes where a piece at this layer would collide with existing terrain. */
export function overlappingCells(board: Board, cells: readonly Hex[], layer: number): Hex[] {
  return cells.filter((h) => board.cellAt(h, layer) !== undefined);
}

export function addPiece(map: MapDefinition, piece: Omit<PlacedPiece, "id">): { map: MapDefinition; id: string } {
  const id = nextId("p", map.pieces.map((p) => p.id));
  return { map: { ...map, pieces: [...map.pieces, { ...piece, id }] }, id };
}

/** Remove a piece, and any scenery that was standing on it. */
export function removePiece(map: MapDefinition, id: string): MapDefinition {
  const pieces = map.pieces.filter((p) => p.id !== id);
  const after = Board.fromMap({ ...map, pieces, scenery: [] }).board;
  const scenery = map.scenery.filter((s) => after.surfaceAt(s.hex, s.elevation) !== undefined);
  return { ...map, pieces, scenery };
}

export function addScenery(map: MapDefinition, kind: string, hex: Hex, elevation: number): MapDefinition {
  const id = nextId("s", map.scenery.map((s) => s.id));
  const placement: SceneryPlacement = { id, kind, hex, elevation };
  return { ...map, scenery: [...map.scenery, placement] };
}

export function removeScenery(map: MapDefinition, id: string): MapDefinition {
  return { ...map, scenery: map.scenery.filter((s) => s.id !== id) };
}

/**
 * Add a hex to a seat's start zone, or remove it if it is already there. A
 * hex belongs to at most one zone. Empty zones are dropped, along with any
 * layouts that used them.
 */
export function toggleZoneHex(map: MapDefinition, seat: number, hex: Hex): MapDefinition {
  if (seat < 0 || seat >= MAX_PLAYERS) return map;
  const inSeat = map.startZones.find((z) => z.seat === seat)?.hexes.some((h) => hexEquals(h, hex)) ?? false;
  let zones = map.startZones.map((z) => ({ ...z, hexes: z.hexes.filter((h) => !hexEquals(h, hex)) }));
  if (!inSeat) {
    const existing = zones.find((z) => z.seat === seat);
    if (existing) existing.hexes.push(hex);
    else zones.push({ seat, hexes: [hex] });
  }
  zones = zones.filter((z) => z.hexes.length > 0).sort((a, b) => a.seat - b.seat);
  const seats = new Set(zones.map((z) => z.seat));
  const layouts = Object.fromEntries(
    Object.entries(map.layouts).filter(([, list]) => list.every((s) => seats.has(s))),
  );
  return { ...map, startZones: zones, layouts };
}

/** Set (or with null, clear) which zones players use for a player count. */
export function setLayout(map: MapDefinition, players: number, zones: number[] | null): MapDefinition {
  const layouts = { ...map.layouts };
  if (zones) layouts[String(players)] = zones;
  else delete layouts[String(players)];
  return { ...map, layouts };
}

export interface MapStats {
  readonly pieces: number;
  readonly hexes: number;
  readonly maxElevation: number;
  readonly scenery: number;
  readonly zones: { seat: number; size: number }[];
}

export function mapStats(map: MapDefinition, board: Board): MapStats {
  return {
    pieces: map.pieces.length,
    hexes: board.hexes().length,
    maxElevation: board.maxElevation(),
    scenery: map.scenery.length,
    zones: map.startZones.map((z) => ({ seat: z.seat, size: new Set(z.hexes.map(hexKey)).size })),
  };
}
