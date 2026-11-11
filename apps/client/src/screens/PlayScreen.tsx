import {
  HIT_BAND_FROM,
  LEVEL_HEIGHT,
  attackTargets,
  currentDeployment,
  deploymentPlacements,
  engagedEnemies,
  eyePoint,
  figureSpots,
  findFigure,
  specialActions,
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
import { useEffect, useMemo, useRef, useState } from "react";
import { Names } from "../describe";
import { BoardScene, boardCenter, type Marker } from "../scene/BoardScene";
import { FigureLabels, Figures, type FigureView } from "../scene/Figures";
import { TestHook } from "../scene/TestHook";
import { closeOnline } from "../online";
import { downloadGameFile } from "../saves";
import { canControl, clearError, dispatch, endSession, replayOf, type Session } from "../session";
import { GameMenu } from "../ui/GameMenu";
import { OnlineBar } from "../ui/OnlineBar";
import { DiceOverlay, EventLog, GameOver, PassScreen, RoundBar, TokenPanel } from "../ui/panels";
import { UnitCardView } from "../ui/UnitCardView";

interface Pending {
  readonly placement: Placement;
  readonly spots: Step[];
}

const CARD_KEY = "age-of-heroes:show-card:v1";

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Storage unavailable: the choice just lasts for this visit.
  }
}

export function PlayScreen({ session }: { session: Session }) {
  const { state, ctx } = session;
  const isOnline = session.kind === "online";
  /** Online: waiting for the server to answer the last command, so nothing else may be sent. */
  const busy = session.pending;
  const mode = state.config.mode;
  const names = useMemo(() => new Names(state, ctx), [state, ctx]);
  const board = ctx.board;
  const center = useMemo(() => boardCenter(board), [board]);

  const [hoveredFigure, setHoveredFigure] = useState<string | null>(null);
  const [pinnedFigure, setPinnedFigure] = useState<string | null>(null);
  const [hoverStep, setHoverStep] = useState<Step | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Placements chosen so far, tied to the unit being deployed so a new unit never sees the last one's.
  const [pendingState, setPendingState] = useState<{ unitId: string | null; items: Pending[] }>({
    unitId: null,
    items: [],
  });
  const [rotation, setRotation] = useState(0);
  const [eyeView, setEyeView] = useState(false);
  /** Which action an attack click uses: null for a normal attack, or a special action's id. */
  const [attackMode, setAttackMode] = useState<string | null>(null);
  const [revealedFor, setRevealedFor] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);
  /** Keep the selected figure's unit card on screen (a viewer preference, kept in the browser). */
  const [showCard, setShowCard] = useState(() => readFlag(CARD_KEY, true));
  const toggleCard = () =>
    setShowCard((v) => {
      writeFlag(CARD_KEY, !v);
      return !v;
    });
  const labelLayer = useRef<HTMLDivElement>(null);

  // ---- Deployment -------------------------------------------------------
  const nextDeployment = state.phase === "deploy" ? currentDeployment(state) : null;
  // Online, only the deploying player's device places figures; everyone else waits.
  const deploying = nextDeployment && canControl(session, nextDeployment.player) ? nextDeployment : null;
  const deployUnit = deploying ? state.units.find((u) => u.id === deploying.unitId)! : null;
  const deployCard = deployUnit ? ctx.cards.get(deployUnit.cardId)! : null;
  const deployBig = deployCard ? deployCard.footprint !== "1" : false;
  const pending = deploying && pendingState.unitId === deploying.unitId ? pendingState.items : [];
  const setPending = (items: Pending[]) => setPendingState({ unitId: deploying?.unitId ?? null, items });
  const deployOptions = useMemo(
    () =>
      deploying && deployCard
        ? deploymentPlacements(state, deploying.player, deployCard, ctx, pending.flatMap((p) => p.spots))
        : [],
    [state, deploying, deployCard, ctx, pending],
  );

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
  const tokenWaiting =
    state.phase === "placeTokens"
      ? state.players.filter((p) => waitingOn(state).includes(p.id)).sort((a, b) => a.seat - b.seat)
      : [];
  const tokenPlayer = tokenWaiting.find((p) => canControl(session, p.id))?.id ?? null;
  // Online there is nobody to hide the tokens from: each device only ever sees its own.
  const tokenPanelOpen = tokenPlayer !== null && !busy && (isOnline || revealedFor === tokenPlayer);

  // ---- Turns --------------------------------------------------------------
  const active = state.phase === "turns" ? state.active : null;
  const activeUnit = active ? state.units.find((u) => u.id === active.unitId)! : null;
  const activeCard = activeUnit ? ctx.cards.get(activeUnit.cardId)! : null;
  const myTurn = canControl(session, active?.player);
  // A figure can act until it has attacked (moving first is optional); Smoke Step allows a move after.
  const mayAct = (id: string) =>
    !!active &&
    !!activeUnit?.figures.some((f) => f.id === id && !f.destroyed && f.position) &&
    (!active.attacked.includes(id) || (active.bonusMoves[id] ?? 0) > 0);
  /** Can this device pick the figure to act with? */
  const canAct = (id: string) => myTurn && mayAct(id);

  // Pick the first figure that can still act when a turn starts or a figure finishes.
  const turnKey = active ? `${state.round}:${active.token}:${active.player}` : "";
  // Eye view belongs to one figure's turn; a new turn (or the end of the round) starts outside it.
  useEffect(() => setEyeView(false), [turnKey]);
  useEffect(() => {
    if (!active || !activeUnit) {
      setSelected(null);
      setEyeView(false);
      return;
    }
    if (selected && canAct(selected)) return;
    setSelected(activeUnit.figures.find((f) => canAct(f.id))?.id ?? null);
  }, [turnKey, state]);
  // Squads: after a figure moves or attacks, move the selection on to the next figure that can act.
  useEffect(() => {
    if (!active || !activeUnit || !myTurn || activeUnit.figures.length < 2) return;
    const ids = new Set(activeUnit.figures.map((f) => f.id));
    let actor: { id: string; attacked: boolean } | null = null;
    for (const e of session.lastEvents) {
      if (e.type === "figureMoved" && ids.has(e.figureId)) actor = { id: e.figureId, attacked: false };
      if (e.type === "attackRolled" && e.source === "attack" && e.attackerId && ids.has(e.attackerId)) {
        actor = { id: e.attackerId, attacked: true };
      }
      if (e.type === "abilityRoll" && ids.has(e.figureId) && e.figureId !== e.targetId) actor = { id: e.figureId, attacked: true };
    }
    if (!actor) return;
    // A figure that may still move after attacking (Smoke Step) keeps the selection for that move.
    if (actor.attacked && (active.bonusMoves[actor.id] ?? 0) > 0 && mayAct(actor.id)) return setSelected(actor.id);
    const living = activeUnit.figures.filter((f) => !f.destroyed && f.position).map((f) => f.id);
    const start = living.indexOf(actor.id);
    const after = [...living.slice(start + 1), ...living.slice(0, Math.max(start, 0))];
    const fresh = after.find((id) => canAct(id) && !active.moved.includes(id) && !active.attacked.includes(id));
    const next = fresh ?? after.find((id) => canAct(id)) ?? (canAct(actor.id) ? actor.id : null);
    if (next) setSelected(next);
  }, [session.lastEvents]);
  useEffect(() => {
    const f = activeUnit?.figures.find((x) => x.id === selected);
    setRotation(f?.position?.rotation ?? 0);
    setAttackMode(null);
  }, [selected, turnKey]);
  const specials = activeCard ? specialActions(state, activeCard) : [];

  const options = useMemo<Map<string, MoveOption>>(() => {
    if (!active || !selected) return new Map();
    const bonus = active.attacked.includes(selected) && (active.bonusMoves[selected] ?? 0) > 0;
    if (!bonus && (active.moved.includes(selected) || active.attacked.includes(selected))) return new Map();
    try {
      return moveOptions(state, selected, ctx);
    } catch {
      return new Map();
    }
  }, [state, ctx, active, selected]);
  const targets = useMemo(() => {
    if (!active || !selected || active.attacked.includes(selected)) return new Set<string>();
    return new Set(attackTargets(state, selected, ctx, attackMode ?? undefined));
  }, [state, ctx, active, selected, attackMode]);
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

  // Keys: R turns a big figure, 1-4 pick a squad figure, E toggles eye view, C the unit card,
  // Space ends the turn. WASD pans the map (in BoardScene).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector(".page-overlay, .pass-screen")) return; // a dialog is open
    const key = e.key.toLowerCase();
    if (key === "r") {
      setRotation((r) => (r + (e.shiftKey ? 5 : 1)) % 6);
    } else if (key === "c") {
      toggleCard();
    } else if (key === "e" && active && myTurn && (selected || eyeView)) {
      setEyeView(!eyeView);
    } else if (/^[1-4]$/.test(key) && active && activeUnit && myTurn) {
      const figure = activeUnit.figures.filter((f) => !f.destroyed)[Number(key) - 1];
      if (figure && canAct(figure.id)) setSelected(figure.id);
    } else if (key === " " && active && myTurn && !busy) {
      e.preventDefault();
      // A focused button would also take the Space press as a click.
      if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
      // Eye view has to close before a turn ends: the first press closes it.
      if (eyeView) setEyeView(false);
      else dispatch({ type: "endTurn", player: active.player });
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Spots and engagement ---------------------------------------------
  const spotsOf = (unitId: string, figureId: string): Step[] => {
    const unit = state.units.find((u) => u.id === unitId);
    const f = unit?.figures.find((x) => x.id === figureId);
    if (!unit || !f) return [];
    const card = ctx.cards.get(unit.cardId)!;
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
    // Look at the clicked (pinned) enemy, else a target, else the nearest enemy. Not the hovered one:
    // turning toward it moves it out from under the pointer, and the camera swings back and forth.
    const enemies = state.units
      .filter((u) => u.owner !== activeUnit.owner)
      .flatMap((u) => u.figures.filter((f) => !f.destroyed && f.position).map((f) => ({ u, f })));
    const near = (id: string) => enemies.find((x) => x.f.id === id);
    const pick =
      (pinnedFigure ? near(pinnedFigure) : undefined) ??
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
  }, [eyeView, selected, activeUnit, activeCard, pinnedFigure, targets, state, ctx]);

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
        status = f.id === selected ? "selected" : mayAct(f.id) ? "ready" : "spent";
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
        ...(status === "selected" ? { arrow: true } : {}),
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
    if (busy) return;
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
    if (busy) return;
    if (deploying && deployUnit?.figures.some((f) => f.id === id)) {
      const i = deployUnit.figures.findIndex((f) => f.id === id);
      if (i >= 0 && i < pending.length) setPending(pending.filter((_, j) => j !== i));
      return;
    }
    if (active && selected && targets.has(id)) {
      dispatch({
        type: "attack",
        player: active.player,
        figureId: selected,
        targetId: id,
        ...(attackMode ? { ability: attackMode } : {}),
      });
      return;
    }
    if (active && activeUnit?.figures.some((f) => f.id === id) && canAct(id)) {
      setSelected(id);
      return;
    }
    setPinnedFigure(pinnedFigure === id ? null : id);
  };

  const replay = state.phase === "gameOver" ? replayOf(session) : null;

  const ownFigure = selected ?? (deployUnit ? deployUnit.figures[0]?.id : null) ?? null;
  const cardFigure = hoveredFigure ?? pinnedFigure ?? (showCard ? ownFigure : null);
  const found = cardFigure ? findFigure(state, cardFigure) : undefined;
  const cardUnit = found?.unit;
  const cardFigureState = found?.figure;

  return (
    <div className="screen play" data-pending={busy ? "true" : undefined}>
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
          <Figures figures={figures} onClick={onFigureClick} onHover={setHoveredFigure} labels={labelLayer} />
        </BoardScene>
        <TestHook offset={center} />
      </Canvas>
      <FigureLabels figures={figures} layer={labelLayer} />

      {state.phase !== "deploy" && state.round > 0 && <RoundBar state={state} names={names} />}
      <OnlineBar session={session} />

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
                disabled={pending.length !== deployUnit.figures.length || busy}
                onClick={confirmDeploy}
              >
                Confirm
              </button>
            </div>
          </section>
        )}

        {nextDeployment && !deploying && (
          <section className="panel" aria-label="Deployment">
            <h2>Deployment</h2>
            <p className="turn-banner" style={{ borderColor: names.playerColor(nextDeployment.player) }}>
              <span className="swatch" style={{ background: names.playerColor(nextDeployment.player) }} />
              <span>
                Waiting for <strong>{names.player(nextDeployment.player)}</strong> to place{" "}
                {names.unit(nextDeployment.unitId)}
              </span>
            </p>
          </section>
        )}

        {state.phase === "placeTokens" && !tokenPanelOpen && tokenWaiting.length > 0 && isOnline && (
          <section className="panel" aria-label="Activation tokens">
            <h2>Activation tokens</h2>
            <p className="muted small">
              Waiting for {tokenWaiting.map((p) => names.player(p.id)).join(", ")} to place their tokens in secret.
            </p>
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
                          {active.attacked.includes(f.id)
                            ? (active.bonusMoves[f.id] ?? 0) > 0
                              ? " may still move"
                              : " done"
                            : active.moved.includes(f.id)
                              ? " moved"
                              : ""}
                        </span>
                        {engaged > 0 && <span className="tag">engaged</span>}
                      </button>
                    </li>
                  );
                })}
            </ul>
            {specials.length > 0 && selected && !active.attacked.includes(selected) && (
              <div className="segmented action-modes" role="radiogroup" aria-label="Attack with">
                {[{ id: null as string | null, name: "Attack" }, ...specials].map((a) => (
                  <button
                    key={a.id ?? "attack"}
                    type="button"
                    role="radio"
                    aria-checked={attackMode === a.id}
                    className={attackMode === a.id ? "on" : ""}
                    onClick={() => setAttackMode(a.id)}
                  >
                    {a.name}
                  </button>
                ))}
              </div>
            )}
            <p className="muted small">
              {!myTurn
                ? `Waiting for ${names.player(active.player)} to play this turn.`
                : selected
                ? `Green hexes: move there. ${targets.size > 0 ? "Red rings: attack." : "No enemy in range and sight."} Orange hexes are risky (lava, ice${mode === "advanced" ? ", falls or passing strikes" : ""}).`
                : "This unit has finished."}
              {moveBig ? " Press R to turn." : ""}
              {myTurn ? ` Keys: ${activeUnit.figures.length > 1 ? "1-4 pick a figure, " : ""}E eye view, Space ends the turn, WASD moves the map.` : ""}
              {hoverOption ? ` Move cost ${hoverOption.cost}.` : ""}
              {eyeView && myTurn ? " Drag or use the arrow keys to look around. Clicking an enemy faces it (a red-ringed one is attacked). Exit eye view to end the turn." : ""}
            </p>
            <div className="actions">
              {myTurn && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy || eyeView}
                  title={eyeView ? "Exit eye view before ending the turn" : undefined}
                  onClick={() => dispatch({ type: "endTurn", player: active.player })}
                >
                  End turn
                </button>
              )}
              {myTurn && (
                <button
                  type="button"
                  aria-pressed={eyeView}
                  onClick={() => setEyeView(!eyeView)}
                  disabled={!selected && !eyeView}
                  title="See the battlefield from the selected figure's eyes"
                >
                  {eyeView ? "Exit eye view" : "Eye view"}
                </button>
              )}
            </div>
          </section>
        )}

        {tokenPlayer && tokenPanelOpen && (
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
        {ownFigure && (
          <button type="button" className="card-toggle" aria-pressed={showCard} onClick={toggleCard} title="Show or hide the selected unit's card (C)">
            {showCard ? "Hide unit card" : "Show unit card"}
          </button>
        )}
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
        <GameMenu session={session} />
      </aside>

      {session.error && (
        <div className="toast error" role="alert" onClick={clearError}>
          {session.error}
        </div>
      )}

      <DiceOverlay events={session.lastEvents} names={names} stamp={session.events.length} />

      {tokenPlayer && !tokenPanelOpen && (
        <PassScreen
          name={names.player(tokenPlayer)}
          color={names.playerColor(tokenPlayer)}
          onReady={() => setRevealedFor(tokenPlayer)}
        />
      )}

      {state.phase === "gameOver" && showResult && (
        <GameOver
          state={state}
          names={names}
          onNewGame={isOnline ? closeOnline : endSession}
          onClose={() => setShowResult(false)}
          onDownload={replay ? () => downloadGameFile(replay, `replay ${session.map.name}`) : undefined}
        />
      )}
    </div>
  );
}
