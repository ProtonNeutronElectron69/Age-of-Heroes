import type { UnitCard } from "@aoh/rules";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HexCard } from "./HexCard";

interface Props {
  card: UnitCard;
  /** The owning player's colour. */
  color?: string;
  /** Figures still alive, for squads. */
  alive?: number;
  /** Wounds on the figure being shown. */
  wounds?: number;
}

/** A unit's hex card, with how many of a squad's figures are left. Click it to see it large. */
export function UnitCardView({ card, color, alive, wounds }: Props) {
  const [large, setLarge] = useState(false);
  const squad = card.figureCount > 1;
  const face = <HexCard card={card} ownerColor={color} wounds={wounds} />;

  // Escape closes the large card before any other key handler sees it.
  useEffect(() => {
    if (!large) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setLarge(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [large]);

  return (
    <article className="unit-card" data-card={card.id}>
      <div
        className="unit-card-face"
        role="button"
        tabIndex={0}
        title="Click to enlarge"
        aria-label={`${card.name}: enlarge the card`}
        onClick={() => setLarge(true)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          e.stopPropagation();
          setLarge(true);
        }}
      >
        {face}
      </div>
      {alive !== undefined && squad && (
        <div className="unit-card-foot">
          <span className="small">
            {alive} of {card.figureCount} figures left
          </span>
        </div>
      )}
      {large &&
        createPortal(
          <div className="overlay page-overlay card-zoom" role="dialog" aria-modal="true" aria-label={card.name} onClick={() => setLarge(false)}>
            <div className="card-zoom-body" onClick={(e) => e.stopPropagation()}>
              {face}
              <div className="unit-card-foot">
                <button type="button" onClick={() => setLarge(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </article>
  );
}
