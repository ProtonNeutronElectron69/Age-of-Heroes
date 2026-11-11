import { currentDrafter, lockedFaction, pickProblem, pointsSpent } from "@aoh/rules";
import { canControl, dispatch, type Session } from "../session";
import { Names } from "../describe";
import { GameMenu } from "../ui/GameMenu";
import { OnlineBar } from "../ui/OnlineBar";
import { UnitCardView } from "../ui/UnitCardView";

/** A short button label for why a card cannot be drafted. */
function shortReason(reason: string): string {
  if (/already been drafted/.test(reason)) return "Already drafted";
  if (/room/.test(reason)) return "No room in start zone";
  if (/points/.test(reason)) return "Not enough points";
  if (/only/.test(reason)) return reason.replace(/^Your army is /, "").replace(/ only$/, " only");
  return reason;
}

export function DraftScreen({ session }: { session: Session }) {
  const { state, ctx } = session;
  const names = new Names(state, ctx);
  const drafter = currentDrafter(state);
  const budget = state.config.budget;
  const pointsDraft = state.config.armySize === null;
  const total = state.draft?.order.length ?? 0;
  const pickNumber = Math.min((state.draft?.index ?? 0) + 1, total);
  const left = drafter && budget !== null ? budget - pointsSpent(state, drafter, ctx) : null;
  const faction = drafter ? lockedFaction(state, drafter, ctx) : null;
  const myPick = canControl(session, drafter);

  return (
    <div className="screen draft">
      <header className="panel draft-header">
        <div>
          <h1>Draft</h1>
          <p className="muted">
            {!pointsDraft
              ? `Pick ${pickNumber} of ${total}. `
              : budget === null
                ? "There is no points limit. Pick until your start zone is full or choose to stop. "
                : `Each player has ${budget} points. Pick until you are out of points or choose to stop. `}
            The order snakes: it reverses every round of picks.
          </p>
        </div>
        <GameMenu session={session} className="draft-menu" />
        {drafter && (
          <p className="turn-banner" style={{ borderColor: names.playerColor(drafter) }}>
            <span className="swatch" style={{ background: names.playerColor(drafter) }} />
            <span>
              {myPick ? (
                <>
                  <strong>{names.player(drafter)}</strong>, choose a unit.
                </>
              ) : (
                <>
                  Waiting for <strong>{names.player(drafter)}</strong> to choose.
                </>
              )}
              {left !== null && <span className="muted"> {left} points left.</span>}
              {faction && <span className="muted"> {faction} only.</span>}
            </span>
            {pointsDraft && myPick && (
              <button type="button" disabled={session.pending} onClick={() => dispatch({ type: "draftPass", player: drafter })}>
                Done drafting
              </button>
            )}
          </p>
        )}
      </header>
      <OnlineBar session={session} />

      <div className="draft-body">
        <section className="card-grid" aria-label="Available units">
          {[...ctx.cards.values()].map((card) => {
            const reason = drafter ? pickProblem(state, ctx, card.id, drafter) : "The draft is over";
            const ok = reason === null;
            return (
              <div key={card.id} className={`draft-card ${ok ? "" : "unavailable"}`}>
                <UnitCardView card={card} mode={state.config.mode} />
                <button
                  type="button"
                  className="primary"
                  disabled={!ok || !drafter || !myPick || session.pending}
                  onClick={() => drafter && dispatch({ type: "draftPick", player: drafter, cardId: card.id })}
                >
                  {ok ? `Draft ${card.name}` : shortReason(reason)}
                </button>
              </div>
            );
          })}
        </section>

        <aside className="panel armies" aria-label="Armies">
          <h2>Armies</h2>
          {state.players.map((p) => {
            const units = state.units.filter((u) => u.owner === p.id);
            const points = units.reduce((n, u) => n + (ctx.cards.get(u.cardId)?.advanced.points ?? 0), 0);
            return (
              <div key={p.id} className="army">
                <h3>
                  <span className="swatch" style={{ background: p.color }} /> {p.name}
                  {state.config.mode === "advanced" && <span className="muted small"> {points} points</span>}
                </h3>
                {units.length === 0 ? (
                  <p className="muted small">No units yet</p>
                ) : (
                  <ul>
                    {units.map((u) => (
                      <li key={u.id}>{names.unit(u.id)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </aside>
      </div>
    </div>
  );
}
