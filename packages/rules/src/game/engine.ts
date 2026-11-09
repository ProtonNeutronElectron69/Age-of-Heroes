import { deepClone } from "../clone";
import { MAX_PLAYERS, MIN_PLAYERS } from "../schema";
import { attack, endOfTurnTerrain } from "./combat";
import { currentDeployment, deployUnit, skipDepartedDeployers, startDeployment } from "./deploy";
import { continueDraft, createUnit, currentDrafter, draftPick, spaceNeeded, startDraft, zoneCapacity } from "./draft";
import { fail, RulesError } from "./errors";
import { moveFigure } from "./movement";
import { findUnit, isUnitAlive } from "./queries";
import { advance, checkGameOver, eliminate, maybeStartTurns, startRound, stepPointer } from "./rounds";
import {
  TOKEN_IDS,
  type Command,
  type CommandResult,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PlayerId,
  type RulesContext,
} from "./types";

/**
 * The rules engine is a pure reducer: (state, command) -> (state, events).
 * It never mutates its input, and all randomness comes from the seeded RNG
 * stored in the state, so a game is fully reproducible from its setup and
 * command log. The same code runs in the browser and on a future server.
 */

export const DEFAULT_ARMY_SIZE = 4;

export function createGame(setup: GameSetup, ctx: RulesContext): { state: GameState; events: GameEvent[] } {
  const n = setup.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new RulesError(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${n}`);
  }
  const ids = new Set(setup.players.map((p) => p.id));
  if (ids.size !== n) throw new RulesError("Player ids must be unique");
  if (setup.mapId !== ctx.board.id) throw new RulesError(`Map "${setup.mapId}" does not match the loaded board`);
  for (let seat = 0; seat < n; seat++) {
    if (ctx.board.startZone(ctx.board.zoneFor(seat, n)).length === 0) {
      throw new RulesError(`This map has no start zone for player ${seat + 1}`);
    }
  }

  const state: GameState = {
    formatVersion: 1,
    config: {
      mode: setup.mode,
      seed: setup.seed >>> 0,
      mapId: setup.mapId,
      roundLimit: setup.roundLimit ?? null,
      armySize: setup.armies ? null : (setup.armySize ?? DEFAULT_ARMY_SIZE),
    },
    rng: setup.seed >>> 0,
    round: 0,
    phase: "draft",
    players: setup.players.map((p, seat) => ({
      ...p,
      seat,
      zone: ctx.board.zoneFor(seat, n),
      eliminated: false,
      conceded: false,
    })),
    units: [],
    draft: null,
    deploy: null,
    tokens: Object.fromEntries(setup.players.map((p) => [p.id, null])),
    revealed: Object.fromEntries(setup.players.map((p) => [p.id, []])),
    initiative: null,
    pointer: null,
    active: null,
    result: null,
  };
  const events: GameEvent[] = [];

  if (setup.armies) {
    for (const p of setup.players) {
      const army = setup.armies[p.id];
      if (!army || army.length === 0) throw new RulesError(`Player ${p.id} has no army`);
      for (const cardId of army) {
        if (!ctx.cards.has(cardId)) throw new RulesError(`Unknown card "${cardId}" in ${p.id}'s army`);
        createUnit(state, p.id, cardId, ctx);
      }
      const room = zoneCapacity(state, p.id, ctx);
      if (spaceNeeded(state, p.id, ctx) > room) {
        throw new RulesError(`${p.name}'s army has more figures than their start zone can hold (${room})`);
      }
    }
    startDeployment(state, events, ctx);
  } else {
    // Both rule sets draft by card count for now; the points budget arrives in Phase 4.
    const size = state.config.armySize!;
    if (!Number.isInteger(size) || size < 1) throw new RulesError("Army size must be at least 1 card");
    startDraft(state, size, events);
  }
  return { state, events };
}

export function applyCommand(state: GameState, command: Command, ctx: RulesContext): CommandResult {
  const next = deepClone(state);
  const events: GameEvent[] = [];
  try {
    if (next.phase === "gameOver") fail("The game is over");
    const player = next.players.find((p) => p.id === command.player) ?? fail(`Unknown player "${command.player}"`);
    if (player.eliminated) fail(`${player.name} is out of the game`);

    switch (command.type) {
      case "draftPick":
        draftPick(next, command.player, command.cardId, events, ctx);
        break;
      case "deployUnit":
        deployUnit(next, command.player, command.unitId, command.placements, events, ctx);
        break;
      case "placeTokens":
        placeTokens(next, command.player, command.tokens, events, ctx);
        break;
      case "move":
        moveFigure(next, command.player, command.figureId, command.path, events, ctx);
        break;
      case "attack":
        attack(next, command.player, command.figureId, command.targetId, events, ctx);
        break;
      case "endTurn":
        endTurn(next, command.player, events, ctx);
        break;
      case "concede":
        concede(next, command.player, events, ctx);
        break;
      default: {
        const unknown: never = command;
        fail(`Unknown command ${JSON.stringify(unknown)}`);
      }
    }
    return { ok: true, state: next, events };
  } catch (err) {
    if (err instanceof RulesError) return { ok: false, error: err.message };
    throw err;
  }
}

/** Re-run a game from its setup and command log. Throws on any invalid command. */
export function replayGame(
  setup: GameSetup,
  commands: readonly Command[],
  ctx: RulesContext,
): { state: GameState; events: GameEvent[] } {
  let { state, events } = createGame(setup, ctx);
  const all = [...events];
  commands.forEach((cmd, i) => {
    const result = applyCommand(state, cmd, ctx);
    if (!result.ok) throw new RulesError(`Command ${i} (${cmd.type}) rejected: ${result.error}`);
    state = result.state;
    all.push(...result.events);
  });
  return { state, events: all };
}

/** Who the game is waiting on, or null when it is over. */
export function waitingOn(state: GameState): PlayerId[] {
  switch (state.phase) {
    case "draft": {
      const p = currentDrafter(state);
      return p ? [p] : [];
    }
    case "deploy": {
      const d = currentDeployment(state);
      return d ? [d.player] : [];
    }
    case "placeTokens":
      return state.players.filter((p) => !p.eliminated && !state.tokens[p.id]).map((p) => p.id);
    case "turns":
      return state.active ? [state.active.player] : [];
    case "gameOver":
      return [];
  }
}

// ---------------------------------------------------------------------------
// Commands

function placeTokens(
  state: GameState,
  player: PlayerId,
  tokens: Record<string, string>,
  events: GameEvent[],
  ctx: RulesContext,
): void {
  if (state.phase !== "placeTokens") fail("Tokens can only be placed before the round's turns begin");
  if (state.tokens[player]) fail("Tokens have already been placed this round");
  const keys = Object.keys(tokens);
  if (keys.length !== TOKEN_IDS.length || !TOKEN_IDS.every((t) => typeof tokens[t] === "string")) {
    fail("All four tokens (1, 2, 3 and X) must be placed");
  }
  for (const t of TOKEN_IDS) {
    const unit = findUnit(state, tokens[t]!);
    if (!unit || unit.owner !== player) fail(`Token ${t} must go on one of your own units`);
    if (!isUnitAlive(unit)) fail(`Token ${t} cannot go on a destroyed unit`);
  }
  state.tokens[player] = { "1": tokens["1"]!, "2": tokens["2"]!, "3": tokens["3"]!, X: tokens["X"]! };
  events.push({ type: "tokensPlaced", player });
  maybeStartTurns(state, events, ctx);
}

function endTurn(state: GameState, player: PlayerId, events: GameEvent[], ctx: RulesContext): void {
  if (state.phase !== "turns" || !state.active) fail("No turn is in progress");
  if (state.active.player !== player) fail("It is not your turn");
  const active = state.active;
  const { token, unitId } = active;
  endOfTurnTerrain(state, unitId, events, ctx);
  if (checkGameOver(state, events, ctx)) return;
  if (state.active !== active) return; // the player was knocked out and play has moved on
  events.push({ type: "turnEnded", player, token, unitId });
  state.active = null;
  stepPointer(state);
  advance(state, events, ctx);
}

function concede(state: GameState, player: PlayerId, events: GameEvent[], ctx: RulesContext): void {
  const p = state.players.find((x) => x.id === player)!;
  p.conceded = true;
  events.push({ type: "playerConceded", player });
  eliminate(state, player, events);
  if (checkGameOver(state, events, ctx)) return;

  switch (state.phase) {
    case "draft":
      continueDraft(state, events, ctx);
      break;
    case "deploy":
      skipDepartedDeployers(state);
      if (!currentDeployment(state)) {
        events.push({ type: "deploymentEnded" });
        startRound(state, events);
      }
      break;
    case "placeTokens":
      maybeStartTurns(state, events, ctx);
      break;
    case "turns":
      if (state.active?.player === player) {
        state.active = null;
        stepPointer(state);
        advance(state, events, ctx);
      }
      break;
  }
}
