import { CARDS, FACTIONS } from "@aoh/content";
import { HexCard } from "../ui/HexCard";

/**
 * Every unit card, by faction. A page for judging card design and
 * art, opened with `?cards` in the address; add `=name` to show one faction or
 * unit, for example `?cards=kagero`.
 */
export function CardGalleryScreen() {
  const filter = (new URLSearchParams(window.location.search).get("cards") ?? "").toLowerCase();
  const shown = CARDS.filter((c) => !filter || c.faction.toLowerCase().includes(filter) || c.id.includes(filter));

  return (
    <main className="card-gallery">
      <h1>Unit cards</h1>
      {FACTIONS.map((faction) => {
        const cards = shown.filter((c) => c.faction === faction);
        if (cards.length === 0) return null;
        return (
          <section key={faction}>
            <h2>{faction}</h2>
            <div className="card-gallery-grid">
              {cards.map((card) => (
                <HexCard key={card.id} card={card} />
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}
