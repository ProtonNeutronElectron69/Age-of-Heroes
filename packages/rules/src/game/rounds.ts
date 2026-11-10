import { Rng } from "../rng";
import { activePlayers, findUnit, isUnitAlive, livingUnitsOf, scoreOf } from "./queries";
import {
  NUMBERED_TOKENS,
  type DamageSource,
  type FigureState,
  type GameEvent,
  type GameResult,
  type GameState,
  type NumberedToken,
  type PlayerId,
  type RollOff,
  type RulesContext,
  type UnitState,
} from "./types";

/**
 * Every active player rolls a d20. Players tied for the highest roll reroll
 * until one is highest. That player goes first; play then passes to the left
 * (increasing seat order, wrapping around). Used for initiative and for
 * choosing the first drafter.
 */
export function rollOff(state: GameState, rng: Rng): { order: PlayerId[]; rolls: RollOff[] } {
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

/** Initiative is a roll-off among the players still in the game. */
export const rollInitiative = rollOff;

/** Begin a new round: everyone places activation tokens in secret. */
export function startRound(state: GameState, events: GameEvent[]): void {
  state.round += 1;
  state.phase = "placeTokens";
  state.tokens = Object.fromEntries(state.players.map((p) => [p.id, null]));
  state.revealed = Object.fromEntries(state.players.map((p) => [p.id, []]));
  state.initiative = null;
  state.pointer = null;
  state.active = null;
  events.push({ type: "roundStarted", round: state.round });
}

export function maybeStartTurns(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  const waiting = activePlayers(state).filter((id) => !state.tokens[id]);
  if (waiting.length > 0) return;
  const rng = new Rng(state.rng);
  const { order, rolls } = rollOff(state, rng);
  state.rng = rng.state;
  state.initiative = order;
  events.push({ type: "initiativeRolled", rolls, order });
  state.phase = "turns";
  state.pointer = { token: "1", orderIndex: 0 };
  advance(state, events, ctx);
}

export function stepPointer(state: GameState): void {
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
export function advance(state: GameState, events: GameEvent[], ctx: RulesContext): void {
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
    state.active = {
      player,
      unitId,
      token: token as NumberedToken,
      moved: [],
      attacked: [],
      attackLog: [],
      bonusMoves: {},
    };
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
  startRound(state, events);
}

// ---------------------------------------------------------------------------
// Damage

/** Apply wounds to a figure, destroying it if they reach its Life. */
export function woundFigure(
  state: GameState,
  unit: UnitState,
  figure: FigureState,
  wounds: number,
  life: number,
  cause: DamageSource,
  events: GameEvent[],
): void {
  if (wounds <= 0 || figure.destroyed) return;
  figure.wounds += wounds;
  events.push({ type: "figureWounded", figureId: figure.id, wounds, total: figure.wounds });
  if (figure.wounds >= life) destroyFigure(unit, figure, cause, events);
}

export function destroyFigure(unit: UnitState, figure: FigureState, cause: DamageSource, events: GameEvent[]): void {
  if (figure.destroyed) return;
  figure.destroyed = true;
  figure.position = null;
  events.push({ type: "figureDestroyed", figureId: figure.id, unitId: unit.id, cause });
}

// ---------------------------------------------------------------------------
// Elimination and victory

export function eliminate(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = state.players.find((x) => x.id === player)!;
  if (p.eliminated) return;
  p.eliminated = true;
  events.push({ type: "playerEliminated", player });
}

/**
 * Once armies are on the battlefield, eliminate players with no living units.
 * End the game if at most one player remains. Returns true if the game ended.
 * If the player whose turn it is was knocked out (say their last figure fell
 * into lava), their turn ends and play moves on.
 */
export function checkGameOver(state: GameState, events: GameEvent[], ctx: RulesContext): boolean {
  if (state.phase === "gameOver") return true;
  if (state.phase === "placeTokens" || state.phase === "turns") {
    for (const p of state.players) {
      if (!p.eliminated && livingUnitsOf(state, p.id).length === 0) eliminate(state, p.id, events);
    }
  }
  if (activePlayers(state).length <= 1) {
    finish(state, "elimination", events, ctx);
    return true;
  }
  const active = state.active;
  if (state.phase === "turns" && active && state.players.find((p) => p.id === active.player)?.eliminated) {
    events.push({ type: "turnEnded", player: active.player, token: active.token, unitId: active.unitId });
    state.active = null;
    stepPointer(state);
    advance(state, events, ctx);
  }
  return false;
}

export function finish(state: GameState, reason: GameResult["reason"], events: GameEvent[], ctx: RulesContext): void {
  const scores = Object.fromEntries(state.players.map((p) => [p.id, scoreOf(state, p.id, ctx)]));
  let winners: PlayerId[];
  const contenders = activePlayers(state);
  if (reason === "elimination") {
    winners = contenders;
  } else {
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
