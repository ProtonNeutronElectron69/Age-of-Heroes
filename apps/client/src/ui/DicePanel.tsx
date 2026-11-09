import { Rng, rollCombat, seedFromString, type CombatRoll, type DieFace } from "@aoh/rules";
import { useRef, useState } from "react";

function FaceIcon({ face }: { face: DieFace }) {
  return (
    <span className={`die die-${face}`} title={face}>
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

/** A quick check that the engine's dice and combat maths work in the browser. */
export function DicePanel() {
  const rng = useRef(new Rng(seedFromString(String(Date.now()))));
  const [attack, setAttack] = useState(3);
  const [defense, setDefense] = useState(2);
  const [roll, setRoll] = useState<CombatRoll | null>(null);

  return (
    <section className="panel">
      <h2>Dice test</h2>
      <div className="dice-controls">
        <label>
          Attack
          <input type="number" min={0} max={12} value={attack} onChange={(e) => setAttack(Number(e.target.value))} />
        </label>
        <label>
          Defense
          <input type="number" min={0} max={12} value={defense} onChange={(e) => setDefense(Number(e.target.value))} />
        </label>
        <button type="button" onClick={() => setRoll(rollCombat(rng.current, attack, defense))}>
          Roll
        </button>
      </div>
      {roll && (
        <div className="dice-result">
          <div className="dice-row">
            {roll.attack.map((f, i) => (
              <FaceIcon key={`a${i}`} face={f} />
            ))}
          </div>
          <div className="dice-row">
            {roll.defense.map((f, i) => (
              <FaceIcon key={`d${i}`} face={f} />
            ))}
          </div>
          <p>
            {roll.hits} {roll.hits === 1 ? "hit" : "hits"}, {roll.blocks} {roll.blocks === 1 ? "block" : "blocks"}:{" "}
            <strong>
              {roll.wounds} {roll.wounds === 1 ? "wound" : "wounds"}
            </strong>
          </p>
        </div>
      )}
    </section>
  );
}
