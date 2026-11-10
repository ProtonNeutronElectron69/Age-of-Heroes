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

const ABILITY_CARDS: UnitCard[] = [
  ...CARDS,
  hero("leader", [ab("rally-the-line", { range: 4, bonus: 1 })]),
  squad("disc", [], { personality: "Disciplined" }),
  hero("singer", [ab("grove-song", { range: 3, bonus: 1 })], { species: "Elf" }),
  squad("elves", [], { species: "Elf" }),
  hero("guard", [ab("deflector-field", { minDistance: 3, bonus: 1 })]),
  squad("leaves", [ab("hidden-in-the-leaves", { minDistance: 4, bonus: 2 })]),
  hero("moss", [ab("moss-armor", { minDistance: 4, bonus: 1 })]),
  squad("pikes", [ab("brace", { bonus: 2 })]),
  squad("volley", [ab("massed-volley", { attacks: 3, bonus: 2 })], { figureCount: 4 }),
  hero("parry", [ab("answering-blade", { wounds: 1 })]),
  hero("oni", [ab("thick-hide", { minDistance: 3, reduce: 1 })]),
  squad("salvage", [ab("salvage-protocol")]),
  hero("medic", [ab("field-dressing", { heal: 1 })]),
  hero("flyer", [ab("flying")]),
  squad("ninja", [ab("smoke-step", { move: 2 })]),
  hero("trampler", [ab("trample", { defenseDice: 1 })], { footprint: "2x1", size: "huge", height: 9 }),
  hero("spitter", [ab("ember-spit", { range: 3, dice: 2, splashDice: 1 })]),
  hero("mortar", [ab("mortar-barrage", { range: 8, minRange: 3, dice: 3, splashDice: 1, ignoresSight: 1 })]),
  hero("monk", [ab("lantern-gaze", { range: 4, needed: 16 })]),
  hero("bigfoe", [], { size: "large", height: 7 }),
  hero("knight", [ab("charge", { bonus: 1 })]),
  squad("rifles", [ab("steady-aim", { bonus: 1 })]),
  squad("bows", [ab("longshot", { minDistance: 5, bonus: 1 })]),
  squad("cats", [ab("pack-hunt", { bonus: 1 })]),
  squad("blades", [ab("duelist", { bonus: 1 })]),
  squad("orcs", [ab("bloodrage", { bonus: 1 })]),
  hero("angel", [ab("smite-the-unholy", { bonus: 2 })]),
  hero("necro", [ab("command-the-dead", { range: 4, bonus: 1 })]),
  squad("dead", [], { species: "Undead" }),
  squad("wall", [ab("shield-wall", { bonus: 1 })]),
  hero("reaper", [ab("soul-reap", { heal: 1 })]),
  squad("bots", [ab("reboot", { needed: 17 })]),
  squad("bones", [ab("reassemble", { needed: 15 })], { species: "Undead" }),
  hero("mage", [ab("arc-lightning", { range: 5, dice: 3, splashDice: 1 })]),
  hero("brute", [ab("fury", { bonus: 1 })]),
];

const flat = (n: number, terrain = "grass"): [string, number][] => Array.from({ length: n }, () => [terrain, 1]);
const at = (q: number, elevation = 1) => ({ q, r: 0, elevation });
const step = (q: number, elevation = 1) => ({ hex: hex(q, 0), elevation });

/** p1 and p2 armies by card id; positions by figure id; p1's first unit active unless given. */
function game(
  columns: [string, number][],
  armies: { p1: string[]; p2: string[] },
  positions: Record<string, { q: number; r: number; elevation: number }>,
  active = "p1:0",
  mode: "basic" | "advanced" = "advanced",
): { ctx: RulesContext; state: GameState } {
  const ctx = makeCtx(rowMap(columns), ABILITY_CARDS);
  const base = createGame(setup(2, { mapId: "test-row", mode, armies }), ctx).state;
  return { ctx, state: turnState(base, active, positions) };
}

const ofType = <T extends GameEvent["type"]>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe("defense and attack auras", () => {
  it("Rally the Line shields nearby Disciplined squads, only in the Advanced game", () => {
    const pos = { "p1:0#1": at(0), "p2:0#1": at(4), "p2:1#1": at(1) };
    const g = game(flat(9), { p1: ["hero"], p2: ["leader", "disc"] }, pos);
    expect(attackDice(g.state, "p1:0#1", "p2:1#1", g.ctx)).toMatchObject({ defenseBonus: 1, notes: ["rally-the-line +1 defense"] });
    const far = game(flat(9), { p1: ["hero"], p2: ["leader", "disc"] }, { ...pos, "p2:0#1": at(8) });
    expect(attackDice(far.state, "p1:0#1", "p2:1#1", far.ctx).defenseBonus).toBe(0);
    const basic = game(flat(9), { p1: ["hero"], p2: ["leader", "disc"] }, pos, "p1:0", "basic");
    expect(attackDice(basic.state, "p1:0#1", "p2:1#1", basic.ctx).defenseBonus).toBe(0);
  });

  it("Grove Song strengthens other friendly Elves nearby", () => {
    const g = game(flat(9), { p1: ["elves", "singer"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(2), "p2:0#1": at(5) });
    expect(attackDice(g.state, "p1:0#1", "p2:0#1", g.ctx)).toMatchObject({ attackBonus: 1, attack: 3 });
  });

  it("Deflector Field protects neighbours from attacks 3 or more hexes away", () => {
    const g = game(flat(9), { p1: ["squad"], p2: ["guard", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(4), "p2:1#1": at(3) });
    expect(attackDice(g.state, "p1:0#1", "p2:1#1", g.ctx).defenseBonus).toBe(1);
    const close = game(flat(9), { p1: ["squad"], p2: ["guard", "hero"] }, { "p1:0#1": at(1), "p2:0#1": at(4), "p2:1#1": at(3) });
    expect(attackDice(close.state, "p1:0#1", "p2:1#1", close.ctx).defenseBonus).toBe(0);
  });

  it("Hidden in the Leaves needs forest and a distant attacker; Moss Armor only distance", () => {
    const cols: [string, number][] = [...flat(5), ["forest", 1], ["grass", 1]];
    const g = game(cols, { p1: ["squad"], p2: ["leaves", "moss"] }, { "p1:0#1": at(0), "p2:0#1": at(5), "p2:1#1": at(6) });
    expect(attackDice(g.state, "p1:0#1", "p2:0#1", g.ctx).defenseBonus).toBe(2);
    expect(attackDice(g.state, "p1:0#1", "p2:1#1", g.ctx).defenseBonus).toBe(1);
  });

  it("Brace punishes a charge", () => {
    const g = game(flat(6), { p1: ["hero"], p2: ["pikes"] }, { "p1:0#1": at(0), "p2:0#1": at(2) });
    const moved = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx).state;
    expect(attackDice(moved, "p1:0#1", "p2:0#1", g.ctx).defenseBonus).toBe(2);
    const still = game(flat(6), { p1: ["hero"], p2: ["pikes"] }, { "p1:0#1": at(1), "p2:0#1": at(2) });
    expect(attackDice(still.state, "p1:0#1", "p2:0#1", still.ctx).defenseBonus).toBe(0);
  });

  it("Massed Volley adds dice from the third attack on the same target", () => {
    // The squad stands on rising steps so each figure can see over the ones in front.
    const cols: [string, number][] = [["rock", 4], ["rock", 3], ["rock", 2], ["grass", 1], ...flat(4)];
    const pos = { "p1:0#1": at(0, 4), "p1:0#2": at(1, 3), "p1:0#3": at(2, 2), "p1:0#4": at(3), "p2:0#1": at(6) };
    let { ctx, state } = game(cols, { p1: ["volley"], p2: ["moss"] }, pos);
    const volleyNote = (id: string) => attackDice(state, id, "p2:0#1", ctx).notes.filter((n) => n.startsWith("massed-volley"));
    for (const id of ["p1:0#1", "p1:0#2"]) {
      expect(volleyNote(id)).toEqual([]);
      state = apply(state, { type: "attack", player: "p1", figureId: id, targetId: "p2:0#1" }, ctx).state;
    }
    expect(volleyNote("p1:0#3")).toEqual(["massed-volley +2 attack"]);
  });
});

describe("reactions", () => {
  it("Answering Blade cuts an adjacent attacker whose attack is parried", () => {
    const g = game(flat(4), { p1: ["hero"], p2: ["parry"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    const r = withOutcome(g.state, { type: "attack", player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" }, g.ctx, (ev) =>
      ev.some((e) => e.type === "abilityUsed" && e.ability === "answering-blade"),
    );
    const roll = ofType(r.events, "attackRolled")[0]!;
    expect(roll.blocks).toBeGreaterThan(roll.hits);
    expect(r.state.units.find((u) => u.id === "p1:0")!.figures[0]!.wounds).toBe(1);
  });

  it("Thick Hide takes 1 wound off ranged attacks", () => {
    const g = game(flat(6), { p1: ["squad"], p2: ["oni"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    const r = withOutcome(g.state, { type: "attack", player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" }, g.ctx, (ev) =>
      ofType(ev, "attackRolled").some((e) => e.hits - e.blocks >= 1),
    );
    const roll = ofType(r.events, "attackRolled")[0]!;
    expect(roll.wounds).toBe(roll.hits - roll.blocks - 1);
    expect(roll.notes).toContain("thick-hide -1 wound");
  });

  it("Salvage Protocol brings back a fallen squadmate after a kill", () => {
    const setupGame = (mode: "basic" | "advanced") => {
      // p2 has two heroes so the game goes on after the kill.
      const g = game(flat(6), { p1: ["salvage"], p2: ["hero", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(5) }, "p1:0", mode);
      const fallen = g.state.units[0]!.figures[1]!;
      fallen.destroyed = true;
      fallen.position = null;
      g.state.units.find((u) => u.id === "p2:0")!.figures[0]!.wounds = 3; // one more wound kills
      return g;
    };
    const cmd = { type: "attack" as const, player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" };
    const kills = (ev: GameEvent[]) => ev.some((e) => e.type === "figureDestroyed");

    const basic = setupGame("basic");
    expect(ofType(withOutcome(basic.state, cmd, basic.ctx, kills).events, "figureRevived")).toHaveLength(0);

    const adv = setupGame("advanced");
    const kill = withOutcome(adv.state, cmd, adv.ctx, kills);
    const revived = ofType(kill.events, "figureRevived");
    expect(revived).toHaveLength(1);
    const back = kill.state.units[0]!.figures.find((f) => f.id === revived[0]!.figureId)!;
    expect(back).toMatchObject({ destroyed: false, wounds: 0 });
    expect(back.position!.hex.q).toBe(1);
  });
});

describe("end of turn", () => {
  it("Field Dressing heals the most wounded hero next to the medic", () => {
    const g = game(flat(6), { p1: ["medic", "hero"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:1#1": at(1), "p2:0#1": at(5) });
    g.state.units.find((u) => u.id === "p1:1")!.figures[0]!.wounds = 2;
    const r = apply(g.state, { type: "endTurn", player: "p1" }, g.ctx);
    expect(ofType(r.events, "figureHealed")).toEqual([{ type: "figureHealed", figureId: "p1:1#1", amount: 1, total: 1 }]);
  });
});

describe("movement abilities", () => {
  it("Flying goes straight over walls and water, and never falls", () => {
    const cols: [string, number][] = [["rock", 12], ["rock", 14], ["water", 1], ["grass", 1]];
    const g = game(cols, { p1: ["flyer"], p2: ["hero"] }, { "p1:0#1": at(0, 12), "p2:0#1": at(3) });
    const options = moveOptions(g.state, "p1:0#1", g.ctx);
    const landing = options.get(placementKey(step(2)))!;
    expect(landing).toMatchObject({ cost: 2, path: [step(2)] });
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(2)] }, g.ctx);
    expect(ofType(r.events, "attackRolled")).toHaveLength(0);
    expect(r.state.units[0]!.figures[0]!.position).toMatchObject({ hex: hex(2, 0), elevation: 1 });
    expect(applyCommand(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1, 14), step(2)] }, g.ctx).ok).toBe(false);
  });

  it("Flying lands on lava with a roll, and walks in the Basic game", () => {
    const cols: [string, number][] = [["grass", 1], ["rock", 9], ["lava", 1]];
    const g = game(cols, { p1: ["flyer"], p2: ["hero"] }, { "p1:0#1": at(0) });
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(2)] }, g.ctx);
    expect(ofType(r.events, "terrainRoll")).toHaveLength(1);
    const basic = game(cols, { p1: ["flyer"], p2: ["hero"] }, { "p1:0#1": at(0) }, "p1:0", "basic");
    expect(moveOptions(basic.state, "p1:0#1", basic.ctx).has(placementKey(step(2)))).toBe(false);
  });

  it("Smoke Step allows one short move after attacking, without passing strikes", () => {
    const g = game(flat(8), { p1: ["ninja"], p2: ["hero", "hero"] }, { "p1:0#1": at(2), "p2:0#1": at(1), "p2:1#1": at(7) });
    const attacked = apply(g.state, { type: "attack", player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" }, g.ctx).state;
    expect(attacked.active!.bonusMoves).toEqual({ "p1:0#1": 2 });
    const options = [...moveOptions(attacked, "p1:0#1", g.ctx).values()];
    expect(Math.max(...options.map((o) => o.cost))).toBe(2);
    const r = apply(attacked, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3), step(4)] }, g.ctx);
    expect(ofType(r.events, "attackRolled")).toHaveLength(0);
    expect(r.state.active!.bonusMoves).toEqual({});
    expect(applyCommand(r.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(5)] }, g.ctx).ok).toBe(false);
    // Without the ability, moving after attacking is not allowed.
    const plain = game(flat(8), { p1: ["squad"], p2: ["hero", "hero"] }, { "p1:0#1": at(2), "p2:0#1": at(1), "p2:1#1": at(7) });
    const hit = apply(plain.state, { type: "attack", player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" }, plain.ctx).state;
    expect(applyCommand(hit, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(3)] }, plain.ctx).error).toMatch(/after attacking/);
  });

  it("Trample goes through small and medium enemies but cannot stop on them", () => {
    const g = game(flat(9), { p1: ["trampler"], p2: ["hero", "bigfoe"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:1#1": at(8) });
    const options = moveOptions(g.state, "p1:0#1", g.ctx);
    // Front hex at 4 (covering 4 and 5) is beyond the medium hero at 3.
    const past = options.get(placementKey({ hex: hex(4, 0), elevation: 1, rotation: 0 }))!;
    expect(past).toBeDefined();
    expect(options.has(placementKey({ hex: hex(2, 0), elevation: 1, rotation: 0 }))).toBe(false);
    const r = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: past.path }, g.ctx);
    expect(ofType(r.events, "abilityUsed").map((e) => e.targetId)).toEqual(["p2:0#1"]);
    // A large enemy cannot be trampled.
    const big = game(flat(9), { p1: ["trampler"], p2: ["bigfoe", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:1#1": at(8) });
    expect(moveOptions(big.state, "p1:0#1", big.ctx).has(placementKey({ hex: hex(4, 0), elevation: 1, rotation: 0 }))).toBe(false);
  });
});

describe("special actions", () => {
  it("lists a card's special actions only in the Advanced game", () => {
    const card = ABILITY_CARDS.find((c) => c.id === "spitter")!;
    const g = game(flat(3), { p1: ["spitter"], p2: ["hero"] }, {});
    expect(specialActions(g.state, card)).toEqual([{ id: "ember-spit", name: "ember-spit", kind: "area" }]);
    const basic = game(flat(3), { p1: ["spitter"], p2: ["hero"] }, {}, "p1:0", "basic");
    expect(specialActions(basic.state, card)).toEqual([]);
  });

  it("Ember Spit hits the target and every other figure next to it", () => {
    const g = game(flat(8), { p1: ["spitter"], p2: ["hero", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:1#1": at(4) });
    // Range 3: the hero at 4 hexes is only reachable by the splash.
    expect(attackTargets(g.state, "p1:0#1", g.ctx, "ember-spit")).toEqual(["p2:0#1"]);
    const r = apply(g.state, { type: "attack", player: "p1", figureId: "p1:0#1", targetId: "p2:0#1", ability: "ember-spit" }, g.ctx);
    const rolls = ofType(r.events, "attackRolled");
    expect(rolls.map((e) => [e.targetId, e.attack.length])).toEqual([
      ["p2:0#1", 2],
      ["p2:1#1", 1],
    ]);
    expect(rolls.every((e) => e.ability === "ember-spit")).toBe(true);
  });

  it("Mortar Barrage ignores sight but not its minimum range", () => {
    const cols: [string, number][] = [["grass", 1], ["rock", 15], ["grass", 1], ["grass", 1], ["grass", 1]];
    const g = game(cols, { p1: ["mortar"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(3) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx)).toMatch(/range|sight/);
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx, "mortar-barrage")).toBeNull();
    const near = game(cols, { p1: ["mortar"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(2) });
    expect(attackProblem(near.state, "p1:0#1", "p2:0#1", near.ctx, "mortar-barrage")).toMatch(/Too close/);
  });

  it("Lantern Gaze takes control of a common figure on a high roll", () => {
    const g = game(flat(6), { p1: ["monk"], p2: ["squad", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:1#1": at(5) });
    const cmd = { type: "attack" as const, player: "p1", figureId: "p1:0#1", targetId: "p2:0#1", ability: "lantern-gaze" };
    const won = withOutcome(g.state, cmd, g.ctx, (ev) => ev.some((e) => e.type === "figureControlled"));
    const roll = ofType(won.events, "abilityRoll")[0]!;
    expect(roll.roll).toBeGreaterThanOrEqual(16);
    const newUnit = won.state.units.find((u) => u.figures.some((f) => f.id === "p2:0#1"))!;
    expect(newUnit.owner).toBe("p1");
    expect(won.state.units.find((u) => u.id === "p2:0")!.figures.map((f) => f.id)).toEqual(["p2:0#2", "p2:0#3"]);
    const lost = withOutcome(g.state, cmd, g.ctx, (ev) => ev.some((e) => e.type === "abilityRoll" && !e.success));
    expect(ofType(lost.events, "figureControlled")).toHaveLength(0);
  });

  it("Lantern Gaze cannot take unique or large figures", () => {
    const g = game(flat(6), { p1: ["monk"], p2: ["unique", "bigfoe"] }, { "p1:0#1": at(0), "p2:0#1": at(2), "p2:1#1": at(3) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx, "lantern-gaze")).toMatch(/Unique/);
    expect(attackProblem(g.state, "p1:0#1", "p2:1#1", g.ctx, "lantern-gaze")).toMatch(/Small or Medium/);
  });

  it("refuses powers a figure does not have", () => {
    const g = game(flat(4), { p1: ["hero"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    expect(attackProblem(g.state, "p1:0#1", "p2:0#1", g.ctx, "ember-spit")).toMatch(/no such power/);
  });
});

describe("abilities added with the larger roster", () => {
  const bonus = (g: { state: GameState; ctx: RulesContext }, from: string, to: string) => attackDice(g.state, from, to, g.ctx);

  it("Charge adds a die to a melee attack right after moving", () => {
    const g = game(flat(6), { p1: ["knight"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(2) });
    const moved = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx).state;
    expect(attackDice(moved, "p1:0#1", "p2:0#1", g.ctx).notes).toContain("charge +1 attack");
    const still = game(flat(6), { p1: ["knight"], p2: ["hero"] }, { "p1:0#1": at(1), "p2:0#1": at(2) });
    expect(bonus(still, "p1:0#1", "p2:0#1").attackBonus).toBe(0);
  });

  it("Steady Aim helps only a figure that has not moved", () => {
    const g = game(flat(8), { p1: ["rifles"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(5) });
    expect(bonus(g, "p1:0#1", "p2:0#1").notes).toContain("steady-aim +1 attack");
    const moved = apply(g.state, { type: "move", player: "p1", figureId: "p1:0#1", path: [step(1)] }, g.ctx).state;
    expect(attackDice(moved, "p1:0#1", "p2:0#1", g.ctx).attackBonus).toBe(0);
  });

  it("Longshot needs a distant target", () => {
    const far = game(flat(8), { p1: ["bows"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(5) });
    expect(bonus(far, "p1:0#1", "p2:0#1").notes).toEqual(["longshot +1 attack"]);
    const near = game(flat(8), { p1: ["bows"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(4) });
    expect(bonus(near, "p1:0#1", "p2:0#1").attackBonus).toBe(0);
  });

  it("Pack Hunt needs another figure of the squad next to the target", () => {
    const pos = { "p1:0#1": at(2), "p1:0#2": at(4), "p2:0#1": at(3) };
    const g = game(flat(6), { p1: ["cats"], p2: ["hero"] }, pos);
    expect(bonus(g, "p1:0#1", "p2:0#1").notes).toEqual(["pack-hunt +1 attack"]);
    const alone = game(flat(6), { p1: ["cats"], p2: ["hero"] }, { ...pos, "p1:0#2": at(0) });
    expect(bonus(alone, "p1:0#1", "p2:0#1").attackBonus).toBe(0);
  });

  it("Duelist adds a die against an adjacent hero, not a squad", () => {
    const vsHero = game(flat(4), { p1: ["blades"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    expect(bonus(vsHero, "p1:0#1", "p2:0#1").notes).toEqual(["duelist +1 attack"]);
    const vsSquad = game(flat(4), { p1: ["blades"], p2: ["squad"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    expect(bonus(vsSquad, "p1:0#1", "p2:0#1").attackBonus).toBe(0);
  });

  it("Bloodrage grows once the squad has lost a figure", () => {
    const g = game(flat(6), { p1: ["orcs"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    expect(bonus(g, "p1:0#1", "p2:0#1").attackBonus).toBe(0);
    g.state.units[0]!.figures[2]!.destroyed = true;
    expect(bonus(g, "p1:0#1", "p2:0#1").notes).toEqual(["bloodrage +1 attack"]);
  });

  it("Fury adds a die while the figure is wounded", () => {
    const g = game(flat(4), { p1: ["brute"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    expect(bonus(g, "p1:0#1", "p2:0#1").attackBonus).toBe(0);
    g.state.units[0]!.figures[0]!.wounds = 1;
    expect(bonus(g, "p1:0#1", "p2:0#1").notes).toEqual(["fury +1 attack"]);
  });

  it("Smite the Unholy adds 2 dice against Undead and Oni only", () => {
    const undead = game(flat(4), { p1: ["angel"], p2: ["dead"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    expect(bonus(undead, "p1:0#1", "p2:0#1").notes).toEqual(["smite-the-unholy +2 attack"]);
    const living = game(flat(4), { p1: ["angel"], p2: ["hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1) });
    expect(bonus(living, "p1:0#1", "p2:0#1").attackBonus).toBe(0);
  });

  it("Command the Dead strengthens other friendly Undead nearby", () => {
    const pos = { "p1:0#1": at(0), "p1:1#1": at(3), "p2:0#1": at(4) };
    const g = game(flat(9), { p1: ["necro", "dead"], p2: ["hero"] }, pos);
    expect(bonus(g, "p1:1#1", "p2:0#1").notes).toEqual(["command-the-dead +1 attack"]);
    const far = game(flat(9), { p1: ["necro", "dead"], p2: ["hero"] }, { ...pos, "p1:1#1": at(5), "p2:0#1": at(6) });
    expect(bonus(far, "p1:1#1", "p2:0#1").attackBonus).toBe(0);
    const living = game(flat(9), { p1: ["necro", "squad"], p2: ["hero"] }, pos);
    expect(bonus(living, "p1:1#1", "p2:0#1").attackBonus).toBe(0);
  });

  it("Shield Wall adds a defense die while a squadmate stands next to the defender", () => {
    const g = game(flat(8), { p1: ["squad"], p2: ["wall"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:0#2": at(4) });
    expect(bonus(g, "p1:0#1", "p2:0#1")).toMatchObject({ defenseBonus: 1, notes: ["shield-wall +1 defense"] });
    const alone = game(flat(8), { p1: ["squad"], p2: ["wall"] }, { "p1:0#1": at(0), "p2:0#1": at(3), "p2:0#2": at(6) });
    expect(bonus(alone, "p1:0#1", "p2:0#1").defenseBonus).toBe(0);
  });

  it("Soul Reap heals the reaper when it destroys a figure", () => {
    const g = game(flat(6), { p1: ["reaper"], p2: ["hero", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(5) });
    g.state.units[0]!.figures[0]!.wounds = 2;
    g.state.units.find((u) => u.id === "p2:0")!.figures[0]!.wounds = 3;
    const cmd = { type: "attack" as const, player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" };
    const r = withOutcome(g.state, cmd, g.ctx, (ev) => ev.some((e) => e.type === "figureDestroyed"));
    expect(ofType(r.events, "figureHealed")).toEqual([{ type: "figureHealed", figureId: "p1:0#1", amount: 1, total: 1 }]);
  });

  it("Reboot may stand a destroyed machine back up where it fell", () => {
    const g = game(flat(6), { p1: ["hero"], p2: ["bots", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(5) });
    const cmd = { type: "attack" as const, player: "p1", figureId: "p1:0#1", targetId: "p2:0#1" };
    const up = withOutcome(g.state, cmd, g.ctx, (ev) => ev.some((e) => e.type === "abilityRoll" && e.success));
    expect(ofType(up.events, "abilityRoll")[0]).toMatchObject({ ability: "reboot", figureId: "p2:0#1", needed: 17 });
    expect(up.state.units.find((u) => u.id === "p2:0")!.figures[0]).toMatchObject({ destroyed: false, wounds: 0 });
    expect(up.state.units.find((u) => u.id === "p2:0")!.figures[0]!.position!.hex.q).toBe(1);
    const down = withOutcome(g.state, cmd, g.ctx, (ev) => ev.some((e) => e.type === "abilityRoll" && !e.success));
    expect(down.state.units.find((u) => u.id === "p2:0")!.figures[0]!.destroyed).toBe(true);
    // Basic game: no abilities, no roll.
    const basic = game(flat(6), { p1: ["hero"], p2: ["bots", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(1), "p2:1#1": at(5) }, "p1:0", "basic");
    const plain = withOutcome(basic.state, cmd, basic.ctx, (ev) => ev.some((e) => e.type === "figureDestroyed"));
    expect(ofType(plain.events, "abilityRoll")).toHaveLength(0);
  });

  it("Reassemble may bring back a fallen figure at the end of the squad's turn", () => {
    const g = game(flat(6), { p1: ["bones"], p2: ["hero"] }, { "p1:0#1": at(0), "p1:0#2": at(1), "p2:0#1": at(5) });
    const fallen = g.state.units[0]!.figures[2]!;
    fallen.destroyed = true;
    const cmd = { type: "endTurn" as const, player: "p1" };
    const back = withOutcome(g.state, cmd, g.ctx, (ev) => ev.some((e) => e.type === "figureRevived"));
    const roll = ofType(back.events, "abilityRoll")[0]!;
    expect(roll).toMatchObject({ ability: "reassemble", targetId: "p1:0#3", success: true });
    const revived = back.state.units[0]!.figures[2]!;
    expect(revived.destroyed).toBe(false);
    expect([0, 1].some((q) => Math.abs(revived.position!.hex.q - q) === 1)).toBe(true);
    const stays = withOutcome(g.state, cmd, g.ctx, (ev) => ev.some((e) => e.type === "abilityRoll" && !e.success));
    expect(stays.state.units[0]!.figures[2]!.destroyed).toBe(true);
  });

  it("Arc Lightning is an area attack: the target and everything next to it", () => {
    const card = ABILITY_CARDS.find((c) => c.id === "mage")!;
    const g = game(flat(8), { p1: ["mage"], p2: ["hero", "hero"] }, { "p1:0#1": at(0), "p2:0#1": at(4), "p2:1#1": at(5) });
    expect(specialActions(g.state, card)).toEqual([{ id: "arc-lightning", name: "arc-lightning", kind: "area" }]);
    const r = apply(g.state, { type: "attack", player: "p1", figureId: "p1:0#1", targetId: "p2:0#1", ability: "arc-lightning" }, g.ctx);
    expect(ofType(r.events, "attackRolled").map((e) => [e.targetId, e.attack.length])).toEqual([
      ["p2:0#1", 3],
      ["p2:1#1", 1],
    ]);
  });
});
