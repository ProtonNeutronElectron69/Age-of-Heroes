import { CARDS, MAPS, contextFor } from "@aoh/content";
import { applyCommand, createGame, type DieFace, type GameState, type PlayerId } from "@aoh/rules";
import { useMemo, useState } from "react";
import { Names } from "../describe";
import type { AttackRoll } from "../fight";
import type { DiceShow } from "../settings";
import { deployAll } from "../testGame";
import { AttackShow, InitiativeShow, type InitiativeRoll } from "../ui/RollShow";

/**
 * The dice show on its own, a design page opened with `?dice` in the address: pick the two
 * units, how many dice each side rolls and the show, then roll as often as you like; or roll
 * initiative for 2 to 6 players. The faces are rolled here at random; nothing is played.
 */

const MAP = MAPS.find((m) => m.id === "twin-fords") ?? MAPS[0]!;

function gameWith(attacker: string, defender: string): { state: GameState; ctx: ReturnType<typeof contextFor>["ctx"] } {
  const { ctx } = contextFor(MAP);
  const setup = {
    seed: 1,
    mapId: MAP.id,
    roundLimit: null,
    players: [
      { id: "p1", name: "Red Player", color: "#d64545" },
      { id: "p2", name: "Blue Player", color: "#3f7fd6" },
    ],
    armies: { p1: [attacker], p2: [defender] },
  };
  let state = createGame(setup, ctx).state;
  for (const command of deployAll(state, ctx)) {
    const r = applyCommand(state, command, ctx);
    if (r.ok) state = r.state;
  }
  return { state, ctx };
}

const faces = (n: number, mark: DieFace): DieFace[] => Array.from({ length: n }, () => (Math.random() < 0.5 ? mark : "blank"));

const SEATS = [
  { id: "p1", name: "Red", color: "#d64545" },
  { id: "p2", name: "Blue", color: "#3f7fd6" },
  { id: "p3", name: "Green", color: "#3fa45b" },
  { id: "p4", name: "Gold", color: "#e0b43a" },
  { id: "p5", name: "Violet", color: "#8a5cd0" },
  { id: "p6", name: "White", color: "#e8e4dc" },
];

/** A roll-off as the rules make it: everyone rolls a d20, and those tied for the highest roll again. */
function rollOff(players: readonly PlayerId[]): InitiativeRoll {
  const values = new Map(players.map((p) => [p, [] as number[]]));
  let rolling = [...players];
  while (rolling.length > 1) {
    for (const p of rolling) values.get(p)!.push(1 + Math.floor(Math.random() * 20));
    const last = (p: PlayerId) => values.get(p)!.at(-1)!;
    const best = Math.max(...rolling.map(last));
    rolling = rolling.filter((p) => last(p) === best);
  }
  // The winner goes first, then play passes to the left.
  const seat = players.indexOf(rolling[0]!);
  return {
    type: "initiativeRolled",
    rolls: players.map((player) => ({ player, values: values.get(player)! })),
    order: players.map((_, i) => players[(seat + i) % players.length]!),
  };
}

export function DiceShowScreen() {
  const [attacker, setAttacker] = useState(CARDS[0]!.id);
  const [defender, setDefender] = useState(CARDS[1]!.id);
  const [attackDice, setAttackDice] = useState(4);
  const [defenseDice, setDefenseDice] = useState(3);
  const [mode, setMode] = useState<Exclude<DiceShow, "none">>("scene");
  const [roll, setRoll] = useState<{ key: number; roll: AttackRoll } | null>(null);
  const [players, setPlayers] = useState(2);
  const [initiative, setInitiative] = useState<{ key: number; event: InitiativeRoll } | null>(null);
  const game = useMemo(() => gameWith(attacker, defender), [attacker, defender]);
  const names = useMemo(() => new Names(game.state, game.ctx), [game]);
  const seats = SEATS.slice(0, players);
  const seatNames = useMemo(() => new Names({ ...game.state, players: SEATS.map((p, i) => ({ ...game.state.players[0]!, ...p, seat: i })) }, game.ctx), [game]);
  const throwNow = () => {
    const attack = faces(attackDice, "skull");
    const defense = faces(defenseDice, "shield");
    const hits = attack.filter((f) => f === "skull").length;
    const blocks = defense.filter((f) => f === "shield").length;
    setInitiative(null);
    setRoll({
      key: Date.now(),
      roll: {
        type: "attackRolled",
        source: "attack",
        attackerId: "p1:0#1",
        targetId: "p2:0#1",
        attack,
        defense,
        hits,
        blocks,
        wounds: Math.max(0, hits - blocks),
        attackBonus: 0,
        defenseBonus: 0,
      },
    });
  };
  const counts = Array.from({ length: 13 }, (_, i) => i);
  return (
    <main className="dice-page">
      <header className="dice-page-head">
        <h1>Dice show</h1>
        <p>The dice show on its own. Choose two units and the dice, then roll, or roll initiative; the faces are random, and nothing is played.</p>
        <div className="dice-page-controls">
          <label>
            Attacker
            <select id="dice-attacker" value={attacker} onChange={(e) => setAttacker(e.target.value)}>
              {CARDS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Defender
            <select id="dice-defender" value={defender} onChange={(e) => setDefender(e.target.value)}>
              {CARDS.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Attack dice
            <select id="dice-attack" value={attackDice} onChange={(e) => setAttackDice(Number(e.target.value))}>
              {counts.slice(1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Defense dice
            <select id="dice-defense" value={defenseDice} onChange={(e) => setDefenseDice(Number(e.target.value))}>
              {counts.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Show
            <select id="dice-mode" value={mode} onChange={(e) => setMode(e.target.value as Exclude<DiceShow, "none">)}>
              <option value="scene">Full scene</option>
              <option value="dice">Dice only</option>
            </select>
          </label>
          <button type="button" className="primary" onClick={throwNow}>
            Roll
          </button>
          <label>
            Players
            <select id="dice-players" value={players} onChange={(e) => setPlayers(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              setRoll(null);
              setInitiative({ key: Date.now(), event: rollOff(seats.map((p) => p.id)) });
            }}
          >
            Roll initiative
          </button>
        </div>
      </header>
      <div className="dice-page-stage">
        {roll && (
          <AttackShow
            key={roll.key}
            rolls={[roll.roll]}
            mode={mode}
            state={game.state}
            ctx={game.ctx}
            names={names}
            onClose={() => setRoll(null)}
            onSkip={() => setRoll(null)}
            hint="Click to close"
          />
        )}
        {initiative && (
          <InitiativeShow
            key={initiative.key}
            event={initiative.event}
            players={initiative.event.rolls.map((r) => r.player)}
            names={seatNames}
            mayRoll={() => true}
            onClose={() => setInitiative(null)}
          />
        )}
      </div>
    </main>
  );
}
