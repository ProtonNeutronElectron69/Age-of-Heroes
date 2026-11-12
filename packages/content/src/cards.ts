import { unitCardSchema, type UnitCard } from "@aoh/rules";
import legends from "./cards/legends.json";
import reinforcements from "./cards/reinforcements.json";
import starter from "./cards/starter.json";

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
 * The roster: the 16 starter units in four factions; the "legends" drop that
 * adds two factions (the Ashen Host and the Dawnhold Covenant) and a unit for
 * each starter faction, for 30; and the "reinforcements" drop of a hero and two
 * squads for every faction, for 48. Every unit is original.
 */
export const CARDS: readonly UnitCard[] = [
  ...(starter as unknown[]),
  ...(legends as unknown[]),
  ...(reinforcements as unknown[]),
].map(loadCard);

export const CARD_CATALOG = cardCatalog(CARDS);

export const FACTIONS: readonly string[] = [...new Set(CARDS.map((c) => c.faction))];
