import { describe, expect, it } from "vitest";
import {
  applyCommand,
  attackDice,
  attackProblem,
  attackTargets,
  createGame,
  hex,
  moveOptions,
  placementKey,
  specialActions,
  type Ability,
  type GameEvent,
  type GameState,
  type RulesContext,
  type UnitCard,
} from "../src";
import { CARDS, apply, makeCtx, rowMap, setup, testCard, turnState, withOutcome } from "./fixtures";

/** Tests for the abilities added with the 48-unit roster. */

const ab = (id: string, params?: Record<string, number>): Ability => ({ id, name: id, text: `${id} ability`, ...(params ? { params } : {}) });
const hero = (id: string, abilities: Ability[], extra: Partial<UnitCard> = {}) =>
  testCard(id, { advanced: { life: 4, move: 5, range: 1, attack: 3, defense: 3, points: 100, abilities }, ...extra });
const squad = (id: string, abilities: Ability[], extra: Partial<UnitCard> = {}) =>
  testCard(id, {
    unitType: "commonSquad",
    figureCount: 3,
    advanced: { life: 1, move: 5, range: 6, attack: 2, defense: 2, points: 60, abilities },
    ...extra,
  });

const NEW_CARDS: UnitCard[] = [
  ...CARDS,
  hero("archer", [ab("pin")], { advanced: { life: 4, move: 5, range: 6, attack: 3, defense: 3, points: 100, abilities: [ab("pin")] } }),
  hero("sapper", [ab("shove")]),
  hero("grappler", [ab("grapple-line", { range: 3 })]),
  squad("ronin", [ab("last-stand")], { advanced: { life: 1, move: 5, range: 1, attack: 3, defense: 0, points: 60, abilities: [ab("last-stand")] } }),
  hero("fae", [ab("fae-step", { range: 5 })]),
  squad("sprites", [ab("will-o-wisp", { maxDistance: 4 })]),
  squad("trees", [ab("regrowth", { heal: 1 })], { figureCount: 2, advanced: { life: 3, move: 3, range: 1, attack: 4, defense: 4, points: 120, abilities: [ab("regrowth", { heal: 1 })] } }),
  squad("drones", [ab("volatile-core", { defenseDice: 1 })], { advanced: { life: 1, move: 6, range: 1, attack: 2, defense: 0, points: 60, abilities: [ab("volatile-core", { defenseDice: 1 })] } }),
  hero("drummer", [ab("war-drums", { range: 3, move: 2 })], { species: "Orc" }),
  squad("orcs", [], { species: "Orc" }),
  squad("ghouls", [ab("corpse-feast", { move: 2 })], { advanced: { life: 1, move: 6, range: 1, attack: 4, defense: 1, points: 60, abilities: [ab("corpse-feast", { move: 2 })] } }),
  hero("paladin", [ab("challenge")]),
  squad("xbows", [ab("piercing", { reduce: 1 })]),
  squad("acolytes", [ab("mending-hymn", { range: 3, heal: 1 })], { figureCount: 2 }),
  hero("weak", [], { advanced: { life: 1, move: 5, range: 1, attack: 3, defense: 0, points: 50, abilities: [] } }),
];

const flat = (n: number, terrain = "grass"): [string, number][] => Array.from({ length: n }, () => [terrain, 1]);
const at = (q: number, elevation = 1) => ({ q, r: 0, elevation });
const step = (q: number, elevation = 1) => ({ hex: hex(q, 0), elevation });

function game(
  columns: [string, number][],
  armies: { p1: string[]; p2: string[] },
  positions: Record<string, { q: number; r: number; elevation: number }>,
  active = "p1:0",
  mode: "basic" | "advanced" = "advanced",
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(rowMap(columns), NEW_CARDS);
  const base = createGame(setup(2, { mapId: "test-row", mode, armies }), ctx).state;
  return { ctx, state: turnState(base, active, positions) };
}

const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const attack = (player: string, figureId: string, targetId: string, ability?: string) =>
  ({ type: "attack", player, figureId, targetId, ...(ability ? { ability } : {}) }) as const;

describe("pin", () => {
  it("stops a wounded figure from moving on its unit's next turn, then wears off", () => {
    const g = game(flat(9), { p1: ["archer"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    const hit = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "figureWounded").length > 0 && ofType(e, "figureDestroyed").length === 0);
    expect(hit.state.pinned).toEqual(["p2:0#1"]);
    expect(ofType(hit.events, "abilityUsed").map((e) => e.ability)).toEqual(["pin"]);
    // On p2's turn the figure cannot move, but it can still attack.
    const theirs = { ...turnState(hit.state, "p2:0", { "p1:0#1": at(0), "p2:0#1": at(4) }), pinned: hit.state.pinned };
    expect(moveOptions(theirs, "p2:0#1", g.ctx).size).toBe(0);
    expect(applyCommand(theirs, { type: "move", player: "p2", figureId: "p2:0#1", path: [step(3)] }, g.ctx).error).toMatch(/pinned/);
    const ended = apply(theirs, { type: "endTurn", player: "p2" }, g.ctx).state;
    expect(ended.pinned).toBeUndefined();
  });

  it("does nothing on a miss", () => {
    const g = game(flat(9), { p1: ["archer"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    const miss = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "figureWounded").length === 0);
    expect(miss.state.pinned).toBeUndefined();
  });
});

describe("shove", () => {
  it("shoves a melee target one hex straight back, and it can fall", () => {
    const cols: [string, number][] = [["rock", 6], ["rock", 6], ["grass", 1], ...flat(3)];
    const g = game(cols, { p1: ["sapper"], p2: ["hero"] }, { "p1:0#1": at(0, 6), "p2:0#1": at(1, 6) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e, s) => !s.units[1]!.figures[0]!.destroyed && ofType(e, "attackRolled").some((x) => x.source === "fall"));
    expect(r.state.units.find((u) => u.id === "p2:0")!.figures[0]!.position).toMatchObject({ hex: hex(2, 0), elevation: 1 });
    expect(ofType(r.events, "abilityUsed")[0]!.detail).toMatch(/shoved back/);
  });

  it("does not shove into an occupied hex", () => {
    const g = game(flat(6), { p1: ["sapper"], p2: ["hero", "squad"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(2) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (_, s) => !s.units[1]!.figures[0]!.destroyed);
    expect(r.state.units[1]!.figures[0]!.position?.hex).toEqual(hex(1, 0));
    expect(ofType(r.events, "abilityUsed")[0]!.detail).toMatch(/nowhere to go/);
  });
});

describe("grapple line", () => {
  it("pulls a Small or Medium enemy into the nearest free hex next to the puller", () => {
    const g = game(flat(9), { p1: ["grappler"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    expect(specialActions(g.state, NEW_CARDS.find((c) => c.id === "grappler")!)).toEqual([{ id: "grapple-line", name: "grapple-line", kind: "pull" }]);
    expect(attackTargets(g.state, "p1:0#1", g.ctx, "grapple-line")).toEqual(["p2:0#1"]);
    const r = apply(g.state, attack("p1", "p1:0#1", "p2:0#1", "grapple-line"), g.ctx);
    expect(r.state.units[1]!.figures[0]!.position?.hex).toEqual(hex(1, 0));
    expect(r.state.active!.attacked).toEqual(["p1:0#1"]);
  });

  it("cannot pull large figures, figures already next to it, or from out of range", () => {
    const g = game(flat(9), { p1: ["grappler"], p2: ["big", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:1#1": at(1) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx, "grapple-line")).toMatch(/Small or Medium/);
    expect(attackProblem(g.state, "p1:0#1", "p2:1#1", g.ctx, "grapple-line")).toMatch(/Too close/);
    const far = game(flat(9), { p1: ["grappler"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(5) });
    expect(attackProblem(far.state, "p1:0#1", "p2:0#1", far.ctx, "grapple-line")).toMatch(/Out of range/);
  });
});

describe("last stand", () => {
  it("lets a destroyed figure strike back at its attacker", () => {
    const g = game(flat(6), { p1: ["hero"], p2: ["ronin"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "figureDestroyed").length > 0);
    const rolls = ofType(r.events, "attackRolled");
    expect(rolls.map((x) => [x.attackerId, x.targetId, x.ability])).toEqual([
      ["p1:0#1", "p2:0#1", undefined],
      ["p2:0#1", "p1:0#1", "last-stand"],
    ]);
  });

  it("cannot strike back out of reach", () => {
    const g = game(flat(9), { p1: ["squad"], p2: ["ronin"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "figureDestroyed").length > 0);
    expect(ofType(r.events, "attackRolled")).toHaveLength(1);
  });
});

describe("fae step", () => {
  it("swaps places with a friendly single-hex figure in range, instead of attacking", () => {
    const g = game(flat(9), { p1: ["fae", "hero"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(4), "p2:0#1": at(8) });
    expect(attackTargets(g.state, "p1:0#1", g.ctx, "fae-step")).toEqual(["p1:1#1"]);
    const r = apply(g.state, attack("p1", "p1:0#1", "p1:1#1", "fae-step"), g.ctx);
    expect(r.state.units[0]!.figures[0]!.position?.hex).toEqual(hex(4, 0));
    expect(r.state.units[1]!.figures[0]!.position?.hex).toEqual(hex(0, 0));
    expect(attackProblem(r.state, "p1:0#1", "p2:0#1", g.ctx)).toMatch(/already attacked/);
  });

  it("refuses enemies, multi-hex friends and friends out of range", () => {
    const g = game(flat(12), { p1: ["fae", "big", "hero"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(2), "p1:2#1": at(7), "p2:0#1": at(4) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx, "fae-step")).toMatch(/friendly/);
    expect(attackProblem(g.state, "p1:0#1", "p1:1#1", g.ctx, "fae-step")).toMatch(/single-hex/);
    expect(attackProblem(g.state, "p1:0#1", "p1:2#1", g.ctx, "fae-step")).toMatch(/Out of range/);
  });
});

describe("will-o'-the-wisp and challenge", () => {
  it("cannot be targeted from more than 4 hexes away", () => {
    const g = game(flat(9), { p1: ["squad"], p2: ["sprites"] }, { "p1:0#1": at(0), "p2:0#1": at(5) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx)).toMatch(/more than 4 hexes/);
    const near = game(flat(9), { p1: ["squad"], p2: ["sprites"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    expect(attackProblem(near.state, "p1:0#1", "p2:0#1", near.ctx)).toBeNull();
    const basic = game(flat(9), { p1: ["squad"], p2: ["sprites"] }, { "p1:0#1": at(0), "p2:0#1": at(5) }, "p1:0", "basic");
    expect(attackProblem(basic.state, "p1:0#1", "p2:0#1", basic.ctx)).toBeNull();
  });

  it("makes neighbours of the challenger attack only the challenger", () => {
    const g = game(flat(9), { p1: ["squad"], p2: ["paladin", "hero"] }, { "p1:0#1": at(1), "p2:0#1": at(2), "p2:1#1": at(0) });
    expect(attackProblem(g.state, "p1:0#1", "p2:1#1", g.ctx)).toMatch(/must attack Test paladin first/);
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx)).toBeNull();
    const apart = game(flat(9), { p1: ["squad"], p2: ["paladin", "hero"] }, { "p1:0#1": at(1), "p2:0#1": at(5), "p2:1#1": at(0) });
    expect(attackProblem(apart.state, "p1:0#1", "p2:1#1", apart.ctx)).toBeNull();
  });
});

describe("healing at the end of a turn", () => {
  it("Regrowth heals Treefolk standing on forest", () => {
    const cols: [string, number][] = [["forest", 1], ["grass", 1], ...flat(3)];
    const g = game(cols, { p1: ["trees"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:0#2": at(1), "p2:0#1": at(4) });
    for (const f of g.state.units[0]!.figures) f.wounds = 2;
    const r = apply(g.state, { type: "endTurn", player: "p1" }, g.ctx);
    expect(r.state.units[0]!.figures.map((f) => f.wounds)).toEqual([1, 2]);
  });

  it("Mending Hymn heals the most wounded friendly hero in range", () => {
    const g = game(flat(9), { p1: ["acolytes", "hero", "unique"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(3), "p1:2#1": at(6), "p2:0#1": at(8) });
    g.state.units[1]!.figures[0]!.wounds = 1;
    g.state.units[2]!.figures[0]!.wounds = 3;
    const r = apply(g.state, { type: "endTurn", player: "p1" }, g.ctx);
    // The unique hero is more wounded but out of range: the near one heals.
    expect(r.state.units[1]!.figures[0]!.wounds).toBe(0);
    expect(r.state.units[2]!.figures[0]!.wounds).toBe(3);
  });
});

describe("volatile core, war drums, corpse feast and piercing", () => {
  it("Volatile Core makes a destroyed drone burst against every figure next to it", () => {
    const g = game(flat(6), { p1: ["hero"], p2: ["drones", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(2) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "figureDestroyed").length > 0);
    const bursts = ofType(r.events, "abilityUsed").filter((e) => e.ability === "volatile-core");
    expect(bursts.map((e) => e.targetId).sort()).toEqual(["p1:0#1", "p2:1#1"]);
  });

  it("War Drums give other Orcs near the drummer +2 move", () => {
    const g = game(flat(12), { p1: ["orcs", "drummer"], p2: ["hero"] }, { "p1:0#1": at(2), "p1:1#1": at(0), "p2:0#1": at(11) });
    expect(moveOptions(g.state, "p1:0#1", g.ctx).has(placementKey(step(9)))).toBe(true);
    const far = game(flat(12), { p1: ["orcs", "drummer"], p2: ["hero"] }, { "p1:0#1": at(4), "p1:1#1": at(0), "p2:0#1": at(11) });
    expect(moveOptions(far.state, "p1:0#1", far.ctx).has(placementKey(step(10)))).toBe(false);
  });

  it("Corpse Feast gives a 2-hex move after a kill", () => {
    const g = game(flat(8), { p1: ["ghouls"], p2: ["weak", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(7) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "figureDestroyed").length > 0);
    expect(r.state.active!.bonusMoves["p1:0#1"]).toBe(2);
    const keys = [...moveOptions(r.state, "p1:0#1", g.ctx).keys()];
    expect(keys).toContain(placementKey(step(2)));
    expect(keys).not.toContain(placementKey(step(3)));
  });

  it("Piercing takes a defense die away, never below none", () => {
    const g = game(flat(9), { p1: ["xbows"], p2: ["hero", "weak"] }, { "p1:0#1": at(0), "p2:0#1": at(4), "p2:1#1": at(5) });
    expect(attackDice(g.state, "p1:0#1", "p2:0#1", g.ctx)).toMatchObject({ defense: 2, defenseBonus: -1, notes: ["piercing -1 defense"] });
    expect(attackDice(g.state, "p1:0#1", "p2:1#1", g.ctx).defense).toBe(0);
  });
});
