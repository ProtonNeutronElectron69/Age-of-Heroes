import { CARDS, FACTIONS } from "@aoh/content";
import { HexCard } from "../ui/HexCard";

/**
 * Every unit card, both sides, by faction. A page for judging card design and
 * art, opened with `?cards` in the address; add `=name` to show one faction or
 * unit, for example `?cards=kagero`.
 */
export function CardGalleryScreen() {
  const filter = (new URLSearchParams(window.location.search).get("cards") ?? "").toLowerCase();
  const shown = CARDS.filter((c) => !filter || c.faction.toLowerCase().includes(filter) || c.id.includes(filter));

  return (
    <main className="card-gallery">
      <h1>Unit cards</h1>
      <p className="muted">The Basic side is on the left and the Advanced side on the right.</p>
      {FACTIONS.map((faction) => {
        const cards = shown.filter((c) => c.faction === faction);
        if (cards.length === 0) return null;
        return (
          <section key={faction}>
            <h2>{faction}</h2>
            <div className="card-gallery-grid">
              {cards.map((card) => (
                <div key={card.id} className="card-gallery-pair">
                  <HexCard card={card} side="basic" />
                  <HexCard card={card} side="advanced" />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
