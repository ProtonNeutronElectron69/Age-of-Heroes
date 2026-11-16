import { Canvas } from "@react-three/fiber";
import { findFigure, type GameEvent, type GameState, type PlayerId, type RulesContext } from "@aoh/rules";
import { useEffect, useMemo, useState } from "react";
import type { Names } from "../describe";
import { useReducedMotion } from "../motion";
import { CardFigure } from "../scene/Figures";
import { CubeDie, D20Die, TrayLights } from "../scene/dice3d";
import type { DiceShow } from "../settings";
import { HexCard } from "./HexCard";

/**
 * The dice show: an attack zooms in on the fight with both units' cards and
 * models over a dimmed board and rolls 3D dice ("scene"), or just rolls the
 * dice ("dice"); initiative rolls a d20 for each player. The rules have already
 * rolled everything; this only shows it, and a click skips it. Afterwards the
 * dice panel keeps the result, as without the show.
 */

export type AttackRoll = Extract<GameEvent, { type: "attackRolled" }> & { readonly attackerId: string };
export type InitiativeRoll = Extract<GameEvent, { type: "initiativeRolled" }>;

/** The rolls in a command that the show plays: attacks and other rolls made by a figure (not falls or swamps). */
export function attackRollsIn(events: readonly GameEvent[]): AttackRoll[] {
  return events.filter((e): e is AttackRoll => e.type === "attackRolled" && e.attackerId !== null);
}

export function initiativeIn(events: readonly GameEvent[]): InitiativeRoll | null {
  return (events.find((e) => e.type === "initiativeRolled") as InitiativeRoll | undefined) ?? null;
}

/** How long a finished attack stays on screen before the show moves on or closes. */
const LINGER_MS = 3000;
const DIE_GAP = 1.3;

function diceRow(count: number, z: number): [number, number, number][] {
  return Array.from({ length: count }, (_, i) => [(i - (count - 1) / 2) * DIE_GAP, 0.45, z]);
}

function resultText(roll: AttackRoll): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(roll.hits, "hit")}, ${plural(roll.blocks, "block")}: ${roll.wounds > 0 ? plural(roll.wounds, "wound") : "no damage"}`;
}

/** A unit's model for the scene, shrunk if its base covers several hexes. */
function SceneModel({ figureId, state, ctx, names, x, yaw }: { figureId: string; state: GameState; ctx: RulesContext; names: Names; x: number; yaw: number }) {
  const hit = findFigure(state, figureId);
  if (!hit) return null;
  const card = ctx.cards.get(hit.unit.cardId)!;
  const scale = card.footprint === "1" ? 1 : card.footprint === "2x1" ? 0.75 : 0.6;
  return (
    <group position={[x, 0, -0.8]} rotation={[0, yaw, 0]} scale={scale}>
      <CardFigure
        cardId={card.id}
        footprint={card.footprint}
        pose={hit.unit.figures.indexOf(hit.figure)}
        faction={card.faction}
        color={names.playerColor(hit.unit.owner)}
        height={card.height}
      />
    </group>
  );
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
}: {
  rolls: readonly AttackRoll[];
  mode: Exclude<DiceShow, "none">;
  state: GameState;
  ctx: RulesContext;
  names: Names;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [landed, setLanded] = useState(0);
  const roll = rolls[index]!;
  const dice = roll.attack.length + roll.defense.length;
  const done = landed >= dice;
  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => {
      if (index + 1 < rolls.length) {
        setIndex(index + 1);
        setLanded(0);
      } else onClose();
    }, LINGER_MS);
    return () => window.clearTimeout(t);
  }, [done, index]);
  const land = () => setLanded((n) => n + 1);
  const full = mode === "scene";
  const title =
    roll.source === "passingStrike"
      ? `${names.figure(roll.attackerId)} strikes ${names.figure(roll.targetId)} as it leaves`
      : roll.ability
        ? `${names.figure(roll.attackerId)}: ${names.ability(roll.attackerId, roll.ability)} on ${names.figure(roll.targetId)}`
        : `${names.figure(roll.attackerId)} attacks ${names.figure(roll.targetId)}`;
  const attackAt = useMemo(() => diceRow(roll.attack.length, full ? 0 : -0.7), [roll, full]);
  const defenseAt = useMemo(() => diceRow(roll.defense.length, full ? 1.6 : 0.7), [roll, full]);
  return (
    <div
      className={`roll-show attack-show ${full ? "full" : "dice-only"}`}
      role="dialog"
      aria-label="Attack"
      data-done={done ? "true" : undefined}
      onClick={onClose}
    >
      {full && <SceneCard figureId={roll.attackerId} state={state} ctx={ctx} names={names} side="attacker" />}
      <div className="scene-stage">
        <div className="scene-title">{title}</div>
        <Canvas
          key={index}
          className="scene-canvas"
          frameloop="demand"
          camera={full ? { position: [0, 6.2, 9.4], fov: 38 } : { position: [0, 5.4, 2.7], fov: 40 }}
          onCreated={({ camera }) => camera.lookAt(0, full ? 0.4 : 0, full ? 0.5 : 0)}
          dpr={[1, 2]}
        >
          <TrayLights />
          {/* A felt tray that fills the whole view. */}
          <color attach="background" args={["#24402f"]} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color="#2c4a36" roughness={0.95} />
          </mesh>
          {full && <SceneModel figureId={roll.attackerId} state={state} ctx={ctx} names={names} x={-3.9} yaw={Math.PI / 2 - 0.45} />}
          {full && <SceneModel figureId={roll.targetId} state={state} ctx={ctx} names={names} x={3.9} yaw={-Math.PI / 2 + 0.45} />}
          {roll.attack.map((face, i) => (
            <CubeDie key={`a${i}`} kind="attack" face={face} at={attackAt[i]!} seed={index * 31 + i} delay={i * 0.08} still={reduced} onLanded={land} />
          ))}
          {roll.defense.map((face, i) => (
            <CubeDie key={`d${i}`} kind="defense" face={face} at={defenseAt[i]!} seed={index * 31 + 17 + i} delay={0.25 + i * 0.08} still={reduced} onLanded={land} />
          ))}
        </Canvas>
        <div className="scene-faces">
          <span>Attack: {roll.attack.length ? roll.attack.join(", ") : "no dice"}</span>
          <span>Defense: {roll.defense.length ? roll.defense.join(", ") : "no dice"}</span>
        </div>
        <div className={`scene-result ${roll.wounds > 0 ? "hit" : "miss"}`} hidden={!done}>
          {resultText(roll)}
        </div>
        <div className="scene-hint">{rolls.length > 1 ? `Roll ${index + 1} of ${rolls.length}. ` : ""}Click to skip</div>
      </div>
      {full && <SceneCard figureId={roll.targetId} state={state} ctx={ctx} names={names} side="defender" />}
    </div>
  );
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
  const rolls = event?.rolls ?? players.map((player) => ({ player, values: [] as number[] }));
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
                    {value === null ? "rolling..." : value}
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
