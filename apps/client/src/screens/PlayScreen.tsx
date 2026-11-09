import {
  attackTargets,
  currentDeployment,
  deploymentSpots,
  moveOptions,
  sameStep,
  stepKey,
  waitingOn,
  type FigurePlacement,
  type MoveOption,
  type Step,
} from "@aoh/rules";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import { Names } from "../describe";
import { BoardScene, boardCenter, type Marker } from "../scene/BoardScene";
import { Figures, type FigureView } from "../scene/Figures";
import { TestHook } from "../scene/TestHook";
import { clearError, dispatch, endSession, type Session } from "../session";
import { DiceOverlay, EventLog, GameOver, PassScreen, RoundBar, TokenPanel } from "../ui/panels";
import { UnitCardView } from "../ui/UnitCardView";

export function PlayScreen({ session }: { session: Session }) {
  const { state, ctx } = session;
  const names = useMemo(() => new Names(state, ctx), [state, ctx]);
  const board = ctx.board;
  const center = useMemo(() => boardCenter(board), [board]);

  const [hoveredFigure, setHoveredFigure] = useState<string | null>(null);
  const [pinnedFigure, setPinnedFigure] = useState<string | null>(null);
  const [hoverStep, setHoverStep] = useState<Step | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Step[]>([]);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);

  // ---- Deployment -------------------------------------------------------
  const deploying = state.phase === "deploy" ? currentDeployment(state) : null;
  const deployUnit = deploying ? state.units.find((u) => u.id === deploying.unitId)! : null;
  const deployCard = deployUnit ? ctx.cards.get(deployUnit.cardId)! : null;
  const deploySpots = useMemo(
    () => (deploying && deployCard ? deploymentSpots(state, deploying.player, deployCard.height, ctx) : []),
    [state, deploying, deployCard, ctx],
  );
  const freeSpots = deploySpots.filter((s) => !pending.some((p) => sameStep(p, s)));
  useEffect(() => setPending([]), [deploying?.unitId]);

  const confirmDeploy = (steps: Step[]) => {
    if (!deploying || !deployUnit) return;
    const placements: FigurePlacement[] = deployUnit.figures.map((f, i) => ({ figureId: f.id, ...steps[i]! }));
    dispatch({ type: "deployUnit", player: deploying.player, unitId: deployUnit.id, placements });
  };
  const autoDeploy = () => {
    if (!deployUnit) return;
    const filled = [...pending, ...freeSpots.slice(0, deployUnit.figures.length - pending.length)];
    setPending(filled);
  };

  // ---- Token placement --------------------------------------------------
  const tokenPlayer =
    state.phase === "placeTokens"
      ? (state.players.filter((p) => waitingOn(state).includes(p.id)).sort((a, b) => a.seat - b.seat)[0]?.id ?? null)
      : null;

  // ---- Turns --------------------------------------------------------------
  const active = state.phase === "turns" ? state.active : null;
  const activeUnit = active ? state.units.find((u) => u.id === active.unitId)! : null;
  // A figure can act until it has attacked (moving first is optional).
  const canAct = (id: string) =>
    !!active &&
    !!activeUnit?.figures.some((f) => f.id === id && !f.destroyed && f.position) &&
    !active.attacked.includes(id);

  // Pick the first figure that can still act when a turn starts or a figure finishes.
  const turnKey = active ? `${state.round}:${active.token}:${active.player}` : "";
  useEffect(() => {
    if (!active || !activeUnit) {
      setSelected(null);
      return;
    }
    if (selected && canAct(selected)) return;
    setSelected(activeUnit.figures.find((f) => canAct(f.id))?.id ?? null);
  }, [turnKey, state]);

  const options = useMemo<Map<string, MoveOption>>(() => {
    if (!active || !selected || active.moved.includes(selected) || active.attacked.includes(selected)) return new Map();
    try {
      return moveOptions(state, selected, ctx);
    } catch {
      return new Map();
    }
  }, [state, ctx, active, selected]);
  const targets = useMemo(() => {
    if (!active || !selected || active.attacked.includes(selected)) return new Set<string>();
    return new Set(attackTargets(state, selected, ctx));
  }, [state, ctx, active, selected]);
  const hoverOption = hoverStep ? options.get(stepKey(hoverStep)) : undefined;

  // Publish a read-only summary of the turn for automated browser tests.
  useEffect(() => {
    const positioned = state.units.flatMap((u) =>
      u.figures.filter((f) => !f.destroyed && f.position).map((f) => ({ unit: u, f, pos: f.position! })),
    );
    window.__aohUi = {
      selected,
      moves: [...options.values()].map((o) => o.to),
      targets: positioned
        .filter((x) => targets.has(x.f.id))
        .map((x) => ({ id: x.f.id, hex: x.pos.hex, elevation: x.pos.elevation, height: ctx.cards.get(x.unit.cardId)!.height })),
      enemies: positioned.filter((x) => active && x.unit.owner !== active.player).map((x) => x.pos),
    };
  }, [state, ctx, selected, options, targets, active]);

  // ---- Board contents ------------------------------------------------------
  const figures: FigureView[] = [];
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId)!;
    const color = names.playerColor(unit.owner);
    for (const f of unit.figures) {
      if (f.destroyed || !f.position) continue;
      let status: FigureView["status"] = "idle";
      if (active && unit.id === active.unitId) {
        status = f.id === selected ? "selected" : canAct(f.id) ? "ready" : "spent";
      } else if (targets.has(f.id)) {
        status = "target";
      }
      figures.push({ id: f.id, position: f.position, height: card.height, color, label: names.tokenLabel(f.id), hero: card.figureCount === 1, status });
    }
  }
  if (deployUnit && deployCard) {
    pending.forEach((step, i) => {
      const f = deployUnit.figures[i]!;
      figures.push({
        id: f.id,
        position: { ...step, rotation: 0 },
        height: deployCard.height,
        color: names.playerColor(deployUnit.owner),
        label: names.tokenLabel(f.id),
        hero: deployCard.figureCount === 1,
        status: "selected",
      });
    });
  }

  const markers: Marker[] = [];
  if (deploying) {
    for (const s of freeSpots) markers.push({ step: s, color: names.playerColor(deploying.player), opacity: 0.4 });
  }
  for (const o of options.values()) markers.push({ step: o.to, color: o.hazards > 0 ? "#ff9800" : "#4caf50", opacity: 0.45 });
  if (hoverOption) for (const s of hoverOption.path) markers.push({ step: s, color: "#ffeb3b", opacity: 0.7 });

  // ---- Interaction -------------------------------------------------------
  const onSurfaceClick = (step: Step) => {
    if (deploying && deployUnit) {
      if (pending.length < deployUnit.figures.length && freeSpots.some((s) => sameStep(s, step))) {
        setPending([...pending, step]);
      }
      return;
    }
    if (active && selected) {
      const option = options.get(stepKey(step));
      if (option) dispatch({ type: "move", player: active.player, figureId: selected, path: option.path });
    }
  };

  const onFigureClick = (id: string) => {
    if (deploying && deployUnit?.figures.some((f) => f.id === id)) {
      const i = deployUnit.figures.findIndex((f) => f.id === id);
      if (i >= 0 && i < pending.length) setPending(pending.filter((_, j) => j !== i));
      return;
    }
    if (active && selected && targets.has(id)) {
      dispatch({ type: "attack", player: active.player, figureId: selected, targetId: id });
      return;
    }
    if (active && activeUnit?.figures.some((f) => f.id === id) && canAct(id)) {
      setSelected(id);
      return;
    }
    setPinnedFigure(pinnedFigure === id ? null : id);
  };

  const cardFigure = hoveredFigure ?? pinnedFigure;
  const cardUnitId = cardFigure?.split("#")[0];
  const cardUnit = cardUnitId ? state.units.find((u) => u.id === cardUnitId) : undefined;

  return (
    <div className="screen play">
      <Canvas
        className="canvas"
        camera={{ position: [-center.span * 0.1, center.span * 0.72, center.span * 0.8], fov: 45 }}
        dpr={[1, 2]}
        onPointerMissed={() => setPinnedFigure(null)}
      >
        <BoardScene
          board={board}
          terrain={ctx.terrain}
          markers={markers}
          onSurfaceClick={onSurfaceClick}
          onSurfaceHover={setHoverStep}
        >
          <Figures figures={figures} onClick={onFigureClick} onHover={setHoveredFigure} />
        </BoardScene>
        <TestHook offset={center} />
      </Canvas>

      {state.phase !== "deploy" && state.round > 0 && <RoundBar state={state} names={names} />}

      <aside className="hud-left">
        {deploying && deployUnit && deployCard && (
          <section className="panel" aria-label="Deployment">
            <h2>Deployment</h2>
            <p className="turn-banner" style={{ borderColor: names.playerColor(deploying.player) }}>
              <span className="swatch" style={{ background: names.playerColor(deploying.player) }} />
              <span>
                <strong>{names.player(deploying.player)}</strong>: place {deployCard.name}
              </span>
            </p>
            <p className="muted small">
              Click highlighted hexes in your start zone. {pending.length} of {deployUnit.figures.length} placed. Click a
              placed figure to pick it up again.
            </p>
            <div className="actions">
              <button type="button" onClick={autoDeploy} disabled={pending.length === deployUnit.figures.length}>
                Auto place
              </button>
              <button type="button" onClick={() => setPending([])} disabled={pending.length === 0}>
                Clear
              </button>
              <button
                type="button"
                className="primary"
                disabled={pending.length !== deployUnit.figures.length}
                onClick={() => confirmDeploy(pending)}
              >
                Confirm
              </button>
            </div>
          </section>
        )}

        {active && activeUnit && (
          <section className="panel" aria-label="Current turn">
            <h2>Turn {active.token}</h2>
            <p className="turn-banner" style={{ borderColor: names.playerColor(active.player) }}>
              <span className="swatch" style={{ background: names.playerColor(active.player) }} />
              <span>
                <strong>{names.player(active.player)}</strong>: {names.unit(activeUnit.id)}
              </span>
            </p>
            <ul className="figure-list">
              {activeUnit.figures
                .filter((f) => !f.destroyed)
                .map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      className={`figure-button ${selected === f.id ? "on" : ""}`}
                      disabled={!canAct(f.id)}
                      onClick={() => setSelected(f.id)}
                    >
                      {names.figure(f.id)}
                      <span className="muted small">
                        {active.attacked.includes(f.id) ? " done" : active.moved.includes(f.id) ? " moved" : ""}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            <p className="muted small">
              {selected
                ? `Green hexes: move there. ${targets.size > 0 ? "Red rings: attack." : "No enemy in range and sight."} Orange hexes cross lava or ice.`
                : "This unit has finished."}
              {hoverOption ? ` Move cost ${hoverOption.cost}.` : ""}
            </p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => dispatch({ type: "endTurn", player: active.player })}>
                End turn
              </button>
            </div>
          </section>
        )}

        {tokenPlayer && revealedFor === tokenPlayer && (
          <TokenPanel
            key={`${state.round}:${tokenPlayer}`}
            state={state}
            player={tokenPlayer}
            names={names}
            onSubmit={(tokens) => {
              setRevealedFor(null);
              dispatch({ type: "placeTokens", player: tokenPlayer, tokens });
            }}
          />
        )}

        <EventLog events={session.events} names={names} />
      </aside>

      <aside className="hud-right">
        {cardUnit && (
          <UnitCardView
            key={cardUnit.id}
            card={ctx.cards.get(cardUnit.cardId)!}
            mode={state.config.mode}
            color={names.playerColor(cardUnit.owner)}
            alive={cardUnit.figures.filter((f) => !f.destroyed).length}
          />
        )}
        <div className="actions menu">
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Quit this game? It cannot be resumed.")) endSession();
            }}
          >
            Quit game
          </button>
        </div>
      </aside>

      {session.error && (
        <div className="toast error" role="alert" onClick={clearError}>
          {session.error}
        </div>
      )}

      <DiceOverlay events={session.lastEvents} names={names} stamp={session.events.length} />

      {tokenPlayer && revealedFor !== tokenPlayer && (
        <PassScreen
          name={names.player(tokenPlayer)}
          color={names.playerColor(tokenPlayer)}
          onReady={() => setRevealedFor(tokenPlayer)}
        />
      )}

      {state.phase === "gameOver" && showResult && (
        <GameOver state={state} names={names} onNewGame={endSession} onClose={() => setShowResult(false)} />
      )}
    </div>
  );
}
