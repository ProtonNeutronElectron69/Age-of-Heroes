import { Board } from "./board";
import { DIRECTIONS, hexAdd, hexEquals, hexKey, hexNeighbors, hexToWorld, type Hex } from "./hex";
import type { Rng } from "./rng";
import type { MapDefinition, PlacedPiece, SceneryPlacement } from "./schema";
import { MAX_PLAYERS } from "./schema";
import { shapeCells, type ShapeId } from "./shapes";
import type { SceneryRules, SceneryTable, TerrainTable } from "./terrain";
import { HEX_SIZE } from "./world";

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
  return removeItems(map, [id], []);
}

/** Remove several pieces and pieces of scenery at once, and any scenery left with nothing under it. */
export function removeItems(
  map: MapDefinition,
  pieceIds: Iterable<string>,
  sceneryIds: Iterable<string>,
): MapDefinition {
  const goPieces = new Set(pieceIds);
  const goScenery = new Set(sceneryIds);
  const pieces = map.pieces.filter((p) => !goPieces.has(p.id));
  const after = Board.fromMap({ ...map, pieces, scenery: [] }).board;
  const scenery = map.scenery.filter(
    (s) => !goScenery.has(s.id) && after.surfaceAt(s.hex, s.elevation) !== undefined,
  );
  return { ...map, pieces, scenery };
}

/** Problems that removing the piece (or scenery) fixes. Duplicate ids are left for the person to sort out. */
const PIECE_PROBLEMS = new Set(["unsupported", "overlap", "unknownTerrain"]);
const SCENERY_PROBLEMS = new Set(["unknownScenery", "sceneryOffBoard", "sceneryOverlap", "sceneryTooTall"]);

/**
 * Remove every piece that is floating, overlaps another or has unknown
 * terrain, and every piece of scenery with a problem. Bridges and overhangs
 * that are held up stay.
 */
export function removeProblems(
  map: MapDefinition,
  terrain?: TerrainTable,
  scenery?: SceneryTable,
): { map: MapDefinition; pieces: number; scenery: number } {
  let next = map;
  let pieces = 0;
  let removedScenery = 0;
  for (let pass = 0; pass < 10; pass++) {
    const { issues } = Board.fromMap(next, terrain, scenery);
    const pieceIds = new Set(issues.filter((i) => PIECE_PROBLEMS.has(i.code) && i.pieceId).map((i) => i.pieceId!));
    const sceneryIds = new Set(
      issues.filter((i) => SCENERY_PROBLEMS.has(i.code) && i.sceneryId).map((i) => i.sceneryId!),
    );
    if (pieceIds.size === 0 && sceneryIds.size === 0) break;
    const before = next.scenery.length;
    next = removeItems(next, pieceIds, sceneryIds);
    pieces += pieceIds.size;
    removedScenery += before - next.scenery.length;
  }
  return { map: next, pieces, scenery: removedScenery };
}

/** Remove every start zone and the layouts that used them. */
export function clearStartZones(map: MapDefinition): MapDefinition {
  return { ...map, startZones: [], layouts: {} };
}

/**
 * Placing a piece beside another at the same level: the neighbour of `cell`
 * on the side nearest the pointer (`point`, in world units), and that side's
 * direction (0 to 5, the order of DIRECTIONS).
 */
export function sidePlacement(cell: Hex, point: { x: number; z: number }): { origin: Hex; direction: number } {
  const c = hexToWorld(cell, HEX_SIZE);
  let best = 0;
  let bestDot = -Infinity;
  DIRECTIONS.forEach((d, i) => {
    const w = hexToWorld(d, HEX_SIZE);
    const dot = w.x * (point.x - c.x) + w.z * (point.z - c.z);
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  });
  return { origin: hexAdd(cell, DIRECTIONS[best]!), direction: best };
}

/** Share of the open hexes one random fill covers, so fills stay light and can be repeated. */
const TERRAIN_FILL = 0.08;
const SCENERY_FILL = 0.04;
/** Small pieces for random fills, with how often each is tried. */
const FILL_SHAPES: readonly [ShapeId, number][] = [
  ["single", 2],
  ["double", 3],
  ["line3", 2],
  ["triangle3", 2],
  ["rhombus4", 2],
];

function pickWeighted<T>(rng: Rng, items: readonly [T, number][]): T {
  const total = items.reduce((n, [, w]) => n + w, 0);
  let roll = rng.float() * total;
  for (const [item, w] of items) {
    roll -= w;
    if (roll < 0) return item;
  }
  return items[items.length - 1]![0];
}

/**
 * Scatter small pieces (1 to 4 hexes) on level `level` (2 or more): each one
 * sits on top of standard terrain and copies it, so grass grows on grass.
 * Only hexes whose top is at the level below are used, which keeps the space
 * under bridges open, and hexes with scenery are left alone.
 */
export function populateTerrain(
  map: MapDefinition,
  level: number,
  rng: Rng,
  terrain: TerrainTable,
): { map: MapDefinition; added: number } {
  const layer = level - 1;
  if (layer < 1) return { map, added: 0 };
  const board = Board.fromMap(map).board;
  const open = new Map<string, string>();
  for (const h of board.hexes()) {
    const col = board.column(h);
    const top = col[col.length - 1];
    if (!top || top.layer !== layer - 1) continue;
    if (terrain.get(top.terrain)?.category !== "standard") continue;
    if (board.sceneryAt(h, layer)) continue;
    open.set(hexKey(h), top.terrain);
  }
  if (open.size === 0) return { map, added: 0 };
  const keys = [...open.keys()].sort();
  const target = Math.max(1, Math.ceil(open.size * TERRAIN_FILL));
  let next = map;
  let covered = 0;
  let added = 0;
  for (let attempt = 0; attempt < target * 30 && covered < target; attempt++) {
    const start = keys[rng.int(0, keys.length - 1)]!;
    const kind = open.get(start);
    if (!kind) continue;
    const [q, r] = start.split(",").map(Number) as [number, number];
    const shape = pickWeighted(rng, FILL_SHAPES);
    const rotation = rng.int(0, 5);
    const cells = shapeCells(shape, { q, r }, rotation);
    if (!cells.every((c) => open.get(hexKey(c)) === kind)) continue;
    next = addPiece(next, { shape, terrain: kind, origin: { q, r }, rotation, layer }).map;
    for (const c of cells) open.delete(hexKey(c));
    covered += cells.length;
    added += 1;
  }
  return { map: next, added };
}

/**
 * Scatter scenery on surfaces at elevation `level` (the top of level `level`
 * pieces): only on standard terrain, outside start zones, where it fits under
 * anything above, and never next to other scenery.
 */
export function populateScenery(
  map: MapDefinition,
  level: number,
  rng: Rng,
  terrain: TerrainTable,
  scenery: SceneryTable,
): { map: MapDefinition; added: number } {
  const board = Board.fromMap(map, terrain, scenery).board;
  const zone = new Set(map.startZones.flatMap((z) => z.hexes.map(hexKey)));
  const crowded = new Set(map.scenery.flatMap((s) => [s.hex, ...hexNeighbors(s.hex)].map(hexKey)));
  const kinds: SceneryRules[] = [...scenery.values()];
  const open: { hex: Hex; clearance: number }[] = [];
  for (const h of board.hexes()) {
    const s = board.surfaceAt(h, level);
    if (!s || terrain.get(s.terrain)?.category !== "standard") continue;
    if (zone.has(hexKey(h)) || crowded.has(hexKey(h))) continue;
    open.push({ hex: h, clearance: s.clearance });
  }
  open.sort((a, b) => hexKey(a.hex).localeCompare(hexKey(b.hex)));
  const target = Math.max(1, Math.ceil(open.length * SCENERY_FILL));
  let next = map;
  let added = 0;
  for (let attempt = 0; attempt < target * 30 && added < target && open.length > 0; attempt++) {
    const spot = open[rng.int(0, open.length - 1)]!;
    if (crowded.has(hexKey(spot.hex))) continue;
    const fits = kinds.filter((k) => k.height <= spot.clearance);
    if (fits.length === 0) continue;
    const kind = fits[rng.int(0, fits.length - 1)]!;
    next = addScenery(next, kind.id, spot.hex, level);
    for (const h of [spot.hex, ...hexNeighbors(spot.hex)]) crowded.add(hexKey(h));
    added += 1;
  }
  return { map: next, added };
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
