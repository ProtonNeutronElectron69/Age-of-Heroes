import { MAPS, buildBoard } from "@aoh/content";
import { MAX_PLAYERS, MIN_PLAYERS, seedFromString, type MapDefinition } from "@aoh/rules";
import { useMemo, useState } from "react";
import { customMaps, deleteCustomMap, findMap } from "../maps";
import { SEAT_COLORS, SEAT_COLOR_NAMES } from "../scene/scale";
import { resumeSavedGame, savedGame, startGame } from "../session";

const ROUND_LIMITS = [null, 5, 8, 12] as const;

interface Props {
  /** Open the map editor, optionally starting from an existing map. */
  onOpenEditor: (map: MapDefinition | null) => void;
  /** Map to select when the screen opens (e.g. one just made in the editor). */
  initialMapId?: string;
}

export function SetupScreen({ onOpenEditor, initialMapId }: Props) {
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>(SEAT_COLOR_NAMES.map((c) => `${c} Player`));
  const [armySize, setArmySize] = useState(3);
  const [roundLimit, setRoundLimit] = useState<number | null>(8);
  const [mine, setMine] = useState(() => customMaps());
  const [mapId, setMapId] = useState(() => (initialMapId && findMap(initialMapId) ? initialMapId : MAPS[0]!.id));
  const map = MAPS.find((m) => m.id === mapId) ?? mine.find((m) => m.id === mapId) ?? MAPS[0]!;
  const counts = useMemo(() => buildBoard(map).board.playerCounts(), [map]);
  const players = counts.includes(count) ? count : (counts[0] ?? MIN_PLAYERS);
  const saved = savedGame();
  const isCustom = mine.some((m) => m.id === map.id);

  const start = () => {
    startGame(
      {
        mode: "basic",
        seed: seedFromString(`${Date.now()}:${Math.random()}`),
        mapId: map.id,
        roundLimit,
        armySize,
        players: Array.from({ length: players }, (_, i) => ({
          id: `p${i + 1}`,
          name: names[i]!.trim() || `Player ${i + 1}`,
          color: SEAT_COLORS[i]!,
        })),
      },
      map,
    );
  };

  return (
    <div className="screen setup">
      <section className="panel setup-panel">
        <h1>Age of Heroes</h1>
        <p className="muted">Basic game. Hot-seat for 2 to 6 players on one device.</p>

        <fieldset>
          <legend>Battlefield</legend>
          <div className="map-row">
            <select value={map.id} onChange={(e) => setMapId(e.target.value)} aria-label="Map">
              <optgroup label="Premade maps">
                {MAPS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </optgroup>
              {mine.length > 0 && (
                <optgroup label="My maps">
                  {mine.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            <button type="button" onClick={() => onOpenEditor(map)}>
              {isCustom ? "Edit" : "Copy and edit"}
            </button>
            {isCustom && (
              <button
                type="button"
                onClick={() => {
                  if (!window.confirm(`Delete "${map.name}" from this browser?`)) return;
                  deleteCustomMap(map.id);
                  setMine(customMaps());
                  setMapId(MAPS[0]!.id);
                }}
              >
                Delete
              </button>
            )}
          </div>
          <p className="muted small">{map.description}</p>
        </fieldset>

        <fieldset>
          <legend>Players</legend>
          <div className="segmented" role="radiogroup" aria-label="Number of players">
            {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={players === n}
                className={players === n ? "on" : ""}
                disabled={!counts.includes(n)}
                title={counts.includes(n) ? undefined : "This map does not have enough start zones"}
                onClick={() => setCount(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <ol className="player-list">
            {Array.from({ length: players }, (_, i) => (
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

        <div className="actions">
          <button type="button" className="primary" onClick={start} disabled={counts.length === 0}>
            Start draft
          </button>
          {saved && (
            <button type="button" onClick={() => resumeSavedGame()}>
              Continue saved game
            </button>
          )}
          <button type="button" onClick={() => onOpenEditor(null)}>
            New map
          </button>
        </div>
        <p className="muted small">The Advanced game arrives in a later phase.</p>
      </section>
    </div>
  );
}
