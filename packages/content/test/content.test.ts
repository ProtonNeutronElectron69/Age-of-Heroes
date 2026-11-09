import { Board } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { CARDS, FACTIONS, MAPS, TERRAIN, TERRAIN_TABLE, cardCatalog, loadCard, loadMap } from "../src";

describe("terrain", () => {
  it("has the five standard and five special types", () => {
    expect(TERRAIN.filter((t) => t.category === "standard").map((t) => t.id)).toEqual([
      "grass",
      "sand",
      "rock",
      "snow",
      "forest",
    ]);
    expect(TERRAIN.filter((t) => t.category === "special").map((t) => t.id)).toEqual([
      "water",
      "swamp",
      "lava",
      "road",
      "ice",
    ]);
  });

  it("gives water and swamp the same stop group and move cost", () => {
    const water = TERRAIN_TABLE.get("water")!;
    const swamp = TERRAIN_TABLE.get("swamp")!;
    expect(water.stopGroup).toBe("wet");
    expect(swamp.stopGroup).toBe("wet");
    expect(water.moveCost).toBe(2);
    expect(swamp.moveCost).toBe(2);
    expect(swamp.endTurnSelfAttack).toEqual({ attackDice: 1, defenseDice: 0 });
  });

  it("uses valid hex colours", () => {
    for (const t of TERRAIN) expect(t.color).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

describe("maps", () => {
  it("every bundled map builds without issues", () => {
    for (const m of MAPS) {
      const { issues } = Board.fromMap(m, TERRAIN_TABLE);
      expect(issues, m.id).toEqual([]);
    }
  });

  it("the proving grounds use every terrain type and seat six players", () => {
    const m = MAPS.find((x) => x.id === "proving-grounds")!;
    const used = new Set(m.pieces.map((p) => p.terrain));
    for (const t of TERRAIN) expect(used.has(t.id), t.id).toBe(true);
    expect(m.startZones.map((z) => z.seat)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(m.layouts["2"]).toEqual([0, 3]);
  });

  it("the proving grounds bridge has room underneath", () => {
    const m = MAPS.find((x) => x.id === "proving-grounds")!;
    const { board } = Board.fromMap(m, TERRAIN_TABLE);
    const underBridge = board.hexes().filter((h) => board.surfaces(h).length > 1);
    expect(underBridge.length).toBeGreaterThan(0);
    for (const h of underBridge) expect(board.surfaces(h)[0]!.clearance).toBeGreaterThanOrEqual(3);
  });

  it("rejects malformed map data with a readable error", () => {
    expect(() => loadMap({ formatVersion: 1, id: "x", name: "X", pieces: [], startZones: [] })).toThrow(/pieces/);
  });
});

describe("cards", () => {
  it("validates squad and hero figure counts", () => {
    const base = {
      id: "c",
      name: "C",
      tokenLabel: "C",
      faction: "f",
      species: "Human",
      unitClass: "Warrior",
      personality: "Valiant",
      size: "medium",
      height: 5,
      footprint: "1",
      basic: { move: 5, range: 1, attack: 3, defense: 3 },
      advanced: { life: 1, move: 5, range: 1, attack: 3, defense: 3, points: 50, abilities: [] },
    };
    expect(() => loadCard({ ...base, unitType: "commonSquad", figureCount: 1 })).toThrow(/at least 2/);
    expect(() => loadCard({ ...base, unitType: "uniqueHero", figureCount: 2 })).toThrow(/exactly 1/);
    expect(loadCard({ ...base, unitType: "commonSquad", figureCount: 4 }).figureCount).toBe(4);
  });

  it("builds a catalog without duplicates", () => {
    expect(cardCatalog(CARDS).size).toBe(CARDS.length);
  });

  it("has a starter roster of 8 single-hex units across 4 factions", () => {
    expect(CARDS).toHaveLength(8);
    expect(FACTIONS).toHaveLength(4);
    for (const f of FACTIONS) expect(CARDS.filter((c) => c.faction === f)).toHaveLength(2);
    expect(CARDS.every((c) => c.footprint === "1")).toBe(true);
    expect(new Set(CARDS.map((c) => c.tokenLabel)).size).toBe(CARDS.length);
  });

  it("fits a full 4-card army of the largest squads in every start zone", () => {
    const m = MAPS.find((x) => x.id === "proving-grounds")!;
    const biggest = Math.max(...CARDS.map((c) => c.figureCount));
    for (const z of m.startZones) expect(z.hexes.length).toBeGreaterThanOrEqual(4 * biggest);
  });
});
