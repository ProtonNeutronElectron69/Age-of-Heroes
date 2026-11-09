import {
  Board,
  applyCommand,
  deepClone,
  deploymentSpots,
  hex,
  terrainTable,
  type Command,
  type GameEvent,
  type GameSetup,
  type GameState,
  type MapDefinition,
  type PlacedPiece,
  type RulesContext,
  type TerrainRules,
  type UnitCard,
} from "../src";

/** Throwaway test units. Not game content. */
export function testCard(id: string, overrides: Partial<UnitCard> = {}): UnitCard {
  return {
    id,
    name: `Test ${id}`,
    tokenLabel: id.slice(0, 2).toUpperCase(),
    faction: "test",
    unitType: "commonHero",
    figureCount: 1,
    species: "Human",
    unitClass: "Warrior",
    personality: "Valiant",
    size: "medium",
    height: 5,
    footprint: "1",
    basic: { move: 5, range: 1, attack: 3, defense: 3 },
    advanced: { life: 4, move: 5, range: 1, attack: 3, defense: 3, points: 100, abilities: [] },
    ...overrides,
  };
}

export const CARDS: UnitCard[] = [
  testCard("hero"),
  testCard("squad", {
    unitType: "commonSquad",
    figureCount: 3,
    basic: { move: 5, range: 6, attack: 2, defense: 2 },
    advanced: { life: 1, move: 5, range: 6, attack: 2, defense: 2, points: 60, abilities: [] },
  }),
  testCard("unique", { unitType: "uniqueHero", name: "Test Unique" }),
];

export const TERRAIN: TerrainRules[] = [
  { id: "grass", name: "Grass", category: "standard", color: "#00ff00" },
  { id: "rock", name: "Rock", category: "standard", color: "#888888" },
  { id: "water", name: "Water", category: "special", color: "#0000ff", stopGroup: "wet", moveCost: 2 },
  {
    id: "swamp",
    name: "Swamp",
    category: "special",
    color: "#666600",
    stopGroup: "wet",
    moveCost: 2,
    endTurnSelfAttack: { attackDice: 1, defenseDice: 0 },
  },
  { id: "lava", name: "Lava", category: "special", color: "#ff0000", entryDestroyOnOrBelow: 12 },
  { id: "road", name: "Road", category: "special", color: "#553311", stayOnBonusMove: 3 },
  { id: "ice", name: "Ice", category: "special", color: "#aaddff", slip: { onOrBelow: 5, slideHexes: 1 } },
];

const ax = (x: number, r: number) => hex(x - Math.floor(r / 2), r);

/** 12 x 4 grass field with six start zones of four hexes each. */
export function fieldMap(): MapDefinition {
  const block = (xs: number[], rs: number[]) => xs.flatMap((x) => rs.map((r) => ax(x, r)));
  return {
    formatVersion: 1,
    id: "test-field",
    name: "Test field",
    description: "",
    pieces: [
      { id: "a", shape: "slab24", terrain: "grass", origin: hex(0, 0), rotation: 0, layer: 0 },
      { id: "b", shape: "slab24", terrain: "grass", origin: hex(6, 0), rotation: 0, layer: 0 },
    ],
    startZones: [
      { seat: 0, hexes: block([0, 1], [0, 1]) },
      { seat: 1, hexes: block([10, 11], [0, 1]) },
      { seat: 2, hexes: block([0, 1], [2, 3]) },
      { seat: 3, hexes: block([10, 11], [2, 3]) },
      { seat: 4, hexes: block([5, 6], [0, 1]) },
      { seat: 5, hexes: block([5, 6], [2, 3]) },
    ],
    layouts: {},
  };
}

/**
 * A single row of hexes q = 0..n-1 (r = 0). Each entry is the top terrain and
 * the column height in levels (stacked from grass underneath).
 */
export function rowMap(columns: [string, number][], extra: PlacedPiece[] = []): MapDefinition {
  const pieces: PlacedPiece[] = [];
  columns.forEach(([terrain, height], q) => {
    for (let layer = 0; layer < height; layer++) {
      pieces.push({
        id: `c${q}l${layer}`,
        shape: "single",
        terrain: layer === height - 1 ? terrain : "grass",
        origin: hex(q, 0),
        rotation: 0,
        layer,
      });
    }
  });
  // Start zones live on a separate strip three rows away, out of reach of the test row.
  const pad = Array.from({ length: 8 }, (_, q) => hex(q, 3));
  pad.forEach((h, i) => pieces.push({ id: `pad${i}`, shape: "single", terrain: "grass", origin: h, rotation: 0, layer: 0 }));
  return {
    formatVersion: 1,
    id: "test-row",
    name: "Test row",
    description: "",
    pieces: [...pieces, ...extra],
    startZones: [
      { seat: 0, hexes: pad.slice(0, 4) },
      { seat: 1, hexes: pad.slice(4) },
    ],
    layouts: {},
  };
}

export function makeCtx(map: MapDefinition = fieldMap(), cards: UnitCard[] = CARDS): RulesContext {
  const terrain = terrainTable(TERRAIN);
  const { board, issues } = Board.fromMap(map, terrain);
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join("\n"));
  return { cards: new Map(cards.map((c) => [c.id, c])), board, terrain };
}

export const ctx = makeCtx();

export function setup(players = 2, overrides: Partial<GameSetup> = {}): GameSetup {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  return {
    mode: "advanced",
    seed: 12345,
    mapId: "test-field",
    roundLimit: null,
    players: ids.map((id, i) => ({ id, name: `Player ${i + 1}`, color: `#00000${i}` })),
    armies: Object.fromEntries(ids.map((id) => [id, ["hero", "squad"]])),
    ...overrides,
  };
}

/** Put every token on one unit. */
export function allOn(unitId: string) {
  return { "1": unitId, "2": unitId, "3": unitId, X: unitId };
}

export function apply(state: GameState, cmd: Command, c: RulesContext = ctx): { state: GameState; events: GameEvent[] } {
  const r = applyCommand(state, cmd, c);
  if (!r.ok) throw new Error(r.error);
  return r;
}

/** The deploy command for the next unit in the queue, using the first free spots in the zone. */
export function nextDeploy(state: GameState, c: RulesContext = ctx): Command {
  const entry = state.deploy!.queue[state.deploy!.index]!;
  const unit = state.units.find((u) => u.id === entry.unitId)!;
  const spots = deploymentSpots(state, entry.player, 5, c);
  const placements = unit.figures.map((f, i) => ({ figureId: f.id, ...spots[i]! }));
  return { type: "deployUnit", player: entry.player, unitId: unit.id, placements };
}

/** Deploy every unit in queue order. */
export function deployAll(state: GameState, c: RulesContext = ctx): { state: GameState; events: GameEvent[] } {
  let s = state;
  const events: GameEvent[] = [];
  while (s.phase === "deploy" && s.deploy) {
    const r = apply(s, nextDeploy(s, c), c);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

/**
 * Jump straight to a turn for unit tests: place figures where given (others
 * stay off the board) and make `unitId` the active unit.
 */
export function turnState(
  base: GameState,
  unitId: string,
  positions: Record<string, { q: number; r: number; elevation: number }>,
): GameState {
  const s = deepClone(base);
  for (const unit of s.units) {
    for (const f of unit.figures) {
      const p = positions[f.id];
      f.position = p ? { hex: hex(p.q, p.r), elevation: p.elevation, rotation: 0 } : null;
    }
  }
  const owner = s.units.find((u) => u.id === unitId)!.owner;
  s.phase = "turns";
  s.round = 1;
  s.deploy = null;
  s.tokens = Object.fromEntries(
    s.players.map((p) => [p.id, allOn(s.units.find((u) => u.owner === p.id)!.id)]),
  );
  s.tokens[owner] = allOn(unitId);
  s.initiative = s.players.map((p) => p.id);
  s.pointer = { token: "1", orderIndex: s.initiative.indexOf(owner) };
  s.active = { player: owner, unitId, token: "1", moved: [], attacked: [] };
  return s;
}

/** Try seeds until the predicate holds for the command's result. */
export function withOutcome(
  state: GameState,
  cmd: Command,
  c: RulesContext,
  predicate: (events: GameEvent[], s: GameState) => boolean,
): { state: GameState; events: GameEvent[] } {
  for (let seed = 1; seed < 5000; seed++) {
    const r = applyCommand({ ...state, rng: seed }, cmd, c);
    if (r.ok && predicate(r.events, r.state)) return r;
  }
  throw new Error("No seed produced the wanted outcome");
}
