import { CARDS, SEAT_COLORS, SEAT_COLOR_NAMES } from "@aoh/content";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { UnitCard } from "@aoh/rules";
import { useEffect, useMemo, useState } from "react";
import { COLOR_SCHEMES, figureColors, type ColorScheme } from "../models";
import { Camera, StandingUnit, Tiles, closeView, lineUp } from "../scene/standing";
import { TestHook } from "../scene/TestHook";
import { HexCard } from "../ui/HexCard";
import { factionTheme } from "../ui/factionThemes";
import { ALL_FILTERS, SORTS, UnitFilterControls, filterCards, isFiltered, type Filters, type SortKey } from "../ui/UnitFilters";
import "./unit-gallery.css";

/** Cards across a row: small 5, medium 3, large 1. */
export type CardSize = "small" | "medium" | "large";
const SIZES: readonly { id: CardSize; name: string }[] = [
  { id: "small", name: "Small" },
  { id: "medium", name: "Medium" },
  { id: "large", name: "Large" },
];

/** The cards that pass the filters, in the chosen order. */
export const galleryCards = (filters: Filters, sort: SortKey, descending: boolean): UnitCard[] => filterCards(CARDS, filters, sort, descending);

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


/**
 * Every unit card in a scrolling grid that can be filtered and sorted, in
 * three sizes. Choosing a card shows its figure model to turn and zoom.
 */
export function UnitGalleryScreen({ onClose }: { onClose: () => void }) {
  const [filters, setFilters] = useState<Filters>(ALL_FILTERS);
  const [sort, setSort] = useState<SortKey>(() => remembered("sort", SORTS.map((s) => s.id), "faction"));
  const [descending, setDescending] = useState(false);
  const [size, setSize] = useState<CardSize>(() => remembered("size", SIZES.map((s) => s.id), "medium"));
  const [chosen, setChosen] = useState<string | null>(null);

  const cards = useMemo(() => galleryCards(filters, sort, descending), [filters, sort, descending]);
  const filtered = isFiltered(filters);
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
        <UnitFilterControls
          filters={filters}
          onFilters={setFilters}
          sort={sort}
          descending={descending}
          onSort={(key, down) => {
            if (key !== sort) remember("sort", key);
            setSort(key);
            setDescending(down);
          }}
        />
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
                  <HexCard card={card} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {chosenCard && (
        <ModelViewer
          card={chosenCard}
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
function ModelViewer({ card, onClose, onStep }: { card: UnitCard; onClose: () => void; onStep: (step: number) => void }) {
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
              <StandingUnit standing={standing} colors={colors} tokens={false} scheme={scheme} />
              <OrbitControls makeDefault enablePan={false} maxPolarAngle={Math.PI / 2.05} minDistance={1.5} maxDistance={Math.max(20, view.distance * 3)} />
              <Camera view={view} />
              <TestHook offset={{ x: 0, z: 0 }} />
            </Canvas>
          </div>
          <aside className="unit-viewer-side">
            <HexCard card={card} ownerColor={SEAT_COLORS[player]} />
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
