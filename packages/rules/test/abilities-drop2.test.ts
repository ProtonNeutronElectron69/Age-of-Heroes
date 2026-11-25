import { describe, expect, it } from "vitest";
import {
  applyCommand,
  attackProblem,
  attackTargets,
  carryFriends,
  createGame,
  endOfTurnAbilities,
  hex,
  hurlSpots,
  ignoresSwamp,
  moveOptions,
  placementKey,
  powerProblem,
  specialActions,
  type Ability,
  type Command,
  type GameEvent,
  type GameState,
  type RulesContext,
  type UnitCard,
} from "../src";
import { CARDS, apply, makeCtx, rowMap, setup, testCard, turnState, withOutcome } from "./fixtures";

/** Tests for the abilities added with the second ability drop (one of each in the roster). */

const ab = (id: string, params?: Record<string, number>): Ability => ({ id, name: id, text: `${id} ability`, ...(params ? { params } : {}) });
const hero = (id: string, abilities: Ability[], extra: Partial<UnitCard> = {}) =>
  testCard(id, { life: 4, move: 5, range: 1, attack: 3, defense: 3, points: 100, abilities, ...extra });
const squad = (id: string, abilities: Ability[], extra: Partial<UnitCard> = {}) =>
  testCard(id, { unitType: "commonSquad", figureCount: 3, life: 1, move: 5, range: 6, attack: 2, defense: 2, points: 60, abilities, ...extra });

const DROP_CARDS: UnitCard[] = [
  ...CARDS,
  squad("raiders", [ab("blood-surge", { needed: 15 })], { range: 1, attack: 3, species: "Orc" }),
  hero("archer", [ab("second-arrow")], { range: 6 }),
  hero("k7", [ab("twin-cannons", { attacks: 2 })], { range: 5 }),
  hero("drainer", [ab("life-tap", { range: 4, dice: 2 })], { life: 6 }),
  hero("coil", [ab("constrict", { needed: 16 }), ab("grave-dread", { failOnOrBelow: 6 })], { unitType: "uniqueHero", size: "huge" }),
  hero("shaman", [ab("bonecall")], { species: "Orc" }),
  squad("orcs", [], { species: "Orc", figureCount: 2 }),
  squad("pair", [], { figureCount: 2 }),
  hero("angel", [ab("flying"), ab("wings-of-refuge")]),
  hero("mage", [ab("blink", { range: 4 })], { move: 1 }),
  squad("xbows", [ab("bolt-through", { reduce: 1 })]),
  squad("spotters", [ab("spotters-call", { range: 3, reduce: 1 })], { range: 8 }),
  hero("monk", [ab("mist-form", { minDistance: 2 })]),
  hero("blade", [ab("circle-cut")]),
  hero("oni", [ab("hurl", { range: 3, wounds: 1 })]),
  hero("captain", [ab("call-to-arms", { range: 4 })]),
  squad("line", [], { personality: "Disciplined" }),
  squad("pikes", [ab("shieldbearers")], { range: 1 }),
  hero("medic", [ab("second-wind", { range: 2 })]),
  hero("walker", [ab("quake-stomp", { defenseDice: 1, wounds: 1 })]),
  squad("breachers", [ab("mag-lock-boots")], { range: 1 }),
  hero("phaser", [ab("phase-walk")]),
  squad("lobbers", [ab("caustic-spores", { turns: 2, woundOnOrBelow: 7 })], { range: 4 }),
  squad("stalkers", [ab("lurk")], { range: 1, attack: 3 }),
  squad("prowlers", [ab("harry")], { range: 1, attack: 3 }),
  hero("druid", [ab("treewalk", { range: 8 })], { move: 2 }),
  hero("wyrm", [ab("fire-breath", { range: 4, dice: 3 })]),
  hero("weak", [], { life: 1, defense: 0 }),
  hero("dummy", [], { life: 8, defense: 0 }),
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
  const ctx = makeCtx(rowMap(columns), DROP_CARDS);
  const base = createGame(setup(2, { mapId: "test-row", armies }), ctx).state;
  return { ctx, state: turnState(base, active, positions) };
}

const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);
const attack = (player: string, figureId: string, targetId: string, ability?: string): Command => ({ type: "attack", player, figureId, targetId, ...(ability ? { ability } : {}) });
const power = (figureId: string, ability: string, aim: { targetId?: string; unitId?: string; at?: { hex: { q: number; r: number }; elevation: number } } = {}): Command => ({
  type: "power",
  player: "p1",
  figureId,
  ability,
  ...aim,
});
const refused = (state: GameState, cmd: Command, ctx: RulesContext) => {
  const r = applyCommand(state, cmd, ctx);
  return r.ok ? null : r.error;
};
const figure = (state: GameState, id: string) => state.units.flatMap((u) => u.figures).find((f) => f.id === id)!;

describe("more attacks in a turn", () => {
  it("Blood Surge: a d20 after the first normal attack may earn one more", () => {
    const g = game(flat(8), { p1: ["raiders"], p2: ["dummy"] }, { "p1:0#1": at(2), "p2:0#1": at(3) });
    const surged = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "abilityRoll").some((r) => r.ability === "blood-surge" && r.success));
    const second = apply(surged.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx);
    // One extra only: no roll after the extra attack, and no third.
    expect(ofType(second.events, "abilityRoll").some((r) => r.ability === "blood-surge")).toBe(false);
    expect(refused(second.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx)).toMatch(/already attacked/);
    const failed = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "abilityRoll").some((r) => r.ability === "blood-surge" && !r.success));
    expect(refused(failed.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx)).toMatch(/already attacked/);
  });

  it("Second Arrow: a kill with a normal attack earns one more, once a turn", () => {
    const g = game(flat(8), { p1: ["archer"], p2: ["weak", "dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:1#1": at(5) });
    const kill = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (_, s) => figure(s, "p2:0#1").destroyed);
    const again = apply(kill.state, attack("p1", "p1:0#1", "p2:1#1"), g.ctx);
    expect(refused(again.state, attack("p1", "p1:0#1", "p2:1#1"), g.ctx)).toMatch(/already attacked/);
    const miss = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (_, s) => !figure(s, "p2:0#1").destroyed);
    expect(refused(miss.state, attack("p1", "p1:0#1", "p2:1#1"), g.ctx)).toMatch(/already attacked/);
  });

  it("Twin Cannons: two normal attacks if the figure has not moved, one if it has", () => {
    const g = game(flat(8), { p1: ["k7"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    const first = apply(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx);
    const second = apply(first.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx);
    expect(refused(second.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx)).toMatch(/already attacked/);
    // A move is still not allowed after attacking.
    expect(refused(first.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx)).toMatch(/after attacking/);
    const moved = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx);
    const once = apply(moved.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx);
    expect(refused(once.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx)).toMatch(/already attacked/);
  });
});

describe("special actions aimed at a figure", () => {
  it("lists the new powers with their kinds", () => {
    const kinds = (id: string) => specialActions(DROP_CARDS.find((c) => c.id === id)!).map((s) => s.kind);
    expect(kinds("drainer")).toEqual(["drain"]);
    expect(kinds("coil")).toEqual(["crush"]);
    expect(kinds("blade")).toEqual(["sweep"]);
    expect(kinds("oni")).toEqual(["throw"]);
    expect(kinds("wyrm")).toEqual(["breath"]);
    expect(kinds("walker")).toEqual(["stomp"]);
    expect(kinds("shaman")).toEqual(["raise"]);
    expect(kinds("captain")).toEqual(["orders"]);
  });

  it("Life Tap: the drainer heals a wound for each wound it deals", () => {
    const g = game(flat(8), { p1: ["drainer"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    figure(g.state, "p1:0#1").wounds = 3;
    expect(refused(g.state, attack("p1", "p1:0#1", "p2:0#1", "life-tap"), g.ctx)).toBeNull();
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1", "life-tap"), g.ctx, (e) => ofType(e, "attackRolled")[0]!.wounds === 2);
    expect(ofType(r.events, "attackRolled")[0]!.attack).toHaveLength(2);
    expect(figure(r.state, "p1:0#1").wounds).toBe(1);
    const far = game(flat(8), { p1: ["drainer"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(5) });
    expect(refused(far.state, attack("p1", "p1:0#1", "p2:0#1", "life-tap"), far.ctx)).toMatch(/Out of range/);
  });

  it("Constrict: a d20 destroys a Small or Medium figure that is not unique outright", () => {
    const g = game(flat(8), { p1: ["coil"], p2: ["weak", "unique"] }, { "p1:0#1": at(2), "p2:0#1": at(3), "p2:1#1": at(1) });
    const crushed = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1", "constrict"), g.ctx, (e) => ofType(e, "abilityRoll").some((r) => r.success));
    expect(figure(crushed.state, "p2:0#1").destroyed).toBe(true);
    expect(ofType(crushed.events, "figureDestroyed")[0]!.cause).toBe("ability");
    const spared = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1", "constrict"), g.ctx, (e) => ofType(e, "abilityRoll").some((r) => !r.success));
    expect(figure(spared.state, "p2:0#1").destroyed).toBe(false);
    expect(refused(g.state, attack("p1", "p1:0#1", "p2:1#1", "constrict"), g.ctx)).toMatch(/unique/);
  });

  it("Grave Dread: an enemy beside it may lose its nerve, and the attack is lost", () => {
    const g = game(flat(8), { p1: ["hero"], p2: ["coil"] }, { "p1:0#1": at(2), "p2:0#1": at(3) });
    const lost = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "abilityRoll").some((r) => r.ability === "grave-dread" && !r.success));
    expect(ofType(lost.events, "attackRolled")).toHaveLength(0);
    expect(lost.state.active!.attacked).toContain("p1:0#1");
    const held = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => ofType(e, "abilityRoll").some((r) => r.ability === "grave-dread" && r.success));
    expect(ofType(held.events, "attackRolled")).toHaveLength(1);
    // Not beside it: no roll.
    const away = game(flat(8), { p1: ["squad"], p2: ["coil"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    expect(ofType(apply(away.state, attack("p1", "p1:0#1", "p2:0#1"), away.ctx).events, "abilityRoll")).toHaveLength(0);
  });

  it("Circle Cut: one action strikes every enemy beside the figure", () => {
    const g = game(flat(8), { p1: ["blade"], p2: ["dummy", "dummy"] }, { "p1:0#1": at(2), "p2:0#1": at(1), "p2:1#1": at(3) });
    expect(attackTargets(g.state, "p1:0#1", g.ctx, "circle-cut").sort()).toEqual(["p2:0#1", "p2:1#1"]);
    const r = apply(g.state, attack("p1", "p1:0#1", "p2:0#1", "circle-cut"), g.ctx);
    expect(ofType(r.events, "attackRolled").map((e) => e.targetId).sort()).toEqual(["p2:0#1", "p2:1#1"]);
  });

  it("Piercing Bolts: the bolt flies on into the next figure behind, friend or foe", () => {
    const g = game(flat(10), { p1: ["xbows"], p2: ["dummy", "dummy"] }, { "p1:0#1": at(0), "p1:0#2": at(4), "p2:0#1": at(2), "p2:1#1": at(6) });
    const r = apply(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx);
    const rolls = ofType(r.events, "attackRolled");
    // The friend on hex 4 is next behind the target, so it takes the bolt; the enemy beyond does not.
    expect(rolls.map((e) => e.targetId)).toEqual(["p2:0#1", "p1:0#2"]);
    expect(rolls[1]!.attack).toHaveLength(1);
  });

  it("Spotter's Call: a shot at an enemy a nearby friend can see, with one fewer die", () => {
    const columns: [string, number][] = [...flat(2), ["rock", 12], ...flat(5)];
    const g = game(columns, { p1: ["spotters"], p2: ["dummy"] }, { "p1:0#1": at(0), "p1:0#2": at(5), "p2:0#1": at(4) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx)).toBeNull();
    const r = apply(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx);
    expect(ofType(r.events, "attackRolled")[0]!.attack).toHaveLength(1);
    // With no friend near the target, the wall blocks the shot.
    const alone = game(columns, { p1: ["spotters"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    expect(attackProblem(alone.state, "p1:0#1", "p2:0#1", alone.ctx)).toMatch(/line of sight/);
  });

  it("Mist Form: a ranged attack does nothing once the target rolls a shield", () => {
    const g = game(flat(8), { p1: ["k7"], p2: ["monk"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => {
      const roll = ofType(e, "attackRolled")[0];
      return !!roll && roll.blocks > 0 && roll.hits > roll.blocks;
    });
    expect(ofType(r.events, "attackRolled")[0]!.wounds).toBe(0);
    expect(figure(r.state, "p2:0#1").wounds).toBe(0);
  });
});

describe("powers", () => {
  it("Hurl: throws an adjacent enemy onto a free hex in reach, where it takes a wound", () => {
    const g = game(flat(9), { p1: ["oni"], p2: ["dummy"] }, { "p1:0#1": at(2), "p2:0#1": at(3) });
    expect(hurlSpots(g.state, "p1:0#1", "p2:0#1", g.ctx).some((s) => s.hex.q === 5)).toBe(true);
    expect(powerProblem(g.state, "p1:0#1", "hurl", { targetId: "p2:0#1", at: step(6) }, g.ctx)).toMatch(/cannot be thrown there/);
    const r = apply(g.state, power("p1:0#1", "hurl", { targetId: "p2:0#1", at: step(5) }), g.ctx);
    expect(figure(r.state, "p2:0#1").position!.hex).toEqual(hex(5, 0));
    expect(figure(r.state, "p2:0#1").wounds).toBe(1);
    expect(r.state.active!.attacked).toContain("p1:0#1");
    // It is not an attack command.
    expect(refused(g.state, attack("p1", "p1:0#1", "p2:0#1", "hurl"), g.ctx)).toMatch(/use the power/);
  });

  it("Quake Stomp: everything beside the stomper may be wounded and rooted", () => {
    const g = game(flat(8), { p1: ["walker"], p2: ["dummy", "dummy"] }, { "p1:0#1": at(2), "p2:0#1": at(1), "p2:1#1": at(3) });
    const r = withOutcome(g.state, power("p1:0#1", "quake-stomp"), g.ctx, (_, s) => figure(s, "p2:0#1").wounds === 1);
    expect(r.state.pinned).toContain("p2:0#1");
    expect(ofType(r.events, "abilityUsed").filter((e) => e.targetId).map((e) => e.targetId).sort()).toEqual(["p2:0#1", "p2:1#1"]);
  });

  it("Fire Breath: burns every figure along its row, and terrain above its head stops it", () => {
    const g = game(flat(9), { p1: ["wyrm", "dummy"], p2: ["dummy", "dummy"] }, { "p1:0#1": at(0), "p1:1#1": at(1), "p2:0#1": at(3), "p2:1#1": at(6) });
    const r = apply(g.state, power("p1:0#1", "fire-breath", { at: step(1) }), g.ctx);
    const burned = ofType(r.events, "attackRolled");
    expect(burned.map((e) => e.targetId)).toEqual(["p1:1#1", "p2:0#1"]);
    expect(burned[0]!.attack).toHaveLength(3);
    const walled = game([...flat(2), ["rock", 12], ...flat(5)], { p1: ["wyrm"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    expect(ofType(apply(walled.state, power("p1:0#1", "fire-breath", { at: step(1) }), walled.ctx).events, "attackRolled")).toHaveLength(0);
    expect(powerProblem(g.state, "p1:0#1", "fire-breath", { at: step(2) }, g.ctx)).toMatch(/row of hexes/);
  });

  it("Bonecall: a fallen Orc or Undead squad figure rises beside the caller", () => {
    const g = game(flat(8), { p1: ["shaman", "orcs"], p2: ["dummy"] }, { "p1:0#1": at(0), "p1:1#2": at(5), "p2:0#1": at(7) });
    figure(g.state, "p1:1#1").destroyed = true;
    const humans = game(flat(8), { p1: ["shaman", "pair"], p2: ["dummy"] }, { "p1:0#1": at(0), "p1:1#2": at(5), "p2:0#1": at(7) });
    figure(humans.state, "p1:1#1").destroyed = true;
    expect(powerProblem(humans.state, "p1:0#1", "bonecall", { unitId: "p1:1" }, humans.ctx)).toMatch(/Orc or Undead/);
    const r = apply(g.state, power("p1:0#1", "bonecall", { unitId: "p1:1" }), g.ctx);
    const risen = figure(r.state, "p1:1#1");
    expect(risen.destroyed).toBe(false);
    expect(risen.position!.hex).toEqual(hex(1, 0));
  });

  it("Call to Arms: a Disciplined squad nearby takes a turn as the caller's ends, once a round", () => {
    const g = game(flat(8), { p1: ["captain", "line"], p2: ["dummy"] }, { "p1:0#1": at(0), "p1:1#1": at(3), "p2:0#1": at(7) });
    expect(powerProblem(g.state, "p1:0#1", "call-to-arms", { unitId: "p2:0" }, g.ctx)).toMatch(/Disciplined/);
    // Choosing is not an attack: the caller may still attack.
    const chosen = apply(g.state, power("p1:0#1", "call-to-arms", { unitId: "p1:1" }), g.ctx);
    expect(chosen.state.active!.attacked).toEqual([]);
    const called = apply(chosen.state, { type: "endTurn", player: "p1" }, g.ctx);
    expect(called.state.active).toMatchObject({ player: "p1", unitId: "p1:1", called: true });
    expect(called.state.called).toEqual(["p1:0"]);
    const after = apply(called.state, { type: "endTurn", player: "p1" }, g.ctx);
    expect(after.state.active?.player).toBe("p2");
    // Out of reach as the turn ends: no extra turn.
    const moved = apply(chosen.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)].map((s) => s) }, g.ctx);
    expect(apply(moved.state, { type: "endTurn", player: "p1" }, g.ctx).state.active?.unitId).toBe("p1:1");
  });
});

describe("movement", () => {
  it("Blink: teleports to a free hex in sight within reach, as its whole move", () => {
    const g = game(flat(8), { p1: ["mage"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(7) });
    const options = moveOptions(g.state, "p1:0#1", g.ctx);
    expect(options.get(placementKey({ hex: hex(1, 0), elevation: 1 }))!.ability).toBeUndefined();
    expect(options.get(placementKey({ hex: hex(4, 0), elevation: 1 }))!.ability).toBe("blink");
    expect(options.has(placementKey({ hex: hex(5, 0), elevation: 1 }))).toBe(false);
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(4)], ability: "blink" }, g.ctx);
    expect(figure(r.state, "p1:0#1").position!.hex).toEqual(hex(4, 0));
    expect(moveOptions(r.state, "p1:0#1", g.ctx).size).toBe(0);
    // After walking, no blink.
    const walked = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx);
    expect(refused(walked.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(4)], ability: "blink" }, g.ctx)).toMatch(/already moved/);
  });

  it("Wings of Refuge: a flyer sets a carried friend down beside where it lands", () => {
    const g = game(flat(9), { p1: ["angel", "weak", "weak"], p2: ["dummy"] }, { "p1:0#1": at(0), "p1:1#1": at(1), "p1:2#1": at(3), "p2:0#1": at(8) });
    expect(carryFriends(g.state, "p1:0#1", g.ctx)).toEqual(["p1:1#1"]);
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(5)], carry: { figureId: "p1:1#1", to: step(6) } }, g.ctx);
    expect(figure(r.state, "p1:1#1").position!.hex).toEqual(hex(6, 0));
    expect(refused(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(5)], carry: { figureId: "p1:2#1", to: step(6) } }, g.ctx)).toMatch(/cannot be carried/);
    expect(refused(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(5)], carry: { figureId: "p1:1#1", to: step(8) } }, g.ctx)).toMatch(/set down/);
  });

  it("Mag-Lock Boots: climbs any height in one step and never falls", () => {
    const columns: [string, number][] = [["grass", 1], ["rock", 8], ["grass", 1], ...flat(3)];
    const g = game(columns, { p1: ["breachers"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(5) });
    expect(moveOptions(g.state, "p1:0#1", g.ctx).has(placementKey({ hex: hex(1, 0), elevation: 8 }))).toBe(true);
    const up = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1, 8)] }, g.ctx);
    const down = apply(up.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(2)] }, g.ctx);
    expect(ofType(down.events, "attackRolled").filter((e) => e.source === "fall")).toHaveLength(0);
  });

  it("Phase Walk: moves through enemies and draws no passing strikes", () => {
    const g = game(flat(8), { p1: ["phaser"], p2: ["squad"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:0#2": at(2) });
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1), step(2), step(3), step(4)] }, g.ctx);
    expect(figure(r.state, "p1:0#1").position!.hex).toEqual(hex(4, 0));
    expect(ofType(r.events, "attackRolled")).toHaveLength(0);
  });

  it("Treewalk: one step of 1 Move from forest to forest", () => {
    const columns: [string, number][] = [["forest", 1], ...flat(5), ["forest", 1], ["grass", 1]];
    const g = game(columns, { p1: ["druid"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(7) });
    const option = moveOptions(g.state, "p1:0#1", g.ctx).get(placementKey({ hex: hex(6, 0), elevation: 1 }))!;
    expect(option.path).toHaveLength(1);
    expect(option.cost).toBe(1);
    apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: option.path }, g.ctx);
  });

  it("Harry: leaving a Prowler draws a full attack, with defense dice", () => {
    const g = game(flat(8), { p1: ["hero"], p2: ["prowlers"] }, { "p1:0#1": at(3), "p2:0#1": at(2) });
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(4), step(5)] }, g.ctx);
    const strike = ofType(r.events, "attackRolled")[0]!;
    expect(strike).toMatchObject({ source: "attack", attackerId: "p2:0#1", ability: "harry" });
    expect(strike.defense.length).toBe(3);
  });

  it("Lurk: a figure ending its move beside a Stalker in water is struck at once, once a turn", () => {
    const columns: [string, number][] = [...flat(4), ["water", 1], ...flat(3)];
    const g = game(columns, { p1: ["squad"], p2: ["stalkers"] }, { "p1:0#1": at(0), "p1:0#2": at(1), "p2:0#1": at(4) });
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1), step(2), step(3)] }, g.ctx);
    expect(ofType(r.events, "attackRolled").some((e) => e.attackerId === "p2:0#1" && e.ability === "lurk")).toBe(true);
    // Once a turn: the second figure ending beside it is not struck.
    const second = apply(r.state, { type: "move", player: "p1", figureId: "p1:0#2", path: [step(2)] }, g.ctx);
    expect(ofType(second.events, "attackRolled")).toHaveLength(0);
    expect(ignoresSwamp(DROP_CARDS.find((c) => c.id === "stalkers")!)).toBe(true);
    // On dry ground the Stalker does not lurk.
    const dry = game(flat(8), { p1: ["squad"], p2: ["stalkers"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    const d = apply(dry.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1), step(2), step(3)] }, dry.ctx);
    expect(ofType(d.events, "attackRolled")).toHaveLength(0);
  });
});

describe("defence and lingering effects", () => {
  it("Shieldbearers: a Pikeman beside a hero takes one of its wounds", () => {
    const g = game(flat(8), { p1: ["hero"], p2: ["dummy", "pikes"] }, { "p1:0#1": at(2), "p2:0#1": at(3), "p2:1#1": at(4) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => (ofType(e, "attackRolled")[0]?.wounds ?? 0) >= 1);
    const roll = ofType(r.events, "attackRolled")[0]!;
    expect(figure(r.state, "p2:1#1").destroyed).toBe(true);
    expect(figure(r.state, "p2:0#1").wounds).toBe(roll.wounds);
    expect(roll.notes!.some((n) => n.includes("shieldbearers"))).toBe(true);
  });

  it("Second Wind: once a game a hero near the medic is left with 1 Life", () => {
    const g = game(flat(8), { p1: ["hero"], p2: ["weak", "medic"] }, { "p1:0#1": at(2), "p2:0#1": at(3), "p2:1#1": at(5) });
    const saved = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => (ofType(e, "attackRolled")[0]?.hits ?? 0) >= 1);
    expect(figure(saved.state, "p2:0#1").destroyed).toBe(false);
    expect(saved.state.spent).toEqual(["second-wind:p2:1#1"]);
    // Spent: the next blow destroys it.
    saved.state.active!.attacked = [];
    const again = withOutcome(saved.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => (ofType(e, "attackRolled")[0]?.hits ?? 0) >= 1);
    expect(figure(again.state, "p2:0#1").destroyed).toBe(true);
  });

  it("Caustic Spores: a skull poisons; the victim rolls as its next two turns end", () => {
    const g = game(flat(8), { p1: ["lobbers"], p2: ["dummy"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    const r = withOutcome(g.state, attack("p1", "p1:0#1", "p2:0#1"), g.ctx, (e) => (ofType(e, "attackRolled")[0]?.hits ?? 0) >= 1);
    expect(r.state.poisoned).toEqual([{ figureId: "p2:0#1", turnsLeft: 2, woundOnOrBelow: 7 }]);
    const s = r.state;
    const events: GameEvent[] = [];
    endOfTurnAbilities(s, "p2:0", g.ctx, events);
    expect(ofType(events, "abilityRoll")[0]).toMatchObject({ ability: "caustic-spores", figureId: "p2:0#1", needed: 8 });
    expect(s.poisoned![0]!.turnsLeft).toBe(1);
    endOfTurnAbilities(s, "p2:0", g.ctx, []);
    expect(s.poisoned).toBeUndefined();
  });
});
