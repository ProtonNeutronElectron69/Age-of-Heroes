import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeOnline, isOnlineHost, leaveOnline, requestSave, useOnline } from "../online";
import { endSession, recordOf, type Session } from "../session";
import { CornerIcon } from "./Ledger";
import { Notice, SaveDialog } from "./SaveDialog";

/**
 * Save and leave buttons, shared by the draft and play screens. Online, only the host can save.
 * `round` draws them as round icon buttons (the play screen's corner), named for screen readers.
 */
export function GameMenu({ session, className = "", round = false }: { session: Session; className?: string; round?: boolean }) {
  const online = useOnline();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const isOnline = session.kind === "online";
  const over = session.state.phase === "gameOver";
  const watching = isOnline && session.me === null;
  const canSave = !over && (!isOnline || isOnlineHost(online));
  const getRecord = () => (isOnline ? requestSave() : Promise.resolve(recordOf(session)));
  const quitLabel = over ? "Back to menu" : watching ? "Stop watching" : isOnline ? "Leave game" : "Quit game";
  const quit = () => {
    if (!isOnline) {
      if (over || window.confirm("Quit this game? Unless you saved it, it cannot be resumed.")) endSession();
    } else if (over || watching) {
      closeOnline();
    } else if (window.confirm("Leave this game? You concede, and your army is removed.")) {
      leaveOnline();
    }
  };

  return (
    <>
      <div className={`actions menu ${className}`}>
        {canSave &&
          (round ? (
            <button type="button" className="round-button" aria-label="Save game" title="Save game" onClick={() => setSaving(true)}>
              <CornerIcon id="save" />
            </button>
          ) : (
            <button type="button" onClick={() => setSaving(true)}>
              Save game
            </button>
          ))}
        {round ? (
          <button type="button" className="round-button" aria-label={quitLabel} title={quitLabel} onClick={quit}>
            <CornerIcon id="quit" />
          </button>
        ) : (
          <button type="button" onClick={quit}>
            {quitLabel}
          </button>
        )}
      </div>
      {/* Drawn over the whole page, not inside the panel that holds the buttons. */}
      {createPortal(
        <>
          {saving && (
            <SaveDialog
              session={session}
              getRecord={getRecord}
              onDone={(message) => {
                setSaving(false);
                setNotice(message);
              }}
            />
          )}
          <Notice text={notice} />
        </>,
        document.body,
      )}
    </>
  );
}
