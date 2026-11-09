import { unitCardSchema, type UnitCard } from "@aoh/rules";

/** Parse and validate a unit card. Throws with a readable message if the data is malformed. */
export function loadCard(data: unknown): UnitCard {
  const parsed = unitCardSchema.safeParse(data);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid unit card:\n${details.join("\n")}`);
  }
  return parsed.data;
}

export function cardCatalog(cards: readonly UnitCard[]): ReadonlyMap<string, UnitCard> {
  const map = new Map<string, UnitCard>();
  for (const c of cards) {
    if (map.has(c.id)) throw new Error(`Duplicate card id: ${c.id}`);
    map.set(c.id, c);
  }
  return map;
}

/**
 * The real roster arrives in Phase 1 (Basic starter units) and Phase 4
 * (full Advanced roster). Until then the catalog is empty.
 */
export const CARDS: readonly UnitCard[] = [];
