import { CARDS, MAPS, buildBoard, contextFor } from "@aoh/content";
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
import { MenuFrame, type MenuCommand } from "./menu/MenuFrame";

const ROUND_LIMITS = [null, 5, 8, 12] as const;
const BUDGETS = [300, 400, 500, 600] as const;
const MIN_POINTS = 50;
/** How many players each premade map hosts, for its button. */
const PREMADE_COUNTS = new Map(MAPS.map((m) => [m.id, buildBoard(m).board.playerCounts()]));

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
  const [view, setView] = useState<"play" | "saves">("play");
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

  // ---- Settings shared by both ways to play --------------------------------
  const rules = (
    <section className="mp-sec mp-rules">
      <h3 className="mp-label">Rules</h3>
      <div className="mp-seg" role="radiogroup" aria-label="Rule set">
        {(["basic", "advanced"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>
            {m === "basic" ? "Basic" : "Advanced"}
          </button>
        ))}
      </div>
      <p className="mp-hint">
        {mode === "basic"
          ? "The front of each card: move, range, attack and defense. Any wound destroys a figure."
          : "The back of each card: Life, points, abilities, height bonuses, falling, engagement and strict line of sight."}
      </p>
    </section>
  );

  const playersSection =
    where === "online" ? (
      <section className="mp-sec mp-players">
        <h3 className="mp-label">Players</h3>
        <p className="mp-hint">
          {counts.length === 0
            ? "This map has no start zone layouts."
            : `This map hosts ${counts.join(", ")} players. Seats and colours follow the order people join.`}
        </p>
      </section>
    ) : (
      <section className="mp-sec mp-players">
        <h3 className="mp-label">Players</h3>
        <div className="mp-seg" role="radiogroup" aria-label="Number of players">
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
        <ol className="mp-names" aria-label="Player names, in turn order">
          {Array.from({ length: players }, (_, i) => (
            <li key={i}>
              <span className="swatch" style={{ background: SEAT_COLORS[i] }} />
              <input
                className="mp-input"
                aria-label={`Player ${i + 1} name`}
                value={names[i]}
                maxLength={24}
                onChange={(e) => setNames(names.map((n, j) => (j === i ? e.target.value : n)))}
              />
            </li>
          ))}
        </ol>
      </section>
    );

  const army =
    mode === "advanced" ? (
      <section className="mp-sec mp-army">
        <h3 className="mp-label">Army points</h3>
        <div className="mp-seg" role="radiogroup" aria-label="Points budget">
          {BUDGETS.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-label={`${n} points`}
              aria-checked={!noLimit && budget === n}
              className={!noLimit && budget === n ? "on" : ""}
              disabled={noLimit}
              onClick={() => pickBudget(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mp-row">
          <label className="mp-inline">
            Other
            <input
              className="mp-input mp-number"
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
          <label className="mp-check">
            <input type="checkbox" checked={noLimit} onChange={(e) => setNoLimit(e.target.checked)} />
            No limit
          </label>
          <label className="mp-check">
            <input type="checkbox" checked={factionPure} onChange={(e) => setFactionPure(e.target.checked)} />
            One faction per army
          </label>
        </div>
        {(noLimit || !budgetOk) && (
          <p className={`mp-hint${budgetOk ? "" : " bad"}`}>
            {noLimit ? "Players draft until they stop or their start zone is full." : `Any whole number from ${MIN_POINTS} to ${MAX_BUDGET}.`}
          </p>
        )}
      </section>
    ) : (
      <section className="mp-sec mp-army">
        <h3 className="mp-label">Army size</h3>
        <div className="mp-seg" role="radiogroup" aria-label="Cards per player">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={armySize === n} className={armySize === n ? "on" : ""} onClick={() => setArmySize(n)}>
              {n} {n === 1 ? "card" : "cards"}
            </button>
          ))}
        </div>
      </section>
    );

  const battlefield = (
    <section className="mp-sec mp-map">
      <h3 className="mp-label">Battlefield</h3>
      <div className="mp-maps" role="radiogroup" aria-label="Map">
        {MAPS.map((m) => {
          const n = PREMADE_COUNTS.get(m.id) ?? [];
          return (
            <button key={m.id} type="button" role="radio" aria-label={m.name} aria-checked={map.id === m.id} className={`mp-mapbtn${map.id === m.id ? " on" : ""}`} onClick={() => setMapId(m.id)}>
              <span className={`mp-mhex m-${m.id}`} aria-hidden="true" />
              <span className="mp-mapname">
                <b>{m.name}</b>
                <small>{n.length > 1 ? `${n[0]} to ${n[n.length - 1]} players` : `${n[0] ?? 0} players`}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mp-row">
        {mine.length > 0 && (
          <select className="mp-input mp-mine" aria-label="My maps" value={isCustom ? map.id : ""} onChange={(e) => e.target.value && setMapId(e.target.value)}>
            <option value="">My maps…</option>
            {mine.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="mp-btn" onClick={() => onOpenEditor(map)}>
          {isCustom ? "Edit" : "Copy and edit"}
        </button>
        {isCustom && (
          <button
            type="button"
            className="mp-btn"
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
      <p className="mp-hint mp-desc">{map.description}</p>
    </section>
  );

  const rounds = (
    <section className="mp-sec mp-rounds">
      <h3 className="mp-label">Round limit</h3>
      <div className="mp-seg" role="radiogroup" aria-label="Round limit">
        {ROUND_LIMITS.map((n) => (
          <button
            key={String(n)}
            type="button"
            role="radio"
            aria-label={n === null ? "No round limit" : `${n} rounds`}
            aria-checked={roundLimit === n}
            className={roundLimit === n ? "on" : ""}
            onClick={() => setRoundLimit(n)}
          >
            {n === null ? "None" : n}
          </button>
        ))}
      </div>
    </section>
  );

  const connection = (
    <section className="mp-sec mp-conn">
      <div className="mp-row mp-fields">
        <label className="mp-field">
          <span className="mp-label">Game server</span>
          <input
            className="mp-input"
            aria-label="Game server address"
            value={serverUrl}
            placeholder="wss://your-server.example/ws"
            spellCheck={false}
            onChange={(e) => setServerUrl(e.target.value)}
          />
        </label>
        <label className="mp-field">
          <span className="mp-label">Your name</span>
          <input className="mp-input" aria-label="Your name" value={myName} maxLength={MAX_NAME_LENGTH} onChange={(e) => setMyName(e.target.value)} />
        </label>
      </div>
      {online.error && (
        <p className="mp-issue" role="alert" onClick={clearOnlineError}>
          {online.error}
        </p>
      )}
      <div className="mp-row">
        <input
          className="mp-input mp-code"
          aria-label="Room code"
          value={code}
          placeholder="ROOM CODE"
          maxLength={8}
          spellCheck={false}
          autoCapitalize="characters"
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
        <button type="button" className="mp-btn" disabled={!codeOk || !nameOk || !serverOk} onClick={() => joinRoom(serverUrl, code.trim(), myName.trim())}>
          Join
        </button>
        <button type="button" className="mp-btn" disabled={!codeOk || !serverOk} onClick={() => spectateRoom(serverUrl, code.trim())}>
          Watch
        </button>
        {seat && (
          <button type="button" className="mp-btn mp-strong" onClick={() => rejoinSaved()}>
            Rejoin room {seat.code}
          </button>
        )}
        <button type="button" className="mp-btn" onClick={() => resumeInput.current?.click()}>
          Resume from a save file
        </button>
      </div>
      {resumeError && (
        <p className="mp-issue" role="alert">
          {resumeError}
        </p>
      )}
      {resumeChoice && (
        <div className="mp-resume" role="group" aria-label="Resume a saved game">
          <p className="mp-hint">
            Resume <strong>{resumeChoice.label}</strong> in a new room. Which army is yours?
          </p>
          <div className="mp-row">
            {resumeChoice.armies.map((a) => (
              <button
                key={a.id}
                type="button"
                className="mp-btn"
                disabled={!serverOk}
                title={!serverOk ? "Enter the game server address first" : undefined}
                onClick={() => resumeRoom(serverUrl, resumeChoice.record, a.id)}
              >
                <span className="swatch" style={{ background: a.color }} /> {a.name}
                {a.out ? " (out)" : ""}
              </button>
            ))}
            <button type="button" className="mp-btn mp-quiet" onClick={() => setResumeChoice(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );

  const playPanel = (
    <div className={`mp mp-play mp-${where}`}>
      {where === "online" && connection}
      <div className="mp-cols">
        <div className="mp-col mp-col1">
          {rules}
          {playersSection}
          {rounds}
        </div>
        <div className="mp-col mp-col2">
          {army}
          {battlefield}
        </div>
      </div>
      <div className="mp-foot">
        <p className="mp-hint">
          {where === "local"
            ? `${players} players on ${map.name}. Turns pass in the order above.`
            : "Create a room with these settings and share its code, or join a friend's room above."}
        </p>
        {where === "local" ? (
          <button type="button" className="mp-go" onClick={start} disabled={counts.length === 0 || !budgetOk}>
            Start draft
          </button>
        ) : (
          <button
            type="button"
            className="mp-go"
            onClick={create}
            disabled={counts.length === 0 || !nameOk || !serverOk || !budgetOk}
            title={!nameOk ? "Enter your name first" : !serverOk ? "Enter the game server address first" : undefined}
          >
            Create room
          </button>
        )}
      </div>
    </div>
  );

  const savesPanel = (
    <div className="mp mp-saves">
      {saved && (
        <div className="mp-save current">
          <div className="mp-save-info">
            <strong>Last game</strong>
            <span>{saved.summary ? describeSummary(saved.summary) : "Kept automatically"}</span>
          </div>
          <div className="mp-row">
            {where === "local" ? (
              <button type="button" className="mp-btn mp-strong" onClick={() => resumeSavedGame()}>
                Resume
              </button>
            ) : (
              <button
                type="button"
                className="mp-btn"
                onClick={() => chooseResume({ formatVersion: 1, setup: saved.setup, map: saved.map, commands: saved.commands }, "Last game")}
              >
                Host online
              </button>
            )}
          </div>
        </div>
      )}
      {saves.length > 0 ? (
        <ul className="mp-savelist" aria-label="Saved games">
          {saves.map((slot) => (
            <li key={slot.id} className="mp-save">
              <div className="mp-save-info">
                <strong>{slot.name}</strong>
                <span>
                  {describeSummary(slot.summary)}
                  {formatSavedAt(slot.savedAt) ? `, saved ${formatSavedAt(slot.savedAt)}` : ""}
                </span>
              </div>
              <div className="mp-row">
                {where === "local" ? (
                  <button type="button" className="mp-btn" onClick={() => loadSlot(slot)} aria-label={`Load ${slot.name}`}>
                    Load
                  </button>
                ) : (
                  <button type="button" className="mp-btn" onClick={() => chooseResume(slot.record, slot.name)} aria-label={`Host ${slot.name} online`}>
                    Host online
                  </button>
                )}
                <button type="button" className="mp-btn" onClick={() => downloadGameFile(slot.record, slot.name)} aria-label={`Download ${slot.name}`} title="Download as a file">
                  File
                </button>
                <button
                  type="button"
                  className="mp-btn"
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
      ) : (
        !saved && <p className="mp-hint">No saved games yet. Save a game from its menu while you play, and it appears here.</p>
      )}
      {where === "online" && resumeChoice && connection}
      {loadError && (
        <p className="mp-issue" role="alert">
          {loadError}
        </p>
      )}
      <div className="mp-foot">
        <p className="mp-hint">{where === "local" ? "A save file holds a whole game; load one from your device." : "Pick a save above to host it in a new room."}</p>
        <button type="button" className="mp-go" onClick={() => saveInput.current?.click()}>
          Load a save file
        </button>
      </div>
    </div>
  );

  const commands: MenuCommand[] = [
    {
      id: "local",
      label: "Play on this device",
      sub: "Hot-seat, pass the screen",
      icon: "swords",
      on: view === "play" && where === "local",
      onClick: () => {
        setWhere("local");
        setView("play");
      },
    },
    {
      id: "online",
      label: "Play online",
      sub: "Create or join a room",
      icon: "globe",
      on: view === "play" && where === "online",
      onClick: () => {
        setWhere("online");
        setView("play");
      },
    },
    {
      id: "continue",
      label: "Continue",
      sub: saved ? (saved.summary ? describeSummary(saved.summary) : "Your last game") : "No unfinished game",
      icon: "hourglass",
      disabled: !saved,
      onClick: () => resumeSavedGame(),
    },
    {
      id: "saves",
      label: "Saved games",
      sub: saves.length === 0 ? "Load a save file" : `${saves.length} saved in this browser`,
      icon: "scroll",
      on: view === "saves",
      onClick: () => setView(view === "saves" ? "play" : "saves"),
    },
    { id: "replay", label: "Watch a replay", sub: "Every move of a finished game", icon: "eye", onClick: () => replayInput.current?.click() },
    { id: "editor", label: "Map editor", sub: "Build and share battlefields", icon: "map", onClick: () => onOpenEditor(null) },
    { id: "gallery", label: "Unit gallery", sub: `All ${CARDS.length} units and their figures`, icon: "cards", onClick: onOpenUnits },
  ];

  const heading = view === "saves" ? "Saved games" : where === "local" ? "Play on this device" : "Play online";
  const sub =
    view === "saves"
      ? where === "local"
        ? "Load a game saved in this browser, or a save file."
        : "Host a saved game in a new online room."
      : where === "local"
        ? "Hot-seat for 2 to 6 players on one screen."
        : "Each player on their own device, connected through a game server.";

  return (
    <MenuFrame
      commands={commands}
      heading={heading}
      sub={sub}
      extras={
        <>
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
          {replayError && (
            <p className="menu-toast" role="alert" onClick={() => setReplayError(null)}>
              {replayError}
            </p>
          )}
        </>
      }
    >
      {view === "saves" ? savesPanel : playPanel}
    </MenuFrame>
  );
}
