import { CARDS, MAPS, contextFor } from "@aoh/content";
import { applyCommand, createGame, type DieFace, type GameState } from "@aoh/rules";
import { useMemo, useState } from "react";
import { Names } from "../describe";
import type { AttackRoll } from "../fight";
import type { DiceShow } from "../settings";
import { deployAll } from "../testGame";
import { AttackShow } from "../ui/RollShow";

/**
 * The attack show on its own, a design page opened with `?dice` in the address: pick the two
 * units, how many dice each side rolls and the show, then roll as often as you like. The faces are
 * rolled here at random; nothing is played.
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

export function DiceShowScreen() {
  const [attacker, setAttacker] = useState(CARDS[0]!.id);
  const [defender, setDefender] = useState(CARDS[1]!.id);
  const [attackDice, setAttackDice] = useState(4);
  const [defenseDice, setDefenseDice] = useState(3);
  const [mode, setMode] = useState<Exclude<DiceShow, "none">>("scene");
  const [roll, setRoll] = useState<{ key: number; roll: AttackRoll } | null>(null);
  const game = useMemo(() => gameWith(attacker, defender), [attacker, defender]);
  const names = useMemo(() => new Names(game.state, game.ctx), [game]);
  const throwNow = () => {
    const attack = faces(attackDice, "skull");
    const defense = faces(defenseDice, "shield");
    const hits = attack.filter((f) => f === "skull").length;
    const blocks = defense.filter((f) => f === "shield").length;
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
        <p>The attack show on its own. Choose two units and the dice, then roll; the faces are random, and nothing is played.</p>
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
      </div>
    </main>
  );
}
