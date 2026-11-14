import { MAPS, buildBoard, contextFor } from "@aoh/content";
import { MAX_NAME_LENGTH, parseReplay, type Replay, type RoomSettings } from "@aoh/protocol";
import { MAX_BUDGET, MAX_PLAYERS, MIN_PLAYERS, replayGame, seedFromString, type MapDefinition, type RulesMode } from "@aoh/rules";
import { useMemo, useRef, useState } from "react";
import { customMaps, deleteCustomMap, findMap } from "../maps";
import {
  clearOnlineError,
  createRoom,
  defaultServerUrl,
  joinRoom,
  rejoinSaved,
  resumeRoom,
  savedName,
  savedSeat,
  spectateRoom,
  useOnline,
} from "../online";
import { SEAT_COLORS, SEAT_COLOR_NAMES } from "../scene/scale";
import { deleteSave, describeSummary, downloadGameFile, formatSavedAt, listSaves, type SaveSlot } from "../saves";
import { loadGame, resumeSavedGame, savedGame, startGame } from "../session";

const ROUND_LIMITS = [null, 5, 8, 12] as const;
const BUDGETS = [300, 400, 500, 600] as const;
const MIN_POINTS = 50;

interface ResumeChoice {
  readonly record: Replay;
  readonly label: string;
  readonly armies: readonly { readonly id: string; readonly name: string; readonly color: string; readonly out: boolean }[];
}

interface Props {
  /** Open the map editor, optionally starting from an existing map. */
  onOpenEditor: (map: MapDefinition | null) => void;
  /** Map to select when the screen opens (e.g. one just made in the editor). */
  initialMapId?: string;
  /** Watch a finished game from a replay file. */
  onOpenReplay: (replay: Replay) => void;
  /** Browse every unit card and its figure model. */
  onOpenUnits: () => void;
}

type Where = "local" | "online";

export function SetupScreen({ onOpenEditor, initialMapId, onOpenReplay, onOpenUnits }: Props) {
  const online = useOnline();
  const [where, setWhere] = useState<Where>(() => (online.error || savedSeat() ? "online" : "local"));
  const [serverUrl, setServerUrl] = useState(defaultServerUrl);
  const [myName, setMyName] = useState(() => savedName());
  const [code, setCode] = useState("");
  const [replayError, setReplayError] = useState<string | null>(null);
  const replayInput = useRef<HTMLInputElement>(null);
  const saveInput = useRef<HTMLInputElement>(null);
  const [saves, setSaves] = useState(() => listSaves());
  const [loadError, setLoadError] = useState<string | null>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const [resumeChoice, setResumeChoice] = useState<ResumeChoice | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [mode, setMode] = useState<RulesMode>("basic");
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>(SEAT_COLOR_NAMES.map((c) => `${c} Player`));
  const [armySize, setArmySize] = useState(3);
  const [budget, setBudget] = useState(400);
  const [budgetText, setBudgetText] = useState("400");
  const [noLimit, setNoLimit] = useState(false);
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
  const budgetOk = mode !== "advanced" || noLimit || (budget >= MIN_POINTS && budget <= MAX_BUDGET);
  const pickBudget = (n: number) => {
    setBudget(n);
    setBudgetText(String(n));
  };
  const serverOk = serverUrl.trim().length > 0;

  const create = () => {
    const settings: RoomSettings = {
      mode,
      roundLimit,
      ...(mode === "advanced" ? { budget: noLimit ? null : budget, factionPure } : { armySize }),
      map,
    };
    createRoom(serverUrl, myName.trim(), settings);
  };

  const readGameFile = async (file: File): Promise<Replay> => {
    try {
      return parseReplay(JSON.parse(await file.text()));
    } catch (e) {
      throw new Error(e instanceof SyntaxError ? "That file is not an Age of Heroes game file." : (e as Error).message);
    }
  };

  const openReplay = async (file: File) => {
    try {
      onOpenReplay(await readGameFile(file));
    } catch (e) {
      setReplayError((e as Error).message);
    }
  };

  /** Loading replaces the unfinished game kept from last time, so check first. */
  const mayReplaceCurrent = () =>
    !saved ||
    window.confirm(
      `Loading replaces your unfinished game${saved.summary ? ` (${describeSummary(saved.summary)})` : ""}. Save it first if you want to keep it. Load anyway?`,
    );

  const openSave = async (file: File) => {
    setLoadError(null);
    try {
      const record = await readGameFile(file);
      if (!mayReplaceCurrent()) return;
      const problem = loadGame(record);
      if (problem) setLoadError(problem);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };

  /** Check a saved game can be continued, then ask which army is the host's. */
  const chooseResume = (record: Replay, label: string) => {
    setResumeError(null);
    setResumeChoice(null);
    try {
      const { state } = replayGame(record.setup, record.commands, contextFor(record.map).ctx);
      if (state.phase === "gameOver") throw new Error("That game is already over; watch it as a replay instead.");
      setResumeChoice({
        record,
        label,
        armies: record.setup.players.map((p) => ({
          ...p,
          out: state.players.find((x) => x.id === p.id)?.eliminated ?? false,
        })),
      });
    } catch (e) {
      setResumeError((e as Error).message);
    }
  };

  const openResumeFile = async (file: File) => {
    try {
      const record = await readGameFile(file);
      chooseResume(record, record.name ?? file.name.replace(/\.json$/i, ""));
    } catch (e) {
      setResumeError((e as Error).message);
    }
  };

  const loadSlot = (slot: SaveSlot) => {
    setLoadError(null);
    if (!mayReplaceCurrent()) return;
    const problem = loadGame(slot.record);
    if (problem) setLoadError(problem);
  };

  const start = () => {
    startGame(
      {
        mode,
        seed: seedFromString(`${Date.now()}:${Math.random()}`),
        mapId: map.id,
        roundLimit,
        ...(mode === "advanced" ? { budget: noLimit ? null : budget, factionPure } : { armySize }),
        players: Array.from({ length: players }, (_, i) => ({
          id: `p${i + 1}`,
          name: names[i]!.trim() || `Player ${i + 1}`,
          color: SEAT_COLORS[i]!,
        })),
      },
      map,
    );
  };

  const savedSection = (saved || saves.length > 0 || loadError) && (
          <fieldset>
            <legend>Saved games</legend>
            {saved && (
              <div className="save-row current">
                <div className="save-info">
                  <strong>Last game</strong>
                  <span className="muted small">
                    {saved.summary ? describeSummary(saved.summary) : "Kept automatically"}
                  </span>
                </div>
                <div className="save-actions">
                  {where === "local" ? (
                    <button type="button" className="primary" onClick={() => resumeSavedGame()}>
                      Continue
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        chooseResume({ formatVersion: 1, setup: saved.setup, map: saved.map, commands: saved.commands }, "Last game")
                      }
                    >
                      Host online
                    </button>
                  )}
                </div>
              </div>
            )}
            {saves.length > 0 && (
              <ul className="save-list" aria-label="Saved games">
                {saves.map((slot) => (
                  <li key={slot.id} className="save-row">
                    <div className="save-info">
                      <strong>{slot.name}</strong>
                      <span className="muted small">
                        {describeSummary(slot.summary)}
                        {formatSavedAt(slot.savedAt) ? `, saved ${formatSavedAt(slot.savedAt)}` : ""}
                      </span>
                    </div>
                    <div className="save-actions">
                      {where === "local" ? (
                        <button type="button" onClick={() => loadSlot(slot)} aria-label={`Load ${slot.name}`}>
                          Load
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => chooseResume(slot.record, slot.name)}
                          aria-label={`Host ${slot.name} online`}
                        >
                          Host online
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadGameFile(slot.record, slot.name)}
                        aria-label={`Download ${slot.name}`}
                        title="Download as a file"
                      >
                        File
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${slot.name}`}
                        onClick={() => {
                          if (!window.confirm(`Delete the save "${slot.name}"?`)) return;
                          deleteSave(slot.id);
                          setSaves(listSaves());
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {loadError && (
              <p className="issues" role="alert">
                {loadError}
              </p>
            )}
          </fieldset>
  );

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

        {where === "local" && savedSection}

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

            <div className="resume-row">
              <button type="button" onClick={() => resumeInput.current?.click()}>
                Resume from a save file
              </button>
              <input
                ref={resumeInput}
                type="file"
                accept=".json,application/json"
                hidden
                aria-label="Resume file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void openResumeFile(file);
                }}
              />
              <span className="muted small">or pick one under Saved games.</span>
            </div>
            {resumeError && (
              <p className="issues" role="alert">
                {resumeError}
              </p>
            )}
            {resumeChoice && (
              <div className="resume-choice" role="group" aria-label="Resume a saved game">
                <p className="small">
                  Resume <strong>{resumeChoice.label}</strong> in a new room. Which army is yours?
                </p>
                <div className="actions">
                  {resumeChoice.armies.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={!serverOk}
                      title={!serverOk ? "Enter the game server address first" : undefined}
                      onClick={() => resumeRoom(serverUrl, resumeChoice.record, a.id)}
                    >
                      <span className="swatch" style={{ background: a.color }} /> {a.name}
                      {a.out ? " (out)" : ""}
                    </button>
                  ))}
                  <button type="button" className="link-button" onClick={() => setResumeChoice(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </fieldset>
        )}
        {where === "online" && savedSection}

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
                  aria-checked={!noLimit && budget === n}
                  className={!noLimit && budget === n ? "on" : ""}
                  disabled={noLimit}
                  onClick={() => pickBudget(n)}
                >
                  {n} points
                </button>
              ))}
            </div>
            <div className="control-row">
              <label className="inline-field">
                Points
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Points per player"
                  min={MIN_POINTS}
                  max={MAX_BUDGET}
                  step={25}
                  value={budgetText}
                  disabled={noLimit}
                  onChange={(e) => {
                    setBudgetText(e.target.value);
                    const n = Number(e.target.value);
                    setBudget(Number.isInteger(n) ? n : NaN);
                  }}
                  onBlur={() => {
                    if (Number.isInteger(budget)) pickBudget(Math.min(MAX_BUDGET, Math.max(MIN_POINTS, budget)));
                    else pickBudget(400);
                  }}
                />
              </label>
              <label className="check">
                <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} />
                No limit
              </label>
            </div>
            <p className={`muted small ${budgetOk ? "" : "bad"}`}>
              {noLimit
                ? "Players draft until they choose to stop or their start zone is full."
                : `Any whole number from ${MIN_POINTS} to ${MAX_BUDGET}.`}
            </p>
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
            <button type="button" className="primary" onClick={start} disabled={counts.length === 0 || !budgetOk}>
              Start draft
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={create}
              disabled={counts.length === 0 || !nameOk || !serverOk || !budgetOk}
              title={!nameOk ? "Enter your name first" : !serverOk ? "Enter the game server address first" : undefined}
            >
              Create room
            </button>
          )}
          {where === "local" && (
            <button type="button" onClick={() => saveInput.current?.click()}>
              Load a save file
            </button>
          )}
          <button type="button" onClick={() => onOpenEditor(null)}>
            New map
          </button>
          <button type="button" onClick={() => replayInput.current?.click()}>
            Watch a replay
          </button>
          <button type="button" onClick={onOpenUnits}>
            Unit gallery
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
          <input
            ref={saveInput}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Save file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void openSave(file);
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
