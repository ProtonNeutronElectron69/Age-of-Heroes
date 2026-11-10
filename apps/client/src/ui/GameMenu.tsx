import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { closeOnline, leaveOnline } from "../online";
import { canSave, endSession, type Session } from "../session";
import { Notice, SaveDialog } from "./SaveDialog";

/** Save (hot-seat games) and leave buttons, shared by the draft and play screens. */
export function GameMenu({ session, className = "" }: { session: Session; className?: string }) {
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
        {canSave(session) && !over && (
          <button type="button" onClick={() => setSaving(true)}>
            Save game
          </button>
        )}
        <button type="button" onClick={quit}>
          {quitLabel}
        </button>
      </div>
      {/* Drawn over the whole page, not inside the panel that holds the buttons. */}
      {createPortal(
        <>
          {saving && (
            <SaveDialog
              session={session}
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
