import { contextFor } from "@aoh/content";
import type { Replay } from "@aoh/protocol";
import { applyCommand, createGame, figureSpots, findFigure, statsOf, type GameEvent, type GameState } from "@aoh/rules";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Names } from "../describe";
import { BoardScene, boardCenter } from "../scene/BoardScene";
import { FigureLabels, Figures, type FigureView } from "../scene/Figures";
import { DiceOverlay, EventLog, RoundBar } from "../ui/panels";
import { UnitCardView } from "../ui/UnitCardView";

interface Frame {
  readonly state: GameState;
  /** How many events had happened by this point. */
  readonly eventCount: number;
  /** Events produced by the command that led here. */
  readonly last: readonly GameEvent[];
}

/** Rebuild every position of a finished game from its setup and commands. */
function buildFrames(replay: Replay) {
  const ctx = contextFor(replay.map).ctx;
  const start = createGame(replay.setup, ctx);
  const events: GameEvent[] = [...start.events];
  const frames: Frame[] = [{ state: start.state, eventCount: events.length, last: [] }];
  let state = start.state;
  let error: string | null = null;
  for (const [i, command] of replay.commands.entries()) {
    const result = applyCommand(state, command, ctx);
    if (!result.ok) {
      error = `The replay stops at move ${i + 1}: ${result.error}`;
      break;
    }
    state = result.state;
    events.push(...result.events);
    frames.push({ state, eventCount: events.length, last: result.events });
  }
  return { ctx, frames, events, error };
}

const STEP_MS = 900;

/** Watch a finished game again, move by move, with everything revealed. */
export function ReplayScreen({ replay, onClose }: { replay: Replay; onClose: () => void }) {
  const built = useMemo(() => {
    try {
      return buildFrames(replay);
    } catch (e) {
      return { error: (e as Error).message } as const;
    }
  }, [replay]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const labelLayer = useRef<HTMLDivElement>(null);

  const frames = "frames" in built ? built.frames : [];
  const last = Math.max(0, frames.length - 1);

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setIndex((i) => Math.min(i + 1, last)), STEP_MS);
    return () => window.clearTimeout(t);
  }, [playing, index, last]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type !== "range") return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, last));
      else if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === " ") setPlaying((p) => !p);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [last]);

  const center = useMemo(() => ("ctx" in built ? boardCenter(built.ctx.board) : null), [built]);

  if (!("ctx" in built) || !center) {
    return (
      <div className="screen setup">
        <section className="panel setup-panel" aria-label="Replay">
          <h1>Replay</h1>
          <p className="issues" role="alert">
            {built.error}
          </p>
          <div className="actions">
            <button type="button" onClick={onClose}>
              Back
            </button>
          </div>
        </section>
      </div>
    );
  }

  const { ctx, events } = built;
  const frame = frames[index]!;
  const state = frame.state;
  const mode = state.config.mode;
  const names = new Names(state, ctx);

  const figures: FigureView[] = [];
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId)!;
    const life = statsOf(card, mode).life;
    for (const f of unit.figures) {
      if (f.destroyed || !f.position) continue;
      figures.push({
        id: f.id,
        spots: figureSpots(f, card.footprint, card.height, ctx),
        height: card.height,
        color: names.playerColor(unit.owner),
        label: names.tokenLabel(f.id),
        hero: card.figureCount === 1,
        status: state.active?.unitId === unit.id ? "ready" : "idle",
        ...(mode === "advanced" && life > 1 ? { lifeLeft: life - f.wounds } : {}),
      });
    }
  }

  const shown = hovered ?? pinned;
  const found = shown ? findFigure(state, shown) : undefined;
  const winners = state.result?.winners.map((w) => names.player(w)) ?? [];

  return (
    <div className="screen play replay">
      <Canvas
        className="canvas"
        camera={{ position: [-center.span * 0.1, center.span * 0.72, center.span * 0.8], fov: 45 }}
        dpr={[1, 2]}
        onPointerMissed={() => setPinned(null)}
      >
        <BoardScene board={ctx.board} terrain={ctx.terrain}>
          <Figures figures={figures} onClick={(id) => setPinned(pinned === id ? null : id)} onHover={setHovered} labels={labelLayer} />
        </BoardScene>
      </Canvas>
      <FigureLabels figures={figures} layer={labelLayer} />

      {state.round > 0 && state.phase !== "deploy" && <RoundBar state={state} names={names} />}

      <aside className="hud-left">
        <section className="panel" aria-label="Replay controls">
          <h2>Replay</h2>
          <p className="muted small">
            {replay.map.name}, {mode === "basic" ? "Basic" : "Advanced"} rules,{" "}
            {state.players.map((p) => p.name).join(", ")}.
          </p>
          <input
            type="range"
            className="scrubber"
            min={0}
            max={last}
            value={index}
            aria-label="Move"
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
          />
          <p className="small" aria-live="polite">
            {index === 0 ? "Start of the game" : `Move ${index} of ${last}`}
            {state.phase === "gameOver"
              ? `: ${winners.length === 0 ? "nobody wins" : `${winners.join(" and ")} ${winners.length > 1 ? "share the win" : "wins"}`}`
              : ""}
          </p>
          <div className="actions replay-controls">
            <button type="button" onClick={() => setIndex(0)} disabled={index === 0} aria-label="First move">
              |&lt;
            </button>
            <button type="button" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0} aria-label="Previous move">
              &lt;
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (index >= last) setIndex(0);
                setPlaying(!playing);
              }}
            >
              {playing ? "Pause" : index >= last ? "Play again" : "Play"}
            </button>
            <button type="button" onClick={() => setIndex(Math.min(last, index + 1))} disabled={index >= last} aria-label="Next move">
              &gt;
            </button>
            <button type="button" onClick={() => setIndex(last)} disabled={index >= last} aria-label="Last move">
              &gt;|
            </button>
          </div>
          <p className="muted small">Arrow keys step, space plays and pauses. Every token is shown.</p>
          {built.error && (
            <p className="issues" role="alert">
              {built.error}
            </p>
          )}
        </section>
        <EventLog events={events.slice(0, frame.eventCount)} names={names} />
      </aside>

      <aside className="hud-right">
        {found && (
          <UnitCardView
            key={found.unit.id}
            card={ctx.cards.get(found.unit.cardId)!}
            mode={mode}
            color={names.playerColor(found.unit.owner)}
            alive={found.unit.figures.filter((f) => !f.destroyed).length}
            wounds={found.figure.wounds}
          />
        )}
        <div className="actions menu">
          <button type="button" onClick={onClose}>
            Close replay
          </button>
        </div>
      </aside>

      <DiceOverlay events={frame.last} names={names} stamp={index} />
    </div>
  );
}
