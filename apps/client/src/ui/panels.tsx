import {
  NUMBERED_TOKENS,
  TOKEN_IDS,
  livingUnitsOf,
  viewFor,
  type DieFace,
  type GameEvent,
  type GameState,
  type PlayerId,
  type TokenAssignment,
  type TokenId,
} from "@aoh/rules";
import { useEffect, useMemo, useRef, useState } from "react";
import { describeEvent, type Names } from "../describe";

// ---------------------------------------------------------------------------
// Pass-the-device screen

export function PassScreen({ name, color, onReady }: { name: string; color: string; onReady: () => void }) {
  return (
    <div className="overlay pass-screen" role="dialog" aria-modal="true" aria-label={`Pass to ${name}`}>
      <div className="panel pass-card" style={{ borderColor: color }}>
        <p className="muted">Pass the device to</p>
        <h2 className="pass-name" style={{ color }}>
          {name}
        </h2>
        <p className="muted small">Everyone else, look away while {name} places their activation tokens.</p>
        <button type="button" className="primary" onClick={onReady} autoFocus>
          I am {name}: show my units
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Secret token placement

export function TokenPanel({
  state,
  player,
  names,
  onSubmit,
}: {
  state: GameState;
  player: PlayerId;
  names: Names;
  onSubmit: (tokens: TokenAssignment) => void;
}) {
  const units = livingUnitsOf(state, player);
  const [assigned, setAssigned] = useState<Partial<TokenAssignment>>({});
  const complete = TOKEN_IDS.every((t) => assigned[t]);

  return (
    <section className="panel token-panel" aria-label="Place activation tokens">
      <h2>{names.player(player)}: place your tokens</h2>
      <p className="muted small">
        Tokens 1, 2 and 3 decide which unit acts on each of your three turns this round. X is a bluff. One unit can
        hold several tokens.
      </p>
      <table className="token-table">
        <thead>
          <tr>
            <th scope="col">Unit</th>
            {TOKEN_IDS.map((t) => (
              <th key={t} scope="col">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id}>
              <th scope="row">
                {names.unit(u.id)}
                <span className="muted small"> ({u.figures.filter((f) => !f.destroyed).length} left)</span>
              </th>
              {TOKEN_IDS.map((t) => (
                <td key={t}>
                  <button
                    type="button"
                    className={`token-chip ${assigned[t] === u.id ? "on" : ""} ${t === "X" ? "bluff" : ""}`}
                    aria-pressed={assigned[t] === u.id}
                    aria-label={`Token ${t} on ${names.unit(u.id)}`}
                    onClick={() => setAssigned({ ...assigned, [t]: u.id })}
                  >
                    {t}
                  </button>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <button
        type="button"
        className="primary"
        disabled={!complete}
        onClick={() => complete && onSubmit(assigned as TokenAssignment)}
      >
        {complete ? "Lock in tokens" : `Place ${TOKEN_IDS.filter((t) => !assigned[t]).join(", ")}`}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Round and initiative bar

export function RoundBar({ state, names }: { state: GameState; names: Names }) {
  const view = viewFor(state, null);
  const order = state.initiative ?? state.players.filter((p) => !p.eliminated).map((p) => p.id);
  const active = state.active;
  return (
    <div className="panel round-bar" aria-label="Round status">
      <span className="round-label">
        Round {state.round}
        {state.config.roundLimit ? ` of ${state.config.roundLimit}` : ""}
        {active ? `, turn ${active.token}` : ""}
      </span>
      <ol className="initiative">
        {order.map((id) => {
          const p = state.players.find((x) => x.id === id)!;
          const shown = view.tokens[id] ?? {};
          return (
            <li key={id} className={`${active?.player === id ? "active" : ""} ${p.eliminated ? "out" : ""}`}>
              <span className="swatch" style={{ background: p.color }} />
              <span>{names.player(id)}</span>
              <span className="revealed">
                {NUMBERED_TOKENS.map((t) => (
                  <span key={t} className={`mini-token ${shown[t] ? "shown" : ""}`} title={shown[t] ? names.unit(shown[t]!) : "Hidden"}>
                    {t}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dice results

function Die({ face, kind }: { face: DieFace; kind: "attack" | "defense" }) {
  return (
    <span className={`die die-${face} die-${kind}`} title={face}>
      {face === "skull" && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3c-4.4 0-8 3.2-8 7.4 0 2.5 1.3 4.6 3.3 5.9V19c0 .6.4 1 1 1h1.2v-2h1.5v2h2v-2h1.5v2h1.2c.6 0 1-.4 1-1v-2.7c2-1.3 3.3-3.4 3.3-5.9C20 6.2 16.4 3 12 3Zm-3.2 9.6a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Zm6.4 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6Z" />
        </svg>
      )}
      {face === "shield" && (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" />
        </svg>
      )}
    </span>
  );
}

/**
 * Shows the dice from the latest command: attacks, swamp, lava and ice rolls,
 * ability rolls and the initiative roll. It stays up until it is closed or the
 * next command replaces it.
 */
export function DiceOverlay({ events, names, stamp }: { events: readonly GameEvent[]; names: Names; stamp: number }) {
  const rolls = events.filter(
    (e) => e.type === "attackRolled" || e.type === "terrainRoll" || e.type === "abilityRoll" || e.type === "initiativeRolled",
  );
  const [dismissed, setDismissed] = useState<number | null>(null);
  if (rolls.length === 0 || dismissed === stamp) return null;

  return (
    <div className="panel dice-overlay" role="status" aria-label="Dice">
      <button type="button" className="dice-close" aria-label="Close dice" onClick={() => setDismissed(stamp)}>
        ×
      </button>
      {rolls.map((e, i) => {
        if (e.type === "initiativeRolled") {
          return (
            <div key={i} className="roll initiative-roll">
              <div className="roll-title">Initiative</div>
              <div className="initiative-dice">
                {e.rolls.map((r) => (
                  <span key={r.player} className="initiative-entry">
                    <span className="swatch" style={{ background: names.playerColor(r.player) }} />
                    {names.player(r.player)}
                    {r.values.map((v, j) => (
                      <span key={j} className={`d20 ${j < r.values.length - 1 ? "d20-reroll" : ""}`} title={j < r.values.length - 1 ? "Tied: rolled again" : undefined}>
                        {v}
                      </span>
                    ))}
                  </span>
                ))}
              </div>
              <div className="roll-result">
                <strong>{names.player(e.order[0]!)}</strong> goes first
                {e.order.length > 2 ? `, then ${e.order.slice(1).map((p) => names.player(p)).join(", then ")}` : ""}.
              </div>
            </div>
          );
        }
        if (e.type === "abilityRoll") {
          return (
            <div key={i} className="roll">
              <span className="d20">{e.roll}</span>
              <span>
                {names.figure(e.figureId)}: {names.ability(e.figureId, e.ability)}
                {e.targetId !== e.figureId ? ` on ${names.figure(e.targetId)}` : ""}, needs {e.needed}:{" "}
                <strong>{e.success ? "success" : "no effect"}</strong>
              </span>
            </div>
          );
        }
        if (e.type === "terrainRoll") {
          const result = e.outcome === "destroyed" ? "destroyed" : e.outcome === "slipped" ? "slips" : "safe";
          return (
            <div key={i} className="roll">
              <span className="d20">{e.roll}</span>
              <span>
                {names.figure(e.figureId)} on {names.terrain(e.terrain)}: <strong>{result}</strong>
              </span>
            </div>
          );
        }
        if (e.type !== "attackRolled") return null;
        return (
          <div key={i} className="roll">
            <div className="roll-title">
              {e.source === "fall"
                ? `${names.figure(e.targetId)} falls`
                : e.source === "swamp"
                  ? `Swamp vs ${names.figure(e.targetId)}`
                  : e.source === "passingStrike"
                    ? `${names.figure(e.attackerId!)} strikes ${names.figure(e.targetId)} as it leaves`
                    : e.ability
                      ? `${names.figure(e.attackerId!)}: ${names.ability(e.attackerId!, e.ability)} on ${names.figure(e.targetId)}`
                      : `${names.figure(e.attackerId!)} vs ${names.figure(e.targetId)}`}
            </div>
            {e.notes && e.notes.length > 0 && <div className="muted small">{e.notes.join(", ")}</div>}
            <div className="dice-row rolling">
              {e.attack.map((f, j) => (
                <Die key={`a${j}`} face={f} kind="attack" />
              ))}
            </div>
            <div className="dice-row rolling">
              {e.defense.length === 0 ? <span className="muted small">No defense dice</span> : null}
              {e.defense.map((f, j) => (
                <Die key={`d${j}`} face={f} kind="defense" />
              ))}
            </div>
            <div className={`roll-result ${e.wounds > 0 ? "hit" : "miss"}`}>
              {e.hits} hit{e.hits === 1 ? "" : "s"}, {e.blocks} block{e.blocks === 1 ? "" : "s"}:{" "}
              <strong>{e.wounds > 0 ? `${e.wounds} wound${e.wounds === 1 ? "" : "s"}` : "no damage"}</strong>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game log

export function EventLog({ events, names }: { events: readonly GameEvent[]; names: Names }) {
  const lines = useMemo(
    () => events.map((e) => describeEvent(e, names)).filter((l): l is string => l !== null).slice(-80),
    [events, names],
  );
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [lines.length]);
  return (
    <section className="panel event-log" aria-label="Game log">
      <h2>Log</h2>
      <ol className="log-lines">
        {lines.map((l, i) => (
          <li key={i} ref={i === lines.length - 1 ? end : undefined}>
            {l}
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Game over

export function GameOver({
  state,
  names,
  onNewGame,
  onClose,
  onDownload,
}: {
  state: GameState;
  names: Names;
  onNewGame: () => void;
  onClose: () => void;
  /** Offered once the full record of the game is available. */
  onDownload?: () => void;
}) {
  const result = state.result!;
  const winners = result.winners.map((w) => names.player(w));
  const scoreLabel = state.config.mode === "basic" ? "Figures left" : "Points left";
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Game over">
      <div className="panel game-over">
        <h2>{winners.length === 0 ? "Nobody wins" : `${winners.join(" and ")} ${winners.length > 1 ? "share the win" : "wins"}!`}</h2>
        <p className="muted">
          {result.reason === "elimination" ? "Last army standing." : `The round limit was reached after round ${state.round}.`}
        </p>
        <table className="scores">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">{scoreLabel}</th>
            </tr>
          </thead>
          <tbody>
            {state.players.map((p) => (
              <tr key={p.id} className={result.winners.includes(p.id) ? "winner" : ""}>
                <td>
                  <span className="swatch" style={{ background: p.color }} /> {p.name}
                </td>
                <td>{result.scores[p.id]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="actions">
          <button type="button" className="primary" onClick={onNewGame}>
            New game
          </button>
          <button type="button" onClick={onClose}>
            View battlefield
          </button>
          {onDownload && (
            <button type="button" onClick={onDownload}>
              Download replay
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export type { TokenId };
