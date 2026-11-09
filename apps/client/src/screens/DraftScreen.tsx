import { currentDrafter, draftableCards, isUnique } from "@aoh/rules";
import { dispatch, type Session } from "../session";
import { Names } from "../describe";
import { UnitCardView } from "../ui/UnitCardView";

export function DraftScreen({ session }: { session: Session }) {
  const { state, ctx } = session;
  const names = new Names(state, ctx);
  const drafter = currentDrafter(state);
  const available = new Set(drafter ? draftableCards(state, ctx, drafter) : []);
  const taken = new Set(state.units.map((u) => u.cardId));
  const total = state.draft?.order.length ?? 0;
  const pickNumber = Math.min((state.draft?.index ?? 0) + 1, total);

  return (
    <div className="screen draft">
      <header className="panel draft-header">
        <div>
          <h1>Draft</h1>
          <p className="muted">
            Pick {pickNumber} of {total}. The order snakes: it reverses every round of picks.
          </p>
        </div>
        {drafter && (
          <p className="turn-banner" style={{ borderColor: names.playerColor(drafter) }}>
            <span className="swatch" style={{ background: names.playerColor(drafter) }} />
            <span>
              <strong>{names.player(drafter)}</strong>, choose a unit.
            </span>
          </p>
        )}
      </header>

      <div className="draft-body">
        <section className="card-grid" aria-label="Available units">
          {[...ctx.cards.values()].map((card) => {
            const ok = available.has(card.id);
            const reason = isUnique(card) && taken.has(card.id) ? "Already drafted" : !ok ? "No room in start zone" : null;
            return (
              <div key={card.id} className={`draft-card ${ok ? "" : "unavailable"}`}>
                <UnitCardView card={card} mode="basic" />
                <button
                  type="button"
                  className="primary"
                  disabled={!ok || !drafter}
                  onClick={() => drafter && dispatch({ type: "draftPick", player: drafter, cardId: card.id })}
                >
                  {reason ?? `Draft ${card.name}`}
                </button>
              </div>
            );
          })}
        </section>

        <aside className="panel armies" aria-label="Armies">
          <h2>Armies</h2>
          {state.players.map((p) => {
            const units = state.units.filter((u) => u.owner === p.id);
            return (
              <div key={p.id} className="army">
                <h3>
                  <span className="swatch" style={{ background: p.color }} /> {p.name}
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
