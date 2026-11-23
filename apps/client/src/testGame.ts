import { CARDS, MAPS, SEAT_COLORS, SEAT_COLOR_NAMES, contextFor } from "@aoh/content";
import {
  GLYPH_KINDS,
  applyCommand,
  cardOf,
  createGame,
  currentDeployment,
  deploymentPlacements,
  isUnique,
  seedFromString,
  type Command,
  type GameSetup,
  type GameState,
  type Step,
  type UnitCard,
} from "@aoh/rules";
import { loadGame } from "./session";

/** The test game: Twin Fords, two players with 500 points each, armies drafted and deployed, every glyph on the board. */
export const TEST_MAP_ID = "twin-fords";
export const TEST_BUDGET = 500;

/**
 * Two armies of up to `budget` points each, picked at random: cards in a shuffled order, each taken
 * once at most across both armies (so unique units are never doubled), while it still fits.
 */
export function testArmies(budget = TEST_BUDGET, random: () => number = Math.random): [string[], string[]] {
  const deck = [...CARDS].sort(() => random() - 0.5);
  const armies: [string[], string[]] = [[], []];
  const left = [budget, budget];
  const taken = new Set<string>();
  // Players take turns picking, so neither army gets all the cheap cards.
  for (let round = 0; round < CARDS.length; round++) {
    let picked = false;
    for (let p = 0; p < 2; p++) {
      const card: UnitCard | undefined = deck.find((c) => !taken.has(c.id) && c.points <= left[p]!);
      if (!card) continue;
      taken.add(card.id);
      armies[p]!.push(card.id);
      left[p]! -= card.points;
      picked = true;
    }
    if (!picked) break;
  }
  // `isUnique` is honoured by taking each card once; checked here so a roster change cannot slip by.
  for (const army of armies) {
    const uniques = army.filter((id) => isUnique(CARDS.find((c) => c.id === id)!));
    if (new Set(uniques).size !== uniques.length) throw new Error("A unique unit was taken twice");
  }
  return armies;
}

/** The deploy commands that place every unit, one after another, on the first free spots of each zone. */
export function deployAll(state: GameState, ctx: ReturnType<typeof contextFor>["ctx"]): Command[] {
  const commands: Command[] = [];
  let s = state;
  while (s.phase === "deploy") {
    const entry = currentDeployment(s);
    if (!entry) break;
    const unit = s.units.find((u) => u.id === entry.unitId)!;
    const card = cardOf(unit, ctx);
    const taken: Step[] = [];
    const placements = unit.figures.map((f) => {
      const choice = deploymentPlacements(s, entry.player, card, ctx, taken)[0];
      if (!choice) throw new Error(`No room to deploy ${card.name}`);
      taken.push(...choice.spots);
      return { figureId: f.id, ...choice.placement };
    });
    const command: Command = { type: "deployUnit", player: entry.player, unitId: unit.id, placements };
    const result = applyCommand(s, command, ctx);
    if (!result.ok) throw new Error(result.error);
    s = result.state;
    commands.push(command);
  }
  return commands;
}

/**
 * Start the test game on this device: Twin Fords, two players with 500-point armies already drafted
 * and deployed, and all 11 glyphs, with the rules of a new game. Play begins at token placement.
 * Returns an error to show, or null.
 */
export function startTestGame(): string | null {
  const map = MAPS.find((m) => m.id === TEST_MAP_ID);
  if (!map) return "The test map is missing";
  const { ctx } = contextFor(map);
  const [first, second] = testArmies();
  const setup: GameSetup = {
    seed: seedFromString(`test:${Date.now()}:${Math.random()}`),
    mapId: map.id,
    roundLimit: null,
    players: [0, 1].map((i) => ({ id: `p${i + 1}`, name: `${SEAT_COLOR_NAMES[i]} Player`, color: SEAT_COLORS[i]! })),
    armies: { p1: first, p2: second },
    tokenRule: "onePerUnit",
    tokenAllowance: "half",
    facing: true,
    swampRoll: "d20",
    zoneOfControl: true,
    glyphs: GLYPH_KINDS.length,
  };
  try {
    const commands = deployAll(createGame(setup, ctx).state, ctx);
    return loadGame({ setup, map, commands });
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
