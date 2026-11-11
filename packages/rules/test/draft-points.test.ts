import { describe, expect, it } from "vitest";
import {
  applyCommand,
  createGame,
  currentDrafter,
  draftableCards,
  pickProblem,
  pointsSpent,
  type GameState,
  type UnitCard,
} from "../src";
import { apply, fieldMap, makeCtx, setup, testCard } from "./fixtures";

const card = (id: string, faction: string, points: number, extra: Partial<UnitCard> = {}) =>
  testCard(id, {
    faction,
    advanced: { life: 4, move: 5, range: 1, attack: 3, defense: 3, points, abilities: [] },
    ...extra,
  });

const CARDS = [
  card("red-a", "Red", 100),
  card("red-b", "Red", 60),
  card("red-unique", "Red", 80, { unitType: "uniqueHero" }),
  card("blue-a", "Blue", 90),
  card("blue-b", "Blue", 40),
];
const ctx = makeCtx(fieldMap(), CARDS);

function pointsGame(budget = 200, factionPure = false): GameState {
  return createGame(setup(2, { mode: "advanced", armies: undefined, budget, factionPure }), ctx).state;
}

const pick = (s: GameState, cardId: string) => apply(s, { type: "draftPick", player: currentDrafter(s)!, cardId }, ctx).state;
const pass = (s: GameState) => apply(s, { type: "draftPass", player: currentDrafter(s)! }, ctx).state;

describe("points draft", () => {
  it("starts in Advanced games given a budget", () => {
    const s = pointsGame();
    expect(s.phase).toBe("draft");
    expect(s.config).toMatchObject({ budget: 200, armySize: null, factionPure: false });
  });

  it("refuses cards a player cannot afford", () => {
    let s = pointsGame(200);
    const first = currentDrafter(s)!;
    s = pick(s, "red-a"); // first: 100 spent
    s = pick(s, "blue-b"); // second
    s = pick(s, "blue-b"); // second again (snake)
    expect(currentDrafter(s)).toBe(first);
    expect(pointsSpent(s, first, ctx)).toBe(100);
    expect(pickProblem(s, ctx, "red-a", first)).toBeNull();
    s = pick(s, "red-b"); // first: 160 spent, 40 left
    // Only the 40-point card is still affordable for the first player.
    const r = applyCommand(s, { type: "draftPick", player: first, cardId: "blue-a" }, ctx);
    if (currentDrafter(s) === first) expect(r.error).toMatch(/costs 90 points; you have 40 left/);
    expect(draftableCards(s, ctx, first)).toEqual(["blue-b"]);
  });

  it("lets players pass and ends when nobody can or will pick", () => {
    let s = pointsGame(200);
    s = pass(s);
    expect(s.draft!.passed).toHaveLength(1);
    // The other player keeps picking alone until they cannot afford anything.
    while (s.phase === "draft") s = pick(s, draftableCards(s, ctx, currentDrafter(s)!)[0]!);
    expect(s.phase).toBe("deploy");
    const other = s.players.find((p) => !s.draft!.passed.includes(p.id))!.id;
    expect(pointsSpent(s, other, ctx)).toBeLessThanOrEqual(200);
    expect(s.units.filter((u) => u.owner === s.draft!.passed[0])).toHaveLength(0);
  });

  it("drafts with no points limit until each start zone is full", () => {
    let s = createGame(setup(2, { mode: "advanced", armies: undefined, budget: null }), ctx).state;
    expect(s.config).toMatchObject({ budget: null, armySize: null });
    expect(pickProblem(s, ctx, "red-a", currentDrafter(s)!)).toBeNull();
    while (s.phase === "draft") s = pick(s, draftableCards(s, ctx, currentDrafter(s)!)[0]!);
    // The test field's start zones hold 4 single-hex figures each.
    for (const p of s.players) expect(s.units.filter((u) => u.owner === p.id)).toHaveLength(4);
    expect(pointsGame(200).config.budget).toBe(200);
    const open = createGame(setup(2, { mode: "advanced", armies: undefined, budget: null }), ctx).state;
    expect(applyCommand(open, { type: "draftPass", player: currentDrafter(open)! }, ctx).ok).toBe(true);
  });

  it("accepts budgets up to 9999", () => {
    expect(pointsGame(9999).config.budget).toBe(9999);
    expect(() => pointsGame(10000)).toThrow(/1 to 9999/);
  });

  it("has no passing in a card-count draft", () => {
    const s = createGame(setup(2, { mode: "basic", armies: undefined, armySize: 2 }), ctx).state;
    expect(applyCommand(s, { type: "draftPass", player: currentDrafter(s)! }, ctx).error).toMatch(/no passing/);
  });

  it("locks each army to the faction of its first pick in faction-pure mode", () => {
    let s = pointsGame(300, true);
    const first = currentDrafter(s)!;
    s = pick(s, "blue-a");
    expect(draftableCards(s, ctx, first).every((id) => CARDS.find((c) => c.id === id)!.faction === "Blue")).toBe(true);
    expect(pickProblem(s, ctx, "red-b", first)).toMatch(/Blue only/);
    // The other player is not locked until they pick.
    const second = currentDrafter(s)!;
    expect(draftableCards(s, ctx, second)).toContain("red-b");
  });

  it("still keeps unique cards to one army", () => {
    let s = pointsGame(300);
    s = pick(s, "red-unique");
    expect(draftableCards(s, ctx, currentDrafter(s)!)).not.toContain("red-unique");
  });
});
