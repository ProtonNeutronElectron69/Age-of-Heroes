import { FACTIONS } from "@aoh/content";
import { isSquad, type UnitCard } from "@aoh/rules";

/**
 * Filtering and sorting unit cards: by a search, faction, heroes or squads, ranged or melee,
 * and a sort by name, faction or a stat. The unit gallery and the draft share it.
 */

export type Kind = "all" | "hero" | "squad";
export type Attack = "all" | "ranged" | "melee";
export type SortKey = "faction" | "name" | "points" | "life" | "height" | "move" | "range" | "attack" | "defense";
export const SORTS: readonly { id: SortKey; name: string }[] = [
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

/** The number a card sorts by. */
function sortValue(card: UnitCard, key: Exclude<SortKey, "faction" | "name">): number {
  return card[key];
}

/** The cards (of `cards`) that pass the filters, in the chosen order. Ties go by name. */
export function filterCards(cards: readonly UnitCard[], filters: Filters, sort: SortKey, descending: boolean): UnitCard[] {
  const text = filters.text.trim().toLowerCase();
  const shown = cards.filter(
    (c) =>
      (filters.faction === "all" || c.faction === filters.faction) &&
      (filters.kind === "all" || (filters.kind === "squad") === isSquad(c)) &&
      (filters.attack === "all" || (filters.attack === "ranged") === c.range > 1) &&
      (!text ||
        [c.name, c.faction, c.species, c.unitClass, c.personality, ...c.abilities.map((a) => a.name)].some((s) => s.toLowerCase().includes(text))),
  );
  const byName = (a: UnitCard, b: UnitCard) => a.name.localeCompare(b.name);
  const compare = (a: UnitCard, b: UnitCard): number => {
    if (sort === "name") return byName(a, b);
    if (sort === "faction") return FACTIONS.indexOf(a.faction) - FACTIONS.indexOf(b.faction);
    return sortValue(a, sort) - sortValue(b, sort);
  };
  return shown.sort((a, b) => (descending ? -compare(a, b) : compare(a, b)) || byName(a, b));
}

export const ALL_FILTERS: Filters = { text: "", faction: "all", kind: "all", attack: "all" };

/** Whether any filter narrows the cards. */
export const isFiltered = (f: Filters) => f.text !== "" || f.faction !== "all" || f.kind !== "all" || f.attack !== "all";

/** The search, the three filters and the sort, as a row of fields. */
export function UnitFilterControls({
  filters,
  onFilters,
  sort,
  descending,
  onSort,
}: {
  filters: Filters;
  onFilters: (filters: Filters) => void;
  sort: SortKey;
  descending: boolean;
  onSort: (sort: SortKey, descending: boolean) => void;
}) {
  return (
    <>
        <label className="field">
          <span>Search</span>
          <input
            type="search"
            aria-label="Search units"
            placeholder="Name, species, ability"
            value={filters.text}
            onChange={(e) => onFilters({ ...filters, text: e.target.value })}
          />
        </label>
        <label className="field">
          <span>Faction</span>
          <select aria-label="Faction" value={filters.faction} onChange={(e) => onFilters({ ...filters, faction: e.target.value })}>
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
          <select aria-label="Type" value={filters.kind} onChange={(e) => onFilters({ ...filters, kind: e.target.value as Kind })}>
            <option value="all">Heroes and squads</option>
            <option value="hero">Heroes</option>
            <option value="squad">Squads</option>
          </select>
        </label>
        <label className="field">
          <span>Attack</span>
          <select aria-label="Attack" value={filters.attack} onChange={(e) => onFilters({ ...filters, attack: e.target.value as Attack })}>
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
                // Bigger numbers first is the usual wish for stats; names and factions read from the top.
                onSort(key, key !== "name" && key !== "faction");
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
              onClick={() => onSort(sort, !descending)}
            >
              {descending ? "↓" : "↑"}
            </button>
          </span>
        </label>
    </>
  );
}
