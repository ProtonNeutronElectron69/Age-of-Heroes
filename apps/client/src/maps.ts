import { MAPS, loadMap } from "@aoh/content";
import type { MapDefinition } from "@aoh/rules";

/**
 * Maps players have made in the editor, kept in this browser's storage.
 * Premade maps come from @aoh/content and cannot be changed.
 */

const KEY = "age-of-heroes:maps:v1";

export function customMaps(): MapDefinition[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    const maps: MapDefinition[] = [];
    for (const item of list) {
      try {
        maps.push(loadMap(item));
      } catch {
        // Skip anything that no longer validates.
      }
    }
    return maps;
  } catch {
    return [];
  }
}

function writeCustomMaps(maps: MapDefinition[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(maps));
    return true;
  } catch {
    return false;
  }
}

/** Save (or replace) a custom map. Returns false if browser storage is unavailable or full. */
export function saveCustomMap(map: MapDefinition): boolean {
  const others = customMaps().filter((m) => m.id !== map.id);
  return writeCustomMaps([...others, map]);
}

export function deleteCustomMap(id: string): void {
  writeCustomMaps(customMaps().filter((m) => m.id !== id));
}

export function isPremade(id: string): boolean {
  return MAPS.some((m) => m.id === id);
}

export function findMap(id: string): MapDefinition | undefined {
  return MAPS.find((m) => m.id === id) ?? customMaps().find((m) => m.id === id);
}

/** A fresh map id that clashes with no premade or saved map. */
export function newMapId(name: string): string {
  const slug =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "map";
  const taken = new Set([...MAPS, ...customMaps()].map((m) => m.id));
  let id = `my-${slug}`;
  for (let n = 2; taken.has(id); n++) id = `my-${slug}-${n}`;
  return id;
}

/** Offer the map as a JSON file download. */
export function downloadMap(map: MapDefinition): void {
  const blob = new Blob([JSON.stringify(map, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${map.id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read and validate a map file chosen by the player. Throws with a readable message. */
export async function readMapFile(file: File): Promise<MapDefinition> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  return loadMap(data);
}
