import { HEX_SIZE } from "@aoh/rules";

/**
 * Where everything sits on the gaming table: the board in the middle, each
 * player's unit cards in a band along a side of the table, chosen by where
 * their start zone lies. Up to four players get a side each; five or six
 * share, two to a side. The table is a square as large as the board and the cards need.
 * All distances are in board units (a hex is HEX_SIZE from centre to corner).
 */

/** A unit card lying on the table is seven hexes of the board's own size. */
export const TABLE_CARD = { width: 3 * Math.sqrt(3) * HEX_SIZE, depth: 5 * HEX_SIZE } as const;

/** Space between two cards, between two players' cards, and between rows. */
const CARD_GAP = 0.5;
const PLAYER_GAP = 1.6;
/** Clear table between the board and the cards, and between the cards and the table's edge. */
const BOARD_MARGIN = 1.6;
const EDGE_MARGIN = 1.2;
/** The least table shown past the board on a side with no cards. */
const BARE_BAND = 2.4;

export type TableSide = "south" | "north" | "east" | "west";

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

export interface TablePlayer {
  readonly id: string;
  /** The middle of the player's start zone, or null to seat players evenly round the table. */
  readonly home: { readonly x: number; readonly z: number } | null;
  /** The player's units, in the order their cards are laid out. */
  readonly units: readonly string[];
}

export interface CardSpot {
  readonly unitId: string;
  readonly player: string;
  readonly side: TableSide;
  /** The middle of the card. */
  readonly x: number;
  readonly z: number;
  /** Turn about the y axis; the foot of the card points at the table's edge. */
  readonly yaw: number;
}

export interface TableLayout {
  /** The table top. */
  readonly table: Bounds;
  /** The board with a little room round it (where a play mat lies). */
  readonly mat: Bounds;
  readonly cards: readonly CardSpot[];
}

const SIDES: readonly TableSide[] = ["south", "north", "east", "west"];
const YAW: Record<TableSide, number> = { south: 0, north: Math.PI, east: Math.PI / 2, west: -Math.PI / 2 };
/** Seats when start zones are unknown: opposite sides first, as players sit down at a table. */
const SEAT_ORDER: readonly TableSide[] = ["south", "north", "east", "west", "south", "north"];

const OUTWARD: Record<TableSide, readonly [number, number]> = { south: [0, 1], north: [0, -1], east: [1, 0], west: [-1, 0] };

/**
 * How badly a side suits a player: 0 when their start zone lies straight out from the board's
 * middle towards it, up to 2 when it lies the other way. Without a start zone, their usual seat costs nothing.
 */
function sideCost(player: TablePlayer, index: number, side: TableSide, mat: Bounds): number {
  if (!player.home) return side === SEAT_ORDER[index % SEAT_ORDER.length] ? 0 : 1;
  const dx = (player.home.x - (mat.minX + mat.maxX) / 2) / Math.max(mat.maxX - mat.minX, 1e-6);
  const dz = (player.home.z - (mat.minZ + mat.maxZ) / 2) / Math.max(mat.maxZ - mat.minZ, 1e-6);
  const length = Math.hypot(dx, dz);
  if (length < 1e-9) return 1;
  const [sx, sz] = OUTWARD[side];
  return 1 - (dx * sx + dz * sz) / length;
}

/**
 * A side for each player. Up to four players each get a side of their own; five or six share,
 * at most two to a side. Of those seatings, the one that best fits where the start zones lie wins.
 */
function assignSides(players: readonly TablePlayer[], mat: Bounds): TableSide[] {
  const perSide = Math.max(1, Math.ceil(players.length / SIDES.length));
  const used: Record<TableSide, number> = { south: 0, north: 0, east: 0, west: 0 };
  const chosen: TableSide[] = [];
  let best: TableSide[] = [];
  let bestCost = Infinity;
  const search = (i: number, cost: number) => {
    if (cost >= bestCost) return;
    if (i === players.length) {
      best = [...chosen];
      bestCost = cost;
      return;
    }
    for (const side of SIDES) {
      if (used[side] >= perSide) continue;
      used[side]++;
      chosen.push(side);
      search(i + 1, cost + sideCost(players[i]!, i, side, mat));
      chosen.pop();
      used[side]--;
    }
  };
  search(0, 0);
  return best;
}

interface Seat {
  readonly player: TablePlayer;
  /** Where along the side the player sits (x for south and north, z for east and west). */
  readonly along: number;
}

/** One side's cards in rows: each player gets an equal stretch of the side. */
function rowsFor(seats: readonly Seat[], length: number) {
  const pitch = TABLE_CARD.width + CARD_GAP;
  const stretch = length / Math.max(seats.length, 1);
  const perRow = Math.max(1, Math.floor((stretch - PLAYER_GAP + CARD_GAP) / pitch));
  const rows = Math.max(0, ...seats.map((s) => Math.ceil(s.player.units.length / perRow)));
  return { pitch, stretch, perRow, rows };
}

export function layoutTable(board: Bounds, players: readonly TablePlayer[]): TableLayout {
  const mat: Bounds = {
    minX: board.minX - BOARD_MARGIN,
    maxX: board.maxX + BOARD_MARGIN,
    minZ: board.minZ - BOARD_MARGIN,
    maxZ: board.maxZ + BOARD_MARGIN,
  };
  const bySide: Record<TableSide, Seat[]> = { south: [], north: [], east: [], west: [] };
  const sides = assignSides(players, mat);
  players.forEach((player, i) => {
    const side = sides[i]!;
    const across = side === "south" || side === "north";
    bySide[side].push({ player, along: player.home ? (across ? player.home.x : player.home.z) : i });
  });
  for (const side of SIDES) bySide[side].sort((a, b) => a.along - b.along);

  const rowDepth = TABLE_CARD.depth + CARD_GAP;
  const band = (rows: number) => (rows === 0 ? BARE_BAND : rows * rowDepth - CARD_GAP + EDGE_MARGIN);
  // East and west cards keep to the board's length. Opposite sides get the same band,
  // so the board stays in the middle of the table.
  const deep = mat.maxZ - mat.minZ;
  const east = rowsFor(bySide.east, deep);
  const west = rowsFor(bySide.west, deep);
  const bandX = Math.max(band(east.rows), band(west.rows));
  // South and north cards may run on into the table's corners.
  const wide = mat.maxX - mat.minX + 2 * (bandX - EDGE_MARGIN);
  const south = rowsFor(bySide.south, wide);
  const north = rowsFor(bySide.north, wide);
  const bandZ = Math.max(band(south.rows), band(north.rows));
  const plans = { south, north, east, west };

  const cards: CardSpot[] = [];
  for (const side of SIDES) {
    const { pitch, stretch, perRow } = plans[side];
    const across = side === "south" || side === "north";
    const start = across ? mat.minX - (bandX - EDGE_MARGIN) : mat.minZ;
    bySide[side].forEach((seat, n) => {
      const middle = start + stretch * (n + 0.5);
      seat.player.units.forEach((unitId, i) => {
        const row = Math.floor(i / perRow);
        const inRow = Math.min(perRow, seat.player.units.length - row * perRow);
        const along = middle + ((i % perRow) - (inRow - 1) / 2) * pitch;
        const out = TABLE_CARD.depth / 2 + row * rowDepth;
        const spot =
          side === "south"
            ? { x: along, z: mat.maxZ + out }
            : side === "north"
              ? { x: along, z: mat.minZ - out }
              : side === "east"
                ? { x: mat.maxX + out, z: along }
                : { x: mat.minX - out, z: along };
        cards.push({ unitId, player: seat.player.id, side, ...spot, yaw: YAW[side] });
      });
    });
  }

  // The table is square, with the board in the middle: a board of any shape sits well on it.
  const midX = (mat.minX + mat.maxX) / 2;
  const midZ = (mat.minZ + mat.maxZ) / 2;
  const half = Math.max((mat.maxX - mat.minX) / 2 + bandX, (mat.maxZ - mat.minZ) / 2 + bandZ);
  return {
    table: { minX: midX - half, maxX: midX + half, minZ: midZ - half, maxZ: midZ + half },
    mat,
    cards,
  };
}

/**
 * Where a unit's figures stand or lie on its card: the card's own hexes, in
 * the card's frame (x to its right, z to its foot). One figure takes the
 * middle; a squad spreads over the upper hexes.
 */
export function cardSlot(index: number, count: number): { x: number; z: number } {
  if (count <= 1) return { x: 0, z: 0 };
  const a = (Math.sqrt(3) / 2) * HEX_SIZE;
  const slots = [
    { x: -a, z: -1.5 },
    { x: a, z: -1.5 },
    { x: -2 * a, z: 0 },
    { x: 2 * a, z: 0 },
  ];
  return slots[index % slots.length]!;
}
