import { deepClone } from "../clone";
import { Rng } from "../rng";
import { MAX_PLAYERS, MIN_PLAYERS } from "../schema";
import {
  NUMBERED_TOKENS,
  TOKEN_IDS,
  type Command,
  type CommandResult,
  type GameEvent,
  type GameResult,
  type GameSetup,
  type GameState,
  type NumberedToken,
  type PlayerId,
  type RulesContext,
  type UnitState,
} from "./types";

/**
 * The rules engine is a pure reducer: (state, command) -> (state, events).
 * It never mutates its input, and all randomness comes from the seeded RNG
 * stored in the state, so a game is fully reproducible from its setup and
 * command log. The same code runs in the browser and on a future server.
 */

export class RulesError extends Error {}

function fail(message: string): never {
  throw new RulesError(message);
}

export function createGame(setup: GameSetup, ctx: RulesContext): { state: GameState; events: GameEvent[] } {
  const n = setup.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    fail(`A game needs ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${n}`);
  }
  const ids = new Set(setup.players.map((p) => p.id));
  if (ids.size !== n) fail("Player ids must be unique");

  const units: UnitState[] = [];
  for (const p of setup.players) {
    const army = setup.armies[p.id];
    if (!army || army.length === 0) fail(`Player ${p.id} has no army`);
    army.forEach((cardId, i) => {
      const card = ctx.cards.get(cardId) ?? fail(`Unknown card "${cardId}" in ${p.id}'s army`);
      const unitId = `${p.id}:${i}`;
      units.push({
        id: unitId,
        cardId,
        owner: p.id,
        figures: Array.from({ length: card.figureCount }, (_, f) => ({
          id: `${unitId}#${f + 1}`,
          wounds: 0,
          destroyed: false,
          position: null,
        })),
      });
    });
  }

  const state: GameState = {
    formatVersion: 1,
    config: { mode: setup.mode, seed: setup.seed >>> 0, roundLimit: setup.roundLimit ?? null },
    rng: setup.seed >>> 0,
    round: 1,
    phase: "placeTokens",
    players: setup.players.map((p, seat) => ({ ...p, seat, eliminated: false, conceded: false })),
    units,
    tokens: Object.fromEntries(setup.players.map((p) => [p.id, null])),
    revealed: Object.fromEntries(setup.players.map((p) => [p.id, []])),
    initiative: null,
    pointer: null,
    active: null,
    result: null,
  };
  return { state, events: [{ type: "roundStarted", round: 1 }] };
}

export function applyCommand(state: GameState, command: Command, ctx: RulesContext): CommandResult {
  const next = deepClone(state);
  const events: GameEvent[] = [];
  try {
    if (next.phase === "gameOver") fail("The game is over");
    const player = next.players.find((p) => p.id === command.player) ?? fail(`Unknown player "${command.player}"`);
    if (player.eliminated) fail(`${player.name} is out of the game`);

    switch (command.type) {
      case "placeTokens":
        placeTokens(next, command.player, command.tokens, events, ctx);
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

// ---------------------------------------------------------------------------
// Queries

export function isUnitAlive(unit: UnitState): boolean {
  return unit.figures.some((f) => !f.destroyed);
}

export function unitsOf(state: GameState, player: PlayerId): UnitState[] {
  return state.units.filter((u) => u.owner === player);
}

export function livingUnitsOf(state: GameState, player: PlayerId): UnitState[] {
  return unitsOf(state, player).filter(isUnitAlive);
}

export function activePlayers(state: GameState): PlayerId[] {
  return state.players.filter((p) => !p.eliminated).map((p) => p.id);
}

export function findUnit(state: GameState, unitId: string): UnitState | undefined {
  return state.units.find((u) => u.id === unitId);
}

/**
 * Score of what a player still has on the board. Advanced: point value, with
 * squads counting in proportion to their surviving figures. Basic (no point
 * costs): number of surviving figures.
 */
export function scoreOf(state: GameState, player: PlayerId, ctx: RulesContext): number {
  let score = 0;
  for (const unit of unitsOf(state, player)) {
    const alive = unit.figures.filter((f) => !f.destroyed).length;
    if (alive === 0) continue;
    if (state.config.mode === "basic") {
      score += alive;
    } else {
      const card = ctx.cards.get(unit.cardId);
      if (card) score += Math.floor((card.advanced.points * alive) / unit.figures.length);
    }
  }
  return score;
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
  const { token, unitId } = state.active;
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
  if (state.phase === "placeTokens") {
    maybeStartTurns(state, events, ctx);
  } else if (state.active?.player === player) {
    state.active = null;
    stepPointer(state);
    advance(state, events, ctx);
  }
}

// ---------------------------------------------------------------------------
// Round flow

function maybeStartTurns(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  const waiting = activePlayers(state).filter((id) => !state.tokens[id]);
  if (waiting.length > 0) return;
  const rng = new Rng(state.rng);
  const { order, rolls } = rollInitiative(state, rng);
  state.rng = rng.state;
  state.initiative = order;
  events.push({ type: "initiativeRolled", rolls, order });
  state.phase = "turns";
  state.pointer = { token: "1", orderIndex: 0 };
  advance(state, events, ctx);
}

/**
 * Every active player rolls a d20. Players tied for the highest roll reroll
 * until one is highest. That player goes first; play then passes to the left
 * (increasing seat order, wrapping around).
 */
export function rollInitiative(
  state: GameState,
  rng: Rng,
): { order: PlayerId[]; rolls: { player: PlayerId; values: number[] }[] } {
  const seated = state.players.filter((p) => !p.eliminated).sort((a, b) => a.seat - b.seat);
  const rolls = seated.map((p) => ({ player: p.id, values: [rng.d20()] }));
  let contenders = rolls;
  for (;;) {
    const best = Math.max(...contenders.map((r) => r.values[r.values.length - 1]!));
    const tied = contenders.filter((r) => r.values[r.values.length - 1] === best);
    if (tied.length === 1) {
      const first = seated.findIndex((p) => p.id === tied[0]!.player);
      const order = [...seated.slice(first), ...seated.slice(0, first)].map((p) => p.id);
      return { order, rolls };
    }
    for (const r of tied) r.values.push(rng.d20());
    contenders = tied;
  }
}

function stepPointer(state: GameState): void {
  const p = state.pointer;
  if (!p || !state.initiative) return;
  const nextIndex = p.orderIndex + 1;
  if (nextIndex < state.initiative.length) {
    state.pointer = { token: p.token, orderIndex: nextIndex };
    return;
  }
  const t = NUMBERED_TOKENS.indexOf(p.token);
  const nextToken = NUMBERED_TOKENS[t + 1];
  state.pointer = nextToken ? { token: nextToken, orderIndex: 0 } : null;
}

/** Resolve token reveals until a turn can start or the round ends. */
function advance(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  while (state.pointer && state.initiative) {
    const { token, orderIndex } = state.pointer;
    const player = state.initiative[orderIndex]!;
    const p = state.players.find((x) => x.id === player)!;
    const placed = state.tokens[player];
    if (p.eliminated || !placed) {
      stepPointer(state);
      continue;
    }
    const unitId = placed[token];
    state.revealed[player]!.push(token);
    events.push({ type: "tokenRevealed", player, token, unitId });
    const unit = findUnit(state, unitId);
    if (!unit || !isUnitAlive(unit)) {
      events.push({ type: "turnLost", player, token, unitId });
      stepPointer(state);
      continue;
    }
    state.active = { player, unitId, token: token as NumberedToken };
    events.push({ type: "turnStarted", player, token, unitId });
    return;
  }
  endRound(state, events, ctx);
}

function endRound(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  for (const id of activePlayers(state)) {
    const placed = state.tokens[id];
    if (placed && !state.revealed[id]!.includes("X")) {
      state.revealed[id]!.push("X");
      events.push({ type: "tokenRevealed", player: id, token: "X", unitId: placed.X });
    }
  }
  events.push({ type: "roundEnded", round: state.round });

  const limit = state.config.roundLimit;
  if (limit !== null && state.round >= limit) {
    finish(state, "roundLimit", events, ctx);
    return;
  }
  state.round += 1;
  state.phase = "placeTokens";
  state.tokens = Object.fromEntries(state.players.map((p) => [p.id, null]));
  state.revealed = Object.fromEntries(state.players.map((p) => [p.id, []]));
  state.initiative = null;
  state.pointer = null;
  state.active = null;
  events.push({ type: "roundStarted", round: state.round });
}

// ---------------------------------------------------------------------------
// Elimination and victory

function eliminate(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = state.players.find((x) => x.id === player)!;
  if (p.eliminated) return;
  p.eliminated = true;
  events.push({ type: "playerEliminated", player });
}

/**
 * Eliminate players with no living units, and end the game if at most one
 * player remains. Call after anything that can destroy figures.
 */
export function checkGameOver(state: GameState, events: GameEvent[], ctx: RulesContext): boolean {
  for (const p of state.players) {
    if (!p.eliminated && livingUnitsOf(state, p.id).length === 0) eliminate(state, p.id, events);
  }
  if (activePlayers(state).length <= 1) {
    finish(state, "elimination", events, ctx);
    return true;
  }
  return false;
}

function finish(state: GameState, reason: GameResult["reason"], events: GameEvent[], ctx: RulesContext): void {
  const scores = Object.fromEntries(state.players.map((p) => [p.id, scoreOf(state, p.id, ctx)]));
  let winners: PlayerId[];
  if (reason === "elimination") {
    winners = activePlayers(state);
  } else {
    const contenders = activePlayers(state);
    const best = Math.max(...contenders.map((id) => scores[id]!));
    winners = contenders.filter((id) => scores[id] === best);
  }
  const result: GameResult = { winners, reason, scores };
  state.phase = "gameOver";
  state.active = null;
  state.pointer = null;
  state.result = result;
  events.push({ type: "gameOver", result });
}
