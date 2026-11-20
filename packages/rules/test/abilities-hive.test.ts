import { describe, expect, it } from "vitest";
import {
  attackDice,
  createGame,
  hex,
  moveOptions,
  placementKey,
  type Ability,
  type GameEvent,
  type GameState,
  type RulesContext,
  type UnitCard,
} from "../src";
import { CARDS, apply, makeCtx, rowMap, setup, testCard, turnState, withOutcome } from "./fixtures";

/** Tests for the abilities added with the Sunken Hive. */

const ab = (id: string, params?: Record<string, number>): Ability => ({ id, name: id, text: `${id} ability`, ...(params ? { params } : {}) });
const hero = (id: string, abilities: Ability[], extra: Partial<UnitCard> = {}) =>
  testCard(id, { life: 4, move: 5, range: 1, attack: 3, defense: 3, points: 100, abilities, ...extra });
const squad = (id: string, abilities: Ability[], extra: Partial<UnitCard> = {}) =>
  testCard(id, {
    unitType: "commonSquad",
    figureCount: 3,
    life: 1, move: 5, range: 6, attack: 2, defense: 2, points: 60, abilities,
    ...extra,
  });

const HIVE_CARDS: UnitCard[] = [
  ...CARDS,
  hero("overmind", [ab("hive-command", { range: 3, bonus: 1 })], { species: "Alien" }),
  squad("aliens", [], { species: "Alien" }),
  squad("stalkers", [ab("bog-skin", { bonus: 2 })], { range: 1, attack: 3 }),
  hero("glarer", [ab("numbing-glare", { needed: 14 })], { range: 5, defense: 2 }),
  hero("wader", [ab("amphibious")], { move: 4 }),
  squad("spawn", [ab("spawn-pool", { needed: 16, wetNeeded: 12 })], { figureCount: 4 }),
  hero("bigfoe", [], { size: "large", height: 7, defense: 3 }),
];

const flat = (n: number, terrain = "grass"): [string, number][] => Array.from({ length: n }, () => [terrain, 1]);
const at = (q: number, elevation = 1) => ({ q, r: 0, elevation });
const step = (q: number, elevation = 1) => ({ hex: hex(q, 0), elevation });

function game(
  columns: [string, number][],
  armies: { p1: string[]; p2: string[] },
  positions: Record<string, { q: number; r: number; elevation: number }>,
  active = "p1:0",
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(rowMap(columns), HIVE_CARDS);
  const base = createGame(setup(2, { mapId: "test-row", armies }), ctx).state;
  return { ctx, state: turnState(base, active, positions) };
}

const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const attack = (player: string, figureId: string, targetId: string) => ({ type: "attack", player, figureId, targetId }) as const;
const endTurn = { type: "endTurn", player: "p1" } as const;

describe("hive-command", () => {
  it("gives other friendly Aliens near the overmind an extra attack die", () => {
    const g = game(flat(9), { p1: ["aliens", "overmind"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(2), "p2:0#1": at(5) });
    expect(attackDice(g.state, "p1:0#1", "p2:0#1", g.ctx)).toMatchObject({ attackBonus: 1, notes: ["hive-command +1 attack"] });
    // The overmind itself gets nothing from its own aura.
    expect(attackDice(g.state, "p1:1#1", "p2:0#1", g.ctx).attackBonus).toBe(0);
  });

  it("reaches only 3 hexes, and only Aliens", () => {
    const far = game(flat(9), { p1: ["aliens", "overmind"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(4), "p2:0#1": at(8) });
    expect(attackDice(far.state, "p1:0#1", "p2:0#1", far.ctx).attackBonus).toBe(0);
    const humans = game(flat(9), { p1: ["squad", "overmind"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(2), "p2:0#1": at(5) });
    expect(attackDice(humans.state, "p1:0#1", "p2:0#1", humans.ctx).attackBonus).toBe(0);
  });
});

describe("bog-skin", () => {
  it("adds 2 defense dice on water or swamp, and none on dry ground", () => {
    const cols: [string, number][] = [["grass", 1], ["grass", 1], ["water", 1], ["swamp", 1], ["grass", 1]];
    const g = game(cols, { p1: ["squad"], p2: ["stalkers"] }, { "p1:0#1": at(0), "p2:0#1": at(2), "p2:0#2": at(3), "p2:0#3": at(4) });
    expect(attackDice(g.state, "p1:0#1", "p2:0#1", g.ctx)).toMatchObject({ defenseBonus: 2, notes: ["bog-skin +2 defense"] });
    expect(attackDice(g.state, "p1:0#1", "p2:0#2", g.ctx).defenseBonus).toBe(2);
    expect(attackDice(g.state, "p1:0#1", "p2:0#3", g.ctx).defenseBonus).toBe(0);
  });

  it("keeps swamp from wounding the squad at the end of its turn", () => {
    const cols: [string, number][] = [["swamp", 1], ["swamp", 1], ["grass", 1], ["grass", 1], ["grass", 1], ["grass", 1]];
    const g = game(cols, { p1: ["stalkers"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:0#2": at(1), "p2:0#1": at(5) });
    const r = apply(g.state, endTurn, g.ctx);
    expect(ofType(r.events, "attackRolled")).toEqual([]);
    // A squad without it rolls for the swamp.
    const plain = game(cols, { p1: ["squad"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:0#2": at(1), "p2:0#1": at(5) });
    expect(ofType(apply(plain.state, endTurn, plain.ctx).events, "attackRolled").map((e) => e.source)).toEqual(["swamp", "swamp"]);
  });
});

describe("numbing-glare", () => {
  it("on a high roll leaves a Small or Medium target without defense dice", () => {
    const g = game(flat(9), { p1: ["glarer"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    const cmd = attack("p1", "p1:0#1", "p2:0#1");
    const numbed = withOutcome(g.state, cmd, g.ctx, (e) => ofType(e, "abilityRoll").some((r) => r.success));
    expect(ofType(numbed.events, "abilityRoll")[0]).toMatchObject({ ability: "numbing-glare", figureId: "p1:0#1", targetId: "p2:0#1", needed: 14 });
    const rolled = ofType(numbed.events, "attackRolled")[0]!;
    expect(rolled.defense).toEqual([]);
    expect(rolled.notes).toContain("numbing-glare: no defense dice");
    // The roll comes before the attack.
    expect(numbed.events.findIndex((e) => e.type === "abilityRoll")).toBeLessThan(numbed.events.findIndex((e) => e.type === "attackRolled"));
    const missed = withOutcome(g.state, cmd, g.ctx, (e) => ofType(e, "abilityRoll").some((r) => !r.success));
    expect(ofType(missed.events, "attackRolled")[0]!.defense).toHaveLength(3);
  });

  it("does not work on Large figures", () => {
    const g = game(flat(9), { p1: ["glarer"], p2: ["bigfoe"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    const r = apply(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx);
    expect(ofType(r.events, "abilityRoll")).toEqual([]);
    expect(ofType(r.events, "attackRolled")[0]!.defense).toHaveLength(3);
  });
});

describe("amphibious", () => {
  const cols: [string, number][] = [["grass", 1], ["water", 1], ["swamp", 1], ["water", 1], ["grass", 1], ["grass", 1], ["grass", 1], ["grass", 1]];

  it("wades through water and swamp at the cost of open ground, without stopping", () => {
    const g = game(cols, { p1: ["wader"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(7) });
    const options = moveOptions(g.state, "p1:0#1", g.ctx);
    expect(options.get(placementKey(step(3)))).toMatchObject({ cost: 3 });
    expect(options.get(placementKey(step(4)))).toMatchObject({ cost: 4 });
    // Without it, the first wet hex ends the move.
    const plain = game(cols, { p1: ["hero"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(7) });
    const stuck = moveOptions(plain.state, "p1:0#1", plain.ctx);
    expect(stuck.get(placementKey(step(1)))).toMatchObject({ cost: 2 });
    expect(stuck.has(placementKey(step(2)))).toBe(false);
  });

  it("may move on in pieces after wading in", () => {
    const g = game(cols, { p1: ["wader"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(7) });
    const wet = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx).state;
    expect(wet.active!.moves!["p1:0#1"]).toMatchObject({ spent: 1, ended: false });
    expect(moveOptions(wet, "p1:0#1", g.ctx).get(placementKey(step(4)))).toMatchObject({ cost: 3 });
  });

  it("is never wounded by swamp", () => {
    const g = game(cols, { p1: ["wader"], p2: ["hero"] }, { "p1:0#1": at(2), "p2:0#1": at(7) });
    expect(ofType(apply(g.state, endTurn, g.ctx).events, "attackRolled")).toEqual([]);
  });
});

describe("spawn-pool", () => {
  it("rolls for each standing figure if the squad did not attack, bringing fallen ones back", () => {
    const g = game(flat(9), { p1: ["spawn"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:0#2": at(2), "p2:0#1": at(8) });
    for (const f of g.state.units[0]!.figures.slice(2)) f.destroyed = true;
    const back = withOutcome(g.state, endTurn, g.ctx, (e) => ofType(e, "figureRevived").length === 2);
    const rolls = ofType(back.events, "abilityRoll");
    expect(rolls.map((r) => [r.figureId, r.targetId, r.needed, r.success])).toEqual([
      ["p1:0#1", "p1:0#3", 16, true],
      ["p1:0#2", "p1:0#4", 16, true],
    ]);
    const [third, fourth] = back.state.units[0]!.figures.slice(2);
    expect(third).toMatchObject({ destroyed: false, wounds: 0 });
    expect(Math.abs(third!.position!.hex.q - 0)).toBe(1);
    expect(Math.abs(fourth!.position!.hex.q - 2)).toBe(1);
    // Each failed roll leaves the fallen figure where it is.
    const none = withOutcome(g.state, endTurn, g.ctx, (e) => ofType(e, "abilityRoll").every((r) => !r.success));
    expect(ofType(none.events, "abilityRoll")).toHaveLength(2);
    expect(none.state.units[0]!.figures.filter((f) => f.destroyed)).toHaveLength(2);
  });

  it("stops rolling once no figure is left to return", () => {
    const g = game(flat(9), { p1: ["spawn"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:0#2": at(2), "p1:0#3": at(4), "p2:0#1": at(8) });
    g.state.units[0]!.figures[3]!.destroyed = true;
    const back = withOutcome(g.state, endTurn, g.ctx, (e) => ofType(e, "figureRevived").length === 1 && ofType(e, "abilityRoll")[0]!.success);
    expect(ofType(back.events, "abilityRoll")).toHaveLength(1);
  });

  it("needs less on water or swamp", () => {
    const cols: [string, number][] = [["water", 1], ["grass", 1], ["swamp", 1], ...flat(6)];
    const g = game(cols, { p1: ["spawn"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:0#2": at(4), "p2:0#1": at(8) });
    for (const f of g.state.units[0]!.figures.slice(2)) f.destroyed = true;
    const r = apply(g.state, endTurn, g.ctx);
    expect(ofType(r.events, "abilityRoll").map((e) => e.needed)).toEqual([12, 16]);
  });

  it("does nothing on a turn the squad attacked", () => {
    const g = game(flat(9), { p1: ["spawn"], p2: ["hero"] }, { "p1:0#1": at(1), "p1:0#2": at(0), "p2:0#1": at(5) });
    g.state.units[0]!.figures[3]!.destroyed = true;
    const attacked = apply(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx).state;
    const r = apply(attacked, endTurn, g.ctx);
    expect(ofType(r.events, "abilityRoll")).toEqual([]);
  });
});
