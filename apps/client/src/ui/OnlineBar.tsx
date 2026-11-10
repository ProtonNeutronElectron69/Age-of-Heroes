import { useOnline } from "../online";
import type { Session } from "../session";

/** For online games: who this device is, and whether the server connection is up. */
export function OnlineBar({ session }: { session: Session }) {
  const online = useOnline();
  if (session.kind !== "online") return null;
  const me = session.state.players.find((p) => p.id === session.me);
  return (
    <div className={`online-bar ${online.connected ? "" : "offline"}`} role="status">
      {me ? (
        <>
          <span className="swatch" style={{ background: me.color }} /> Playing as <strong>{me.name}</strong>
        </>
      ) : (
        <>Watching</>
      )}
      <span className="muted"> in room {online.code}</span>
      {!online.connected && <span className="reconnecting"> Connection lost, reconnecting...</span>}
    </div>
  );
}
