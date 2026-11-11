import { DIRECTIONS, hexAdd, hexKey, parseHexKey, type Hex } from "./hex";
import type { MapDefinition, PlacedPiece, SceneryPlacement } from "./schema";
import { MAX_PLAYERS, MIN_PLAYERS } from "./schema";
import { shapeCells } from "./shapes";
import { DEFAULT_SCENERY, type SceneryRules, type SceneryTable, type TerrainTable } from "./terrain";

/** One solid block of terrain: a single hex of a piece, one layer thick. */
export interface Cell {
  readonly hex: Hex;
  readonly layer: number;
  readonly terrain: string;
  readonly pieceId: string;
}

/** The top face of a cell that a figure could stand on. */
export interface Surface {
  readonly hex: Hex;
  /** Height of the standing surface in levels (cell layer + 1). */
  readonly elevation: number;
  readonly terrain: string;
  readonly pieceId: string;
  /** Empty levels above the surface before the next solid cell (Infinity if open sky). */
  readonly clearance: number;
}

/** A piece of scenery on the board, with its rules resolved. */
export interface ScenerySpot {
  readonly placement: SceneryPlacement;
  readonly rules: SceneryRules;
}

export type MapIssueCode =
  | "duplicatePieceId"
  | "overlap"
  | "unsupported"
  | "unknownTerrain"
  | "startZoneOffBoard"
  | "startZoneOverlap"
  | "duplicateSeat"
  | "tooManyStartZones"
  | "badLayout"
  | "duplicateSceneryId"
  | "unknownScenery"
  | "sceneryOffBoard"
  | "sceneryOverlap"
  | "sceneryTooTall";

export interface MapIssue {
  readonly severity: "error" | "warning";
  readonly code: MapIssueCode;
  readonly message: string;
  readonly pieceId?: string;
  readonly sceneryId?: string;
  readonly hex?: Hex;
}

/** Piece shapes that join into one span when they bridge a gap together. */
const SPAN_SHAPES: ReadonlySet<string> = new Set(["single", "double", "line3"]);

/**
 * The battlefield as a set of hex columns. Each column holds the solid cells
 * stacked in it, sorted bottom to top. Gaps between cells are allowed, which
 * is how bridges and overhangs are represented.
 */
export class Board {
  private readonly columns = new Map<string, Cell[]>();
  private readonly piecesById = new Map<string, PlacedPiece>();
  private readonly sceneryBySpot = new Map<string, ScenerySpot>();
  private readonly sceneryByHex = new Map<string, ScenerySpot[]>();
  private readonly spanPieces = new Set<string>();

  private constructor(readonly definition: MapDefinition) {}

  /**
   * Build a board from a map definition. Never throws on bad map data:
   * problems are returned as issues so an editor can show them.
   */
  static fromMap(
    def: MapDefinition,
    terrain?: TerrainTable,
    scenery?: SceneryTable,
  ): { board: Board; issues: MapIssue[] } {
    const board = new Board(def);
    const issues: MapIssue[] = [];

    for (const piece of def.pieces) {
      if (board.piecesById.has(piece.id)) {
        issues.push({
          severity: "error",
          code: "duplicatePieceId",
          message: `Duplicate piece id "${piece.id}"`,
          pieceId: piece.id,
        });
        continue;
      }
      if (terrain && !terrain.has(piece.terrain)) {
        issues.push({
          severity: "error",
          code: "unknownTerrain",
          message: `Piece "${piece.id}" uses unknown terrain "${piece.terrain}"`,
          pieceId: piece.id,
        });
      }
      board.piecesById.set(piece.id, piece);
      for (const h of shapeCells(piece.shape, piece.origin, piece.rotation)) {
        const existing = board.cellAt(h, piece.layer);
        if (existing) {
          issues.push({
            severity: "error",
            code: "overlap",
            message: `Piece "${piece.id}" overlaps "${existing.pieceId}" at ${hexKey(h)} layer ${piece.layer}`,
            pieceId: piece.id,
            hex: h,
          });
          continue;
        }
        board.insert({ hex: h, layer: piece.layer, terrain: piece.terrain, pieceId: piece.id });
      }
    }

    issues.push(...board.supportIssues());
    issues.push(...board.placeScenery(scenery));
    issues.push(...board.startZoneIssues());
    issues.push(...board.layoutIssues());
    return { board, issues };
  }

  private insert(cell: Cell): void {
    const key = hexKey(cell.hex);
    const col = this.columns.get(key) ?? [];
    col.push(cell);
    col.sort((a, b) => a.layer - b.layer);
    this.columns.set(key, col);
  }

  private placeScenery(table: SceneryTable | undefined): MapIssue[] {
    const issues: MapIssue[] = [];
    const ids = new Set<string>();
    for (const placement of this.definition.scenery ?? []) {
      const where = `${hexKey(placement.hex)} level ${placement.elevation}`;
      if (ids.has(placement.id)) {
        issues.push({ severity: "error", code: "duplicateSceneryId", message: `Duplicate scenery id "${placement.id}"` });
        continue;
      }
      ids.add(placement.id);
      const rules = table?.get(placement.kind);
      if (table && !rules) {
        issues.push({
          severity: "error",
          code: "unknownScenery",
          message: `Unknown scenery "${placement.kind}" at ${where}`,
          sceneryId: placement.id,
          hex: placement.hex,
        });
      }
      const surface = this.surfaceAt(placement.hex, placement.elevation);
      if (!surface) {
        issues.push({
          severity: "error",
          code: "sceneryOffBoard",
          message: `Scenery at ${where} has no ground under it`,
          sceneryId: placement.id,
          hex: placement.hex,
        });
        continue;
      }
      const key = `${hexKey(placement.hex)}@${placement.elevation}`;
      if (this.sceneryBySpot.has(key)) {
        issues.push({
          severity: "error",
          code: "sceneryOverlap",
          message: `Two pieces of scenery stand at ${where}`,
          sceneryId: placement.id,
          hex: placement.hex,
        });
        continue;
      }
      const spot: ScenerySpot = { placement, rules: rules ?? DEFAULT_SCENERY };
      if (surface.clearance < spot.rules.height) {
        issues.push({
          severity: "error",
          code: "sceneryTooTall",
          message: `${spot.rules.name} at ${where} does not fit under the terrain above it`,
          sceneryId: placement.id,
          hex: placement.hex,
        });
      }
      this.sceneryBySpot.set(key, spot);
      const list = this.sceneryByHex.get(hexKey(placement.hex)) ?? [];
      list.push(spot);
      this.sceneryByHex.set(hexKey(placement.hex), list);
    }
    return issues;
  }

  /**
   * Pieces must be held up. A piece is held up when it rests on the table, or
   * any of its hexes rests on a piece that is held up (an overhang). A run of
   * pieces with nothing under them (a bridge) is held up when, at its own
   * level, it touches held-up pieces on two opposite sides: two of its sides
   * that face at least 120 degrees apart. Touching on one side only, or along
   * one wall, does not count.
   */
  private supportIssues(): MapIssue[] {
    const cellsByPiece = new Map<string, Cell[]>();
    for (const col of this.columns.values()) {
      for (const cell of col) {
        const list = cellsByPiece.get(cell.pieceId) ?? [];
        list.push(cell);
        cellsByPiece.set(cell.pieceId, list);
      }
    }
    const supported = new Set<string>();
    const queue: string[] = [];
    const hold = (id: string) => {
      if (supported.has(id)) return;
      supported.add(id);
      queue.push(id);
    };
    const spread = () => {
      while (queue.length > 0) {
        for (const cell of cellsByPiece.get(queue.shift()!) ?? []) {
          const above = this.cellAt(cell.hex, cell.layer + 1);
          if (above) hold(above.pieceId);
        }
      }
    };
    for (const [id, cells] of cellsByPiece) {
      if (cells.some((c) => c.layer === 0)) hold(id);
    }
    spread();

    // Bridges: keep anchoring runs of floating pieces until nothing changes.
    for (;;) {
      let grew = false;
      for (const span of this.floatingSpans(cellsByPiece, supported)) {
        if (!span.anchored) continue;
        grew = true;
        for (const id of span.pieces) hold(id);
        if (span.pieces.length > 1 && span.pieces.every((id) => SPAN_SHAPES.has(this.piecesById.get(id)?.shape ?? ""))) {
          for (const id of span.pieces) this.spanPieces.add(id);
        }
      }
      if (!grew) break;
      spread();
    }

    const issues: MapIssue[] = [];
    for (const id of cellsByPiece.keys()) {
      if (!supported.has(id)) {
        issues.push({
          severity: "error",
          code: "unsupported",
          message: `Piece "${id}" is floating; rest it on the table or another piece, or join it to pieces on two opposite sides`,
          pieceId: id,
        });
      }
    }
    return issues;
  }

  /**
   * Groups of floating pieces joined side by side at one level, and whether
   * each group touches held-up pieces on two opposite sides.
   */
  private floatingSpans(
    cellsByPiece: ReadonlyMap<string, Cell[]>,
    supported: ReadonlySet<string>,
  ): { pieces: string[]; anchored: boolean }[] {
    const seen = new Set<string>();
    const spans: { pieces: string[]; anchored: boolean }[] = [];
    for (const start of cellsByPiece.keys()) {
      if (supported.has(start) || seen.has(start)) continue;
      const pieces: string[] = [];
      const sides = new Set<number>();
      const stack = [start];
      seen.add(start);
      while (stack.length > 0) {
        const id = stack.pop()!;
        pieces.push(id);
        for (const cell of cellsByPiece.get(id) ?? []) {
          DIRECTIONS.forEach((d, dir) => {
            const next = this.cellAt(hexAdd(cell.hex, d), cell.layer);
            if (!next || next.pieceId === id) return;
            if (supported.has(next.pieceId)) sides.add(dir);
            else if (!seen.has(next.pieceId)) {
              seen.add(next.pieceId);
              stack.push(next.pieceId);
            }
          });
        }
      }
      const list = [...sides];
      const anchored = list.some((a) => list.some((b) => Math.min((a - b + 6) % 6, (b - a + 6) % 6) >= 2));
      spans.push({ pieces, anchored });
    }
    return spans;
  }

  private startZoneIssues(): MapIssue[] {
    const issues: MapIssue[] = [];
    const zones = this.definition.startZones;
    if (zones.length > MAX_PLAYERS) {
      issues.push({
        severity: "error",
        code: "tooManyStartZones",
        message: `At most ${MAX_PLAYERS} start zones are allowed`,
      });
    }
    const seats = new Set<number>();
    const claimed = new Map<string, number>();
    for (const zone of zones) {
      if (seats.has(zone.seat)) {
        issues.push({
          severity: "error",
          code: "duplicateSeat",
          message: `More than one start zone for seat ${zone.seat + 1}`,
        });
      }
      seats.add(zone.seat);
      for (const h of zone.hexes) {
        const key = hexKey(h);
        if (!this.columns.has(key)) {
          issues.push({
            severity: "error",
            code: "startZoneOffBoard",
            message: `Start zone for seat ${zone.seat + 1} includes ${key}, which has no terrain`,
            hex: h,
          });
        }
        const other = claimed.get(key);
        if (other !== undefined && other !== zone.seat) {
          issues.push({
            severity: "error",
            code: "startZoneOverlap",
            message: `Hex ${key} is in the start zones of seats ${other + 1} and ${zone.seat + 1}`,
            hex: h,
          });
        }
        claimed.set(key, zone.seat);
      }
    }
    return issues;
  }

  private layoutIssues(): MapIssue[] {
    const issues: MapIssue[] = [];
    const seats = new Set(this.definition.startZones.map((z) => z.seat));
    for (const [count, zones] of Object.entries(this.definition.layouts ?? {})) {
      const ok =
        zones.length === Number(count) && new Set(zones).size === zones.length && zones.every((z) => seats.has(z));
      if (!ok) {
        issues.push({
          severity: "error",
          code: "badLayout",
          message: `The ${count}-player layout must list ${count} different start zones that exist`,
        });
      }
    }
    return issues;
  }

  /** Scenery standing on a spot, if any. */
  sceneryAt(h: Hex, elevation: number): ScenerySpot | undefined {
    return this.sceneryBySpot.get(`${hexKey(h)}@${elevation}`);
  }

  /** All scenery in one hex column. */
  sceneryIn(h: Hex): readonly ScenerySpot[] {
    return this.sceneryByHex.get(hexKey(h)) ?? [];
  }

  scenery(): ScenerySpot[] {
    return [...this.sceneryBySpot.values()];
  }

  /** Player counts this map can host: every player needs their own start zone. */
  playerCounts(): number[] {
    const counts: number[] = [];
    for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
      const zones = Array.from({ length: n }, (_, i) => this.zoneFor(i, n));
      if (new Set(zones).size === n && zones.every((z) => this.startZone(z).length > 0)) counts.push(n);
    }
    return counts;
  }

  /** The start zone (seat number) used by player `index` in a game of `players`. */
  zoneFor(index: number, players: number): number {
    return this.definition.layouts?.[String(players)]?.[index] ?? index;
  }

  get id(): string {
    return this.definition.id;
  }

  /**
   * Pieces that bridge a gap together (singles, 2-hex and 3-hex lines held up
   * only at their ends). They are drawn as one span.
   */
  isSpanPiece(id: string): boolean {
    return this.spanPieces.has(id);
  }

  piece(id: string): PlacedPiece | undefined {
    return this.piecesById.get(id);
  }

  hexes(): Hex[] {
    return [...this.columns.keys()].map(parseHexKey);
  }

  has(h: Hex): boolean {
    return this.columns.has(hexKey(h));
  }

  column(h: Hex): readonly Cell[] {
    return this.columns.get(hexKey(h)) ?? [];
  }

  cells(): Cell[] {
    return [...this.columns.values()].flat();
  }

  cellAt(h: Hex, layer: number): Cell | undefined {
    return this.column(h).find((c) => c.layer === layer);
  }

  /** Every standable surface in a column, bottom to top. */
  surfaces(h: Hex): Surface[] {
    const col = this.column(h);
    const result: Surface[] = [];
    for (let i = 0; i < col.length; i++) {
      const cell = col[i]!;
      const next = col[i + 1];
      if (next && next.layer === cell.layer + 1) continue; // buried
      result.push({
        hex: cell.hex,
        elevation: cell.layer + 1,
        terrain: cell.terrain,
        pieceId: cell.pieceId,
        clearance: next ? next.layer - (cell.layer + 1) : Number.POSITIVE_INFINITY,
      });
    }
    return result;
  }

  topSurface(h: Hex): Surface | undefined {
    const s = this.surfaces(h);
    return s[s.length - 1];
  }

  surfaceAt(h: Hex, elevation: number): Surface | undefined {
    return this.surfaces(h).find((s) => s.elevation === elevation);
  }

  maxElevation(): number {
    let max = 0;
    for (const col of this.columns.values()) {
      const top = col[col.length - 1];
      if (top) max = Math.max(max, top.layer + 1);
    }
    return max;
  }

  /** Do start zones grow to fit each army (see `growZones` on the map)? */
  growsZones(): boolean {
    return this.definition.growZones === true;
  }

  startZone(seat: number): Hex[] {
    return this.definition.startZones.find((z) => z.seat === seat)?.hexes ?? [];
  }
}
