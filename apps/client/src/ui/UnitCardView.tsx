import type { RulesMode, UnitCard } from "@aoh/rules";
import { useState } from "react";

const TYPE_NAMES: Record<UnitCard["unitType"], string> = {
  uniqueHero: "Unique Hero",
  commonHero: "Common Hero",
  uniqueSquad: "Unique Squad",
  commonSquad: "Common Squad",
};

const SIZE_NAMES: Record<UnitCard["size"], string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  huge: "Huge",
};

interface Props {
  card: UnitCard;
  /** Which side to show first. */
  mode: RulesMode;
  color?: string;
  /** Figures still alive, for squads. */
  alive?: number;
  /** Wounds on the figure being shown (Advanced). */
  wounds?: number;
  compact?: boolean;
}

/** A two-sided unit card: front for the Basic game, back for the Advanced game. */
export function UnitCardView({ card, mode, color, alive, wounds, compact }: Props) {
  const [side, setSide] = useState<RulesMode>(mode);
  const squad = card.figureCount > 1;
  return (
    <article className={`unit-card ${compact ? "compact" : ""}`} style={{ borderColor: color }}>
      <header>
        <span className="token-badge" style={{ background: color ?? "#556" }}>
          {card.tokenLabel}
        </span>
        <div>
          <h3>{card.name}</h3>
          <p className="muted small">
            {TYPE_NAMES[card.unitType]}
            {squad ? ` of ${card.figureCount}` : ""}
            {alive !== undefined && squad ? `, ${alive} left` : ""}
          </p>
          {mode === "advanced" && wounds !== undefined && card.advanced.life > 1 && (
            <p className="life-line small">
              Life {card.advanced.life - wounds} of {card.advanced.life}
            </p>
          )}
        </div>
      </header>

      {side === "basic" ? (
        <div className="stats">
          <Stat label="Move" value={card.basic.move} />
          <Stat label="Range" value={card.basic.range} />
          <Stat label="Attack" value={card.basic.attack} />
          <Stat label="Defense" value={card.basic.defense} />
        </div>
      ) : (
        <>
          <div className="attributes small">
            <span>{card.faction}</span>
            <span>
              {card.species} {card.unitClass}
            </span>
            <span>{card.personality}</span>
            <span>
              {SIZE_NAMES[card.size]} {card.height}
            </span>
          </div>
          <div className="stats six">
            <Stat label="Life" value={card.advanced.life} />
            <Stat label="Move" value={card.advanced.move} />
            <Stat label="Range" value={card.advanced.range} />
            <Stat label="Attack" value={card.advanced.attack} />
            <Stat label="Defense" value={card.advanced.defense} />
            <Stat label="Points" value={card.advanced.points} />
          </div>
          {!compact && (
            <ul className="abilities">
              {card.advanced.abilities.map((a) => (
                <li key={a.id}>
                  <strong>{a.name}.</strong> {a.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {!compact && (
        <button type="button" className="link-button" onClick={() => setSide(side === "basic" ? "advanced" : "basic")}>
          {side === "basic" ? "Show Advanced side" : "Show Basic side"}
        </button>
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
