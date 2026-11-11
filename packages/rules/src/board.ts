import { DIRECTIONS, hexAdd, hexKey, hexNeighbors, hexToWorld, parseHexKey, type Hex } from "./hex";
import type { MapDefinition, PlacedPiece, SceneryPlacement } from "./schema";
import { MAX_PLAYERS, MIN_PLAYERS } from "./schema";
import { shapeCells } from "./shapes";
import { isBalanced, type Point2 } from "./support";
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
  | "detached"
  | "void"
  | "unknownTerrain"
  | "startZoneOffBoard"
  | "startZoneOverlap"
  | "startZoneTerrain"
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
  /** For a sealed empty space: the layer of its first cell. */
  readonly layer?: number;
}

/** One empty cell (a hex at a layer) inside the terrain. */
export interface Gap {
  readonly hex: Hex;
  readonly layer: number;
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
  private sealed: Gap[] = [];
  private terrainTable: TerrainTable | undefined;

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
    board.terrainTable = terrain;
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

    const support = board.supportIssues();
    issues.push(...support);
    // Pieces already reported (overlapping or not held up) are not reported as detached too.
    issues.push(...board.detachedIssues(new Set(issues.filter((i) => i.pieceId).map((i) => i.pieceId!))));
    issues.push(...board.voidIssues());
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
   * Pieces must be held up, the way real blocks would be. A piece rests on
   * contact points: the centre of each of its hexes that sits on held-up
   * terrain (or the table), and the middle of each side where it touches a
   * held-up piece at its own level. It is held up when its centre of mass
   * sits over the area, or the line, between its contact points; a piece of
   * more than one hex needs at least 2 of them. A run of pieces joined side
   * by side (a bridge) that cannot stand piece by piece is checked as one
   * body. So a bridge between two pillars and a roof over a cave stand, but a
   * slab held at one edge, or a piece hanging off a single pillar, does not.
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
    const held = new Set<string>();
    const centre = (h: Hex): Point2 => hexToWorld(h);
    const contacts = (cells: readonly Cell[], own: ReadonlySet<string>): Point2[] => {
      const points: Point2[] = [];
      for (const cell of cells) {
        const below = cell.layer === 0 ? null : this.cellAt(cell.hex, cell.layer - 1);
        if (cell.layer === 0 || (below && held.has(below.pieceId))) points.push(centre(cell.hex));
        for (const d of DIRECTIONS) {
          const next = this.cellAt(hexAdd(cell.hex, d), cell.layer);
          if (!next || own.has(next.pieceId) || !held.has(next.pieceId)) continue;
          const a = centre(cell.hex);
          const b = centre(next.hex);
          points.push({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
        }
      }
      return points;
    };
    const stands = (ids: readonly string[]) => {
      const own = new Set(ids);
      const cells = ids.flatMap((id) => cellsByPiece.get(id) ?? []);
      return isBalanced(
        cells.map((c) => centre(c.hex)),
        contacts(cells, own),
      );
    };

    for (let grew = true; grew; ) {
      grew = false;
      // Piece by piece first, bottom up, so each piece sees what holds it.
      const loose = [...cellsByPiece.keys()]
        .filter((id) => !held.has(id))
        .sort((a, b) => cellsByPiece.get(a)![0]!.layer - cellsByPiece.get(b)![0]!.layer);
      for (const id of loose) {
        if (stands([id])) {
          held.add(id);
          grew = true;
        }
      }
      if (grew) continue;
      // Then runs of loose pieces joined side by side, as one body.
      for (const span of this.looseSpans(cellsByPiece, held)) {
        if (!stands(span)) continue;
        for (const id of span) held.add(id);
        grew = true;
        if (span.length > 1 && span.every((id) => SPAN_SHAPES.has(this.piecesById.get(id)?.shape ?? ""))) {
          for (const id of span) this.spanPieces.add(id);
        }
      }
    }

    const issues: MapIssue[] = [];
    for (const id of cellsByPiece.keys()) {
      if (!held.has(id)) {
        issues.push({
          severity: "error",
          code: "unsupported",
          message: `Piece "${id}" is not held up; its middle must sit between at least 2 points it rests on or touches`,
          pieceId: id,
        });
      }
    }
    return issues;
  }

  /** Groups of pieces that are not held up, joined side by side at one level. */
  private looseSpans(cellsByPiece: ReadonlyMap<string, Cell[]>, held: ReadonlySet<string>): string[][] {
    const seen = new Set<string>();
    const spans: string[][] = [];
    for (const start of cellsByPiece.keys()) {
      if (held.has(start) || seen.has(start)) continue;
      const span: string[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length > 0) {
        const id = stack.pop()!;
        span.push(id);
        for (const cell of cellsByPiece.get(id) ?? []) {
          for (const d of DIRECTIONS) {
            const next = this.cellAt(hexAdd(cell.hex, d), cell.layer);
            if (!next || held.has(next.pieceId) || seen.has(next.pieceId)) continue;
            seen.add(next.pieceId);
            stack.push(next.pieceId);
          }
        }
      }
      spans.push(span);
    }
    return spans;
  }

  /**
   * Every piece must join the rest of the map: pieces touching face to face
   * (side by side at one level, or one on another) form groups, and pieces
   * outside the largest group are detached. Pieces already reported as not
   * held up are not reported twice.
   */
  private detachedIssues(alreadyReported: ReadonlySet<string>): MapIssue[] {
    const ids = [...this.piecesById.keys()];
    const group = new Map<string, number>();
    const sizes: number[] = [];
    for (const start of ids) {
      if (group.has(start)) continue;
      const n = sizes.length;
      let size = 0;
      const stack = [start];
      group.set(start, n);
      while (stack.length > 0) {
        const id = stack.pop()!;
        const piece = this.piecesById.get(id)!;
        const cells = shapeCells(piece.shape, piece.origin, piece.rotation);
        size += cells.length;
        for (const h of cells) {
          const touching = [
            ...hexNeighbors(h).map((nb) => this.cellAt(nb, piece.layer)),
            this.cellAt(h, piece.layer - 1),
            this.cellAt(h, piece.layer + 1),
          ];
          for (const c of touching) {
            if (!c || group.has(c.pieceId)) continue;
            group.set(c.pieceId, n);
            stack.push(c.pieceId);
          }
        }
      }
      sizes.push(size);
    }
    let main = 0;
    sizes.forEach((size, i) => {
      if (size > sizes[main]!) main = i;
    });
    return ids
      .filter((id) => group.get(id) !== main && !alreadyReported.has(id))
      .map((id) => ({
        severity: "error" as const,
        code: "detached" as const,
        message: `Piece "${id}" does not touch the rest of the map`,
        pieceId: id,
      }));
  }

  /**
   * Empty spaces sealed inside the terrain, with no way out to the open air:
   * up, down or sideways. Caves and the space under bridges are open, so they
   * are fine.
   */
  private voidIssues(): MapIssue[] {
    const top = this.maxElevation();
    if (top === 0) return [];
    const area = new Set<string>();
    for (const key of this.columns.keys()) {
      area.add(key);
      for (const nb of hexNeighbors(parseHexKey(key))) area.add(hexKey(nb));
    }
    const filled = (key: string, layer: number) => this.cellAt(parseHexKey(key), layer) !== undefined;
    const open = new Set<string>();
    const queue: [string, number][] = [];
    const visit = (key: string, layer: number) => {
      if (layer < 0 || layer > top || !area.has(key) || filled(key, layer)) return;
      const id = `${key}@${layer}`;
      if (open.has(id)) return;
      open.add(id);
      queue.push([key, layer]);
    };
    // The air above the highest piece, and every column around the map, are open.
    for (const key of area) {
      visit(key, top);
      if (!this.columns.has(key)) for (let l = 0; l <= top; l++) visit(key, l);
    }
    while (queue.length > 0) {
      const [key, layer] = queue.pop()!;
      visit(key, layer + 1);
      visit(key, layer - 1);
      for (const nb of hexNeighbors(parseHexKey(key))) visit(hexKey(nb), layer);
    }
    this.sealed = [];
    for (const key of this.columns.keys()) {
      for (let l = 0; l < top; l++) {
        if (!filled(key, l) && !open.has(`${key}@${l}`)) this.sealed.push({ hex: parseHexKey(key), layer: l });
      }
    }
    // One issue per sealed pocket.
    const issues: MapIssue[] = [];
    const reported = new Set<string>();
    const inPocket = new Set(this.sealed.map((g) => `${hexKey(g.hex)}@${g.layer}`));
    for (const g of this.sealed) {
      const id = `${hexKey(g.hex)}@${g.layer}`;
      if (reported.has(id)) continue;
      let size = 0;
      const stack = [g];
      reported.add(id);
      while (stack.length > 0) {
        const c = stack.pop()!;
        size += 1;
        const around = [
          { hex: c.hex, layer: c.layer + 1 },
          { hex: c.hex, layer: c.layer - 1 },
          ...hexNeighbors(c.hex).map((h) => ({ hex: h, layer: c.layer })),
        ];
        for (const n of around) {
          const nid = `${hexKey(n.hex)}@${n.layer}`;
          if (!inPocket.has(nid) || reported.has(nid)) continue;
          reported.add(nid);
          stack.push(n);
        }
      }
      issues.push({
        severity: "error",
        code: "void",
        message: `A sealed empty space (${size} ${size === 1 ? "hex" : "hexes"}) at ${hexKey(g.hex)} level ${g.layer + 1}; fill it or open it up`,
        hex: g.hex,
        layer: g.layer,
      });
    }
    return issues;
  }

  /** Empty cells sealed inside the terrain (see the "void" problem). */
  sealedGaps(): readonly Gap[] {
    return this.sealed;
  }

  /**
   * Can this hex be part of a start zone? It needs terrain, only standard
   * terrain on every surface in it (when the terrain table is known), and no
   * scenery.
   */
  zoneProblem(h: Hex): string | null {
    const surfaces = this.surfaces(h);
    if (surfaces.length === 0) return "has no terrain";
    if (this.sceneryIn(h).length > 0) return "has scenery";
    const special = surfaces.find((s) => this.terrainTable?.get(s.terrain)?.category === "special");
    if (special) return `has ${this.terrainTable!.get(special.terrain)!.name.toLowerCase()}, a special terrain`;
    return null;
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
        const problem = this.columns.has(key) ? this.zoneProblem(h) : null;
        if (problem) {
          issues.push({
            severity: "error",
            code: "startZoneTerrain",
            message: `Start zone ${zone.seat + 1} includes ${key}, which ${problem}`,
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
