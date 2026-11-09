import { MAPS } from "@aoh/content";
import { MAX_PLAYERS, MIN_PLAYERS, seedFromString } from "@aoh/rules";
import { useState } from "react";
import { SEAT_COLORS, SEAT_COLOR_NAMES } from "../scene/scale";
import { resumeSavedGame, savedGame, startGame } from "../session";

const ROUND_LIMITS = [null, 5, 8, 12] as const;

export function SetupScreen() {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>(SEAT_COLOR_NAMES.map((c) => `${c} Player`));
  const [armySize, setArmySize] = useState(3);
  const [roundLimit, setRoundLimit] = useState<number | null>(8);
  const [mapId, setMapId] = useState(MAPS[0]!.id);
  const saved = savedGame();

  const start = () => {
    startGame({
      mode: "basic",
      seed: seedFromString(`${Date.now()}:${Math.random()}`),
      mapId,
      roundLimit,
      armySize,
      players: Array.from({ length: count }, (_, i) => ({
        id: `p${i + 1}`,
        name: names[i]!.trim() || `Player ${i + 1}`,
        color: SEAT_COLORS[i]!,
      })),
    });
  };

  return (
    <div className="screen setup">
      <section className="panel setup-panel">
        <h1>Age of Heroes</h1>
        <p className="muted">Basic game. Hot-seat for 2 to 6 players on one device.</p>

        <fieldset>
          <legend>Players</legend>
          <div className="segmented" role="radiogroup" aria-label="Number of players">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={count === n}
                className={count === n ? "on" : ""}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <ol className="player-list">
            {Array.from({ length: count }, (_, i) => (
              <li key={i}>
                <span className="swatch" style={{ background: SEAT_COLORS[i] }} />
                <input
                  aria-label={`Player ${i + 1} name`}
                  value={names[i]}
                  maxLength={24}
                  onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
                />
              </li>
            ))}
          </ol>
          <p className="muted small">Turn order passes in this order (to the left).</p>
        </fieldset>

        <fieldset>
          <legend>Army size</legend>
          <div className="segmented" role="radiogroup" aria-label="Cards per player">
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={armySize === n}
                className={armySize === n ? "on" : ""}
                onClick={() => setArmySize(n)}
              >
                {n} {n === 1 ? "card" : "cards"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Round limit</legend>
          <div className="segmented" role="radiogroup" aria-label="Round limit">
            {ROUND_LIMITS.map((n) => (
              <button
                key={String(n)}
                type="button"
                role="radio"
                aria-checked={roundLimit === n}
                className={roundLimit === n ? "on" : ""}
                onClick={() => setRoundLimit(n)}
              >
                {n === null ? "None" : `${n} rounds`}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Battlefield</legend>
          <select value={mapId} onChange={(e) => setMapId(e.target.value)} aria-label="Map">
            {MAPS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <p className="muted small">{MAPS.find((m) => m.id === mapId)?.description}</p>
        </fieldset>

        <div className="actions">
          <button type="button" className="primary" onClick={start}>
            Start draft
          </button>
          {saved && (
            <button type="button" onClick={() => resumeSavedGame()}>
              Continue saved game
            </button>
          )}
        </div>
        <p className="muted small">The Advanced game arrives in a later phase.</p>
      </section>
    </div>
  );
}
