import { leaveOnline, startRoom, useOnline } from "../online";

/** Waiting room for an online game: share the code, see who is here, and start. */
export function LobbyScreen() {
  const online = useOnline();
  const room = online.room;

  if (online.status === "connecting" || online.status === "playing" || !room) {
    return (
      <div className="screen setup">
        <section className="panel setup-panel" aria-label="Connecting">
          <h1>{online.status === "playing" ? "Joining the game..." : "Connecting..."}</h1>
          <p className="muted">Reaching the game server at {online.serverUrl || "the server"}.</p>
          <div className="actions">
            <button type="button" onClick={leaveOnline}>
              Cancel
            </button>
          </div>
        </section>
      </div>
    );
  }

  const me = room.members.find((m) => m.playerId === online.me);
  const isHost = me?.host ?? false;
  const count = room.members.length;
  const canStart = isHost && room.playerCounts.includes(count);
  const max = Math.max(...room.playerCounts);

  return (
    <div className="screen setup">
      <section className="panel setup-panel lobby" aria-label="Lobby">
        <h1>Online game</h1>
        <p className="muted">Share this code so others can join from their own device.</p>
        <p className="room-code" aria-label="Room code">
          {room.code}
        </p>
        <button
          type="button"
          className="link-button"
          onClick={() => {
            void navigator.clipboard?.writeText(room.code);
          }}
        >
          Copy code
        </button>

        <h2>
          Players ({count} of up to {max})
        </h2>
        <ul className="player-list lobby-players">
          {room.members.map((m) => (
            <li key={m.playerId}>
              <span className="swatch" style={{ background: m.color }} />
              <span>
                {m.name}
                {m.playerId === online.me ? " (you)" : ""}
                {m.host ? <span className="tag host-tag">host</span> : null}
                {!m.connected ? <span className="muted small"> disconnected</span> : null}
              </span>
            </li>
          ))}
        </ul>
        {room.spectators > 0 && (
          <p className="muted small">
            {room.spectators} watching
          </p>
        )}

        <h2>Game</h2>
        <p className="small">
          {room.mapName}, {room.mode === "basic" ? "Basic" : "Advanced"} rules,{" "}
          {room.budget !== null
            ? `${room.budget} points`
            : `${room.armySize} ${room.armySize === 1 ? "card" : "cards"} each`}
          {room.factionPure ? ", faction-pure" : ""}, {room.roundLimit === null ? "no round limit" : `${room.roundLimit} rounds`}.
        </p>

        {online.error && (
          <p className="issues" role="alert">
            {online.error}
          </p>
        )}
        <div className="actions">
          {online.me === null ? (
            <p className="muted">You are watching. The game starts when the host is ready.</p>
          ) : isHost ? (
            <button type="button" className="primary" disabled={!canStart} onClick={startRoom}>
              {canStart ? "Start game" : `Waiting for players (${room.playerCounts.join(", ")} needed)`}
            </button>
          ) : (
            <p className="muted">Waiting for the host to start.</p>
          )}
          <button type="button" onClick={leaveOnline}>
            Leave
          </button>
        </div>
        {!online.connected && <p className="muted small">Connection lost. Reconnecting...</p>}
      </section>
    </div>
  );
}
