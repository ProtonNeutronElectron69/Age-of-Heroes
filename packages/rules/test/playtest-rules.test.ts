import { describe, expect, it } from "vitest";
import {
  createGame,
  hex,
  moveOptions,
  placementKey,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PlacedPiece,
  type RulesContext,
  type UnitCard,
} from "../src";
import { CARDS, apply, makeCtx, rowMap, setup, testCard, turnState, withOutcome } from "./fixtures";

/** The swamp d20 (`swampRoll`) and zone of control (`zoneOfControl`). */

const CARDS_HERE: UnitCard[] = [
  ...CARDS,
  testCard("rider", {
    unitType: "commonSquad",
    figureCount: 3,
    size: "large",
    height: 6,
    life: 2,
    move: 7,
    range: 1,
    abilities: [{ id: "trample", name: "trample", text: "trample", params: { defenseDice: 1 } }],
  }),
];

/** Three rows of grass (r = 0, 1, 2), q = 0..n-1; the first row's terrain as given. */
function field(columns: [string, number][]) {
  const extra: PlacedPiece[] = [1, 2].flatMap((r) =>
    columns.map((_, q) => ({ id: `r${r}q${q}`, shape: "single", terrain: "grass", origin: hex(q, r), rotation: 0, layer: 0 })),
  );
  return rowMap(columns, extra);
}

const flat = (n: number, terrain = "grass"): [string, number][] => Array.from({ length: n }, () => [terrain, 1]);
const at = (q: number, r = 0) => ({ q, r, elevation: 1 });
const step = (q: number, r = 0) => ({ hex: hex(q, r), elevation: 1 });

function game(
  columns: [string, number][],
  armies: { p1: string[]; p2: string[] },
  positions: Record<string, { q: number; r: number; elevation: number }>,
  rules: Partial<GameSetup> = {},
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(field(columns), CARDS_HERE);
  const base = createGame(setup(2, { mapId: "test-row", armies, ...rules }), ctx).state;
  return { ctx, state: turnState(base, "p1:0", positions) };
}

const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const strikes = (events: GameEvent[]) => ofType(events, "attackRolled").filter((e) => e.source === "passingStrike");
const endTurn = { type: "endTurn", player: "p1" } as const;
const ZONE = { zoneOfControl: true } as const;

describe("swamp d20", () => {
  const cols: [string, number][] = [["swamp", 1], ...flat(5)];
  const pos = { "p1:0#1": at(0), "p2:0#1": at(5) };

  it("wounds on 1 to 5 and does nothing on 6 or more", () => {
    const g = game(cols, { p1: ["hero"], p2: ["hero"] }, pos, { swampRoll: "d20" });
    expect(g.state.config.swampRoll).toBe("d20");
    const hurt = withOutcome(g.state, endTurn, g.ctx, (e) => ofType(e, "terrainRoll").some((t) => t.roll <= 5));
    expect(ofType(hurt.events, "terrainRoll")[0]).toMatchObject({ terrain: "swamp", outcome: "wounded" });
    expect(hurt.state.units[0]!.figures[0]!.wounds).toBe(1);
    const safe = withOutcome(g.state, endTurn, g.ctx, (e) => ofType(e, "terrainRoll").some((t) => t.roll === 6));
    expect(ofType(safe.events, "terrainRoll")[0]).toMatchObject({ outcome: "safe" });
    expect(safe.state.units[0]!.figures[0]!.wounds).toBe(0);
    expect(ofType(safe.events, "attackRolled")).toEqual([]);
  });

  it("keeps the attack die in games without it", () => {
    const g = game(cols, { p1: ["hero"], p2: ["hero"] }, pos);
    const r = apply(g.state, endTurn, g.ctx);
    expect(ofType(r.events, "terrainRoll")).toEqual([]);
    expect(ofType(r.events, "attackRolled").map((e) => e.source)).toEqual(["swamp"]);
  });
});

describe("zone of control", () => {
  // The enemy stands at (2, 1); (1, 1), (2, 0) and (3, 0) are all beside it, (4, 0) is not.
  const pos = { "p1:0#1": at(1, 1), "p2:0#1": at(2, 1) };
  const path = [step(2, 0), step(3, 0), step(4, 0)];
  const move = (p = path) => ({ type: "move", player: "p1", figureId: "p1:0#1", path: p }) as const;

  it("gives one free step beside an enemy, then strikes on every step", () => {
    const g = game(flat(8), { p1: ["hero"], p2: ["hero"] }, pos, ZONE);
    expect(strikes(apply(g.state, move(), g.ctx).events)).toHaveLength(2);
    // Without the rule only leaving the enemy draws a strike.
    const old = game(flat(8), { p1: ["hero"], p2: ["hero"] }, pos);
    expect(strikes(apply(old.state, move(), old.ctx).events)).toHaveLength(1);
  });

  it("counts a move made in pieces as one", () => {
    const g = game(flat(8), { p1: ["hero"], p2: ["hero"] }, pos, ZONE);
    const first = apply(g.state, move([step(2, 0)]), g.ctx);
    expect(strikes(first.events)).toEqual([]);
    expect(first.state.active!.moves!["p1:0#1"]!.besideUsed).toBe(true);
    expect(strikes(apply(first.state, move([step(3, 0)]), g.ctx).events)).toHaveLength(1);
  });

  it("marks extra steps beside an enemy as risky", () => {
    const key = placementKey({ hex: hex(3, 0), elevation: 1, rotation: 0 });
    const g = game(flat(8), { p1: ["hero"], p2: ["hero"] }, pos, ZONE);
    expect(moveOptions(g.state, "p1:0#1", g.ctx).get(key)!.hazards).toBe(1);
    const old = game(flat(8), { p1: ["hero"], p2: ["hero"] }, pos);
    expect(moveOptions(old.state, "p1:0#1", old.ctx).get(key)!.hazards).toBe(0);
  });

  it("lets a rider go straight through the figure it rides down", () => {
    const riders = { "p1:0#1": at(0), "p2:0#1": at(2) };
    const key = placementKey({ hex: hex(3, 0), elevation: 1, rotation: 0 });
    const g = game(flat(8), { p1: ["rider"], p2: ["hero"] }, riders, ZONE);
    const option = moveOptions(g.state, "p1:0#1", g.ctx).get(key)!;
    expect(option.path).toEqual([step(1), step(2), step(3)]);
    expect(option.hazards).toBe(0);
    const r = apply(g.state, move(option.path), g.ctx);
    expect(strikes(r.events)).toEqual([]);
    expect(ofType(r.events, "abilityUsed").map((e) => e.targetId)).toEqual(["p2:0#1"]);
    // Older games: riding through draws the enemy's strike, so the safe path goes round it.
    const old = game(flat(8), { p1: ["rider"], p2: ["hero"] }, riders);
    expect(moveOptions(old.state, "p1:0#1", old.ctx).get(key)!.path).not.toContainEqual(step(2));
  });
});
