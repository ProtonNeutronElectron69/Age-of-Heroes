import {
  Rng,
  applyCommand,
  attackTargets,
  createGame,
  currentDeployment,
  currentDrafter,
  deploymentSpots,
  draftableCards,
  livingUnitsOf,
  moveOptions,
  replayGame,
  stepKey,
  type Command,
  type GameSetup,
  type GameState,
  type RulesContext,
} from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { MAPS, contextFor } from "../src";

const map = MAPS.find((m) => m.id === "proving-grounds")!;
const { ctx } = contextFor(map);

function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[rng.int(0, items.length - 1)]!;
}

/** Choose a random legal command for whoever the game is waiting on. */
function randomCommand(state: GameState, rng: Rng, c: RulesContext): Command {
  switch (state.phase) {
    case "draft": {
      const player = currentDrafter(state)!;
      return { type: "draftPick", player, cardId: pick(rng, draftableCards(state, c, player)) };
    }
    case "deploy": {
      const { player, unitId } = currentDeployment(state)!;
      const unit = state.units.find((u) => u.id === unitId)!;
      const height = c.cards.get(unit.cardId)!.height;
      const spots = [...deploymentSpots(state, player, height, c)];
      const placements = unit.figures.map((f) => {
        const spot = spots.splice(rng.int(0, spots.length - 1), 1)[0]!;
        return { figureId: f.id, ...spot };
      });
      return { type: "deployUnit", player, unitId, placements };
    }
    case "placeTokens": {
      const player = state.players.find((p) => !p.eliminated && !state.tokens[p.id])!.id;
      const units = livingUnitsOf(state, player).map((u) => u.id);
      return {
        type: "placeTokens",
        player,
        tokens: { "1": pick(rng, units), "2": pick(rng, units), "3": pick(rng, units), X: pick(rng, units) },
      };
    }
    case "turns": {
      const active = state.active!;
      const unit = state.units.find((u) => u.id === active.unitId)!;
      for (const f of unit.figures) {
        if (f.destroyed || !f.position) continue;
        if (!active.moved.includes(f.id) && !active.attacked.includes(f.id) && rng.float() < 0.7) {
          const options = [...moveOptions(state, f.id, c).values()];
          if (options.length > 0) {
            return { type: "move", player: active.player, figureId: f.id, path: pick(rng, options).path };
          }
        }
        if (!active.attacked.includes(f.id)) {
          const targets = attackTargets(state, f.id, c);
          if (targets.length > 0) {
            return { type: "attack", player: active.player, figureId: f.id, targetId: pick(rng, targets) };
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
    for (const f of unit.figures) {
      if (f.destroyed) {
        expect(f.position).toBeNull();
        continue;
      }
      if (!f.position) continue;
      const key = stepKey(f.position);
      expect(spots.has(key), `two figures on ${key}`).toBe(false);
      spots.add(key);
      expect(ctx.board.surfaceAt(f.position.hex, f.position.elevation), `${f.id} is floating`).toBeDefined();
    }
  }
}

function playRandomGame(seed: number, players: number) {
  const setup: GameSetup = {
    mode: "basic",
    seed,
    mapId: map.id,
    roundLimit: 12,
    armySize: 3,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: "#fff" })),
  };
  const rng = new Rng(seed * 7919 + 1);
  let state = createGame(setup, ctx).state;
  const commands: Command[] = [];
  let moves = 0;
  let attacks = 0;
  while (state.phase !== "gameOver") {
    const cmd = randomCommand(state, rng, ctx);
    const r = applyCommand(state, cmd, ctx);
    if (!r.ok) throw new Error(`seed ${seed}: ${cmd.type} rejected: ${r.error}`);
    if (cmd.type === "move") moves++;
    if (cmd.type === "attack") attacks++;
    commands.push(cmd);
    state = r.state;
    checkInvariants(state);
    if (commands.length > 5000) throw new Error(`seed ${seed}: game did not end`);
  }
  return { setup, state, commands, moves, attacks };
}

describe("random games on the Proving Grounds", () => {
  for (const [seed, players] of [
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 6],
    [5, 2],
  ] as const) {
    it(`seed ${seed}, ${players} players: stays legal to the end and replays exactly`, () => {
      const game = playRandomGame(seed, players);
      expect(game.state.phase).toBe("gameOver");
      expect(game.moves).toBeGreaterThan(0);
      expect(game.attacks).toBeGreaterThan(0);
      expect(replayGame(game.setup, game.commands, ctx).state).toEqual(game.state);
    });
  }
});
