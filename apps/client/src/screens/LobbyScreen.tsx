import { useEffect, useState } from "react";
import { claimArmy, leaveOnline, startRoom, useOnline } from "../online";

/** Waiting room for an online game: share the code, see who is here, and start. */
export function LobbyScreen() {
  const online = useOnline();
  const room = online.room;
  const waiting = online.status === "connecting" || online.status === "playing" || !room;
  // After a few seconds without an answer, explain that the server may be waking up.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return setSlow(false);
    const t = window.setTimeout(() => setSlow(true), 5000);
    return () => window.clearTimeout(t);
  }, [waiting]);

  if (waiting) {
    return (
      <div className="screen setup">
        <section className="panel setup-panel" aria-label="Connecting">
          <h1>{online.status === "playing" ? "Joining the game..." : "Connecting..."}</h1>
          <p className="muted">Reaching the game server at {online.serverUrl || "the server"}.</p>
          {slow && (
            <p className="muted small">
              Still trying. A server that has been idle can take up to a minute to wake up.
            </p>
          )}
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
  const max = Math.max(...room.playerCounts);
  const resume = room.resume;
  // A resumed game continues once every army still in it has its player back.
  const missing = resume ? resume.armies.filter((a) => !a.taken && !a.out) : [];
  const canStart = isHost && (resume ? missing.length === 0 : room.playerCounts.includes(count));
  const choosing = resume !== null && online.me === null && online.wantsSeat;

  return (
    <div className="screen setup">
      <section className="panel setup-panel lobby" aria-label="Lobby">
        <h1>{resume ? "Resumed game" : "Online game"}</h1>
        {resume && (
          <p className="small">
            {resume.name ? <strong>{resume.name}</strong> : "A saved game"},{" "}
            {resume.phase === "draft"
              ? "in the draft"
              : resume.phase === "deploy"
                ? "during deployment"
                : `round ${resume.round}`}
            .
          </p>
        )}
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

        {resume ? (
          <>
            <h2>Armies</h2>
            <p className="muted small">
              {choosing ? "Which army is yours?" : "Each player picks their own army when they join."}
            </p>
            <ul className="player-list lobby-players" aria-label="Armies">
              {resume.armies.map((a) => {
                const holder = room.members.find((m) => m.playerId === a.playerId);
                return (
                  <li key={a.playerId}>
                    <span className="swatch" style={{ background: a.color }} />
                    <span className="army-name">
                      {a.name}
                      {holder && holder.playerId === online.me ? " (you)" : ""}
                      {holder?.host ? <span className="tag host-tag">host</span> : null}
                      {holder && !holder.connected ? <span className="muted small"> disconnected</span> : null}
                    </span>
                    {a.out ? (
                      <span className="muted small">out of the game</span>
                    ) : holder ? (
                      <span className="muted small">taken</span>
                    ) : choosing ? (
                      <button type="button" className="primary" onClick={() => claimArmy(a.playerId)}>
                        This is me
                      </button>
                    ) : (
                      <span className="muted small">waiting</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <>
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
          </>
        )}
        {room.spectators > 0 && !choosing && (
          <p className="muted small">
            {room.spectators} watching
          </p>
        )}

        <h2>Game</h2>
        <p className="small">
          {room.mapName}, {room.mode === "basic" ? "Basic" : "Advanced"} rules,{" "}
          {room.budget !== null
            ? `${room.budget} points`
            : room.armySize === null
              ? "No points limit"
              : `${room.armySize} ${room.armySize === 1 ? "card" : "cards"} each`}
          {room.factionPure ? ", faction-pure" : ""}, {room.roundLimit === null ? "no round limit" : `${room.roundLimit} rounds`}.
        </p>

        {online.error && (
          <p className="issues" role="alert">
            {online.error}
          </p>
        )}
        <div className="actions">
          {choosing ? null : online.me === null ? (
            <p className="muted">
              {resume && online.wantsSeat
                ? "Every army is taken, so you are watching."
                : "You are watching. The game starts when the host is ready."}
            </p>
          ) : isHost ? (
            <button type="button" className="primary" disabled={!canStart} onClick={startRoom}>
              {resume
                ? canStart
                  ? "Continue game"
                  : `Waiting for ${missing.map((a) => a.name).join(", ")}`
                : canStart
                  ? "Start game"
                  : `Waiting for players (${room.playerCounts.join(", ")} needed)`}
            </button>
          ) : (
            <p className="muted">Waiting for the host to {resume ? "continue" : "start"}.</p>
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
