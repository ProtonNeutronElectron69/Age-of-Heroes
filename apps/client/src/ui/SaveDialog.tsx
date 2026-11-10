import type { Replay } from "@aoh/protocol";
import { useState } from "react";
import { MAX_SAVE_NAME, defaultSaveName, downloadGameFile, listSaves, storeSave, summarize } from "../saves";
import type { Session } from "../session";

/**
 * Name the game and keep it in this browser, or download it as a file. Works
 * for hot-seat games and, for the host, online ones: `getRecord` fetches the
 * game's full record (from the server, for an online game).
 */
export function SaveDialog({
  session,
  getRecord,
  onDone,
}: {
  session: Session;
  getRecord: () => Promise<Replay>;
  onDone: (message: string | null) => void;
}) {
  const summary = summarize(session.state, session.map);
  const [name, setName] = useState(() => defaultSaveName(summary));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const clean = name.trim().slice(0, MAX_SAVE_NAME) || defaultSaveName(summary);
  const replacing = listSaves().some((s) => s.name === clean);
  const online = session.kind === "online";

  const run = async (action: (record: Replay) => string | null) => {
    setBusy(true);
    setError(null);
    try {
      const record = { ...(await getRecord()), name: clean, savedAt: new Date().toISOString() };
      const problem = action(record);
      if (problem) setError(problem);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const keep = () =>
    run((record) => {
      const problem = storeSave(clean, record, summary);
      if (!problem) onDone(`Saved as "${clean}"`);
      return problem;
    });
  const download = () =>
    run((record) => {
      downloadGameFile(record, clean);
      onDone("Save file downloaded");
      return null;
    });

  return (
    <div className="overlay page-overlay" role="dialog" aria-modal="true" aria-label="Save game">
      <form
        className="panel save-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void keep();
        }}
      >
        <h2>Save game</h2>
        <label className="field">
          <span>Name</span>
          <input
            aria-label="Save name"
            value={name}
            maxLength={MAX_SAVE_NAME}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="muted small">
          {replacing ? "This replaces the save with the same name. " : ""}
          {online
            ? "To carry on another time, open the Online panel, choose this save under Resume, and share the new room code. Everyone picks their army again. The game carries on now; close it whenever you like."
            : "Saves stay in this browser. Download a file to keep a copy or carry on from another device."}
        </p>
        {error && (
          <p className="issues" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            Save
          </button>
          <button type="button" disabled={busy} onClick={() => void download()}>
            Download file
          </button>
          <button type="button" onClick={() => onDone(null)}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/** A short message that clears itself, for "Saved" and the like. */
export function Notice({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="toast notice" role="status">
      {text}
    </div>
  );
}
