import { CARD_CATALOG, CARDS } from "@aoh/content";
import { useState } from "react";
import { type CardFinish, HexCard } from "../ui/HexCard";

/** One unit from each faction: three squads and three heroes, with the longest name and the longest rules text. */
const MOCKUPS = ["brass-hussars", "lady-asagiri", "queen-ilyth", "siege-walker-atlas", "barrow-legion", "dame-rowena"];

/**
 * A page of unit cards for judging the card design, opened with `?cards` in the
 * address. `?cards=all` shows the whole roster and `&finish=worn` or
 * `&finish=clean` picks the frame finish.
 */
export function CardGalleryScreen() {
  const params = new URLSearchParams(window.location.search);
  const [finish, setFinish] = useState<CardFinish>(params.get("finish") === "worn" ? "worn" : "clean");
  const [all, setAll] = useState(params.get("cards") === "all");
  const cards = all ? CARDS : MOCKUPS.map((id) => CARD_CATALOG.get(id)).filter((c) => c !== undefined);

  return (
    <main className="card-gallery">
      <header>
        <h1>Unit cards</h1>
        <div className="row">
          <button type="button" className={finish === "clean" ? "primary" : ""} onClick={() => setFinish("clean")}>
            Clean finish
          </button>
          <button type="button" className={finish === "worn" ? "primary" : ""} onClick={() => setFinish("worn")}>
            Worn finish
          </button>
          <button type="button" onClick={() => setAll(!all)}>
            {all ? "Show the six mockups" : "Show the whole roster"}
          </button>
        </div>
      </header>
      <div className="card-gallery-grid">
        {cards.map((card) => (
          <section key={card.id} className="card-gallery-pair">
            <HexCard card={card} side="basic" finish={finish} />
            <HexCard card={card} side="advanced" finish={finish} />
          </section>
        ))}
      </div>
    </main>
  );
}
