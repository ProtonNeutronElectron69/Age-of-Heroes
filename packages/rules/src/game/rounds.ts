import { hexDistance } from "../hex";
import { Rng } from "../rng";
import { initiativeBonus, spendInitiativeGlyphs } from "./glyphs";
import { figureSpots } from "./placement";
import { activePlayers, findUnit, isUnitAlive, livingUnitsOf, mostNumberedTokens, scoreOf } from "./queries";
import {
  type DamageSource,
  type FigureState,
  type GameEvent,
  type GameResult,
  type GameState,
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
export function rollOff(state: GameState, rng: Rng, ctx?: RulesContext): { order: PlayerId[]; rolls: RollOff[] } {
  const seated = state.players.filter((p) => !p.eliminated).sort((a, b) => a.seat - b.seat);
  // A glyph of initiative adds to every roll its player makes.
  const rolls: RollOff[] = seated.map((p) => {
    const bonus = initiativeBonus(state, p.id, ctx);
    return bonus ? { player: p.id, values: [rng.d20()], bonus } : { player: p.id, values: [rng.d20()] };
  });
  const total = (r: RollOff) => r.values[r.values.length - 1]! + (r.bonus ?? 0);
  let contenders = rolls;
  for (;;) {
    const best = Math.max(...contenders.map(total));
    const tied = contenders.filter((r) => total(r) === best);
    if (tied.length === 1) {
      const first = seated.findIndex((p) => p.id === tied[0]!.player);
      const order = [...seated.slice(first), ...seated.slice(0, first)].map((p) => p.id);
      return { order, rolls };
    }
    for (const r of tied) r.values.push(rng.d20());
    contenders = tied;
  }
}

/** Begin a new round: everyone places activation tokens in secret. */
export function startRound(state: GameState, events: GameEvent[]): void {
  // Under "half", each player's tokens are fixed as the first round begins: half their army, rounded up.
  if (state.round === 0 && state.config.tokenAllowance === "half") {
    state.tokenCounts = Object.fromEntries(state.players.map((p) => [p.id, Math.ceil(state.units.filter((u) => u.owner === p.id).length / 2)]));
  }
  state.round += 1;
  state.phase = "placeTokens";
  state.tokens = Object.fromEntries(state.players.map((p) => [p.id, null]));
  state.revealed = Object.fromEntries(state.players.map((p) => [p.id, []]));
  state.initiative = null;
  delete state.initiativeReady;
  state.pointer = null;
  state.active = null;
  delete state.called;
  events.push({ type: "roundStarted", round: state.round });
}

/**
 * Once every player's tokens are down, roll initiative and start the turns. Where
 * players roll for themselves, the round first waits ("initiative" phase) until
 * each of them has; nobody's roll is made until then, so nobody sees one early.
 */
export function maybeStartTurns(state: GameState, events: GameEvent[], ctx: RulesContext): void {
  if (state.phase === "placeTokens") {
    const waiting = activePlayers(state).filter((id) => !state.tokens[id]);
    if (waiting.length > 0) return;
    if (state.config.initiative === "players") {
      state.phase = "initiative";
      state.initiativeReady = [];
    }
  }
  if (state.phase === "initiative") {
    const ready = state.initiativeReady ?? [];
    if (activePlayers(state).some((id) => !ready.includes(id))) return;
    delete state.initiativeReady;
  }
  const rng = new Rng(state.rng);
  const { order, rolls } = rollOff(state, rng, ctx);
  state.rng = rng.state;
  state.initiative = order;
  events.push({ type: "initiativeRolled", rolls, order });
  spendInitiativeGlyphs(state, events);
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
  const next = Number(p.token) + 1;
  state.pointer = next <= mostNumberedTokens(state) ? { token: String(next), orderIndex: 0 } : null;
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
    // A player with fewer units than tokens may have left this one off: no turn, and nothing to reveal.
    if (unitId === undefined) {
      stepPointer(state);
      continue;
    }
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
      token,
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
    if (placed?.X !== undefined && !state.revealed[id]!.includes("X")) {
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

/**
 * Apply wounds to a figure, destroying it if they reach its Life. With the rules context, a
 * hero that would be destroyed may be saved by a friendly Second Wind (once a game).
 */
export function woundFigure(
  state: GameState,
  unit: UnitState,
  figure: FigureState,
  wounds: number,
  life: number,
  cause: DamageSource,
  events: GameEvent[],
  ctx?: RulesContext,
): void {
  if (wounds <= 0 || figure.destroyed) return;
  if (ctx && figure.wounds + wounds >= life) {
    const saved = secondWind(state, unit, figure, ctx, events);
    if (saved) wounds = Math.max(0, life - 1 - figure.wounds);
    if (wounds <= 0) return;
  }
  figure.wounds += wounds;
  events.push({ type: "figureWounded", figureId: figure.id, wounds, total: figure.wounds });
  if (figure.wounds >= life) destroyFigure(unit, figure, cause, events);
}

/**
 * Second Wind: once a game, a friendly hero within range of the medic that would be destroyed by
 * wounds is left with 1 Life instead. Returns whether it was saved.
 */
function secondWind(state: GameState, unit: UnitState, figure: FigureState, ctx: RulesContext, events: GameEvent[]): boolean {
  const card = ctx.cards.get(unit.cardId);
  if (!card || card.figureCount !== 1 || !figure.position) return false;
  const spots = figureSpots(figure, card.footprint, card.height, ctx);
  for (const u of state.units) {
    if (u.owner !== unit.owner) continue;
    const c = ctx.cards.get(u.cardId);
    const ability = c?.abilities.find((a) => a.id === "second-wind");
    if (!c || !ability) continue;
    const range = ability.params?.range ?? 2;
    for (const medic of u.figures) {
      if (medic.destroyed || !medic.position) continue;
      const key = `second-wind:${medic.id}`;
      if (state.spent?.includes(key)) continue;
      const near = figureSpots(medic, c.footprint, c.height, ctx).some((m) => spots.some((s) => hexDistance(m.hex, s.hex) <= range));
      if (!near) continue;
      state.spent = [...(state.spent ?? []), key];
      events.push({
        type: "abilityUsed",
        ability: "second-wind",
        figureId: medic.id,
        targetId: figure.id,
        detail: `${ability.name}: ${card.name} stays on its feet with 1 Life`,
      });
      return true;
    }
  }
  return false;
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
  if (state.phase === "placeTokens" || state.phase === "initiative" || state.phase === "turns") {
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
