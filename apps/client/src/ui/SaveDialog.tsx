import { useState } from "react";
import { MAX_SAVE_NAME, defaultSaveName, downloadGameFile, listSaves, storeSave, summarize } from "../saves";
import { replayOf, type Session } from "../session";

/** Name and save the hot-seat game in this browser, or download it as a file. */
export function SaveDialog({ session, onDone }: { session: Session; onDone: (message: string | null) => void }) {
  const summary = summarize(session.state, session.map);
  const [name, setName] = useState(() => defaultSaveName(summary));
  const [error, setError] = useState<string | null>(null);
  const record = replayOf(session)!;
  const clean = name.trim().slice(0, MAX_SAVE_NAME);
  const replacing = clean !== "" && listSaves().some((s) => s.name === clean);

  const save = () => {
    const problem = storeSave(clean, record, summary);
    if (problem) setError(problem);
    else onDone(`Saved as "${clean || defaultSaveName(summary)}"`);
  };

  return (
    <div className="overlay page-overlay" role="dialog" aria-modal="true" aria-label="Save game">
      <form
        className="panel save-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          save();
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
          Saves stay in this browser. Download a file to keep a copy or carry on from another device.
        </p>
        {error && (
          <p className="issues" role="alert">
            {error}
          </p>
        )}
        <div className="actions">
          <button type="submit" className="primary">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              downloadGameFile({ ...record, name: clean, savedAt: new Date().toISOString() }, clean || "save");
              onDone("Save file downloaded");
            }}
          >
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
