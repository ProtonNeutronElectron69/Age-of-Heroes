import { currentDrafter, drafters, isOpenDraft, lockedFaction, pickProblem, playerZone, pointsSpent } from "@aoh/rules";
import { useEffect, useState } from "react";
import { onPing } from "../online";
import { canControl, dispatch, type Session } from "../session";
import { Names } from "../describe";
import { GameMenu } from "../ui/GameMenu";
import { OnlineBar } from "../ui/OnlineBar";
import { UnitCardView } from "../ui/UnitCardView";
import { ALL_FILTERS, UnitFilterControls, filterCards, isFiltered, type Filters, type SortKey } from "../ui/UnitFilters";
import { DraftMap } from "./DraftMap";

/** How long the map button says who pinged, while this player is on the cards. */
const PINGED_NOTICE_MS = 3000;

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
  // A snake draft has one drafter at a time. In an open draft (online games) everyone picks at once:
  // each device drafts for its own player; a hot-seat screen picks whose army a click adds to.
  const open = isOpenDraft(state);
  const stillDrafting = drafters(state);
  const [chosen, setChosen] = useState<string | null>(null);
  // Sorting and filtering the cards, as in the unit gallery, and hiding the ones that cannot be drafted.
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "faction", descending: false });
  const [draftableOnly, setDraftableOnly] = useState(false);
  const drafter = !open
    ? currentDrafter(state)
    : session.kind === "online"
      ? session.me && stillDrafting.includes(session.me)
        ? session.me
        : null
      : chosen && stillDrafting.includes(chosen)
        ? chosen
        : (stillDrafting[0] ?? null);
  const finished = open && session.kind === "online" && session.me !== null && !stillDrafting.includes(session.me);
  const budget = state.config.budget;
  const left = drafter && budget !== null ? budget - pointsSpent(state, drafter, ctx) : null;
  const faction = drafter ? lockedFaction(state, drafter, ctx) : null;
  const myPick = canControl(session, drafter);
  // The draft opens on the battlefield, before anyone has picked, so players can plan their armies.
  const [view, setView] = useState<"map" | "units">(() => (state.units.length === 0 ? "map" : "units"));
  const onMap = view === "map";
  // Online, a ping made while this player is on the cards: the map button says who, for a few seconds.
  const [pingedBy, setPingedBy] = useState<string | null>(null);
  useEffect(() => {
    if (session.kind !== "online") return;
    let timer = 0;
    const stop = onPing((p) => {
      setPingedBy(p.player);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPingedBy(null), PINGED_NOTICE_MS);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [session.kind]);

  return (
    <div className={`screen draft${onMap ? " map-open" : ""}`}>
      <header className="panel draft-header">
        <div>
          <h1>Draft</h1>
          <p className="muted">
            {budget === null
              ? "There is no points limit. Pick until your start zone is full or choose to stop. "
              : `Each player has ${budget} points. Pick until you are out of points or choose to stop. `}
            {open
              ? "Everyone drafts at once, and each unit can be drafted by one player only: a unit someone takes is greyed out for everyone."
              : "The order snakes: it reverses every round of picks."}
          </p>
        </div>
        <div className="draft-actions">
          <button
            type="button"
            className={onMap ? "primary" : pingedBy ? "pinged" : ""}
            style={!onMap && pingedBy ? { borderColor: names.playerColor(pingedBy) } : undefined}
            onClick={() => setView(onMap ? "units" : "map")}
          >
            {onMap ? "Go to the draft" : pingedBy ? `View map: ${names.player(pingedBy)} pinged it` : "View map"}
          </button>
          <GameMenu session={session} className="draft-menu" />
        </div>
        {open && session.kind === "local" && stillDrafting.length > 1 && (
          <div className="segmented draft-for" role="radiogroup" aria-label="Drafting for">
            {stillDrafting.map((id) => (
              <button key={id} type="button" role="radio" aria-checked={drafter === id} className={drafter === id ? "on" : ""} onClick={() => setChosen(id)}>
                {names.player(id)}
              </button>
            ))}
          </div>
        )}
        {open && !drafter && state.phase === "draft" && (
          <p className="turn-banner">
            <span>
              {finished ? "You have finished drafting. " : ""}
              Waiting for {stillDrafting.map((id) => names.player(id)).join(" and ")} to finish drafting.
            </span>
          </p>
        )}
        {drafter && (
          <p className="turn-banner" style={{ borderColor: names.playerColor(drafter) }}>
            <span className="swatch" style={{ background: names.playerColor(drafter) }} />
            <span>
              {myPick ? (
                <>
                  <strong>{names.player(drafter)}</strong>, {open ? "choose your units." : "choose a unit."}
                </>
              ) : (
                <>
                  Waiting for <strong>{names.player(drafter)}</strong> to choose.
                </>
              )}
              {left !== null && <span className="muted"> {left} points left.</span>}
              {faction && <span className="muted"> {faction} only.</span>}
            </span>
            {myPick && (
              <button type="button" disabled={session.pending} onClick={() => dispatch({ type: "draftPass", player: drafter })}>
                Done drafting
              </button>
            )}
          </p>
        )}
      </header>
      <OnlineBar session={session} />

      <div className={`draft-body${onMap ? " map-view" : ""}`}>
        {onMap ? (
          <DraftMap state={state} ctx={ctx} me={session.kind === "online" ? session.me : null} />
        ) : (
          <div className="draft-cards">
          <div className="unit-gallery-controls draft-filters" aria-label="Sort and filter units">
            <UnitFilterControls filters={filters} onFilters={setFilters} sort={sort.key} descending={sort.descending} onSort={(key, descending) => setSort({ key, descending })} />
            <label className="check">
              <input type="checkbox" checked={draftableOnly} onChange={(e) => setDraftableOnly(e.target.checked)} /> Only units I can draft
            </label>
            {(isFiltered(filters) || draftableOnly) && (
              <button
                type="button"
                onClick={() => {
                  setFilters(ALL_FILTERS);
                  setDraftableOnly(false);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <section className="card-grid" aria-label="Available units">
            {filterCards([...ctx.cards.values()], filters, sort.key, sort.descending).map((card) => {
              const reason = drafter
                ? pickProblem(state, ctx, card.id, drafter)
                : open
                  ? (pickProblem(state, ctx, card.id) ?? "Not drafting")
                  : "The draft is over";
              const ok = reason === null;
              if (draftableOnly && !ok) return null;
              // Who took a card nobody else may now draft.
              const takenBy = reason && /already been drafted/.test(reason) ? state.units.find((u) => u.cardId === card.id)?.owner : undefined;
              return (
                <div key={card.id} className={`draft-card ${ok ? "" : "unavailable"}`} data-points={card.points}>
                  <UnitCardView card={card} />
                  <button
                    type="button"
                    className="primary"
                    disabled={!ok || !drafter || !myPick || session.pending}
                    onClick={() => drafter && dispatch({ type: "draftPick", player: drafter, cardId: card.id })}
                  >
                    {ok ? `Draft ${card.name}` : takenBy ? `Drafted by ${names.player(takenBy)}` : shortReason(reason)}
                  </button>
                </div>
              );
            })}
          </section>
          </div>
        )}

        <aside className="panel armies" aria-label="Armies">
          <h2>Armies</h2>
          {state.players.map((p) => {
            const units = state.units.filter((u) => u.owner === p.id);
            const points = units.reduce((n, u) => n + (ctx.cards.get(u.cardId)?.points ?? 0), 0);
            return (
              <div key={p.id} className="army">
                <h3>
                  <span className="swatch" style={{ background: p.color }} /> {p.name}
                  <span className="muted small"> {points} points</span>
                  {open && state.draft?.passed.includes(p.id) && <span className="muted small">, done</span>}
                </h3>
                {onMap && (
                  <p className="muted small">
                    Start zone: {playerZone(state, p.id, ctx).length} hexes, in {p.name}'s colour.
                  </p>
                )}
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
