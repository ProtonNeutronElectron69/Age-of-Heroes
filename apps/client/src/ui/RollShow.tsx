import { Canvas } from "@react-three/fiber";
import { LEVEL_HEIGHT, findFigure, type GameEvent, type GameState, type PlayerId, type RulesContext } from "@aoh/rules";
import { useEffect, useMemo, useState } from "react";
import type { Names } from "../describe";
import type { AttackRoll } from "../fight";
import { useReducedMotion } from "../motion";
import { playSound } from "../sfx";
import { CardFigure } from "../scene/Figures";
import { CastShadows, FELT_HEIGHT, FrameView, ThrownDice, TraySet, WALL_THICK } from "../scene/DiceTray";
import { D20Die, TrayLights } from "../scene/dice3d";
import { throwDice, type DieKind } from "../scene/diceRoll";
import type { DiceShow } from "../settings";
import { HexCard } from "./HexCard";

/**
 * The dice show: an attack zooms in on the fight with both units' cards, and
 * their models standing at the two ends of a dice tray into which the 3D dice
 * are thrown ("scene"), or just throws the dice into the tray ("dice");
 * initiative rolls a d20 for each player. The rules have already
 * rolled everything; this only shows it, and a click skips it (online, an attack's
 * skip waits for every player: the play screen decides). An attack's dice follow
 * its intro on the board (`scene/FightFx.tsx`). Afterwards the dice panel keeps
 * the result, as without the show.
 */

export type InitiativeRoll = Extract<GameEvent, { type: "initiativeRolled" }>;

export function initiativeIn(events: readonly GameEvent[]): InitiativeRoll | null {
  return (events.find((e) => e.type === "initiativeRolled") as InitiativeRoll | undefined) ?? null;
}

/** How long a finished attack stays on screen before the show moves on or closes (a click closes it sooner). */
const LINGER_MS = 3900;

/** How much of the board's size a figure is drawn at by the tray: tall enough to see, whatever its Height. */
function figureScale(height: number, footprint: string): number {
  const size = Math.min(3.2, Math.max(1.9, 4.6 / (height * LEVEL_HEIGHT)));
  return size * (footprint === "1" ? 1 : footprint === "2x1" ? 0.75 : 0.6);
}

/** "Archer attacks Knight": the heading of an attack's intro and dice. */
export function attackTitle(roll: AttackRoll, names: Names): string {
  if (roll.source === "passingStrike") return `${names.figure(roll.attackerId)} strikes ${names.figure(roll.targetId)} as it leaves`;
  if (roll.ability) return `${names.figure(roll.attackerId)}: ${names.ability(roll.attackerId, roll.ability)} on ${names.figure(roll.targetId)}`;
  return `${names.figure(roll.attackerId)} attacks ${names.figure(roll.targetId)}`;
}

/** The result line: hits in red, blocks in blue, wounds in orange. */
function resultText(roll: AttackRoll) {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return (
    <>
      <span className="result-hits">{plural(roll.hits, "hit")}</span>, <span className="result-blocks">{plural(roll.blocks, "block")}</span>:{" "}
      <span className="result-wounds">{roll.wounds > 0 ? plural(roll.wounds, "wound") : "no damage"}</span>
    </>
  );
}

/** A unit's model for the scene, standing on the table at one end of the tray, turned to face the other end. */
function SceneModel({ figureId, state, ctx, names, x, yaw }: { figureId: string; state: GameState; ctx: RulesContext; names: Names; x: number; yaw: number }) {
  const hit = findFigure(state, figureId);
  if (!hit) return null;
  const card = ctx.cards.get(hit.unit.cardId)!;
  return (
    <group position={[x, -FELT_HEIGHT, -0.4]} rotation={[0, yaw, 0]} scale={figureScale(card.height, card.footprint)}>
      <CastShadows>
        <CardFigure
          cardId={card.id}
          footprint={card.footprint}
          pose={hit.unit.figures.indexOf(hit.figure)}
          faction={card.faction}
          color={names.playerColor(hit.unit.owner)}
          height={card.height}
        />
      </CastShadows>
    </group>
  );
}

/** How far a unit's figure reaches from its middle at the tray's scale, and how tall it stands. */
function figureReach(figureId: string, state: GameState, ctx: RulesContext): { reach: number; height: number } {
  const hit = findFigure(state, figureId);
  const card = hit ? ctx.cards.get(hit.unit.cardId) : undefined;
  if (!card) return { reach: 1, height: 2 };
  const scale = figureScale(card.height, card.footprint);
  const hexes = card.footprint === "1" ? 1 : card.footprint === "2x2" ? 2 : card.footprint === "3x1" ? 3 : 2;
  return { reach: 0.85 * scale * hexes, height: card.height * LEVEL_HEIGHT * scale };
}

function SceneCard({ figureId, state, ctx, names, side }: { figureId: string; state: GameState; ctx: RulesContext; names: Names; side: string }) {
  const hit = findFigure(state, figureId);
  if (!hit) return null;
  const card = ctx.cards.get(hit.unit.cardId)!;
  return (
    <div className={`scene-card ${side}`}>
      <HexCard card={card} ownerColor={names.playerColor(hit.unit.owner)} wounds={hit.figure.wounds} />
    </div>
  );
}

/** One attack (or a command's several, in turn) as the full scene or as dice only. */
export function AttackShow({
  rolls,
  mode,
  state,
  ctx,
  names,
  onClose,
  onSkip,
  hint = "Click to skip",
}: {
  rolls: readonly AttackRoll[];
  mode: Exclude<DiceShow, "none">;
  state: GameState;
  ctx: RulesContext;
  names: Names;
  /** The show has played to the end. */
  onClose: () => void;
  /** The player clicked to skip it. */
  onSkip: () => void;
  /** The line at the bottom: how to skip, or (online) who has still to skip. */
  hint?: string;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [landed, setLanded] = useState({ attack: 0, defense: 0 });
  const roll = rolls[index]!;
  const attackDown = landed.attack >= roll.attack.length;
  const defenseDown = landed.defense >= roll.defense.length;
  const done = attackDown && defenseDown;
  // The throw is worked out once per roll; the same roll always tumbles the same way.
  const thrown = useMemo(() => throwDice(roll.attack, roll.defense, rollSeed(roll, index)), [roll, index]);
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => {
      if (index + 1 < rolls.length) {
        setIndex(index + 1);
        setLanded({ attack: 0, defense: 0 });
      } else onClose();
    }, LINGER_MS);
    return () => window.clearTimeout(t);
  }, [done, index]);
  // The attack dice are heard as they are thrown, and the defense dice when they follow (`onDefenseThrown`).
  useEffect(() => {
    if (roll.attack.length > 0 || (roll.defense.length > 0 && reduced)) playSound("dice");
  }, [index]);
  const land = (kind: DieKind) => setLanded((n) => ({ ...n, [kind]: n[kind] + 1 }));
  const full = mode === "scene";
  const title = attackTitle(roll, names);
  const { halfX, halfZ } = thrown.tray;
  const attacker = full ? figureReach(roll.attackerId, state, ctx) : null;
  const defender = full ? figureReach(roll.targetId, state, ctx) : null;
  // The figures stand on the table just outside the tray's ends.
  const attackerX = -(halfX + WALL_THICK + 0.25 + (attacker?.reach ?? 0));
  const defenderX = halfX + WALL_THICK + 0.25 + (defender?.reach ?? 0);
  const halfWidth = full ? Math.max(-attackerX + (attacker?.reach ?? 0), defenderX + (defender?.reach ?? 0)) : halfX + WALL_THICK;
  const tallest = Math.max(attacker?.height ?? 0, defender?.height ?? 0, 1);
  return (
    <div
      className={`roll-show attack-show ${full ? "full" : "dice-only"}`}
      role="dialog"
      aria-label="Attack"
      data-done={done ? "true" : undefined}
      onClick={onSkip}
    >
      {full && <SceneCard figureId={roll.attackerId} state={state} ctx={ctx} names={names} side="attacker" />}
      <div className="scene-stage">
        <div className="scene-title">{title}</div>
        <Canvas key={index} className="scene-canvas" frameloop="demand" shadows camera={{ position: [0, 9, 10], fov: full ? 30 : 34 }} dpr={[1, 2]}>
          <TraySet halfX={halfX} halfZ={halfZ} />
          <FrameView halfWidth={halfWidth} halfDepth={halfZ + WALL_THICK} height={full ? tallest : 0.5} pitch={full ? 0.6 : 1.0} aim={[0, full ? tallest * 0.3 : 0, full ? 0.1 : 0]} />
          {full && <SceneModel figureId={roll.attackerId} state={state} ctx={ctx} names={names} x={attackerX} yaw={Math.PI / 2 - 0.5} />}
          {full && <SceneModel figureId={roll.targetId} state={state} ctx={ctx} names={names} x={defenderX} yaw={-Math.PI / 2 + 0.5} />}
          <ThrownDice roll={thrown} still={reduced} onLanded={land} onDefenseThrown={() => playSound("dice")} />
        </Canvas>
        <div className="scene-faces">
          {/* Each side's faces show once its dice have landed, so the text does not give the roll away. */}
          <span>Attack: {!roll.attack.length ? "no dice" : attackDown ? roll.attack.join(", ") : "rolling..."}</span>
          <span>Defense: {!roll.defense.length ? "no dice" : defenseDown ? roll.defense.join(", ") : attackDown ? "rolling..." : "waiting"}</span>
        </div>
        <div className={`scene-result ${roll.wounds > 0 ? "hit" : "miss"}`} hidden={!done}>
          {resultText(roll)}
        </div>
        <div className="scene-hint">{rolls.length > 1 ? `Roll ${index + 1} of ${rolls.length}. ` : ""}{hint}</div>
      </div>
      {full && <SceneCard figureId={roll.targetId} state={state} ctx={ctx} names={names} side="defender" />}
    </div>
  );
}

/** A seed for a roll's throw, from the roll itself, so every player sees the same tumble. */
function rollSeed(roll: AttackRoll, index: number): number {
  let h = 2166136261 + index;
  for (const ch of `${roll.attackerId}|${roll.targetId}|${roll.attack.join("")}|${roll.defense.join("")}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

const D20_GAP = 2.6;

/**
 * Initiative: a d20 for each player, who clicks it to roll. It tumbles and lands
 * on the value the rules rolled; a tie rolls again.
 *
 * Where players roll for themselves (online games, `onRoll`), the rules make no
 * roll until every player has clicked: until then `event` is null and the dice
 * wait, each player's row saying whether they have rolled. When the roll comes,
 * every die tumbles at once, so nobody sees a result before they have rolled.
 */
export function InitiativeShow({
  event,
  players,
  ready = [],
  onRoll,
  busy = false,
  names,
  mayRoll,
  onClose,
}: {
  event: InitiativeRoll | null;
  /** The players rolling, in seat order (the order of the event's rolls). */
  players: readonly PlayerId[];
  /** Players who have rolled, while waiting for the rest. */
  ready?: readonly PlayerId[];
  /** Send this device's roll for a player; the dice then wait for everyone. Without it the rules have already rolled. */
  onRoll?: (player: PlayerId) => void;
  /** A roll is on its way to the server. */
  busy?: boolean;
  names: Names;
  /** Whether this device rolls for the player (hot-seat: everyone; online: only its own player). */
  mayRoll: (player: PlayerId) => boolean;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const together = onRoll !== undefined;
  const rolls: readonly { player: PlayerId; values: readonly number[]; bonus?: number }[] =
    event?.rolls ?? players.map((player) => ({ player, values: [] as number[] }));
  /** For each player, which of their values the die is showing (-1 before it is rolled), and whether it has landed. */
  const [stage, setStage] = useState<number[]>(() => rolls.map(() => -1));
  const [landed, setLanded] = useState<boolean[]>(() => rolls.map(() => false));
  /** Skipped: every die shows its last value at once. */
  const [skipped, setSkipped] = useState(false);
  const roll = (i: number) => setStage((s) => (s[i] !== -1 ? s : s.map((x, j) => (j === i ? 0 : x))));
  const finished = (i: number) => stage[i] === rolls[i]!.values.length - 1 && landed[i];
  const allDone = event !== null && rolls.every((_, i) => finished(i));

  // Hot-seat: the rules have rolled already, and other devices' players (if any) roll by themselves.
  useEffect(() => {
    if (together) return;
    const timers = rolls.flatMap((r, i) => (mayRoll(r.player) ? [] : [window.setTimeout(() => roll(i), 700 + i * 400)]));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);
  // Everyone has rolled and the result is in: every die tumbles at once.
  useEffect(() => {
    if (together && event) setStage(event.rolls.map(() => 0));
  }, [together, event]);
  // A tie rolls again a moment after the die lands.
  useEffect(() => {
    const timers = rolls.flatMap((r, i) =>
      stage[i]! >= 0 && landed[i] && stage[i]! < r.values.length - 1
        ? [
            window.setTimeout(() => {
              setLanded((l) => l.map((x, j) => (j === i ? false : x)));
              setStage((s) => s.map((x, j) => (j === i ? x + 1 : x)));
            }, 900),
          ]
        : [],
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [stage, landed]);

  // Each throw of a d20 is heard (a skip shows every result without a sound).
  const thrown = stage.reduce((n, s) => n + (s >= 0 ? s + 1 : 0), 0);
  useEffect(() => {
    if (thrown > 0 && !skipped) playSound("dice");
  }, [thrown]);

  const skip = () => {
    setSkipped(true);
    setStage(rolls.map((r) => r.values.length - 1));
    setLanded(rolls.map(() => true));
  };
  // Pull the camera back for more players, so every die fits.
  const camera = [0, 1.2, Math.max(7, rolls.length * 2.6)] as const;
  return (
    <div className="roll-show initiative-show" role="dialog" aria-label="Initiative" data-done={allDone ? "true" : undefined} onClick={allDone ? onClose : undefined}>
      <div className="panel initiative-panel" onClick={(e) => e.stopPropagation()}>
        <h2>Initiative</h2>
        <p className="muted small">Each player rolls a d20; the highest goes first.</p>
        <div className="initiative-stage" style={{ width: `${Math.min(760, rolls.length * 150)}px` }}>
          <Canvas className="scene-canvas" frameloop="demand" camera={{ position: [...camera], fov: 30 }} dpr={[1, 2]}>
            <TrayLights />
            {rolls.map((r, i) => {
              const x = (i - (rolls.length - 1) / 2) * D20_GAP;
              const s = stage[i]!;
              const toward = [camera[0] - x, camera[1], camera[2]] as const;
              return (
                <D20Die
                  key={r.player}
                  value={s < 0 ? 20 : r.values[s]!}
                  toward={toward}
                  at={[x, 0, 0]}
                  seed={i * 13 + s * 5 + 3}
                  throwKey={s}
                  still={reduced || skipped || s < 0}
                  duration={1.2}
                  onLanded={() => s >= 0 && setLanded((l) => l.map((x2, j) => (j === i ? true : x2)))}
                />
              );
            })}
          </Canvas>
        </div>
        <div className="initiative-players">
          {rolls.map((r, i) => {
            const s = stage[i]!;
            const value = s >= 0 && landed[i] ? r.values[s] : null;
            return (
              <div key={r.player} className="initiative-player" data-player={r.player}>
                <span className="swatch" style={{ background: names.playerColor(r.player) }} /> {names.player(r.player)}
                {together && !event ? (
                  mayRoll(r.player) && !ready.includes(r.player) ? (
                    <button type="button" className="primary" disabled={busy} onClick={() => onRoll(r.player)}>
                      Roll for {names.player(r.player)}
                    </button>
                  ) : (
                    <span className="initiative-value" data-ready={ready.includes(r.player) ? "true" : undefined}>
                      {ready.includes(r.player) ? "ready" : "waiting to roll"}
                    </span>
                  )
                ) : s < 0 && mayRoll(r.player) && !together ? (
                  <button type="button" className="primary" onClick={() => roll(i)}>
                    Roll for {names.player(r.player)}
                  </button>
                ) : (
                  <span className="initiative-value" data-value={value ?? undefined}>
                    {value == null ? "rolling..." : r.bonus ? `${value} + ${r.bonus} = ${value + r.bonus}` : value}
                    {value !== null && s < r.values.length - 1 ? ", tied: rolling again" : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {!event ? (
          <p className="muted small">The dice roll once every player has rolled.</p>
        ) : allDone ? (
          <>
            <p className="roll-result">
              <strong>{names.player(event!.order[0]!)}</strong> goes first
              {event!.order.length > 2 ? `, then ${event!.order.slice(1).map((p) => names.player(p)).join(", then ")}` : ""}.
            </p>
            <button type="button" className="primary" onClick={onClose}>
              Continue
            </button>
          </>
        ) : (
          <button type="button" onClick={skip}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
