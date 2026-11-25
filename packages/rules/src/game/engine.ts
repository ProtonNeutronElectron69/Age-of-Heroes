import { deepClone } from "../clone";
import { MAX_PLAYERS, MIN_PLAYERS } from "../schema";
import { endOfTurnAbilities } from "./abilities";
import { attack, blastHex, calledUnit, endOfTurnTerrain, lurkAttacks, usePower } from "./combat";
import { advanceDeployment, currentDeployment, deployUnit, startDeployment } from "./deploy";
import {
  continueDraft,
  createUnit,
  draftPass,
  drafters,
  draftPick,
  spaceNeeded,
  startDraft,
  zoneCapacity,
} from "./draft";
import { fail, RulesError } from "./errors";
import { faceFigure } from "./facing";
import { curseTurnEnded, pickUpGlyphs, useGlyph } from "./glyphs";
import { moveFigure } from "./movement";
import { findUnit, isUnitAlive, tokenIdsFor, tokensToPlace } from "./queries";
import { advance, checkGameOver, eliminate, maybeStartTurns, stepPointer } from "./rounds";
import {
  GLYPH_KINDS,
  type Command,
  type CommandResult,
  type GameEvent,
  type GameSetup,
  type GameState,
  type PlayerId,
  type RulesContext,
  type TokenAssignment,
} from "./types";

/**
 * The rules engine is a pure reducer: (state, command) -> (state, events).
 * It never mutates its input, and all randomness comes from the seeded RNG
 * stored in the state, so a game is fully reproducible from its setup and
 * command log. The same code runs in the browser and on a future server.
 */

/** The largest points budget a game can set. */
export const MAX_BUDGET = 9999;

/**
 * The rule options every new game sets, hot-seat, online and the test game alike. A save made
 * before an option existed leaves it out and keeps the older rule, so it replays exactly; a new
 * option goes here (and in `GameSetup`, `GameConfig` and the protocol's `setupSchema`).
 * Online games add their own `draft` and `initiative`; `glyphs` is chosen per game.
 */
export const NEW_GAME_RULES = {
  // At most one activation token on each unit, and tokens for half the army, rounded up, plus the bluff.
  tokenRule: "onePerUnit",
  tokenAllowance: "half",
  // Figures face a way.
  facing: true,
  // Swamp rolls a d20, and figures beside an enemy get one free step.
  swampRoll: "d20",
  zoneOfControl: true,
  // Glyphs are picked up as a turn ends, only melee units strike from behind, and engaged figures may use special actions.
  glyphPickup: "turnEnd",
  strikeFromBehind: "meleeOnly",
  engagedSpecials: true,
} as const satisfies Partial<GameSetup>;

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

  // Armies are drafted to a points budget; null (or no budget given) means no limit.
  const budget = setup.armies ? null : (setup.budget ?? null);
  if (budget !== null && (!Number.isInteger(budget) || budget < 1 || budget > MAX_BUDGET)) {
    throw new RulesError(`The points budget must be a whole number from 1 to ${MAX_BUDGET}`);
  }
  const state: GameState = {
    formatVersion: 1,
    config: {
      seed: setup.seed >>> 0,
      mapId: setup.mapId,
      roundLimit: setup.roundLimit ?? null,
      budget,
      factionPure: setup.factionPure ?? false,
      draft: setup.draft ?? "snake",
      initiative: setup.initiative ?? "auto",
      tokenRule: setup.tokenRule ?? "stack",
      ...(setup.glyphs ? { glyphs: Math.max(0, Math.min(GLYPH_KINDS.length, Math.floor(setup.glyphs))) } : {}),
      ...(setup.facing ? { facing: true } : {}),
      ...(setup.tokenAllowance ? { tokenAllowance: setup.tokenAllowance } : {}),
      ...(setup.swampRoll ? { swampRoll: setup.swampRoll } : {}),
      ...(setup.zoneOfControl ? { zoneOfControl: true } : {}),
      ...(setup.glyphPickup ? { glyphPickup: setup.glyphPickup } : {}),
      ...(setup.strikeFromBehind ? { strikeFromBehind: setup.strikeFromBehind } : {}),
      ...(setup.engagedSpecials ? { engagedSpecials: true } : {}),
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
    startDraft(state, events);
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
      case "draftPass":
        draftPass(next, command.player, events, ctx);
        break;
      case "rollInitiative":
        rollForInitiative(next, command.player, events, ctx);
        break;
      case "deployUnit":
        deployUnit(next, command.player, command.unitId, command.placements, events, ctx);
        break;
      case "placeTokens":
        placeTokens(next, command.player, command.tokens, events, ctx);
        break;
      case "move":
        moveFigure(next, command.player, command.figureId, command.path, events, ctx, command.ability, command.carry);
        // Lurk: an enemy in water or swamp strikes at a figure that ends its move beside it.
        if (next.phase === "turns") lurkAttacks(next, command.figureId, events, ctx);
        break;
      case "attack":
        attack(next, command.player, command.figureId, command.targetId, events, ctx, command.ability, command.aim);
        break;
      case "blast":
        blastHex(next, command.player, command.figureId, command.ability, command.at, events, ctx);
        break;
      case "power":
        usePower(
          next,
          command.player,
          command.figureId,
          command.ability,
          {
            ...(command.targetId !== undefined ? { targetId: command.targetId } : {}),
            ...(command.unitId !== undefined ? { unitId: command.unitId } : {}),
            ...(command.at !== undefined ? { at: command.at } : {}),
          },
          events,
          ctx,
        );
        break;
      case "endTurn":
        endTurn(next, command.player, events, ctx);
        break;
      case "face":
        faceFigure(next, command.player, command.figureId, command.facing, events, ctx);
        break;
      case "useGlyph":
        useGlyph(next, command.player, command.glyphId, command.unitId, command.placements, events, ctx);
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
    case "draft":
      return drafters(state);
    case "deploy": {
      const d = currentDeployment(state);
      return d ? [d.player] : [];
    }
    case "placeTokens":
      return state.players.filter((p) => !p.eliminated && !state.tokens[p.id]).map((p) => p.id);
    case "initiative":
      return state.players.filter((p) => !p.eliminated && !(state.initiativeReady ?? []).includes(p.id)).map((p) => p.id);
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
  tokens: Record<string, string | undefined>,
  events: GameEvent[],
  ctx: RulesContext,
): void {
  if (state.phase !== "placeTokens") fail("Tokens can only be placed before the round's turns begin");
  if (state.tokens[player]) fail("Tokens have already been placed this round");
  const ids = tokenIdsFor(state, player);
  const named = ids.join(", ").replace(/, X$/, " and X");
  const keys = Object.keys(tokens);
  if (keys.some((k) => !ids.includes(k)) || keys.some((k) => typeof tokens[k] !== "string")) {
    fail(`Your tokens are ${named}, each placed on a unit`);
  }
  const spread = state.config.tokenRule === "onePerUnit";
  const needed = tokensToPlace(state, player);
  if (!spread && keys.length !== ids.length) fail(`All your tokens (${named}) must be placed`);
  if (spread && keys.length !== needed) {
    fail(needed === ids.length ? `All your tokens (${named}) must be placed` : `Place ${needed} token${needed === 1 ? "" : "s"}, one on each of your units`);
  }
  const placed: TokenAssignment = {};
  for (const t of ids) {
    const unitId = tokens[t];
    if (unitId === undefined) continue;
    const unit = findUnit(state, unitId);
    if (!unit || unit.owner !== player) fail(`Token ${t} must go on one of your own units`);
    if (!isUnitAlive(unit)) fail(`Token ${t} cannot go on a destroyed unit`);
    placed[t] = unitId;
  }
  if (spread && new Set(Object.values(placed)).size !== keys.length) fail("Each unit can hold only one token");
  state.tokens[player] = placed;
  events.push({ type: "tokensPlaced", player });
  maybeStartTurns(state, events, ctx);
}

function rollForInitiative(state: GameState, player: PlayerId, events: GameEvent[], ctx: RulesContext): void {
  if (state.phase !== "initiative") fail("Initiative is not being rolled now");
  const ready = (state.initiativeReady ??= []);
  if (ready.includes(player)) fail("You have already rolled for initiative");
  ready.push(player);
  events.push({ type: "initiativeReady", player });
  maybeStartTurns(state, events, ctx);
}

function endTurn(state: GameState, player: PlayerId, events: GameEvent[], ctx: RulesContext): void {
  if (state.phase !== "turns" || !state.active) fail("No turn is in progress");
  if (state.active.player !== player) fail("It is not your turn");
  const active = state.active;
  const { token, unitId } = active;
  // Games that pick glyphs up as a turn ends: each figure of the unit standing on one takes it now.
  if (state.config.glyphPickup === "turnEnd") {
    const unit = state.units.find((u) => u.id === unitId);
    for (const figure of unit?.figures ?? []) pickUpGlyphs(state, unit!, figure, events, ctx);
  }
  endOfTurnTerrain(state, unitId, events, ctx);
  endOfTurnAbilities(state, unitId, ctx, events);
  curseTurnEnded(state, player, events);
  if (checkGameOver(state, events, ctx)) return;
  if (state.active !== active) return; // the player was knocked out and play has moved on
  const call = calledUnit(state, ctx);
  events.push({ type: "turnEnded", player, token, unitId });
  state.active = null;
  // Call to Arms: the chosen squad takes a turn straight away, then play moves on as it would have.
  if (call) {
    state.called = [...(state.called ?? []), unitId];
    state.active = { player, unitId: call, token, moved: [], attacked: [], attackLog: [], bonusMoves: {}, called: true };
    events.push({ type: "turnStarted", player, token, unitId: call });
    return;
  }
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
      advanceDeployment(state, events, ctx);
      break;
    case "placeTokens":
    case "initiative":
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
