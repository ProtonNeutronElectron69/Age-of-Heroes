import { MAPS, buildBoard } from "@aoh/content";
import { MAX_NAME_LENGTH, parseReplay, type Replay, type RoomSettings } from "@aoh/protocol";
import { MAX_PLAYERS, MIN_PLAYERS, seedFromString, type MapDefinition, type RulesMode } from "@aoh/rules";
import { useMemo, useRef, useState } from "react";
import { customMaps, deleteCustomMap, findMap } from "../maps";
import {
  clearOnlineError,
  createRoom,
  defaultServerUrl,
  joinRoom,
  rejoinSaved,
  savedName,
  savedSeat,
  spectateRoom,
  useOnline,
} from "../online";
import { SEAT_COLORS, SEAT_COLOR_NAMES } from "../scene/scale";
import { resumeSavedGame, savedGame, startGame } from "../session";

const ROUND_LIMITS = [null, 5, 8, 12] as const;
const BUDGETS = [300, 400, 500, 600] as const;

interface Props {
  /** Open the map editor, optionally starting from an existing map. */
  onOpenEditor: (map: MapDefinition | null) => void;
  /** Map to select when the screen opens (e.g. one just made in the editor). */
  initialMapId?: string;
  /** Watch a finished game from a replay file. */
  onOpenReplay: (replay: Replay) => void;
}

type Where = "local" | "online";

export function SetupScreen({ onOpenEditor, initialMapId, onOpenReplay }: Props) {
  const online = useOnline();
  const [where, setWhere] = useState<Where>(() => (online.error || savedSeat() ? "online" : "local"));
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [myName, setMyName] = useState(() => savedName());
  const [code, setCode] = useState("");
  const [replayError, setReplayError] = useState<string | null>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<RulesMode>("basic");
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>(SEAT_COLOR_NAMES.map((c) => `${c} Player`));
  const [armySize, setArmySize] = useState(3);
  const [budget, setBudget] = useState(400);
  const [factionPure, setFactionPure] = useState(false);
  const [roundLimit, setRoundLimit] = useState<number | null>(8);
  const [mine, setMine] = useState(() => customMaps());
  const [mapId, setMapId] = useState(() => (initialMapId && findMap(initialMapId) ? initialMapId : MAPS[0]!.id));
  const map = MAPS.find((m) => m.id === mapId) ?? mine.find((m) => m.id === mapId) ?? MAPS[0]!;
  const counts = useMemo(() => buildBoard(map).board.playerCounts(), [map]);
  const players = counts.includes(count) ? count : (counts[0] ?? MIN_PLAYERS);
  const saved = savedGame();
  const seat = savedSeat();
  const isCustom = mine.some((m) => m.id === map.id);
  const nameOk = myName.trim().length > 0;
  const codeOk = /^[A-Za-z]{4,8}$/.test(code.trim());
  const serverOk = serverUrl.trim().length > 0;

  const create = () => {
    const settings: RoomSettings = {
      mode,
      roundLimit,
      ...(mode === "advanced" ? { budget, factionPure } : { armySize }),
      map,
    };
    createRoom(serverUrl, myName.trim(), settings);
  };

  const openReplay = async (file: File) => {
    try {
      onOpenReplay(parseReplay(JSON.parse(await file.text())));
    } catch (e) {
      setReplayError(e instanceof SyntaxError ? "That file is not a replay." : (e as Error).message);
    }
  };

  const start = () => {
    startGame(
      {
        mode,
        seed: seedFromString(`${Date.now()}:${Math.random()}`),
        mapId: map.id,
        roundLimit,
        ...(mode === "advanced" ? { budget, factionPure } : { armySize }),
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
        <div className="segmented where" role="radiogroup" aria-label="Where to play">
          {(["local", "online"] as const).map((w) => (
            <button
              key={w}
              type="button"
              role="radio"
              aria-checked={where === w}
              className={where === w ? "on" : ""}
              onClick={() => setWhere(w)}
            >
              {w === "local" ? "This device" : "Online"}
            </button>
          ))}
        </div>
        <p className="muted">
          {where === "local"
            ? "Hot-seat for 2 to 6 players on one device."
            : "Each player on their own device, connected through a game server."}
        </p>

        {where === "online" && (
          <fieldset>
            <legend>Online</legend>
            <label className="field">
              <span>Game server</span>
              <input
                aria-label="Game server address"
                value={serverUrl}
                placeholder="wss://your-server.example/ws"
                spellCheck={false}
                onChange={(e) => setServerUrl(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Your name</span>
              <input
                aria-label="Your name"
                value={myName}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => setMyName(e.target.value)}
              />
            </label>
            {online.error && (
              <p className="issues" role="alert" onClick={clearOnlineError}>
                {online.error}
              </p>
            )}
            {seat && (
              <div className="actions">
                <button type="button" className="primary" onClick={() => rejoinSaved()}>
                  Rejoin room {seat.code}
                </button>
              </div>
            )}
            <div className="join-row">
              <input
                aria-label="Room code"
                className="code-input"
                value={code}
                placeholder="CODE"
                maxLength={8}
                spellCheck={false}
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <button
                type="button"
                disabled={!codeOk || !nameOk || !serverOk}
                onClick={() => joinRoom(serverUrl, code.trim(), myName.trim())}
              >
                Join
              </button>
              <button type="button" disabled={!codeOk || !serverOk} onClick={() => spectateRoom(serverUrl, code.trim())}>
                Watch
              </button>
            </div>
            <p className="muted small">
              Join a friend's room with its code, or set up a game below and create a room for others to join.
            </p>
          </fieldset>
        )}

        <fieldset>
          <legend>Rules</legend>
          <div className="segmented" role="radiogroup" aria-label="Rule set">
            {(["basic", "advanced"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? "on" : ""}
                onClick={() => setMode(m)}
              >
                {m === "basic" ? "Basic" : "Advanced"}
              </button>
            ))}
          </div>
          <p className="muted small">
            {mode === "basic"
              ? "The front of each card: move, range, attack and defense. Any wound destroys a figure."
              : "The back of each card: Life, points, special abilities, height bonuses, falling, engagement and strict line of sight."}
          </p>
        </fieldset>

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

        {where === "online" ? (
          <fieldset>
            <legend>Players</legend>
            <p className="muted small">
              {counts.length === 0
                ? "This map has no start zone layouts."
                : `This map hosts ${counts.join(", ")} players. Seats and colors follow the order people join.`}
            </p>
          </fieldset>
        ) : (
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
        )}

        {mode === "advanced" ? (
          <fieldset>
            <legend>Army points</legend>
            <div className="segmented" role="radiogroup" aria-label="Points budget">
              {BUDGETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={budget === n}
                  className={budget === n ? "on" : ""}
                  onClick={() => setBudget(n)}
                >
                  {n} points
                </button>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={factionPure} onChange={(e) => setFactionPure(e.target.checked)} />
              Faction-pure armies (every unit shares the faction of your first pick)
            </label>
          </fieldset>
        ) : (
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
        )}

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
          {where === "local" ? (
            <button type="button" className="primary" onClick={start} disabled={counts.length === 0}>
              Start draft
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={create}
              disabled={counts.length === 0 || !nameOk || !serverOk}
              title={!nameOk ? "Enter your name first" : !serverOk ? "Enter the game server address first" : undefined}
            >
              Create room
            </button>
          )}
          {saved && where === "local" && (
            <button type="button" onClick={() => resumeSavedGame()}>
              Continue saved game
            </button>
          )}
          <button type="button" onClick={() => onOpenEditor(null)}>
            New map
          </button>
          <button type="button" onClick={() => replayInput.current?.click()}>
            Watch a replay
          </button>
          <input
            ref={replayInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Replay file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              setReplayError(null);
              if (file) void openReplay(file);
            }}
          />
        </div>
        {replayError && (
          <p className="issues" role="alert">
            {replayError}
          </p>
        )}
      </section>
    </div>
  );
}
