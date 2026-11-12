import type { RulesMode, UnitCard } from "@aoh/rules";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HexCard } from "./HexCard";

interface Props {
  card: UnitCard;
  /** Which side to show first. */
  mode: RulesMode;
  /** The owning player's colour. */
  color?: string;
  /** Figures still alive, for squads. */
  alive?: number;
  /** Wounds on the figure being shown (Advanced). */
  wounds?: number;
}

/**
 * A unit's hex card with its controls: turn it over between the Basic front and
 * the Advanced back, and click it to see it large.
 */
export function UnitCardView({ card, mode, color, alive, wounds }: Props) {
  const [side, setSide] = useState<RulesMode>(mode);
  const [large, setLarge] = useState(false);
  const squad = card.figureCount > 1;
  const face = <HexCard card={card} side={side} ownerColor={color} wounds={mode === "advanced" ? wounds : undefined} />;
  const flip = (
    <button type="button" className="link-button" onClick={() => setSide(side === "basic" ? "advanced" : "basic")}>
      {side === "basic" ? "Show Advanced side" : "Show Basic side"}
    </button>
  );

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
      <div className="unit-card-foot">
        {alive !== undefined && squad ? (
          <span className="small">
            {alive} of {card.figureCount} figures left
          </span>
        ) : (
          <span />
        )}
        {flip}
      </div>
      {large &&
        createPortal(
          <div className="overlay page-overlay card-zoom" role="dialog" aria-modal="true" aria-label={card.name} onClick={() => setLarge(false)}>
            <div className="card-zoom-body" onClick={(e) => e.stopPropagation()}>
              {face}
              <div className="unit-card-foot">
                {flip}
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
