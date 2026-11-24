import {
  HIT_BAND_FROM,
  HEX_SIZE,
  LEVEL_HEIGHT,
  areaAttackOf,
  attackProblem,
  breathLine,
  callUnits,
  carryFriends,
  carrySpots,
  hurlSpots,
  raiseUnits,
  attackTargets,
  blastSpots,
  centreOf,
  currentDeployment,
  deploymentPlacements,
  endFacing,
  summonOptions,
  lostFigures,
  faceProblem,
  engagedEnemies,
  eyePoint,
  figureSpots,
  findFigure,
  specialActions,
  hexToWorld,
  DIRECTIONS,
  hexDistance,
  moveOptions,
  placementKey,
  sameStep,
  stepKey,
  statsOf,
  waitingOn,
  type FigurePlacement,
  type GameEvent,
  type MoveOption,
  type Placement,
  type Step,
  type Vec3,
} from "@aoh/rules";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Names } from "../describe";
import { BoardScene, boardCenter, type CameraFocusRequest, type Marker } from "../scene/BoardScene";
import { FigureLabels, Figures, SHAKE_SECONDS, type FigureCarry, type FigureJump, type FigureMotions, type FigurePreview, type FigureShake, type FigureView } from "../scene/Figures";
import { ATTACK_RED, FightIntro, WoundNumbers, anchorOf, type FigureAnchor, type WoundNumber } from "../scene/FightFx";
import { attackRollsIn, fallenSpots, fightIn, woundMarksIn, type WoundMark } from "../fight";
import { GamingTable, TableCards, tableRoom } from "../scene/Table";
import { tableFor, tableKey, tableUnits } from "../scene/tableData";
import { TestHook } from "../scene/TestHook";
import { closeOnline, sendWatched, useOnline } from "../online";
import { PingInput, Pings, useOnlinePings } from "../scene/Pings";
import { canControl, clearError, dispatch, endSession, type Session } from "../session";
import { DisplayMenu } from "../ui/DisplayMenu";
import { useBattleMusic } from "../music";
import { playSound } from "../sfx";
import { landingSound } from "../soundEffects";
import { toggleFigures, toggleTiles, useDisplay } from "../settings";
import { GameMenu } from "../ui/GameMenu";
import { HexTip, useHexTip, zoneOwners } from "../ui/HexTip";
import { OnlineBar } from "../ui/OnlineBar";
import { DiceOverlay, EventLog, GameOver, HotKeys, PassScreen, RoundBar, TokenPanel } from "../ui/panels";
import { Drawer, Hint, Pills, Ribbon, type Pill } from "../ui/Ledger";
import { AttackShow, InitiativeShow, attackTitle, initiativeIn } from "../ui/RollShow";
import { UnitCardView } from "../ui/UnitCardView";
import { GlyphPanel } from "../ui/GlyphPanel";
import { GlyphPickups, GlyphTiles, type GlyphPickup } from "../scene/Glyphs";

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

/** How long the pointer rests on a figure before its card shows, and how long the card stays after it leaves. */
const HOVER_DELAY_MS = 500;
const HOVER_GRACE_MS = 150;

/**
 * The figure whose card to show for the pointer: it changes only after the
 * pointer has rested on a figure for HOVER_DELAY_MS, and clears shortly after
 * it leaves. Passing between a figure's parts (or its label) does not flicker.
 */
function useDelayedHover(): [string | null, (id: string | null) => void] {
  const [shown, setShown] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  const aim = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = (id: string | null) => {
    shownRef.current = id;
    setShown(id);
  };
  const onHover = useCallback((id: string | null) => {
    if (id === aim.current) return;
    aim.current = id;
    window.clearTimeout(timer.current);
    if (id === shownRef.current) return;
    timer.current = window.setTimeout(() => show(id), id === null ? HOVER_GRACE_MS : HOVER_DELAY_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [shown, onHover];
}

/** The view the camera glides to when it follows the acting figure: from the south, looking down at about 50 degrees. */
const FOLLOW_FRAME = { from: { x: 0, y: 1, z: 0.85 }, distance: 18 } as const;
/** The closest the camera frames a fight for the attack scene. */
const FIGHT_DISTANCE = 15;
/** How long the attack intro (auras, arrow, icon) plays before the dice roll. */
const INTRO_MS = 2000;
/**
 * Online, the player whose turn it is waits for everyone to finish watching an attack; but no
 * longer than this after their own show has ended, so a player who has gone quiet cannot stall the game.
 */
const HOLD_LIMIT_MS = 20000;

/** An attack being shown: its intro on the board, then (with Dice rolls on) the dice. */
interface Beat {
  /** The event count once the attack happened; online, this names the show for every screen. */
  readonly stamp: number;
  readonly events: readonly GameEvent[];
  readonly part: "intro" | "dice";
  /** Online: this player has clicked to skip, and waits for the others to. */
  readonly skipped: boolean;
}

/** A figure destroyed by a recent command, still drawn where it fell until it has shaken. */
interface Ghost {
  readonly stamp: number;
  readonly id: string;
  readonly spots: readonly Step[];
}

/** One command's wounds, floating up once its show is over. */
interface Batch {
  readonly stamp: number;
  readonly marks: readonly WoundMark[];
}

export function PlayScreen({ session }: { session: Session }) {
  const { state, ctx } = session;
  const isOnline = session.kind === "online";
  /** Online: this device's player (null for a spectator); locally null. */
  const me = isOnline ? session.me : null;

  // ---- Attacks are shown before play goes on ----
  const [beat, setBeat] = useState<Beat | null>(null);
  const beatRef = useRef(beat);
  beatRef.current = beat;
  // The battle music comes in with an attack and stays a while after it.
  useBattleMusic(beat !== null);
  const online = useOnline();
  const watching = isOnline ? online.watching : null;
  /** The show whose wait has run out (HOLD_LIMIT_MS). */
  const [holdLapsed, setHoldLapsed] = useState(-1);
  /** Online: the other players still watching the attack that was the last thing to happen. */
  const othersWatching =
    watching && watching.show === session.events.length && holdLapsed !== watching.show ? watching.waiting.filter((p) => p !== me) : [];
  /**
   * Nothing else may be sent: online, the server has not answered the last command yet, or an attack
   * is still being shown, here or on another player's screen.
   */
  const busy = session.pending || beat !== null || othersWatching.length > 0;
  const names = useMemo(() => new Names(state, ctx), [state, ctx]);
  const board = ctx.board;
  const center = useMemo(() => boardCenter(board), [board]);

  const [hoveredFigure, hoverFigure] = useDelayedHover();
  /** The figure the camera last glided to (or a fight, between it and `with`); a new key starts a glide. */
  const [follow, setFollow] = useState<{ id: string; key: number; with?: string } | null>(null);
  const followFigure = (id: string | null | undefined) => {
    if (id) setFollow((f) => ({ id, key: (f?.key ?? 0) + 1 }));
  };
  /** A squad's next figure to follow once the attack scene closes: the scene shows the fight first. */
  const pendingFollow = useRef<string | null>(null);
  const [pinnedFigure, setPinnedFigure] = useState<string | null>(null);
  const [hoverStep, setHoverStep] = useState<Step | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Placements chosen so far, tied to the unit being deployed so a new unit never sees the last one's.
  const [pendingState, setPendingState] = useState<{ unitId: string | null; items: Pending[] }>({
    unitId: null,
    items: [],
  });
  const [rotation, setRotation] = useState(0);
  /** The way a big figure should face at the end of its move, picked with R (its rotation), or null for the natural one. */
  const [endRotation, setEndRotation] = useState<number | null>(null);
  /** A Glyph of Resurrection being used: the unit coming back and the spots chosen so far. */
  const [resurrect, setResurrect] = useState<{ glyphId: string; unitId: string; items: Pending[] } | null>(null);
  const [eyeView, setEyeView] = useState(false);
  /** Which action an attack click uses: null for a normal attack, or a special action's id. */
  const [attackMode, setAttackMode] = useState<string | null>(null);
  /** A blast at a figure covering several hexes waits here while the player picks the hex to aim at. */
  const [aiming, setAiming] = useState<string | null>(null);
  /** Hurl: the enemy picked up, while the player picks where to throw it. */
  const [throwing, setThrowing] = useState<string | null>(null);
  /** Wings of Refuge: the friend the chosen flyer will carry on its next flight, if any. */
  const [carryId, setCarryId] = useState<string | null>(null);
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
  const display = useDisplay();
  /** The figure the pointer is dragging to a new hex; `dropped` once it has been let go there. */
  const [drag, setDrag] = useState<{ id: string; dropped: Step | null } | null>(null);
  /** The figures jumping on the spot so they can be found (the H key). */
  const [jump, setJump] = useState<FigureJump | null>(null);

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
  /** A figure of the acting unit that may be turned now (games with facing): before or after it moves, until it attacks. */
  const canTurn = (id: string) => !!state.config.facing && !!active && faceProblem(state, active.player, id, 0, ctx) === null;
  /**
   * The figure R turns: the chosen one if it may turn, else the last of the unit's figures to move
   * that may still turn (a squad hands the choice on to its next figure after each move).
   */
  const turning = (): string | null => {
    // While a resurrected unit is being placed, R turns the figure being placed instead.
    if (!active || !myTurn || resurrect) return null;
    if (selected && canTurn(selected)) return selected;
    return [...(active.turnable ?? [])].reverse().find((id) => canTurn(id) && findFigure(state, id)?.figure.position) ?? null;
  };
  const turner = turning();
  const mayAct = (id: string) =>
    !!active &&
    !!activeUnit?.figures.some((f) => f.id === id && !f.destroyed && f.position) &&
    (!active.attacked.includes(id) || (active.bonusMoves[id] ?? 0) > 0 || extraAttacks(id) > 0);
  /** Normal attacks a figure may still make after its first this turn (Blood Surge, Second Arrow, Twin Cannons). */
  function extraAttacks(id: string): number {
    return active?.extraAttacks?.[id] ?? 0;
  }
  /** Can this device pick the figure to act with? */
  const canAct = (id: string) => myTurn && mayAct(id);
  /** A figure of the acting unit that has moved, not attacked, and has movement left for another piece. */
  const canMoveOn = (id: string): boolean => {
    if (!active || !active.moved.includes(id) || active.attacked.includes(id)) return false;
    try {
      return moveOptions(state, id, ctx).size > 0;
    } catch {
      return false;
    }
  };

  // ---- Glyphs picked up: the tile lifts off and shows its face (`GlyphPickups`) ----
  /** Players whose held glyphs this device shows face up: online its own, on one device the player whose turn it is. */
  const glyphsShown = isOnline ? (me ? [me] : []) : active && myTurn ? [active.player] : [];
  /** The Glyphs tab: shown while the game has glyphs on the board, held or in play; its badge counts the viewer's own. */
  const glyphsInPlay =
    !!state.glyphs &&
    (state.glyphs.onBoard.length > 0 || Object.values(state.glyphs.held).some((h) => h.length > 0) || state.glyphs.boosts.length > 0 || state.glyphs.curses.length > 0);
  const glyphsHeld = glyphsShown.reduce((n, p) => n + (state.glyphs?.held[p]?.length ?? 0), 0);
  const [pickups, setPickups] = useState<(GlyphPickup & { glyphId: string })[]>([]);
  /** Where each glyph on the board lay before the latest command, to lift it from there. */
  const glyphSpots = useRef(new Map<string, Step>());
  useEffect(() => {
    const taken = session.lastEvents.flatMap((e) => (e.type === "glyphTaken" ? [e] : []));
    if (taken.length === 0) return;
    const fresh = taken.flatMap((e) => {
      const spot = glyphSpots.current.get(e.glyphId) ?? findFigure(state, e.figureId)?.figure.position;
      if (!spot) return [];
      const found = findFigure(state, e.figureId);
      const height = found ? (ctx.cards.get(found.unit.cardId)?.height ?? 5) : 5;
      // A trap shows itself to everyone; a glyph kept is known to its holder only.
      const held = state.glyphs?.held[e.player]?.find((h) => h.id === e.glyphId)?.kind ?? null;
      // Picked up as a turn ends (`glyphPickup: "turnEnd"`), on one device the turn has already passed
      // on: the player who ended it is still at the screen, so it shows its face to them.
      const endedHere = !isOnline && session.lastEvents.some((x) => x.type === "turnEnded" && x.player === e.player);
      const kind = e.trap ?? (glyphsShown.includes(e.player) || endedHere ? held : null);
      return [{ key: `${session.events.length}:${e.glyphId}`, glyphId: e.glyphId, hex: spot.hex, elevation: spot.elevation, kind, lift: height * LEVEL_HEIGHT + 2.5 * HEX_SIZE }];
    });
    setPickups((list) => [...list, ...fresh]);
  }, [session.lastEvents]);
  // After the pickups above have read it, so it still held the glyphs as they were.
  useEffect(() => {
    glyphSpots.current = new Map((state.glyphs?.onBoard ?? []).map((g) => [g.id, { hex: g.hex, elevation: g.elevation }]));
  }, [state]);

  /** A figure of the acting unit that has not attacked and has a target, now or once turned to face it. */
  const canAttack = (id: string): boolean => {
    if (!active || !activeCard) return false;
    if (active.attacked.includes(id)) {
      if (extraAttacks(id) === 0) return false;
      try {
        return attackTargets(state, id, ctx).length > 0;
      } catch {
        return false;
      }
    }
    // With facing, a figure that may still turn can face any target in range and sight.
    const sight = state.config.facing && canTurn(id) ? { ...state, config: { ...state.config, facing: false } } : state;
    const modes = [undefined, ...specialActions(activeCard).map((sp) => sp.id)];
    try {
      return modes.some((mode) => attackTargets(sight, id, ctx, mode).length > 0);
    } catch {
      return false;
    }
  };

  // Pick the first figure that can still act when a turn starts or a figure finishes.
  const turnKey = active ? `${state.round}:${active.token}:${active.player}` : "";
  // Eye view belongs to one figure's turn; a new turn (or the end of the round) starts outside it.
  useEffect(() => setEyeView(false), [turnKey]);
  // A resurrection being placed belongs to this turn, and ends once its glyph has been used.
  useEffect(() => setResurrect(null), [turnKey]);
  const resurrectUnit =
    resurrect && active && myTurn && state.glyphs?.held[active.player]?.some((h) => h.id === resurrect.glyphId)
      ? (state.units.find((u) => u.id === resurrect.unitId && u.figures.some((f) => f.destroyed)) ?? null)
      : null;
  const resurrecting = resurrectUnit ? resurrect : null;
  /** The figures coming back: all of a destroyed unit, or those a squad still standing has lost. */
  const resurrectFigures = resurrectUnit ? lostFigures(resurrectUnit) : [];
  const resurrectCard = resurrectUnit ? ctx.cards.get(resurrectUnit.cardId)! : null;
  const resurrectBig = resurrectCard ? resurrectCard.footprint !== "1" : false;
  const resurrectOptions = useMemo(
    () => (resurrecting && active ? summonOptions(state, active.player, resurrecting.unitId, ctx, resurrecting.items.flatMap((p) => p.spots)) : []),
    [state, ctx, active, resurrecting],
  );
  const resurrectAt = (step: Step) =>
    resurrectOptions.find((o) => sameStep(o.placement, step) && o.placement.rotation === rotation) ??
    resurrectOptions.find((o) => sameStep(o.placement, step));
  const setResurrectItems = (items: Pending[]) => setResurrect((r) => (r ? { ...r, items } : r));
  const autoResurrect = () => {
    if (!resurrecting || !resurrectUnit || !active) return;
    const filled = [...resurrecting.items];
    while (filled.length < resurrectFigures.length) {
      const next = summonOptions(state, active.player, resurrectUnit.id, ctx, filled.flatMap((p) => p.spots))[0];
      if (!next) break;
      filled.push(next);
    }
    setResurrectItems(filled);
  };
  const confirmResurrect = () => {
    if (!resurrecting || !resurrectUnit || !active || !resurrectCard) return;
    const placements: FigurePlacement[] = resurrectFigures.map((f, i) => {
      const { hex, elevation, rotation: turn } = resurrecting.items[i]!.placement;
      return resurrectBig ? { figureId: f.id, hex, elevation, rotation: turn } : { figureId: f.id, hex, elevation };
    });
    setResurrect(null);
    dispatch({ type: "useGlyph", player: active.player, glyphId: resurrecting.glyphId, unitId: resurrectUnit.id, placements });
  };
  // A new turn brings the camera to the unit that acts and shows its card, on every player's turn.
  useEffect(() => {
    if (!active || !activeUnit) return;
    const living = activeUnit.figures.filter((f) => !f.destroyed && f.position);
    const first = (living.find((f) => canAct(f.id)) ?? living[0])?.id;
    // The turn starts with this figure chosen, so the arrow and the camera agree.
    if (first && canAct(first)) setSelected(first);
    pendingFollow.current = null;
    followFigure(first);
    setShowCard(true);
  }, [turnKey]);
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
    // A move may be made in pieces: a figure with movement left keeps the selection for the next piece,
    // and so does one with something to attack (turning first if it must).
    if (!actor.attacked && mayAct(actor.id) && (canMoveOn(actor.id) || canAttack(actor.id))) return setSelected(actor.id);
    const living = activeUnit.figures.filter((f) => !f.destroyed && f.position).map((f) => f.id);
    const start = living.indexOf(actor.id);
    const after = [...living.slice(start + 1), ...living.slice(0, Math.max(start, 0))];
    const fresh = after.find((id) => canAct(id) && !active.moved.includes(id) && !active.attacked.includes(id));
    const next = fresh ?? after.find((id) => canAct(id)) ?? (canAct(actor.id) ? actor.id : null);
    if (next) setSelected(next);
    // The camera follows the selection to the squad's next figure; after the attack scene, if one plays.
    if (next && next !== actor.id) {
      if (attackRollsIn(session.lastEvents).length > 0) pendingFollow.current = next;
      else followFigure(next);
    }
  }, [session.lastEvents]);

  // ---- Wounds: numbers float up, then destroyed figures shake and leave the board ----
  // The state before the last command, to find where destroyed figures fell.
  const seen = useRef({ events: session.lastEvents, state, before: state });
  if (seen.current.events !== session.lastEvents) seen.current = { events: session.lastEvents, state, before: seen.current.state };
  else seen.current.state = state;
  const fallen = useMemo(() => fallenSpots(seen.current.before, session.lastEvents, ctx), [session.lastEvents]);
  const [ghostList, setGhostList] = useState<readonly Ghost[]>([]);
  const [retired, setRetired] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (fallen.size === 0) return;
    const stamp = session.events.length;
    setGhostList((g) => [...g, ...[...fallen].map(([id, spots]) => ({ stamp, id, spots }))]);
  }, [fallen]);
  const ghostKey = (g: { stamp: number; id: string }) => `${g.stamp}:${g.id}`;
  // The figures that fell to the last command are drawn from the first frame, before the effect above records them.
  const ghosts = [...ghostList, ...[...fallen].map(([id, spots]) => ({ stamp: session.events.length, id, spots }))].filter(
    (g, i, all) => !retired.has(ghostKey(g)) && all.findIndex((x) => ghostKey(x) === ghostKey(g)) === i,
  );
  const [batches, setBatches] = useState<readonly Batch[]>([]);
  const [shake, setShake] = useState<FigureShake | null>(null);
  /** Float a command's wounds (once its show, if any, is over). */
  const release = (stamp: number, events: readonly GameEvent[]) => {
    const marks = woundMarksIn(events);
    if (marks.some((m) => (m.wounds ?? 0) > 0)) playSound("wounds");
    if (marks.length > 0) setBatches((list) => [...list.filter((b) => b.stamp !== stamp), { stamp, marks }]);
  };
  const destroyedIn = (b: Batch) => b.marks.filter((m) => m.destroyed).map((m) => m.figureId);
  const batchFloated = (b: Batch) => {
    const ids = destroyedIn(b);
    if (ids.length > 0) playSound("destroyed");
    if (ids.length > 0) setShake((x) => ({ key: (x?.key ?? 0) + 1, ids }));
  };
  const batchDone = (b: Batch) => {
    setBatches((list) => list.filter((x) => x.stamp !== b.stamp));
    if (followAfter.current?.stamp === b.stamp) followFigure(followAfter.current.id);
    followAfter.current = null;
    const gone = destroyedIn(b).map((id) => ghostKey({ stamp: b.stamp, id }));
    if (gone.length === 0) return;
    setRetired((r) => new Set([...r, ...gone]));
    setGhostList((list) => list.filter((g) => !gone.includes(ghostKey(g))));
  };

  // ---- The attack intro and the dice show, and the initiative d20s (presentation only) ----
  const [show, setShow] = useState<{ stamp: number; kind: "initiative"; events: readonly GameEvent[] } | null>(null);
  /** Online: the show this device has told the others it is done with, so it tells them once. */
  const reported = useRef(-1);
  /** How many attack intros a click has skipped, for the browser tests (`__aohUi.introsSkipped`). */
  const introsSkipped = useRef(0);
  const reportWatched = (stamp: number) => {
    if (me === null || reported.current === stamp) return;
    reported.current = stamp;
    sendWatched(stamp);
  };
  /** Stop showing the attack; its wounds float up. */
  const dropBeat = () => {
    const b = beatRef.current;
    if (!b) return null;
    beatRef.current = null;
    setBeat(null);
    release(b.stamp, b.events);
    return b;
  };
  /** A squad's next figure to follow once the attack's wounds have floated up (and any destroyed figure has gone). */
  const followAfter = useRef<{ stamp: number; id: string } | null>(null);
  const endBeat = () => {
    const b = dropBeat();
    if (!b) return;
    const next = pendingFollow.current;
    pendingFollow.current = null;
    if (next && woundMarksIn(b.events).length > 0) followAfter.current = { stamp: b.stamp, id: next };
    else if (next) followFigure(next);
  };
  const toDice = (b: Beat) => {
    const next = { ...b, part: "dice" as const };
    beatRef.current = next;
    setBeat(next);
  };
  /** The intro, or the dice, played to the end. */
  const beatPlayed = () => {
    const b = beatRef.current;
    if (!b) return;
    if (b.part === "intro" && display.dice !== "none") return toDice(b);
    reportWatched(b.stamp);
    endBeat();
  };
  /**
   * A click on the intro or the dice. Locally it skips what is showing. Online it skips the rest
   * of the show, but only once every player has clicked (or their show has ended); until then this
   * player's show plays on and says who it is waiting for. Spectators skip for themselves.
   */
  const skipBeat = () => {
    const b = beatRef.current;
    if (!b) return;
    if (b.part === "intro") introsSkipped.current++;
    if (!isOnline) {
      if (b.part === "intro" && display.dice !== "none") toDice(b);
      else endBeat();
      return;
    }
    if (me === null) return endBeat();
    reportWatched(b.stamp);
    const known = watching?.show === b.stamp;
    if (known && watching.waiting.every((p) => p === me)) return endBeat();
    const next = { ...b, skipped: true };
    beatRef.current = next;
    setBeat(next);
  };
  // Online: everyone has finished or skipped the show, so it ends on every screen.
  useEffect(() => {
    const b = beatRef.current;
    if (b && watching && watching.show === b.stamp && watching.waiting.length === 0) endBeat();
  }, [watching]);
  // Online: a player who switches away from the game is not watching; nobody waits for them.
  useEffect(() => {
    if (!isOnline) return;
    const away = () => {
      const b = beatRef.current;
      if (!document.hidden || !b) return;
      reportWatched(b.stamp);
      endBeat();
    };
    document.addEventListener("visibilitychange", away);
    return () => document.removeEventListener("visibilitychange", away);
  }, [isOnline]);
  // The player whose turn it is waits for the others' shows, but not for ever.
  useEffect(() => {
    if (beat || othersWatching.length === 0 || !watching) return;
    const showKey = watching.show;
    const t = window.setTimeout(() => setHoldLapsed(showKey), HOLD_LIMIT_MS);
    return () => window.clearTimeout(t);
  }, [beat === null, watching]);
  useEffect(() => {
    const events = session.lastEvents;
    if (events.length === 0) return;
    const stamp = session.events.length;
    // Something new happened: a show still running ends, though its wounds still float up.
    const old = beatRef.current;
    if (old) {
      reportWatched(old.stamp);
      dropBeat();
    }
    if (initiativeIn(events)) {
      if (display.dice !== "none") setShow({ stamp, kind: "initiative", events });
      return;
    }
    const rolls = attackRollsIn(events);
    if (rolls.length > 0) {
      // Every attack opens with its intro, whatever Dice rolls says, and the camera frames the fight.
      const next: Beat = { stamp, events, part: "intro", skipped: false };
      playSound(fightIn(events, seen.current.before, ctx)?.pairs[0]?.ranged ? "ranged" : "melee");
      beatRef.current = next;
      setBeat(next);
      setFollow((f) => ({ id: rolls[0]!.attackerId, with: rolls[0]!.targetId, key: (f?.key ?? 0) + 1 }));
      return;
    }
    // Wounds without an attack (a fall, lava, an ability) float up straight away.
    release(stamp, events);
  }, [session.lastEvents]);
  useEffect(() => {
    if (beat?.part !== "intro") return;
    const t = window.setTimeout(beatPlayed, INTRO_MS);
    return () => window.clearTimeout(t);
  }, [beat?.stamp, beat?.part]);
  useEffect(() => {
    if (display.dice !== "none") return;
    setShow(null);
    if (beatRef.current?.part === "dice") beatPlayed();
  }, [display.dice]);
  // Online, each player rolls their own initiative and the rules roll once everyone has (`initiative: "players"`).
  const together = state.config.initiative === "players";
  /** The event count when the initiative dice were last closed, so a closed show does not open again. */
  const closedInitiative = useRef(-1);
  const closeShow = () => {
    closedInitiative.current = session.events.length;
    setShow(null);
    if (pendingFollow.current) followFigure(pendingFollow.current);
    pendingFollow.current = null;
  };
  useEffect(() => {
    const f = activeUnit?.figures.find((x) => x.id === selected);
    setRotation(f?.position?.rotation ?? 0);
    setAttackMode(null);
  }, [selected, turnKey]);
  useEffect(() => setAiming(null), [selected, turnKey, attackMode, state]);
  useEffect(() => setThrowing(null), [selected, turnKey, attackMode, state]);
  useEffect(() => setCarryId(null), [selected, turnKey, session.events.length]);
  useEffect(() => setEndRotation(null), [selected, turnKey, session.events.length]);
  // With the dice show off, this device rolls for its players at once.
  useEffect(() => {
    if (!together || state.phase !== "initiative" || display.dice !== "none" || busy) return;
    const next = state.players.find((p) => !p.eliminated && !(state.initiativeReady ?? []).includes(p.id) && canControl(session, p.id));
    if (next) dispatch({ type: "rollInitiative", player: next.id });
  }, [state, display.dice, busy]);
  // The initiative dice: waiting for every roll, then the result. The roll arrives a moment before the show
  // records it, so read it from the last events meanwhile and keep the same dice on screen throughout.
  const freshInitiative = together && closedInitiative.current !== session.events.length ? initiativeIn(session.lastEvents) : null;
  const initiativeEvent = show?.kind === "initiative" ? initiativeIn(show.events) : freshInitiative;
  const initiativeOpen =
    display.dice !== "none" && (together ? state.phase === "initiative" || initiativeEvent !== null : show?.kind === "initiative");
  // Call to Arms is not used instead of attacking: it has a control of its own.
  const allSpecials = activeCard ? specialActions(activeCard) : [];
  const specials = allSpecials.filter((s) => s.kind !== "orders");
  const orders = allSpecials.find((s) => s.kind === "orders");
  const modeKind = specials.find((s) => s.id === attackMode)?.kind ?? null;
  const blast = activeCard && attackMode ? areaAttackOf(activeCard, attackMode) : undefined;

  const options = useMemo<Map<string, MoveOption>>(() => {
    if (!active || !selected || resurrecting) return new Map();
    // Aiming Fire Breath or a throw: the red and orange hexes are for that, not for moving.
    if (modeKind === "breath" || throwing) return new Map();
    const bonus = active.attacked.includes(selected) && (active.bonusMoves[selected] ?? 0) > 0;
    // A figure that has moved may move on with what it has left, until it attacks.
    if (!bonus && active.attacked.includes(selected)) return new Map();
    try {
      return moveOptions(state, selected, ctx);
    } catch {
      return new Map();
    }
  }, [state, ctx, active, selected, resurrecting, modeKind, throwing]);
  const targets = useMemo(() => {
    if (!active || !selected || resurrecting) return new Set<string>();
    // After its first attack, a figure with an extra attack may make another normal one.
    if (active.attacked.includes(selected) && (attackMode || (active.extraAttacks?.[selected] ?? 0) === 0)) return new Set<string>();
    // Powers aimed at a place or a squad have no figure to click.
    if (modeKind === "stomp" || modeKind === "breath" || modeKind === "raise") return new Set<string>();
    return new Set(attackTargets(state, selected, ctx, attackMode ?? undefined));
  }, [state, ctx, active, selected, attackMode, modeKind, resurrecting]);
  /** Hurl: where the picked-up enemy may be thrown. */
  const throwSpots = useMemo<Step[]>(() => (throwing && selected ? hurlSpots(state, selected, throwing, ctx) : []), [throwing, selected, state, ctx]);
  /** Fire Breath: the hexes next to the figure it may breathe through, each with the row it would burn. */
  const breaths = useMemo(() => {
    if (modeKind !== "breath" || !selected || !active || active.attacked.includes(selected)) return [];
    const here = findFigure(state, selected)?.figure.position;
    if (!here) return [];
    return DIRECTIONS.flatMap((d) => {
      const first = { q: here.hex.q + d.q, r: here.hex.r + d.r };
      const line = breathLine(state, selected, first, ctx);
      const top = Math.max(...ctx.board.surfaces(first).map((s) => s.elevation));
      return line && Number.isFinite(top) ? [{ first: { hex: first, elevation: top }, line }] : [];
    });
  }, [modeKind, selected, active, state, ctx]);
  const moveBig = activeCard ? activeCard.footprint !== "1" : false;
  /** The hexes of the aimed-at figure a blast may land on. */
  const aimSpots = useMemo<Step[]>(() => {
    if (!aiming || !selected || !attackMode) return [];
    const unit = state.units.find((u) => u.figures.some((f) => f.id === aiming));
    const f = unit?.figures.find((x) => x.id === aiming);
    if (!unit || !f) return [];
    const card = ctx.cards.get(unit.cardId)!;
    return figureSpots(f, card.footprint, card.height, ctx).filter(
      (s) => attackProblem(state, selected, aiming, ctx, attackMode, s.hex) === null,
    );
  }, [aiming, selected, attackMode, state, ctx]);
  /** Empty hexes a blast that may be aimed at a hex can land on. */
  const blastHexes = useMemo<Step[]>(() => {
    if (!blast?.hexTarget || !active || !selected || !attackMode || active.attacked.includes(selected)) return [];
    return blastSpots(state, selected, ctx, attackMode);
  }, [blast, active, selected, attackMode, state, ctx]);

  /** Where the chosen figure stands now, and the hexes it covers. */
  const moverAt = selected ? (findFigure(state, selected)?.figure.position ?? null) : null;
  const moverSpots = useMemo(() => {
    const found = selected ? findFigure(state, selected) : undefined;
    if (!found || !moverAt) return [];
    const card = ctx.cards.get(found.unit.cardId)!;
    return figureSpots(found.figure, card.footprint, card.height, ctx);
  }, [state, ctx, selected]);
  /** The way the chosen figure would face after a move. */
  const facingAfter = (o: MoveOption): number => (moverAt && activeCard ? endFacing(activeCard.footprint, moverAt.hex, o.path) : null) ?? 0;
  /** Every way a big figure may end a move with its front on this hex, in turning order (R steps through them). */
  const optionsAt = (step: Step | null): MoveOption[] =>
    step && moveBig ? [...options.values()].filter((o) => sameStep(o.to, step)).sort((a, b) => facingAfter(a) - facingAfter(b)) : [];
  /**
   * The move option for a hex. A big figure may end its move facing several ways: the one picked
   * with R if it can, else the safest, then the one facing most nearly the way it travels (from
   * where it stands to where it ends), then the one nearest its present facing, then the cheapest.
   */
  const optionAt = (step: Step | null): MoveOption | undefined => {
    if (!step) return undefined;
    if (!moveBig) return options.get(placementKey(step));
    const here = optionsAt(step);
    const picked = endRotation === null ? undefined : here.find((o) => (o.to.rotation ?? 0) === endRotation);
    if (picked || here.length === 0) return picked;
    const from = moverSpots.length > 0 ? centreOf(moverSpots.map((s) => s.hex)) : null;
    const now = selected ? (findFigure(state, selected)?.figure.facing ?? null) : null;
    const apart = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    const score = (o: MoveOption) => {
      const to = centreOf(o.spots.map((s) => s.hex));
      const travel = from && Math.hypot(to.x - from.x, to.z - from.z) > 1e-6 ? (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI : null;
      return [o.hazards, travel === null ? 0 : apart(facingAfter(o), travel), now === null ? 0 : apart(facingAfter(o), now), o.cost];
    };
    const ranked = here.map((o) => ({ o, key: score(o) }));
    ranked.sort((a, b) => {
      const i = a.key.findIndex((v, j) => v !== b.key[j]);
      return i < 0 ? 0 : a.key[i]! - b.key[i]!;
    });
    return ranked[0]!.o;
  };
  const hoverOption = optionAt(hoverStep);

  // Keys: R turns a figure that has just moved (games with facing) or a big figure being placed, 1-4 pick a squad figure, E toggles eye view, C the unit card,
  // T models or tokens, H makes the chosen figure jump, Space ends the turn. WASD pans the map (in BoardScene).
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector(".page-overlay, .pass-screen")) return; // a dialog is open
    const key = e.key.toLowerCase();
    if (key === "escape" && aiming) {
      setAiming(null);
    } else if (key === "escape" && throwing) {
      setThrowing(null);
    } else if (key === "escape" && resurrecting) {
      setResurrect(null);
    } else if (key === "t") {
      toggleFigures();
    } else if (key === "b") {
      toggleTiles();
    } else if (key === "r" && active && turning()) {
      // Turn the chosen figure (or the last to move) an eighth (Shift+R the other way).
      if (busy) return;
      const id = turning()!;
      const facing = findFigure(state, id)?.figure.facing ?? 0;
      dispatch({ type: "face", player: active.player, figureId: id, facing: (facing + (e.shiftKey ? 315 : 45)) % 360 });
    } else if (key === "r" && active && myTurn && selected && moveBig && options.size > 0 && !deploying && !resurrecting) {
      // A big figure about to move: step through the ways it may face at the end of the hovered move.
      const here = optionsAt(hoverStep);
      if (here.length > 0) {
        const at = Math.max(0, here.indexOf(hoverOption!));
        setEndRotation(here[(at + (e.shiftKey ? here.length - 1 : 1)) % here.length]!.to.rotation ?? 0);
      } else {
        const now = endRotation ?? moverAt?.rotation ?? 0;
        setEndRotation((now + (e.shiftKey ? 5 : 1)) % 6);
      }
    } else if (key === "r") {
      setRotation((r) => (r + (e.shiftKey ? 5 : 1)) % 6);
    } else if (key === "c") {
      toggleCard();
    } else if (key === "h" && activeUnit && !eyeView) {
      // The chosen figure (the one under the arrow) jumps, so it is easy to find on a crowded board.
      // With none chosen (another player's turn), the whole acting unit jumps.
      const living = activeUnit.figures.filter((f) => !f.destroyed && f.position).map((f) => f.id);
      const ids = selected && living.includes(selected) ? [selected] : living;
      setJump((j) => ({ key: (j?.key ?? 0) + 1, ids }));
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
  const spotsOfFigure = (figureId: string): Step[] => {
    const unit = state.units.find((u) => u.figures.some((f) => f.id === figureId));
    return unit ? spotsOf(unit.id, figureId) : [];
  };
  const engagedCount = (figureId: string): number => {
    if (!activeUnit || !activeCard) return 0;
    return engagedEnemies(state, activeUnit.owner, spotsOf(activeUnit.id, figureId), activeCard.height, ctx).length;
  };

  // ---- Pings (online): P points at the spot under the pointer for everyone in the game ----
  const { pings, ping } = useOnlinePings(me, (player) => names.playerColor(player));
  // Players ping; spectators only watch. Not in eye view, where the pointer turns the view.
  const canPing = isOnline && me !== null && !eyeView && state.phase !== "gameOver";

  // Publish a read-only summary of the turn for automated browser tests.
  useEffect(() => {
    const positioned = state.units.flatMap((u) =>
      u.figures.filter((f) => !f.destroyed && f.position).map((f) => ({ unit: u, f, pos: f.position! })),
    );
    window.__aohUi = {
      selected,
      selectedAt: selected ? (findFigure(state, selected)?.figure.position ?? null) : null,
      dragging: drag && !drag.dropped ? { id: drag.id, over: hoverOption?.to ?? null } : null,
      moves: [...options.values()].map((o) => o.to),
      targets: positioned
        .filter((x) => targets.has(x.f.id))
        .map((x) => ({ id: x.f.id, hex: x.pos.hex, elevation: x.pos.elevation, height: ctx.cards.get(x.unit.cardId)!.height })),
      enemies: positioned.filter((x) => active && x.unit.owner !== active.player).map((x) => x.pos),
      aiming: aiming ? { id: aiming, spots: aimSpots } : null,
      blastHexes,
      turning: turner ? { id: turner, facing: findFigure(state, turner)?.figure.facing ?? 0 } : null,
      preview: hoverOption ? { to: hoverOption.to, facing: facingAfter(hoverOption), path: hoverOption.path } : null,
      introsSkipped: () => introsSkipped.current,
      facingOf: (id: string) => findFigure(state, id)?.figure.facing ?? null,
    };
  }, [state, ctx, selected, options, targets, active, drag, hoverOption, aiming, aimSpots, blastHexes, turner]);

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
    // With facing, the view keeps to the figure's front cone.
    const facing = findFigure(state, selected)?.figure.facing;
    return { eye: from, look, ...(state.config.facing && facing !== undefined ? { facing: (facing * Math.PI) / 180 } : {}) };
  }, [eyeView, selected, activeUnit, activeCard, pinnedFigure, targets, state, ctx]);

  // ---- Board contents ------------------------------------------------------
  const figures: FigureView[] = [];
  for (const unit of state.units) {
    const card = ctx.cards.get(unit.cardId)!;
    const color = names.playerColor(unit.owner);
    const life = statsOf(card).life;
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
        cardId: card.id,
        footprint: card.footprint,
        faction: card.faction,
        owner: unit.owner,
        pose: unit.figures.indexOf(f),
        spots: figureSpots(f, card.footprint, card.height, ctx),
        height: card.height,
        color,
        label: names.tokenLabel(f.id),
        hero: card.figureCount === 1,
        status,
        ...(status === "selected" ? { arrow: true } : {}),
        ...(life > 1 ? { lifeLeft: life - f.wounds } : {}),
        ...(state.config.facing && f.facing !== undefined ? { facing: f.facing } : {}),
        ...(f.id === turner ? { cone: true } : {}),
      });
    }
  }
  /** The chosen figure as the hovered move would leave it: where it ends and which way it faces. */
  const selectedView = figures.find((f) => f.id === selected);
  const preview: FigurePreview | null =
    hoverOption && selectedView && !eyeView && !drag?.dropped
      ? { figure: selectedView, spots: hoverOption.spots, facing: facingAfter(hoverOption), cone: !!state.config.facing }
      : null;
  // Figures destroyed a moment ago stay where they fell until they have shaken.
  for (const g of ghosts) {
    const hit = findFigure(state, g.id);
    if (!hit || figures.some((f) => f.id === g.id)) continue;
    const card = ctx.cards.get(hit.unit.cardId)!;
    figures.push({
      id: g.id,
      cardId: card.id,
      footprint: card.footprint,
      faction: card.faction,
      owner: hit.unit.owner,
      pose: hit.unit.figures.indexOf(hit.figure),
      spots: g.spots,
      height: card.height,
      color: names.playerColor(hit.unit.owner),
      label: names.tokenLabel(g.id),
      hero: card.figureCount === 1,
      status: "idle",
      ...(statsOf(card).life > 1 ? { lifeLeft: 0 } : {}),
      ...(state.config.facing && hit.figure.facing !== undefined ? { facing: hit.figure.facing } : {}),
    });
  }
  if (deployUnit && deployCard) {
    pending.forEach((p, i) => {
      const f = deployUnit.figures[i]!;
      figures.push({
        id: f.id,
        cardId: deployCard.id,
        footprint: deployCard.footprint,
        faction: deployCard.faction,
        owner: deployUnit.owner,
        pose: i,
        spots: p.spots,
        height: deployCard.height,
        color: names.playerColor(deployUnit.owner),
        label: names.tokenLabel(f.id),
        hero: deployCard.figureCount === 1,
        status: "selected",
      });
    });
  }

  if (resurrecting && resurrectUnit && resurrectCard) {
    resurrecting.items.forEach((p, i) => {
      const f = resurrectFigures[i]!;
      figures.push({
        id: f.id,
        cardId: resurrectCard.id,
        footprint: resurrectCard.footprint,
        faction: resurrectCard.faction,
        owner: resurrectUnit.owner,
        pose: resurrectUnit.figures.indexOf(f),
        spots: p.spots,
        height: resurrectCard.height,
        color: names.playerColor(resurrectUnit.owner),
        label: names.tokenLabel(f.id),
        hero: resurrectCard.figureCount === 1,
        status: "selected",
      });
    });
  }

  // ---- New powers' choices: squads to raise, friends to carry, squads to call to arms ----
  const raiseChoices = modeKind === "raise" && selected ? raiseUnits(state, selected, ctx) : [];
  const carryChoices = selected && active && !active.moved.includes(selected) ? carryFriends(state, selected, ctx) : [];
  const callerId = orders && activeUnit ? (activeUnit.figures.find((f) => !f.destroyed && f.position)?.id ?? null) : null;
  const calledThisRound = !!active && (state.called ?? []).includes(active.unitId);
  const callChoices = callerId ? callUnits(state, callerId, ctx) : [];

  // ---- The turn sheet: each figure's state, the chosen figure's pills and one line of help ----
  const figureState = (id: string): string => {
    if (!active) return "";
    if (active.attacked.includes(id)) return extraAttacks(id) > 0 ? "may attack again" : (active.bonusMoves[id] ?? 0) > 0 ? "may still move" : "done";
    if (active.moved.includes(id)) return canMoveOn(id) ? "moved, can move on" : "moved";
    return "";
  };
  const figurePills = (id: string): Pill[] => {
    if (!active) return [];
    const pills: Pill[] = [];
    const attacked = active.attacked.includes(id);
    if (options.size > 0) pills.push({ text: active.moved.includes(id) ? "Can move on" : "Can move", tone: "good" });
    else if (attacked && extraAttacks(id) > 0) pills.push({ text: "May attack again", tone: "good" });
    else if (attacked) pills.push({ text: "Has attacked" });
    else if (active.moved.includes(id)) pills.push({ text: "Has moved" });
    if (!attacked) {
      const n = targets.size;
      if (modeKind === "swap") pills.push(n > 0 ? { text: `${n} to swap with`, tone: "good" } : { text: "No friend in range" });
      else if (n > 0) pills.push({ text: n === 1 ? "1 target" : `${n} targets`, tone: "good" });
      else if (blastHexes.length === 0) pills.push({ text: "No target in range" });
    }
    if (attacked && extraAttacks(id) > 0 && targets.size > 0) pills.push({ text: targets.size === 1 ? "1 target" : `${targets.size} targets`, tone: "good" });
    if (engagedCount(id) > 0) pills.push({ text: "Engaged", tone: "warn" });
    if (state.pinned?.includes(id)) pills.push({ text: "Pinned", tone: "warn" });
    const poison = state.poisoned?.find((p) => p.figureId === id);
    if (poison) pills.push({ text: `Poisoned (${poison.turnsLeft} turn${poison.turnsLeft === 1 ? "" : "s"})`, tone: "warn" });
    return pills;
  };
  /** What to do now, in a sentence, then what the hovered move costs and what R does. */
  const turnHint = (): string => {
    if (!active) return "";
    if (!myTurn) return `Waiting for ${names.player(active.player)} to play this turn.`;
    if (eyeView) return "Drag or use the arrow keys to look around. Clicking an enemy faces it; a red-ringed one is attacked. Exit eye view to end the turn.";
    if (!selected) return "This unit has finished: end the turn.";
    if (aiming) return "Click a red hex to aim the blast; figures next to it are hit too. Esc picks another target.";
    if (throwing) return `Click an orange hex to throw ${names.figure(throwing)} there. Esc picks another enemy.`;
    if (modeKind === "throw") return targets.size > 0 ? "Click an enemy beside the figure to pick it up." : "No Small or Medium enemy beside it to throw.";
    if (modeKind === "breath") return breaths.length > 0 ? "Click a red hex beside the figure to breathe fire that way; hover one to see the row it burns." : "There is no way in front of it to breathe fire.";
    if (modeKind === "stomp") return "Press the button below to stamp: every figure beside it, friend or foe, may be wounded.";
    if (modeKind === "raise") return "Choose a squad below to call back one of its fallen.";
    if (modeKind === "sweep") return targets.size > 0 ? "Click any enemy beside the figure: it strikes every one of them." : "No enemy beside it.";
    const canMove = options.size > 0;
    const hits = targets.size > 0;
    let first: string;
    if (modeKind === "swap") first = hits ? "Click a ringed friend to swap places with it." : "No friend in range to swap with.";
    else if (blastHexes.length > 0) first = hits ? "Click a red ring or a red hex to aim the blast." : "Click a red hex to aim the blast.";
    else if (canMove && hits) first = "Click a green hex to move, or a red ring to attack.";
    else if (canMove) first = "Click a green hex to move there, or drag the figure.";
    else if (hits) first = blast ? "Click a red ring to attack; on a big figure, then pick the hex to aim at." : "Click a red ring to attack.";
    else if (activeUnit?.figures.some((f) => f.id !== selected && canAct(f.id))) first = "This figure is done: pick another, or end the turn.";
    else first = "Nothing left to do: end the turn.";
    const more: string[] = [];
    if (hoverOption) {
      const cost = hoverOption.cost === 0 ? "Turning is free." : `Costs ${hoverOption.cost} Move.`;
      more.push(hoverOption.hazards > 0 ? `Risky: lava, ice, a fall or a passing strike. ${cost}` : cost);
    }
    if (moveBig && canMove) more.push("R picks the way it faces.");
    else if (turner) more.push(`R turns ${names.figure(turner)}.`);
    return [first, ...more].join(" ");
  };

  const markers: Marker[] = [];
  if (resurrecting && resurrectUnit && resurrecting.items.length < resurrectFigures.length) {
    const seen = new Set<string>();
    for (const o of resurrectOptions) {
      const key = stepKey(o.placement);
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ step: o.placement, color: names.playerColor(resurrectUnit.owner), opacity: 0.4 });
    }
    const preview = hoverStep && resurrectBig ? resurrectAt(hoverStep) : undefined;
    if (preview) for (const s of preview.spots) markers.push({ step: s, color: "#ffffff", opacity: 0.6 });
  }
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
    markers.push({ step: o.to, color: originHazards.get(key)! > 0 ? "#ff9800" : "#4caf50", opacity: 0.45, ring: true });
    originHazards.delete(key);
  }
  if (hoverOption) {
    for (const s of hoverOption.path) markers.push({ step: s, color: "#ffeb3b", opacity: 0.7 });
    if (moveBig) for (const s of hoverOption.spots) markers.push({ step: s, color: "#ffffff", opacity: 0.6 });
  }
  const sendAttack = (targetId: string, aim?: Step) => {
    if (!active || !selected) return;
    setAiming(null);
    dispatch({
      type: "attack",
      player: active.player,
      figureId: selected,
      targetId,
      ...(attackMode ? { ability: attackMode } : {}),
      ...(aim ? { aim: aim.hex } : {}),
    });
  };
  if (aiming) {
    const unit = state.units.find((u) => u.figures.some((f) => f.id === aiming));
    const height = unit ? ctx.cards.get(unit.cardId)!.height : 1;
    for (const s of aimSpots) {
      markers.push({ step: s, color: "#e53935", opacity: 0.35, height, onClick: () => !busy && sendAttack(aiming, s) });
    }
  }
  for (const s of blastHexes) markers.push({ step: s, color: "#e53935", opacity: 0.3 });
  /** Use a power (the `power` command) with the chosen figure. */
  const sendPower = (ability: string, aim: { targetId?: string; unitId?: string; at?: Step }) => {
    if (!active || !selected) return;
    setThrowing(null);
    dispatch({
      type: "power",
      player: active.player,
      figureId: selected,
      ability,
      ...(aim.targetId ? { targetId: aim.targetId } : {}),
      ...(aim.unitId ? { unitId: aim.unitId } : {}),
      ...(aim.at ? { at: { hex: aim.at.hex, elevation: aim.at.elevation } } : {}),
    });
  };
  // Hurl: orange hexes the picked-up enemy may be thrown onto.
  if (throwing && attackMode) {
    for (const s of throwSpots) markers.push({ step: s, color: "#ff9800", opacity: 0.45, onClick: () => !busy && sendPower(attackMode, { targetId: throwing, at: s }) });
  }
  // Fire Breath: a red hex next to the figure for each way it may breathe; hovering one shows the row it burns.
  if (attackMode && breaths.length > 0) {
    const shown = hoverStep ? breaths.find((b) => b.line.some((h) => h.q === hoverStep.hex.q && h.r === hoverStep.hex.r)) : undefined;
    for (const b of breaths) {
      markers.push({ step: b.first, color: "#e53935", opacity: shown === b ? 0.6 : 0.35, onClick: () => !busy && sendPower(attackMode, { at: b.first }) });
    }
    for (const h of shown?.line.slice(1) ?? []) {
      const top = Math.max(...ctx.board.surfaces(h).map((s) => s.elevation));
      markers.push({ step: { hex: h, elevation: top }, color: "#ff7043", opacity: 0.4 });
    }
  }
  /** Wings of Refuge: where a carried friend is set down beside a landing spot: the free hex nearest where it stands now. */
  const carryFor = (landing: Step): { figureId: string; to: Step } | null => {
    if (!carryId || !selected) return null;
    const from = findFigure(state, carryId)?.figure.position;
    const spots = carrySpots(state, selected, carryId, landing, ctx);
    if (!from || spots.length === 0) return null;
    const best = [...spots].sort((a, b) => hexDistance(a.hex, from.hex) - hexDistance(b.hex, from.hex))[0]!;
    return { figureId: carryId, to: { hex: best.hex, elevation: best.elevation } };
  };
  /** The move command for a move option: a teleport says so, and a flyer may carry a friend. */
  const moveCommand = (figureId: string, option: MoveOption) => {
    const carry = option.ability ? null : carryFor(option.to);
    return {
      type: "move" as const,
      player: active!.player,
      figureId,
      path: option.path,
      ...(option.ability ? { ability: option.ability } : {}),
      ...(carry ? { carry } : {}),
    };
  };

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
    if (resurrecting && resurrectUnit) {
      if (resurrecting.items.length >= resurrectFigures.length) return;
      const option = resurrectAt(step);
      if (option) {
        setRotation(option.placement.rotation);
        setResurrectItems([...resurrecting.items, option]);
      }
      return;
    }
    if (active && selected && attackMode && blastHexes.some((s) => sameStep(s, step))) {
      dispatch({ type: "blast", player: active.player, figureId: selected, ability: attackMode, at: { hex: step.hex, elevation: step.elevation } });
      return;
    }
    if (active && selected) {
      const option = optionAt(step);
      if (option) dispatch(moveCommand(selected, option));
    }
  };

  const onFigureClick = (id: string) => {
    if (busy) return;
    if (deploying && deployUnit?.figures.some((f) => f.id === id)) {
      const i = deployUnit.figures.findIndex((f) => f.id === id);
      if (i >= 0 && i < pending.length) setPending(pending.filter((_, j) => j !== i));
      return;
    }
    if (resurrecting && resurrectFigures.some((f) => f.id === id)) {
      const i = resurrectFigures.findIndex((f) => f.id === id);
      if (i >= 0 && i < resurrecting.items.length) setResurrectItems(resurrecting.items.filter((_, j) => j !== i));
      return;
    }
    if (active && selected && targets.has(id)) {
      // Hurl: pick the enemy up, then click where to throw it.
      if (modeKind === "throw") {
        setThrowing(throwing === id ? null : id);
        return;
      }
      // A blast at a figure on several hexes: the player picks which of its hexes to aim at.
      if (blast && spotsOfFigure(id).length > 1) {
        setAiming(aiming === id ? null : id);
        return;
      }
      sendAttack(id);
      return;
    }
    if (active && activeUnit?.figures.some((f) => f.id === id) && canAct(id)) {
      setSelected(id);
      return;
    }
    setPinnedFigure(pinnedFigure === id ? null : id);
  };

  // ---- Moving figures: hops, and dragging a figure to its hex ---------------
  /** A figure that was dragged to its hex is already there: it does not hop the path as well. */
  const carried = useRef<string | null>(null);
  const motions = useMemo<FigureMotions>(
    () => ({
      key: session.events.length,
      moves: session.lastEvents.flatMap((e) => (e.type === "figureMoved" && e.figureId !== carried.current ? [{ figureId: e.figureId, from: e.from, path: e.path }] : [])),
    }),
    [session.lastEvents],
  );
  /** A hop's sound depends on what the figure lands on: water and swamp splash, lava flares. */
  const land = useCallback((_id: string, step: Step) => playSound(landingSound(ctx.board.surfaceAt(step.hex, step.elevation)?.terrain)), [ctx]);
  // A figure dragged to its hex makes its landing sound when the move is made, as it does not hop.
  useEffect(() => {
    for (const e of session.lastEvents) {
      if (e.type === "figureMoved" && e.figureId === carried.current && e.path.length > 0) land(e.figureId, e.path[e.path.length - 1]!);
    }
  }, [session.lastEvents]);
  useEffect(() => {
    carried.current = null;
  }, [session.lastEvents, session.error]);
  // A dropped figure waits on its new hex until the move is made (online, until the server answers).
  useEffect(() => {
    if (drag?.dropped && !session.pending) setDrag(null);
  }, [drag, session.state, session.pending, session.error]);
  const canDrag = (id: string) => !busy && !eyeView && !deploying && !resurrecting && canAct(id);
  const onDragStart = (id: string) => {
    if (!canDrag(id)) return;
    setSelected(id);
    setDrag({ id, dropped: null });
  };
  const onDragEnd = () => {
    if (!drag || drag.dropped) return;
    // The move options are the selected figure's, which a drag makes the dragged one.
    if (active && hoverOption && selected === drag.id && !busy) {
      carried.current = drag.id;
      setDrag({ id: drag.id, dropped: hoverOption.to });
      dispatch(moveCommand(drag.id, hoverOption));
    } else {
      setDrag(null);
    }
  };
  const dragFrom = drag ? findFigure(state, drag.id)?.figure.position : null;
  const carry: FigureCarry | null =
    drag && dragFrom ? { id: drag.id, from: dragFrom, to: drag.dropped ?? (selected === drag.id ? hoverOption?.to : null) ?? null, held: !drag.dropped } : null;

  // ---- The table: every unit's card, with the figures that are off the board ----
  const tableShape = tableKey(state);
  const table = useMemo(() => tableFor(state, ctx), [tableShape, ctx]);
  // Figures being placed are on the board, not their card; so are destroyed figures still shaking.
  const placing = new Set([
    ...(deployUnit ? deployUnit.figures.slice(0, pending.length).map((f) => f.id) : []),
    ...(resurrecting && resurrectUnit ? resurrectFigures.slice(0, resurrecting.items.length).map((f) => f.id) : []),
    ...ghosts.map((g) => g.id),
  ]);
  // Tokens on the cards show their numbers to their own player only (until revealed): online this
  // device's player; on one device the player whose turn it is, or who is placing tokens.
  const tokenViewer = isOnline ? me : state.phase === "turns" ? (active?.player ?? null) : state.phase === "placeTokens" && tokenPanelOpen ? tokenPlayer : null;
  const cardsOnTable = tableUnits(state, ctx, (p) => names.playerColor(p), placing, tokenViewer);
  const firstFigure = (unitId: string | null) => (unitId ? state.units.find((u) => u.id === unitId)?.figures[0]?.id ?? null : null);

  // ---- Unit cards: the acting unit's, and below it the one under the pointer or clicked ----
  const ownFigure =
    selected ??
    (deployUnit ? deployUnit.figures[0]?.id : null) ??
    activeUnit?.figures.find((f) => !f.destroyed && f.position)?.id ??
    null;
  const mainCard = showCard && ownFigure ? findFigure(state, ownFigure) : undefined;
  const otherId = hoveredFigure ?? pinnedFigure;
  const otherFound = otherId ? findFigure(state, otherId) : undefined;
  const actingUnitId = deployUnit?.id ?? activeUnit?.id;
  const otherCard = otherFound && otherFound.unit.id !== actingUnitId && otherFound.unit.id !== mainCard?.unit.id ? otherFound : undefined;
  const cardView = (hit: NonNullable<typeof mainCard>) => (
    <UnitCardView
      key={hit.unit.id}
      card={ctx.cards.get(hit.unit.cardId)!}
      color={names.playerColor(hit.unit.owner)}
      alive={hit.unit.figures.filter((f) => !f.destroyed).length}
      wounds={hit.figure.wounds}
    />
  );

  // ---- Camera: glide to the figure being followed, read when the request is made ----
  const focusRequest = useMemo((): CameraFocusRequest | null => {
    if (!follow) return null;
    const centre = (id: string): Vec3 | null => {
      const hit = findFigure(state, id);
      if (!hit) return null;
      const card = ctx.cards.get(hit.unit.cardId)!;
      // A figure the attack destroyed is still drawn where it fell.
      const spots = hit.figure.position ? figureSpots(hit.figure, card.footprint, card.height, ctx) : fallen.get(id);
      if (!spots?.length) return null;
      const at = spots.map((s) => hexToWorld(s.hex));
      const ground = Math.max(...spots.map((s) => s.elevation));
      return {
        x: at.reduce((n, p) => n + p.x, 0) / at.length,
        y: (ground + card.height * 0.4) * LEVEL_HEIGHT,
        z: at.reduce((n, p) => n + p.z, 0) / at.length,
      };
    };
    const point = centre(follow.id);
    if (!point) return null;
    const other = follow.with ? centre(follow.with) : null;
    if (other) {
      // A fight: look at the middle of the two figures from across the line between them, so
      // they stand side by side on screen, and from far enough back to see both. Always, whatever
      // the Display settings: an attack is worth seeing.
      const dx = other.x - point.x;
      const dz = other.z - point.z;
      const apart = Math.hypot(dx, dz);
      const across = apart > 0.01 ? { x: (-dz / apart) * FOLLOW_FRAME.from.z, y: FOLLOW_FRAME.from.y, z: (dx / apart) * FOLLOW_FRAME.from.z } : FOLLOW_FRAME.from;
      return {
        key: follow.key,
        point: { x: (point.x + other.x) / 2, y: (point.y + other.y) / 2, z: (point.z + other.z) / 2 },
        frame: { from: across, distance: Math.max(FIGHT_DISTANCE, apart * 1.5 + 6), either: true },
      };
    }
    // Following the acting unit makes only the moves the player has ticked under Display.
    const parts = { pan: display.autoPan, rotate: display.autoRotate, zoom: display.autoZoom };
    if (!parts.pan && !parts.rotate && !parts.zoom) return null;
    return { key: follow.key, point, frame: FOLLOW_FRAME, parts };
    // Only a new follow request moves the camera; later state changes must not.
  }, [follow]);
  const [hexTip, setHexTip] = useHexTip();

  // ---- What the fight effects need: where each figure stands ----
  const anchorFor = (id: string): FigureAnchor | null => {
    const view = figures.find((f) => f.id === id);
    return view ? anchorOf(view) : null;
  };
  // Read from the game as the attack began, so a figure it destroyed still has its place.
  const fight = useMemo(() => (beat ? fightIn(beat.events, seen.current.before, ctx) : null), [beat?.stamp]);
  const intro =
    beat?.part === "intro" && fight
      ? {
          pairs: fight.pairs.flatMap((p) => {
            const from = anchorFor(p.attackerId);
            const to = anchorFor(p.targetId);
            return from && to ? [{ from, to, ranged: p.ranged }] : [];
          }),
          attackers: fight.attackers.flatMap((id) => anchorFor(id) ?? []),
          targets: fight.targets.flatMap((id) => anchorFor(id) ?? []),
        }
      : null;
  const firstRoll = beat ? attackRollsIn(beat.events)[0] : undefined;
  // A blast names its first target "and 2 more".
  const fightTitle = firstRoll ? `${attackTitle(firstRoll, names)}${fight && fight.targets.length > 1 ? ` and ${fight.targets.length - 1} more` : ""}` : "";
  /** What the bottom line of the intro and the dice says: how to skip, or who the skip waits for. */
  const skipHint =
    beat?.skipped && watching?.show === beat.stamp
      ? `Waiting for ${watching.waiting.filter((p) => p !== me).map((p) => names.player(p)).join(", ")} to skip`
      : beat?.skipped
        ? "Waiting for the others to skip"
        : "Click to skip";
  const numbersOf = (b: Batch): WoundNumber[] =>
    b.marks.flatMap((m) => {
      const a = m.wounds === null ? null : anchorFor(m.figureId);
      return a && m.wounds !== null ? [{ figureId: m.figureId, wounds: m.wounds, at: { x: a.x, y: a.top, z: a.z } }] : [];
    });

  const zones = useMemo(() => zoneOwners(state, ctx), [state.players, state.zones, ctx]);

  return (
    <div className="screen play" data-pending={busy ? "true" : undefined}>
      <Canvas
        className="canvas"
        // Drawn only when something changes: a resting board costs nothing, which matters without a graphics card.
        frameloop="demand"
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
          focus={focusRequest}
          backdrop={tableRoom(display.table)}
          dragging={!!drag && !drag.dropped}
          onInspect={setHexTip}
        >
          <Pings pings={pings} center={center} />
          {state.glyphs && <GlyphTiles glyphs={state.glyphs.onBoard} />}
          <GlyphPickups pickups={pickups} onDone={(key) => setPickups((list) => list.filter((p) => p.key !== key))} />
          {intro && <FightIntro key={beat!.stamp} pairs={intro.pairs} attackers={intro.attackers} targets={intro.targets} center={center} />}
          {batches.map((b) => (
            <WoundNumbers
              key={b.stamp}
              numbers={numbersOf(b)}
              center={center}
              then={destroyedIn(b).length > 0 ? SHAKE_SECONDS : 0}
              onFloated={() => batchFloated(b)}
              onDone={() => batchDone(b)}
            />
          ))}
          <GamingTable layout={table} style={display.table} />
          <TableCards
            layout={table}
            units={cardsOnTable}
            onHover={(unitId) => hoverFigure(firstFigure(unitId))}
            onClick={(unitId) => {
              const id = firstFigure(unitId);
              setPinnedFigure(pinnedFigure === id ? null : id);
            }}
          />
          <Figures
            figures={figures}
            onClick={onFigureClick}
            onHover={hoverFigure}
            labels={labelLayer}
            motions={motions}
            jump={jump}
            shake={shake}
            carry={carry}
            canDrag={canDrag}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onLand={land}
            preview={preview}
          />
        </BoardScene>
        <PingInput
          enabled={canPing}
          center={center}
          onPing={ping}
        />
        <TestHook offset={center} />
      </Canvas>
      <FigureLabels figures={figures} layer={labelLayer} />
      <HexTip tip={hexTip} board={board} terrain={ctx.terrain} zones={zones} glyphs={state.glyphs?.onBoard} onClose={() => setHexTip(null)} />

      {state.phase !== "deploy" && state.round > 0 && <RoundBar state={state} names={names} />}
      <OnlineBar session={session} />

      <aside className="hud-left">
        {deploying && deployUnit && deployCard && (
          <section className="panel ledger-sheet" aria-label="Deployment">
            <Ribbon
              color={names.playerColor(deploying.player)}
              faction={deployCard.faction}
              eyebrow={`${names.player(deploying.player)} · Deployment`}
              title={`Place ${deployCard.name}`}
            />
            <Pills pills={[{ text: `${pending.length} of ${deployUnit.figures.length} placed`, tone: pending.length === deployUnit.figures.length ? "good" : undefined }]} />
            <Hint>
              Click highlighted hexes in your start zone; click a placed figure to pick it up again.
              {deployBig ? " R turns it." : ""}
            </Hint>
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
          <section className="panel ledger-sheet" aria-label="Deployment">
            <Ribbon
              color={names.playerColor(nextDeployment.player)}
              faction={ctx.cards.get(state.units.find((u) => u.id === nextDeployment.unitId)?.cardId ?? "")?.faction}
              eyebrow={`${names.player(nextDeployment.player)} · Deployment`}
              title={names.unit(nextDeployment.unitId)}
            />
            <Hint>Waiting for {names.player(nextDeployment.player)} to place this unit.</Hint>
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

        {state.phase === "initiative" && !initiativeOpen && (
          <section className="panel" aria-label="Initiative">
            <h2>Initiative</h2>
            <p className="muted small">
              Waiting for{" "}
              {state.players
                .filter((p) => !p.eliminated && !(state.initiativeReady ?? []).includes(p.id))
                .map((p) => p.name)
                .join(", ")}{" "}
              to roll for initiative.
            </p>
          </section>
        )}

        {active && activeUnit && activeCard && (
          <section className="panel ledger-sheet" aria-label="Current turn">
            <Ribbon
              color={names.playerColor(active.player)}
              faction={activeCard.faction}
              eyebrow={`${names.player(active.player)} · ${active.called ? "Called to arms" : `Turn ${active.token}`}`}
              title={names.unit(activeUnit.id)}
            />
            {activeUnit.figures.length > 1 && (
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
                          <span className="figure-state">{figureState(f.id)}</span>
                          {engaged > 0 && <span className="tag">engaged</span>}
                          {state.pinned?.includes(f.id) && <span className="tag">pinned</span>}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            )}
            {myTurn && selected && <Pills pills={figurePills(selected)} />}
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
            {myTurn && selected && attackMode && modeKind === "stomp" && !active.attacked.includes(selected) && (
              <div className="actions power-actions">
                <button type="button" className="primary" disabled={busy} onClick={() => sendPower(attackMode, {})}>
                  {specials.find((s) => s.id === attackMode)?.name}
                </button>
              </div>
            )}
            {myTurn && selected && attackMode && modeKind === "raise" && !active.attacked.includes(selected) && (
              <div className="power-choices" role="group" aria-label="Squads to call back">
                {raiseChoices.length === 0 ? (
                  <p className="muted small">No friendly Orc or Undead squad has a fallen figure to call back.</p>
                ) : (
                  raiseChoices.map((u) => (
                    <button key={u} type="button" disabled={busy} onClick={() => sendPower(attackMode, { unitId: u })}>
                      {names.unit(u)}
                    </button>
                  ))
                )}
              </div>
            )}
            {myTurn && selected && carryChoices.length > 0 && options.size > 0 && (
              <div className="segmented carry-choice" role="radiogroup" aria-label="Carry a friend">
                {[null, ...carryChoices].map((id) => (
                  <button key={id ?? "alone"} type="button" role="radio" aria-checked={carryId === id} className={carryId === id ? "on" : ""} onClick={() => setCarryId(id)}>
                    {id ? `Carry ${names.figure(id)}` : "Fly alone"}
                  </button>
                ))}
              </div>
            )}
            {myTurn && orders && callerId && (
              <div className="power-choices" role="group" aria-label={orders.name}>
                <span className="power-label">{orders.name}</span>
                {calledThisRound ? (
                  <span className="muted small">used this round</span>
                ) : callChoices.length === 0 ? (
                  <span className="muted small">no Disciplined squad in reach</span>
                ) : (
                  callChoices.map((u) => (
                    <button
                      key={u}
                      type="button"
                      aria-pressed={active.callUnit === u}
                      className={active.callUnit === u ? "on" : ""}
                      disabled={busy}
                      onClick={() => {
                        if (!active || !callerId) return;
                        dispatch({ type: "power", player: active.player, figureId: callerId, ability: orders.id, unitId: u });
                      }}
                    >
                      {names.unit(u)}
                    </button>
                  ))
                )}
              </div>
            )}
            {othersWatching.length > 0 && !beat && (
              <p className="watching-note" role="status">
                Waiting for {othersWatching.map((p) => names.player(p)).join(", ")} to finish watching the attack.
              </p>
            )}
            <Hint>{turnHint()}</Hint>
            {myTurn && (
              <div className="actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy || eyeView}
                  title={eyeView ? "Exit eye view before ending the turn" : "End the turn (Space)"}
                  onClick={() => dispatch({ type: "endTurn", player: active.player })}
                >
                  End turn
                </button>
                <button
                  type="button"
                  aria-pressed={eyeView}
                  onClick={() => setEyeView(!eyeView)}
                  disabled={!selected && !eyeView}
                  title="See the battlefield from the selected figure's eyes (E)"
                >
                  {eyeView ? "Exit eye view" : "Eye view"}
                </button>
              </div>
            )}
          </section>
        )}

        {resurrecting && resurrectUnit && resurrectCard && (
          <section className="panel ledger-sheet" aria-label="Resurrection">
            <Ribbon
              color={names.playerColor(resurrectUnit.owner)}
              faction={resurrectCard.faction}
              eyebrow={`${names.player(resurrectUnit.owner)} · Resurrection`}
              title={`Place ${resurrectCard.name}`}
            />
            <Pills
              pills={[{ text: `${resurrecting.items.length} of ${resurrectFigures.length} placed`, tone: resurrecting.items.length === resurrectFigures.length ? "good" : undefined }]}
            />
            <Hint>
              Click highlighted hexes, each within {ctx.tuning?.glyphs?.summonRange ?? 3} hexes of one of your figures; click a placed figure to pick it
              up again.{resurrectBig ? " R turns it." : ""} Esc cancels.
            </Hint>
            <div className="actions">
              <button type="button" onClick={autoResurrect} disabled={resurrecting.items.length === resurrectFigures.length}>
                Auto place
              </button>
              <button type="button" onClick={() => setResurrectItems([])} disabled={resurrecting.items.length === 0}>
                Clear
              </button>
              <button type="button" onClick={() => setResurrect(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                disabled={resurrecting.items.length !== resurrectFigures.length || busy}
                onClick={confirmResurrect}
              >
                Confirm
              </button>
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

        <Drawer
          tabs={[
            { id: "log", label: "Log", content: <EventLog events={session.events} names={names} /> },
            ...(glyphsInPlay
              ? [
                  {
                    id: "glyphs",
                    label: "Glyphs",
                    badge: glyphsHeld,
                    fresh: pickups.length > 0,
                    content: (
              <GlyphPanel
                state={state}
                ctx={ctx}
                names={names}
                shown={glyphsShown}
                fresh={pickups.map((p) => p.glyphId)}
                user={active && myTurn && !busy && !eyeView ? active.player : null}
                onUse={(glyphId, unitId) => active && dispatch({ type: "useGlyph", player: active.player, glyphId, unitId })}
                onResurrect={(glyphId, unitId) => {
                  setAiming(null);
                  setEyeView(false);
                  setResurrect({ glyphId, unitId, items: [] });
                }}
                resurrecting={resurrecting?.glyphId ?? null}
              />
                    ),
                  },
                ]
              : []),
            { id: "keys", label: "Keys", content: <HotKeys online={isOnline} /> },
          ]}
        />
      </aside>

      <aside className={`hud-right${mainCard && otherCard ? " two-cards" : ""}`}>
        {ownFigure && (
          <button type="button" className="card-toggle" aria-pressed={showCard} onClick={toggleCard} title="Show or hide the selected unit's card (C)">
            {showCard ? "Hide unit card" : "Show unit card"}
          </button>
        )}
        {mainCard && <div className="unit-card-main">{cardView(mainCard)}</div>}
        {otherCard && (
          <div className="unit-card-other" aria-label="Other unit">
            {cardView(otherCard)}
          </div>
        )}
        <div className="hud-corner">
          <GameMenu session={session} round />
          <DisplayMenu />
        </div>
      </aside>

      {session.error && (
        <div className="toast error" role="alert" onClick={clearError}>
          {session.error}
        </div>
      )}

      {/* While the attack or the dice show plays, the dice panel waits; it keeps the result afterwards. */}
      {!show && !beat && <DiceOverlay events={session.lastEvents} names={names} stamp={session.events.length} />}
      {beat?.part === "intro" && (
        <div
          className="fight-intro"
          role="dialog"
          aria-label="Attack begins"
          data-kind={fight?.pairs[0]?.ranged ? "ranged" : "melee"}
          onClick={skipBeat}
        >
          <div className="fight-title" style={{ borderColor: ATTACK_RED }}>
            {fightTitle}
          </div>
          <div className="fight-hint">{skipHint}</div>
        </div>
      )}
      {beat?.part === "dice" && display.dice !== "none" && (
        <AttackShow
          key={beat.stamp}
          rolls={attackRollsIn(beat.events)}
          mode={display.dice}
          state={state}
          ctx={ctx}
          names={names}
          onClose={beatPlayed}
          onSkip={skipBeat}
          hint={skipHint}
        />
      )}
      {initiativeOpen && (
        <InitiativeShow
          key={together ? `round-${state.round}` : show?.stamp}
          event={initiativeEvent}
          players={state.players
            .filter((p) => !p.eliminated)
            .sort((a, b) => a.seat - b.seat)
            .map((p) => p.id)}
          ready={state.initiativeReady ?? []}
          onRoll={together ? (player) => dispatch({ type: "rollInitiative", player }) : undefined}
          busy={busy}
          names={names}
          mayRoll={(p) => session.kind !== "online" || p === session.me}
          onClose={closeShow}
        />
      )}

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
        />
      )}
    </div>
  );
}
