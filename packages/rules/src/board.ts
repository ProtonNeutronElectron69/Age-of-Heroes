import { hexKey, parseHexKey, type Hex } from "./hex";
import type { MapDefinition, PlacedPiece } from "./schema";
import { MAX_PLAYERS } from "./schema";
import { shapeCells } from "./shapes";
import type { TerrainTable } from "./terrain";

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

export type MapIssueCode =
  | "duplicatePieceId"
  | "overlap"
  | "unsupported"
  | "unknownTerrain"
  | "startZoneOffBoard"
  | "startZoneOverlap"
  | "duplicateSeat"
  | "tooManyStartZones"
  | "badLayout";

export interface MapIssue {
  readonly severity: "error" | "warning";
  readonly code: MapIssueCode;
  readonly message: string;
  readonly pieceId?: string;
  readonly hex?: Hex;
}

/**
 * The battlefield as a set of hex columns. Each column holds the solid cells
 * stacked in it, sorted bottom to top. Gaps between cells are allowed, which
 * is how bridges and overhangs are represented.
 */
export class Board {
  private readonly columns = new Map<string, Cell[]>();
  private readonly piecesById = new Map<string, PlacedPiece>();

  private constructor(readonly definition: MapDefinition) {}

  /**
   * Build a board from a map definition. Never throws on bad map data:
   * problems are returned as issues so an editor can show them.
   */
  static fromMap(def: MapDefinition, terrain?: TerrainTable): { board: Board; issues: MapIssue[] } {
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

  /** Pieces must rest on the table or, through a chain of pieces, on something that does. */
  private supportIssues(): MapIssue[] {
    const supported = new Set<string>();
    const queue: string[] = [];
    const cellsByPiece = new Map<string, Cell[]>();
    for (const col of this.columns.values()) {
      for (const cell of col) {
        const list = cellsByPiece.get(cell.pieceId) ?? [];
        list.push(cell);
        cellsByPiece.set(cell.pieceId, list);
      }
    }
    for (const [id, cells] of cellsByPiece) {
      if (cells.some((c) => c.layer === 0)) {
        supported.add(id);
        queue.push(id);
      }
    }
    while (queue.length > 0) {
      const id = queue.shift()!;
      for (const cell of cellsByPiece.get(id) ?? []) {
        const above = this.cellAt(cell.hex, cell.layer + 1);
        if (above && !supported.has(above.pieceId)) {
          supported.add(above.pieceId);
          queue.push(above.pieceId);
        }
      }
    }
    const issues: MapIssue[] = [];
    for (const id of cellsByPiece.keys()) {
      if (!supported.has(id)) {
        issues.push({
          severity: "error",
          code: "unsupported",
          message: `Piece "${id}" is floating; it must rest on the table or another piece`,
          pieceId: id,
        });
      }
    }
    return issues;
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

  /** The start zone (seat number) used by player `index` in a game of `players`. */
  zoneFor(index: number, players: number): number {
    return this.definition.layouts?.[String(players)]?.[index] ?? index;
  }

  get id(): string {
    return this.definition.id;
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

  startZone(seat: number): Hex[] {
    return this.definition.startZones.find((z) => z.seat === seat)?.hexes ?? [];
  }
}
