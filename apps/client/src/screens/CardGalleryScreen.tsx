import { CARDS, FACTIONS } from "@aoh/content";
import { ART_STYLES } from "../ui/art/UnitArt";
import { FIGURES } from "../ui/art/figures";
import { HexCard } from "../ui/HexCard";

/**
 * Every unit card, both sides, by faction. A page for judging card design and
 * art, opened with `?cards` in the address; add `=name` to show one faction or
 * unit, for example `?cards=kagero`. `?cards&art` shows the units that have a
 * drawing, in each art style.
 */
export function CardGalleryScreen() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("art")) return <ArtStyles />;
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

/** The drawn units in every art style, for choosing one. */
function ArtStyles() {
  const cards = CARDS.filter((c) => FIGURES[c.id]);
  return (
    <main className="card-gallery">
      <h1>Art styles</h1>
      <p className="muted">One drawing, painted four ways. The hit zone picture is the same in each.</p>
      {ART_STYLES.map((style) => (
        <section key={style.id} data-style={style.id}>
          <h2>{style.name}</h2>
          <p className="muted">{style.note}</p>
          <div className="card-gallery-grid">
            {cards.map((card) => (
              <div key={card.id} className="card-gallery-pair">
                <HexCard card={card} side="basic" artStyle={style.id} />
                <HexCard card={card} side="advanced" artStyle={style.id} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
