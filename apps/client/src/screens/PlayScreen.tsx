import {
  HIT_BAND_FROM,
  LEVEL_HEIGHT,
  attackTargets,
  currentDeployment,
  deploymentPlacements,
  engagedEnemies,
  eyePoint,
  figureSpots,
  hexToWorld,
  hexDistance,
  moveOptions,
  placementKey,
  sameStep,
  stepKey,
  statsOf,
  waitingOn,
  type FigurePlacement,
  type MoveOption,
  type Placement,
  type Step,
  type Vec3,
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

interface Pending {
  readonly placement: Placement;
  readonly spots: Step[];
}

export function PlayScreen({ session }: { session: Session }) {
  const { state, ctx } = session;
  const mode = state.config.mode;
  const names = useMemo(() => new Names(state, ctx), [state, ctx]);
  const board = ctx.board;
  const center = useMemo(() => boardCenter(board), [board]);

  const [hoveredFigure, setHoveredFigure] = useState<string | null>(null);
  const [pinnedFigure, setPinnedFigure] = useState<string | null>(null);
  const [hoverStep, setHoverStep] = useState<Step | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [rotation, setRotation] = useState(0);
  const [eyeView, setEyeView] = useState(false);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);

  // ---- Deployment -------------------------------------------------------
  const deploying = state.phase === "deploy" ? currentDeployment(state) : null;
  const deployUnit = deploying ? state.units.find((u) => u.id === deploying.unitId)! : null;
  const deployCard = deployUnit ? ctx.cards.get(deployUnit.cardId)! : null;
  const deployBig = deployCard ? deployCard.footprint !== "1" : false;
  const deployOptions = useMemo(
    () =>
      deploying && deployCard
        ? deploymentPlacements(state, deploying.player, deployCard, ctx, pending.flatMap((p) => p.spots))
        : [],
    [state, deploying, deployCard, ctx, pending],
  );
  useEffect(() => setPending([]), [deploying?.unitId]);

  const deployAt = (step: Step) =>
    deployOptions.find((o) => sameStep(o.placement, step) && o.placement.rotation === rotation) ??
    deployOptions.find((o) => sameStep(o.placement, step));

  const confirmDeploy = () => {
    if (!deploying || !deployUnit) return;
    const placements: FigurePlacement[] = deployUnit.figures.map((f, i) => ({ figureId: f.id, ...pending[i]!.placement }));
    dispatch({ type: "deployUnit", player: deploying.player, unitId: deployUnit.id, placements });
  };
  const autoDeploy = () => {
    if (!deployUnit || !deployCard || !deploying) return;
    const filled = [...pending];
    while (filled.length < deployUnit.figures.length) {
      const next = deploymentPlacements(state, deploying.player, deployCard, ctx, filled.flatMap((p) => p.spots))[0];
      if (!next) break;
      filled.push(next);
    }
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
  const activeCard = activeUnit ? ctx.cards.get(activeUnit.cardId)! : null;
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
      setEyeView(false);
      return;
    }
    if (selected && canAct(selected)) return;
    setSelected(activeUnit.figures.find((f) => canAct(f.id))?.id ?? null);
  }, [turnKey, state]);
  useEffect(() => {
    const f = activeUnit?.figures.find((x) => x.id === selected);
    setRotation(f?.position?.rotation ?? 0);
  }, [selected, turnKey]);

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
  const moveBig = activeCard ? activeCard.footprint !== "1" : false;

  /** The move option for a hex: for big figures, prefer the facing chosen with R. */
  const optionAt = (step: Step | null): MoveOption | undefined => {
    if (!step) return undefined;
    if (!moveBig) return options.get(placementKey(step));
    return (
      options.get(placementKey({ ...step, rotation })) ??
      [...options.values()].find((o) => sameStep(o.to, step))
    );
  };
  const hoverOption = optionAt(hoverStep);

  // R turns the figure being deployed or moved.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "r" || e.key === "R") setRotation((r) => (r + (e.shiftKey ? 5 : 1)) % 6);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Spots and engagement ---------------------------------------------
  const spotsOf = (unitId: string, figureId: string): Step[] => {
    const unit = state.units.find((u) => u.id === unitId)!;
    const card = ctx.cards.get(unit.cardId)!;
    const f = unit.figures.find((x) => x.id === figureId)!;
    return figureSpots(f, card.footprint, card.height, ctx);
  };
  const engagedCount = (figureId: string): number => {
    if (mode !== "advanced" || !activeUnit || !activeCard) return 0;
    return engagedEnemies(state, activeUnit.owner, spotsOf(activeUnit.id, figureId), activeCard.height, ctx).length;
  };

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

  // ---- Figure's-eye view -------------------------------------------------
  const eye = useMemo(() => {
    if (!eyeView || !selected || !activeUnit || !activeCard) return null;
    const mySpots = spotsOf(activeUnit.id, selected);
    if (mySpots.length === 0) return null;
    const from = eyePoint({ ...mySpots[0]!, height: activeCard.height });
    // Look at the hovered enemy, else a target, else the nearest enemy.
    const enemies = state.units
      .filter((u) => u.owner !== activeUnit.owner)
      .flatMap((u) => u.figures.filter((f) => !f.destroyed && f.position).map((f) => ({ u, f })));
    const near = (id: string) => enemies.find((x) => x.f.id === id);
    const pick =
      (hoveredFigure ? near(hoveredFigure) : undefined) ??
      [...targets].map(near).find(Boolean) ??
      [...enemies].sort(
        (a, b) => hexDistance(a.f.position!.hex, mySpots[0]!.hex) - hexDistance(b.f.position!.hex, mySpots[0]!.hex),
      )[0];
    let look: Vec3;
    if (pick) {
      const card = ctx.cards.get(pick.u.cardId)!;
      const p = pick.f.position!;
      const { x, z } = hexToWorld(p.hex);
      look = { x, y: (p.elevation + card.height * (HIT_BAND_FROM + 0.2)) * LEVEL_HEIGHT, z };
    } else {
      look = { x: from.x + 1, y: from.y, z: from.z };
    }
    return { eye: from, look };
  }, [eyeView, selected, activeUnit, activeCard, hoveredFigure, targets, state, ctx]);

  // ---- Board contents ------------------------------------------------------
  const figures: FigureView[] = [];
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId)!;
    const color = names.playerColor(unit.owner);
    const life = statsOf(card, mode).life;
    for (const f of unit.figures) {
      if (f.destroyed || !f.position) continue;
      // In eye view the camera is inside the viewer's own token, so leave it out.
      if (eye && f.id === selected) continue;
      let status: FigureView["status"] = "idle";
      if (active && unit.id === active.unitId) {
        status = f.id === selected ? "selected" : canAct(f.id) ? "ready" : "spent";
      } else if (targets.has(f.id)) {
        status = "target";
      }
      figures.push({
        id: f.id,
        spots: figureSpots(f, card.footprint, card.height, ctx),
        height: card.height,
        color,
        label: names.tokenLabel(f.id),
        hero: card.figureCount === 1,
        status,
        ...(mode === "advanced" && life > 1 ? { lifeLeft: life - f.wounds } : {}),
      });
    }
  }
  if (deployUnit && deployCard) {
    pending.forEach((p, i) => {
      const f = deployUnit.figures[i]!;
      figures.push({
        id: f.id,
        spots: p.spots,
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
    const seen = new Set<string>();
    for (const o of deployOptions) {
      const key = stepKey(o.placement);
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ step: o.placement, color: names.playerColor(deploying.player), opacity: 0.4 });
    }
    const preview = hoverStep && deployBig ? deployAt(hoverStep) : undefined;
    if (preview) for (const s of preview.spots) markers.push({ step: s, color: "#ffffff", opacity: 0.6 });
  }
  const originHazards = new Map<string, number>();
  for (const o of options.values()) {
    const key = stepKey(o.to);
    originHazards.set(key, Math.min(originHazards.get(key) ?? Infinity, o.hazards));
  }
  for (const o of options.values()) {
    const key = stepKey(o.to);
    if (!originHazards.has(key)) continue;
    markers.push({ step: o.to, color: originHazards.get(key)! > 0 ? "#ff9800" : "#4caf50", opacity: 0.45 });
    originHazards.delete(key);
  }
  if (hoverOption) {
    for (const s of hoverOption.path) markers.push({ step: s, color: "#ffeb3b", opacity: 0.7 });
    if (moveBig) for (const s of hoverOption.spots) markers.push({ step: s, color: "#ffffff", opacity: 0.6 });
  }

  // ---- Interaction -------------------------------------------------------
  const onSurfaceClick = (step: Step) => {
    if (deploying && deployUnit) {
      if (pending.length >= deployUnit.figures.length) return;
      const option = deployAt(step);
      if (option) {
        setRotation(option.placement.rotation);
        setPending([...pending, option]);
      }
      return;
    }
    if (active && selected) {
      const option = optionAt(step);
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
  const cardFigureState = cardUnit?.figures.find((f) => f.id === cardFigure);

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
          eyeView={eye}
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
              {deployBig ? " This figure covers several hexes: press R to turn it." : ""}
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
                onClick={confirmDeploy}
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
                .map((f) => {
                  const engaged = engagedCount(f.id);
                  return (
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
                        {engaged > 0 && <span className="tag">engaged</span>}
                      </button>
                    </li>
                  );
                })}
            </ul>
            <p className="muted small">
              {selected
                ? `Green hexes: move there. ${targets.size > 0 ? "Red rings: attack." : "No enemy in range and sight."} Orange hexes are risky (lava, ice${mode === "advanced" ? ", falls or passing strikes" : ""}).`
                : "This unit has finished."}
              {moveBig ? " Press R to turn." : ""}
              {hoverOption ? ` Move cost ${hoverOption.cost}.` : ""}
            </p>
            <div className="actions">
              <button type="button" className="primary" onClick={() => dispatch({ type: "endTurn", player: active.player })}>
                End turn
              </button>
              <button
                type="button"
                aria-pressed={eyeView}
                onClick={() => setEyeView(!eyeView)}
                disabled={!selected}
                title="See the battlefield from the selected figure's eyes"
              >
                {eyeView ? "Exit eye view" : "Eye view"}
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
            mode={mode}
            color={names.playerColor(cardUnit.owner)}
            alive={cardUnit.figures.filter((f) => !f.destroyed).length}
            wounds={cardFigureState?.wounds}
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
