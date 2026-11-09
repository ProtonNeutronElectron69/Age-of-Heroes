import type { GameSetup, RulesContext, UnitCard } from "../src";

/** Throwaway test units. Not game content. */
export function testCard(id: string, overrides: Partial<UnitCard> = {}): UnitCard {
  return {
    id,
    name: `Test ${id}`,
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
    advanced: { life: 1, move: 5, range: 6, attack: 2, defense: 2, points: 60, abilities: [] },
  }),
];

export const ctx: RulesContext = { cards: new Map(CARDS.map((c) => [c.id, c])) };

export function setup(players = 2, overrides: Partial<GameSetup> = {}): GameSetup {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  return {
    mode: "advanced",
    seed: 12345,
    roundLimit: null,
    players: ids.map((id, i) => ({ id, name: `Player ${i + 1}`, color: `#00000${i}` })),
    armies: Object.fromEntries(ids.map((id) => [id, ["hero", "squad"]])),
    ...overrides,
  };
}

/** Put every token on the player's first unit. */
export function allOn(unitId: string) {
  return { "1": unitId, "2": unitId, "3": unitId, X: unitId };
}
