import { CARDS, FACTIONS, SEAT_COLORS, SEAT_COLOR_NAMES } from "@aoh/content";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { isSquad, type UnitCard } from "@aoh/rules";
import { useEffect, useMemo, useState } from "react";
import { COLOR_SCHEMES, figureColors, type ColorScheme } from "../models";
import { Camera, StandingUnit, Tiles, closeView, lineUp } from "../scene/standing";
import { TestHook } from "../scene/TestHook";
import { HexCard, type CardSide } from "../ui/HexCard";
import { factionTheme } from "../ui/factionThemes";
import "./unit-gallery.css";

/** Cards across a row: small 5, medium 3, large 1. */
export type CardSize = "small" | "medium" | "large";
const SIZES: readonly { id: CardSize; name: string }[] = [
  { id: "small", name: "Small" },
  { id: "medium", name: "Medium" },
  { id: "large", name: "Large" },
];

type Kind = "all" | "hero" | "squad";
type Attack = "all" | "ranged" | "melee";
export type SortKey = "faction" | "name" | "points" | "life" | "height" | "move" | "range" | "attack" | "defense";
const SORTS: readonly { id: SortKey; name: string }[] = [
  { id: "faction", name: "Faction" },
  { id: "name", name: "Name" },
  { id: "points", name: "Points" },
  { id: "life", name: "Life" },
  { id: "height", name: "Height" },
  { id: "move", name: "Move" },
  { id: "range", name: "Range" },
  { id: "attack", name: "Attack" },
  { id: "defense", name: "Defense" },
];

export interface Filters {
  readonly text: string;
  readonly faction: string;
  readonly kind: Kind;
  readonly attack: Attack;
}

/** The number a card sorts by. Points and Life are on the Advanced side only; the rest follow the side shown. */
function sortValue(card: UnitCard, key: SortKey, side: CardSide): number {
  const stats = side === "advanced" ? card.advanced : card.basic;
  switch (key) {
    case "points":
      return card.advanced.points;
    case "life":
      return card.advanced.life;
    case "height":
      return card.height;
    case "move":
    case "range":
    case "attack":
    case "defense":
      return stats[key];
    default:
      return 0;
  }
}

/** The cards that pass the filters, in the chosen order. Ties go by name. */
export function galleryCards(filters: Filters, sort: SortKey, descending: boolean, side: CardSide): UnitCard[] {
  const text = filters.text.trim().toLowerCase();
  const shown = CARDS.filter(
    (c) =>
      (filters.faction === "all" || c.faction === filters.faction) &&
      (filters.kind === "all" || (filters.kind === "squad") === isSquad(c)) &&
      (filters.attack === "all" || (filters.attack === "ranged") === c.advanced.range > 1) &&
      (!text ||
        [c.name, c.faction, c.species, c.unitClass, c.personality, ...c.advanced.abilities.map((a) => a.name)].some((s) => s.toLowerCase().includes(text))),
  );
  const byName = (a: UnitCard, b: UnitCard) => a.name.localeCompare(b.name);
  const compare = (a: UnitCard, b: UnitCard): number => {
    if (sort === "name") return byName(a, b);
    if (sort === "faction") return FACTIONS.indexOf(a.faction) - FACTIONS.indexOf(b.faction);
    return sortValue(a, sort, side) - sortValue(b, sort, side);
  };
  return shown.sort((a, b) => (descending ? -compare(a, b) : compare(a, b)) || byName(a, b));
}

/** Remembered choices: a convenience only, so a blocked or empty store just gives the defaults. */
function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(`aoh.gallery.${key}`);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(`aoh.gallery.${key}`, value);
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

const ALL_FILTERS: Filters = { text: "", faction: "all", kind: "all", attack: "all" };

/**
 * Every unit card in a scrolling grid that can be filtered and sorted, in
 * three sizes. Choosing a card shows its figure model to turn and zoom.
 */
export function UnitGalleryScreen({ onClose }: { onClose: () => void }) {
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [sort, setSort] = useState<SortKey>(() => remembered("sort", SORTS.map((s) => s.id), "faction"));
  const [descending, setDescending] = useState(false);
  const [side, setSide] = useState<CardSide>(() => remembered("side", ["basic", "advanced"], "advanced"));
  const [size, setSize] = useState<CardSize>(() => remembered("size", SIZES.map((s) => s.id), "medium"));
  const [chosen, setChosen] = useState<string | null>(null);

  const cards = useMemo(() => galleryCards(filters, sort, descending, side), [filters, sort, descending, side]);
  const filtered = filters.text !== "" || filters.faction !== "all" || filters.kind !== "all" || filters.attack !== "all";
  const update = (change: Partial<Filters>) => setFilters((f) => ({ ...f, ...change }));
  const chosenCard = cards.find((c) => c.id === chosen) ?? CARDS.find((c) => c.id === chosen) ?? null;

  return (
    <div className="screen unit-gallery">
      <header className="unit-gallery-head">
        <button type="button" onClick={onClose}>
          Back
        </button>
        <h1>Unit gallery</h1>
        <p className="muted" aria-live="polite">
          {cards.length === CARDS.length ? `All ${CARDS.length} units.` : `${cards.length} of ${CARDS.length} units.`} Choose a card to see its figure.
        </p>
      </header>

      <div className="unit-gallery-controls">
        <label className="field">
          <span>Search</span>
          <input
            type="search"
            aria-label="Search units"
            placeholder="Name, species, ability"
            value={filters.text}
            onChange={(e) => update({ text: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Faction</span>
          <select aria-label="Faction" value={filters.faction} onChange={(e) => update({ faction: e.target.value })}>
            <option value="all">All factions</option>
            {FACTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Type</span>
          <select aria-label="Type" value={filters.kind} onChange={(e) => update({ kind: e.target.value as Kind })}>
            <option value="all">Heroes and squads</option>
            <option value="hero">Heroes</option>
            <option value="squad">Squads</option>
          </select>
        </label>
        <label className="field">
          <span>Attack</span>
          <select aria-label="Attack" value={filters.attack} onChange={(e) => update({ attack: e.target.value as Attack })}>
            <option value="all">Ranged and melee</option>
            <option value="ranged">Ranged</option>
            <option value="melee">Melee</option>
          </select>
        </label>
        <label className="field">
          <span>Sort by</span>
          <span className="unit-gallery-sort">
            <select
              aria-label="Sort by"
              value={sort}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort(key);
                remember("sort", key);
                // Bigger numbers first is the usual wish for stats; names and factions read from the top.
                setDescending(key !== "name" && key !== "faction");
              }}
            >
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={descending ? "Highest first" : "Lowest first"}
              title={descending ? "Highest first; click for lowest first" : "Lowest first; click for highest first"}
              onClick={() => setDescending((d) => !d)}
            >
              {descending ? "↓" : "↑"}
            </button>
          </span>
        </label>
        <div className="field">
          <span>Side</span>
          <div className="segmented" role="radiogroup" aria-label="Card side">
            {(["basic", "advanced"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={side === s}
                className={side === s ? "on" : ""}
                onClick={() => {
                  setSide(s);
                  remember("side", s);
                }}
              >
                {s === "basic" ? "Basic" : "Advanced"}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Size</span>
          <div className="segmented" role="radiogroup" aria-label="Card size">
            {SIZES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={size === s.id}
                className={size === s.id ? "on" : ""}
                onClick={() => {
                  setSize(s.id);
                  remember("size", s.id);
                }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        {filtered && (
          <button type="button" className="link-button" onClick={() => setFilters(ALL_FILTERS)}>
            Clear filters
          </button>
        )}
      </div>

      {/* Hidden, not removed, behind the figure viewer: it keeps its scroll place and is not drawn under the overlay. */}
      <div className="unit-gallery-scroll" style={chosenCard ? { visibility: "hidden" } : undefined}>
        {cards.length === 0 ? (
          <p className="muted unit-gallery-empty">No units match these filters.</p>
        ) : (
          <ul className={`unit-gallery-grid ${size}`} aria-label="Unit cards" data-size={size}>
            {cards.map((card) => (
              <li key={card.id}>
                <button type="button" className="unit-gallery-card" data-unit={card.id} aria-label={card.name} onClick={() => setChosen(card.id)}>
                  <HexCard card={card} side={side} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {chosenCard && (
        <ModelViewer
          card={chosenCard}
          side={side}
          onClose={() => setChosen(null)}
          onStep={(step) => {
            if (cards.length === 0) return;
            const at = cards.findIndex((c) => c.id === chosenCard.id);
            setChosen(cards[(at + step + cards.length) % cards.length]!.id);
          }}
        />
      )}
    </div>
  );
}

/** One unit's figure model on a small board, to turn with the mouse or a finger, beside its card. */
function ModelViewer({ card, side, onClose, onStep }: { card: UnitCard; side: CardSide; onClose: () => void; onStep: (step: number) => void }) {
  const [scheme, setScheme] = useState<ColorScheme>(() => remembered("scheme", COLOR_SCHEMES.map((s) => s.id), "faction"));
  const [player, setPlayer] = useState(0);
  const standings = useMemo(() => lineUp([card]), [card]);
  const standing = standings[0]!;
  const view = useMemo(() => closeView(standing), [standing]);
  const colors = figureColors(scheme, factionTheme(card.faction).primary, SEAT_COLORS[player]!);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") onStep(1);
      else if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  return (
    <div className="overlay unit-viewer-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="panel unit-viewer" role="dialog" aria-modal="true" aria-label={`${card.name} figure`}>
        <header className="unit-viewer-head">
          <div>
            <h2 className="unit-viewer-title">{card.name}</h2>
            <p className="muted small">Drag to turn, scroll or pinch to zoom. The arrow keys step through the cards.</p>
          </div>
          <div className="unit-viewer-nav">
            <button type="button" aria-label="Previous unit" onClick={() => onStep(-1)}>
              ←
            </button>
            <button type="button" aria-label="Next unit" onClick={() => onStep(1)}>
              →
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>
        <div className="unit-viewer-body">
          <div className="unit-viewer-stage" data-viewing={card.id}>
            {/* Drawn only when something changes: a still figure need not redraw every frame over the cards behind. */}
            <Canvas frameloop="demand" camera={{ position: [10, 6, 6], fov: 40 }} dpr={[1, 2]}>
              <color attach="background" args={["#232d3b"]} />
              <hemisphereLight args={["#eef3ff", "#5a4e40", 1.5]} />
              <directionalLight position={[5, 16, 18]} intensity={2.6} />
              <directionalLight position={[14, 5, -12]} intensity={1.1} />
              <directionalLight position={[-12, 10, -3]} intensity={0.9} />
              <Tiles standings={standings} />
              <StandingUnit standing={standing} colors={colors} tokens={false} />
              <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.05} minDistance={1.5} maxDistance={Math.max(20, view.distance * 3)} />
              <Camera view={view} />
              <TestHook offset={{ x: 0, z: 0 }} />
            </Canvas>
          </div>
          <aside className="unit-viewer-side">
            <HexCard card={card} side={side} ownerColor={SEAT_COLORS[player]} />
            <label className="field">
              <span>Colours</span>
              <select
                aria-label="Colours"
                value={scheme}
                onChange={(e) => {
                  const s = e.target.value as ColorScheme;
                  setScheme(s);
                  remember("scheme", s);
                }}
              >
                {COLOR_SCHEMES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Player</span>
              <select aria-label="Player colour" value={player} onChange={(e) => setPlayer(Number(e.target.value))}>
                {SEAT_COLOR_NAMES.map((name, i) => (
                  <option key={name} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          </aside>
        </div>
      </section>
    </div>
  );
}
