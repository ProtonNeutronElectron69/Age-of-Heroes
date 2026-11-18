import { describe, expect, it } from "vitest";
import {
  Rng,
  applyCommand,
  attackDice,
  createGame,
  curseTurnEnded,
  hex,
  hexKey,
  moveOptions,
  replayGame,
  rollOff,
  viewFor,
  type GameState,
  type GlyphKind,
  type GlyphState,
  summonPlacements,
  summonOptions,
  hexDistance,
  glyphBonus,
  maybeStartTurns,
  type GameEvent,
} from "../src";
import { apply, ctx, deployAll, setup, turnState } from "./fixtures";

const base = deployAll(createGame(setup(2), ctx).state).state;

/** p1's hero (p1:0) at (3,0) is acting; p2's hero at (6,0) and squad at (7,0) (8,0) (9,0). */
function game(glyphs: Partial<GlyphState> = {}, unit = "p1:0", extra: Record<string, { q: number; r: number; elevation: number }> = {}): GameState {
  const s = turnState(base, unit, {
    "p1:0#1": { q: 3, r: 0, elevation: 1 },
    "p1:1#1": { q: 2, r: 1, elevation: 1 },
    "p1:1#2": { q: 3, r: 1, elevation: 1 },
    "p1:1#3": { q: 4, r: 1, elevation: 1 },
    "p2:0#1": { q: 6, r: 0, elevation: 1 },
    "p2:1#1": { q: 7, r: 0, elevation: 1 },
    "p2:1#2": { q: 8, r: 0, elevation: 1 },
    "p2:1#3": { q: 9, r: 0, elevation: 1 },
    ...extra,
  });
  s.glyphs = { onBoard: [], held: { p1: [], p2: [] }, boosts: [], curses: [], ...glyphs };
  return s;
}
const holding = (kind: GlyphKind, player = "p1") => ({ held: { p1: [], p2: [], [player]: [{ id: "g1", kind }] } });
const use = (s: GameState, unitId: string, player = "p1", extra = {}) =>
  applyCommand(s, { type: "useGlyph", player, glyphId: "g1", unitId, ...extra }, ctx);
const move = (s: GameState, figureId: string, to: [number, number][], player = "p1") =>
  apply(s, { type: "move", player, figureId, path: to.map(([q, r]) => ({ hex: hex(q, r), elevation: 1 })) });

describe("scattering glyphs", () => {
  it("lays the chosen number face down, one of each kind, outside the start zones and away from figures", () => {
    const { state, events } = deployAll(createGame(setup(2, { glyphs: 5 }), ctx).state);
    const g = state.glyphs!;
    expect(g.onBoard).toHaveLength(5);
    expect(new Set(g.onBoard.map((o) => o.kind)).size).toBe(5);
    const zones = new Set([hex(0, 0), hex(1, 0), hex(0, 1), hex(1, 1), hex(10, 0), hex(11, 0), hex(10, 1), hex(11, 1)].map(hexKey));
    for (const o of g.onBoard) expect(zones.has(hexKey(o.hex))).toBe(false);
    expect(events.find((e) => e.type === "glyphsPlaced")).toMatchObject({ glyphs: expect.any(Array) });
    // Nobody can see what lies on the board.
    expect(viewFor(state, "p1").glyphs!.onBoard.every((o) => o.kind === null)).toBe(true);
  });

  it("is part of the game's record, and none are laid by default", () => {
    const s = setup(2, { glyphs: 11 });
    const once = deployAll(createGame(s, ctx).state).state;
    expect(once.glyphs!.onBoard).toHaveLength(11);
    expect(replayGame(s, [], ctx).state.glyphs).toBeUndefined();
    expect(base.glyphs).toBeUndefined();
  });
});

describe("picking up glyphs", () => {
  it("happens when a figure ends its move on one; the holder alone sees what it is", () => {
    const s = game({ onBoard: [{ id: "g1", kind: "attack", hex: hex(4, 0), elevation: 1 }] });
    const passed = move(s, "p1:0#1", [[4, 0], [5, 0]]);
    expect(passed.state.glyphs!.onBoard).toHaveLength(1);
    const { state, events } = move(s, "p1:0#1", [[4, 0]]);
    expect(state.glyphs!.onBoard).toEqual([]);
    expect(state.glyphs!.held.p1).toEqual([{ id: "g1", kind: "attack" }]);
    expect(events.find((e) => e.type === "glyphTaken")).toEqual({ type: "glyphTaken", player: "p1", figureId: "p1:0#1", glyphId: "g1" });
    expect(viewFor(state, "p1").glyphs!.held.p1![0]!.kind).toBe("attack");
    expect(viewFor(state, "p2").glyphs!.held.p1![0]!.kind).toBeNull();
  });

  it("springs a pit trap on the figure: one wound", () => {
    const { state, events } = move(game({ onBoard: [{ id: "g1", kind: "pit", hex: hex(4, 0), elevation: 1 }] }), "p1:0#1", [[4, 0]]);
    expect(state.units[0]!.figures[0]!.wounds).toBe(1);
    expect(state.glyphs!.held.p1).toEqual([]);
    expect(events.some((e) => e.type === "glyphTaken" && e.trap === "pit")).toBe(true);
  });

  it("curses the figure: destroyed at the end of its player's second turn after this one", () => {
    const { state } = move(game({ onBoard: [{ id: "g1", kind: "curse", hex: hex(4, 0), elevation: 1 }] }), "p1:0#1", [[4, 0]]);
    expect(state.glyphs!.curses).toEqual([{ glyphId: "g1", figureId: "p1:0#1", player: "p1", turnsLeft: 3 }]);
    const events: never[] = [];
    curseTurnEnded(state, "p2", events);
    curseTurnEnded(state, "p1", events); // the turn it was picked up in
    curseTurnEnded(state, "p1", events);
    expect(state.units[0]!.figures[0]!.destroyed).toBe(false);
    curseTurnEnded(state, "p1", events);
    expect(state.units[0]!.figures[0]!.destroyed).toBe(true);
    expect(state.glyphs!.curses).toEqual([]);
  });
});

describe("using glyphs", () => {
  it("only on your own turn, and only one you hold", () => {
    expect(use(game(holding("attack", "p2")), "p2:0", "p2").ok).toBe(false);
    expect(use(game(), "p1:0").ok).toBe(false);
  });

  it("puts a stat glyph on one of your units for good, one glyph per unit", () => {
    const before = attackDice(game(), "p1:0#1", "p2:0#1", ctx);
    const r = use(game(holding("attack")), "p1:0");
    expect(r.ok).toBe(true);
    const s = r.ok ? r.state : null!;
    const after = attackDice(s, "p1:0#1", "p2:0#1", ctx);
    expect(after.attack).toBe(before.attack + 1);
    expect(after.notes).toContain("Glyph +1 attack");
    s.glyphs!.held.p1 = [{ id: "g1", kind: "defense" }];
    expect(use(s, "p1:0").ok).toBe(false);
    expect(use(s, "p1:1").ok).toBe(true);
    // Not on an enemy unit.
    expect(use(game(holding("defense")), "p2:0").ok).toBe(false);
  });

  it("adds move and range while the unit lives", () => {
    const most = (s: GameState) => Math.max(...[...moveOptions(s, "p1:0#1", ctx).values()].map((o) => o.cost));
    const r = use(game(holding("move")), "p1:0");
    expect(r.ok && most(r.state)).toBe(most(game()) + 2);
  });

  it("adds to its player's next initiative roll only", () => {
    const r = use(game(holding("initiative")), "p1:0");
    const { rolls } = rollOff(r.ok ? r.state : null!, new Rng(1), ctx);
    expect(rolls.find((x) => x.player === "p1")!.bonus).toBe(8);
    expect(rolls.find((x) => x.player === "p2")!.bonus).toBeUndefined();
    // The next round's roll uses it up, and the unit is free for another glyph.
    const s = r.ok ? r.state : null!;
    s.phase = "placeTokens";
    s.active = null;
    const events: GameEvent[] = [];
    maybeStartTurns(s, events, ctx);
    expect(events.find((e) => e.type === "initiativeRolled")).toMatchObject({ rolls: expect.arrayContaining([expect.objectContaining({ player: "p1", bonus: 8 })]) });
    expect(events.some((e) => e.type === "glyphSpent")).toBe(true);
    expect(s.glyphs!.boosts).toEqual([]);
    expect(rollOff(s, new Rng(1), ctx).rolls.every((x) => x.bonus === undefined)).toBe(true);
  });

  it("puts the Hawk only on a unit with a Range above 1, for +3 range", () => {
    expect(use(game(holding("range")), "p1:0").ok).toBe(false);
    const r = use(game(holding("range")), "p1:1");
    expect(r.ok && glyphBonus(r.state, "p1:1", "range", ctx)).toBe(3);
  });

  it("negates a stat glyph on an enemy unit", () => {
    const s = game({ ...holding("negate", "p2"), boosts: [{ glyphId: "g9", kind: "attack", unitId: "p1:0" }] }, "p2:0");
    expect(use(s, "p2:1", "p2").ok).toBe(false);
    const r = use(s, "p1:0", "p2");
    expect(r.ok && r.state.glyphs!.boosts).toEqual([]);
    expect(r.ok && r.events.some((e) => e.type === "glyphCancelled")).toBe(true);
  });

  it("heals every wound on one of your units", () => {
    const s = game(holding("heal"));
    expect(use(s, "p1:0").ok).toBe(false);
    s.units[0]!.figures[0]!.wounds = 3;
    const r = use(s, "p1:0");
    expect(r.ok && r.state.units[0]!.figures[0]!.wounds).toBe(0);
  });

  it("wounds every figure of an enemy squad, or half an enemy hero's Life left", () => {
    const squad = use(game(holding("wound")), "p2:1");
    expect(squad.ok && squad.state.units[3]!.figures.every((f) => f.destroyed)).toBe(true);
    const s = game(holding("wound"));
    s.units[2]!.figures[0]!.wounds = 1;
    const hero = use(s, "p2:0");
    // 3 Life left: half, rounded down, is 1 more wound.
    expect(hero.ok && hero.state.units[2]!.figures[0]!.wounds).toBe(2);
  });

  it("summons a destroyed unit back beside your other figures", () => {
    const s = game(holding("summon"));
    for (const f of s.units[1]!.figures) {
      f.destroyed = true;
      f.position = null;
    }
    const near = [hex(2, 0), hex(4, 0), hex(5, 0)].map((h, i) => ({ figureId: `p1:1#${i + 1}`, hex: h, elevation: 1 }));
    const far = near.map((p, i) => (i === 0 ? { ...p, hex: hex(9, 3) } : p));
    expect(use(s, "p1:1", "p1", { placements: far }).ok).toBe(false);
    expect(use(s, "p1:0", "p1", { placements: near }).ok).toBe(false);
    const r = use(s, "p1:1", "p1", { placements: near });
    expect(r.ok && r.state.units[1]!.figures.every((f) => !f.destroyed && f.position)).toBe(true);
  });

  it("finds spots for a summoned unit next to the player's figures", () => {
    const s = game(holding("summon"));
    for (const f of s.units[1]!.figures) {
      f.destroyed = true;
      f.position = null;
    }
    // Every spot offered is free and within 3 hexes of another of p1's figures (the hero at (3,0)).
    const options = summonOptions(s, "p1", "p1:1", ctx);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => hexDistance(o.placement.hex, hex(3, 0)) <= 3)).toBe(true);
    // A spot already chosen for one figure is not offered again.
    const first = options[0]!;
    expect(summonOptions(s, "p1", "p1:1", ctx, first.spots).some((o) => hexKey(o.placement.hex) === hexKey(first.placement.hex))).toBe(false);
    const spots = summonPlacements(s, "p1", "p1:1", ctx)!;
    expect(spots).toHaveLength(s.units[1]!.figures.length);
    const r = use(s, "p1:1", "p1", { placements: spots });
    expect(r.ok && r.state.units[1]!.figures.every((f) => !f.destroyed && f.position)).toBe(true);
  });
});
