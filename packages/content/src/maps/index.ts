import { mapSchema, type MapDefinition } from "@aoh/rules";
import provingGrounds from "./proving-grounds.json";

/** Parse and validate a map file. Throws with a readable message if the data is malformed. */
export function loadMap(data: unknown): MapDefinition {
  const parsed = mapSchema.safeParse(data);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`Invalid map data:\n${details.join("\n")}`);
  }
  return parsed.data;
}

export const MAPS: readonly MapDefinition[] = [loadMap(provingGrounds)];

export function getMap(id: string): MapDefinition | undefined {
  return MAPS.find((m) => m.id === id);
}
