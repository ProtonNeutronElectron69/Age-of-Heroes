import {
  POWER_COMMAND_KINDS,
  Rng,
  applyCommand,
  attackTargets,
  createGame,
  figureSpots,
  hexDistance,
  currentDeployment,
  currentDrafter,
  deploymentPlacements,
  drafters,
  draftableCards,
  livingUnitsOf,
  glyphProblem,
  tokensToPlace,
  tokenIdsFor,
  moveOptions,
  specialActions,
  replayGame,
  stepKey,
  type Command,
  type GameSetup,
  type GameState,
  type RulesContext,
  type Step,
} from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { MAPS, contextFor } from "../src";

const map = MAPS.find((m) => m.id === "proving-grounds")!;
const { ctx } = contextFor(map);

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[rng.int(0, items.length - 1)]!;
}

function shuffle<T>(rng: Rng, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Choose a random legal command for whoever the game is waiting on. */
function randomCommand(state: GameState, rng: Rng, c: RulesContext): Command {
  switch (state.phase) {
    case "draft": {
      // An open draft (online games) lets anyone still drafting pick: choose one at random.
      const player = currentDrafter(state) ?? pick(rng, drafters(state));
      const owned = state.units.some((u) => u.owner === player);
      if (state.config.budget !== null && owned && rng.float() < 0.15) return { type: "draftPass", player };
      return { type: "draftPick", player, cardId: pick(rng, draftableCards(state, c, player)) };
    }
    case "deploy": {
      const { player, unitId } = currentDeployment(state)!;
      const unit = state.units.find((u) => u.id === unitId)!;
      const card = c.cards.get(unit.cardId)!;
      const taken: Step[] = [];
      const placements = unit.figures.map((f) => {
        const options = deploymentPlacements(state, player, card, c, taken);
        const choice = options[rng.int(0, options.length - 1)]!;
        taken.push(...choice.spots);
        return { figureId: f.id, ...choice.placement };
      });
      return { type: "deployUnit", player, unitId, placements };
    }
    case "placeTokens": {
      const player = state.players.find((p) => !p.eliminated && !state.tokens[p.id])!.id;
      const units = livingUnitsOf(state, player).map((u) => u.id);
      if (state.config.tokenRule !== "onePerUnit") {
        return { type: "placeTokens", player, tokens: { "1": pick(rng, units), "2": pick(rng, units), "3": pick(rng, units), X: pick(rng, units) } };
      }
      // One token on each of some units: random tokens on random units, as many as the rules ask for.
      const tokens = shuffle(rng, tokenIdsFor(state, player)).slice(0, tokensToPlace(state, player));
      const holders = shuffle(rng, units);
      return { type: "placeTokens", player, tokens: Object.fromEntries(tokens.map((t, i) => [t, holders[i]!])) };
    }
    case "initiative": {
      const player = state.players.find((p) => !p.eliminated && !(state.initiativeReady ?? []).includes(p.id))!.id;
      return { type: "rollInitiative", player };
    }
    case "turns": {
      const active = state.active!;
      const unit = state.units.find((u) => u.id === active.unitId)!;
      // Sometimes use a held glyph on a unit it can go on (not Summoning, which needs placing).
      const held = (state.glyphs?.held[active.player] ?? []).filter((h) => h.kind !== "summon");
      if (held.length > 0 && rng.float() < 0.5) {
        const glyph = pick(rng, held);
        const targets = state.units.filter((u) => glyphProblem(state, active.player, glyph.id, u.id, c) === null);
        if (targets.length > 0) return { type: "useGlyph", player: active.player, glyphId: glyph.id, unitId: pick(rng, targets).id };
      }
      for (const f of unit.figures) {
        if (f.destroyed || !f.position) continue;
        if (!active.moved.includes(f.id) && !active.attacked.includes(f.id) && rng.float() < 0.7) {
          const options = [...moveOptions(state, f.id, c).values()];
          if (options.length > 0) {
            // Usually close in on the nearest enemy, so armies meet and fight; sometimes wander.
            const enemies = state.units
              .filter((u) => u.owner !== active.player)
              .flatMap((u) => u.figures.filter((x) => !x.destroyed && x.position).map((x) => x.position!.hex));
            const gap = (o: (typeof options)[number]) => Math.min(...enemies.map((e) => hexDistance(e, o.to.hex)));
            const toward = enemies.length > 0 && rng.float() < 0.75;
            const choice = toward ? options.reduce((best, o) => (gap(o) < gap(best) ? o : best)) : pick(rng, options);
            // A Blink option must say so, or the move is checked as a walk.
            return { type: "move", player: active.player, figureId: f.id, path: choice.path, ...(choice.ability ? { ability: choice.ability } : {}) };
          }
        }
        // Sometimes turn a figure that has just moved (games with facing).
        if (active.turnable?.includes(f.id) && rng.float() < 0.3) {
          return { type: "face", player: active.player, figureId: f.id, facing: Math.floor(rng.float() * 8) * 45 };
        }
        if (!active.attacked.includes(f.id)) {
          // Sometimes use a special action (area attack or mind control) instead. Powers such as Hurl use the `power` command, not `attack`.
          const specials = specialActions(c.cards.get(unit.cardId)!).filter((s) => !POWER_COMMAND_KINDS.includes(s.kind));
          if (specials.length > 0 && rng.float() < 0.5) {
            const ability = pick(rng, specials).id;
            const targets = attackTargets(state, f.id, c, ability);
            if (targets.length > 0) {
              return { type: "attack", player: active.player, figureId: f.id, targetId: pick(rng, targets), ability };
            }
          }
          const targets = attackTargets(state, f.id, c);
          if (targets.length > 0) {
            return { type: "attack", player: active.player, figureId: f.id, targetId: pick(rng, targets) };
          }
        }
        // Smoke Step: take the short move after attacking.
        if (active.bonusMoves[f.id]) {
          const options = [...moveOptions(state, f.id, c).values()];
          if (options.length > 0) {
            const choice = pick(rng, options);
            return { type: "move", player: active.player, figureId: f.id, path: choice.path, ...(choice.ability ? { ability: choice.ability } : {}) };
          }
        }
      }
      return { type: "endTurn", player: active.player };
    }
    case "gameOver":
      throw new Error("game is over");
  }
}

function checkInvariants(state: GameState): void {
  const spots = new Set<string>();
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId)!;
    for (const f of unit.figures) {
      if (f.destroyed) {
        expect(f.position).toBeNull();
        continue;
      }
      if (!f.position) continue;
      for (const s of figureSpots(f, card.footprint, card.height, ctx)) {
        const key = stepKey(s);
        expect(spots.has(key), `two figures on ${key}`).toBe(false);
        spots.add(key);
        expect(ctx.board.surfaceAt(s.hex, s.elevation), `${f.id} is floating`).toBeDefined();
      }
      expect(f.wounds).toBeLessThan(card.life);
    }
  }
}

/** `online`: the online game's rules, an open draft and initiative rolled by each player. `hitZones`: line of sight by hit shapes. */
function playRandomGame(seed: number, players: number, budget: number, online = false, hitZones = false) {
  const setup: GameSetup = {
    seed,
    mapId: map.id,
    roundLimit: 12,
    budget,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: "#fff" })),
    ...(online ? { draft: "open" as const, initiative: "players" as const } : {}),
    // New games keep one token on each unit; older games' stacking is covered by the engine's tests.
    tokenRule: "onePerUnit",
    // Glyphs on the board: picked up, sprung and used along the way.
    glyphs: 8,
    // Figures face a way: ranged attacks need the target in front, and melee from behind rolls more.
    facing: true,
    // Tokens for half of each army, rounded up, plus the bluff.
    tokenAllowance: "half",
    ...(hitZones ? { hitZones: "models" as const } : {}),
  };
  const rng = new Rng(seed * 7919 + 1);
  let state = createGame(setup, ctx).state;
  const commands: Command[] = [];
  let moves = 0;
  let attacks = 0;
  const abilityEvents: string[] = [];
  while (state.phase !== "gameOver") {
    const cmd = randomCommand(state, rng, ctx);
    const r = applyCommand(state, cmd, ctx);
    if (!r.ok) throw new Error(`seed ${seed}: ${cmd.type} rejected: ${r.error}`);
    if (cmd.type === "move") moves++;
    if (cmd.type === "attack") attacks++;
    commands.push(cmd);
    state = r.state;
    for (const e of r.events) {
      if (e.type === "abilityUsed" || e.type === "abilityRoll") abilityEvents.push(e.ability);
      if (e.type === "glyphTaken") abilityEvents.push(`glyph:${e.trap ?? "taken"}`);
      if (e.type === "glyphUsed") abilityEvents.push(`glyph:${e.kind}`);
      if (e.type === "attackRolled" && e.ability) abilityEvents.push(e.ability);
      if (e.type === "attackRolled" && e.notes) abilityEvents.push(...e.notes.map((n) => n.split(" +")[0]!.split(" -")[0]!));
      if (e.type === "figureMoved" && cmd.type === "move" && cmd.path.length === 1 && e.path.length === 1) {
        const unit = state.units.find((u) => u.figures.some((f) => f.id === e.figureId));
        if (unit && ctx.cards.get(unit.cardId)!.abilities.some((a) => a.id === "flying")) {
          abilityEvents.push("flying");
        }
      }
    }
    checkInvariants(state);
    if (commands.length > 5000) throw new Error(`seed ${seed}: game did not end`);
  }
  return { setup, state, commands, moves, attacks, abilityEvents };
}

describe("random games on the Proving Grounds", () => {
  const games: readonly (readonly [number, number, number, boolean, boolean?])[] = [
    [1, 2, 250, false],
    [2, 3, 250, false],
    [3, 4, 250, false],
    [4, 6, 250, false],
    [5, 2, 400, false],
    [6, 3, 400, false],
    [7, 4, 400, false],
    [8, 6, 400, false],
    [11, 2, 400, true],
    [10, 4, 250, true],
    [12, 2, 400, false, true],
    [13, 4, 400, true, true],
  ];
  for (const [seed, players, budget, online, shaped = false] of games) {
    const rules = `${online ? ", online rules" : ""}${shaped ? ", hit zones" : ""}`;
    it(`seed ${seed}, ${players} players, ${budget} points${rules}: stays legal to the end and replays exactly`, () => {
      const game = playRandomGame(seed, players, budget, online, shaped);
      expect(game.state.phase).toBe("gameOver");
      expect(game.moves).toBeGreaterThan(0);
      expect(game.attacks).toBeGreaterThan(0);
      expect(game.state.config.budget).toBe(budget);
      expect(replayGame(game.setup, game.commands, ctx).state).toEqual(game.state);
    });
  }

  it("uses many different abilities across the 400-point games", () => {
    const used = new Set<string>();
    for (const [seed, players] of [
      [5, 2],
      [6, 3],
      [7, 4],
      [8, 6],
    ] as const) {
      for (const a of playRandomGame(seed, players, 400).abilityEvents) used.add(a);
    }
    if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.SIM_REPORT) {
      (globalThis as { console?: { log: (s: string) => void } }).console?.log([...used].sort().join(", "));
    }
    expect(used.size).toBeGreaterThanOrEqual(6);
    // Glyphs are picked up and used along the way.
    expect([...used].filter((a) => a.startsWith("glyph:")).length).toBeGreaterThanOrEqual(3);
  });
});
