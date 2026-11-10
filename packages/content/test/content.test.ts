import { createGame, deploymentPlacements, hexDistance } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import {
  CARDS,
  FACTIONS,
  MAPS,
  SCENERY_TABLE,
  TERRAIN,
  TERRAIN_TABLE,
  buildBoard,
  cardCatalog,
  contextFor,
  loadCard,
  loadMap,
} from "../src";

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
  it("has a library of four premade maps", () => {
    expect(MAPS.map((m) => m.id)).toEqual(["proving-grounds", "twin-fords", "the-mesa", "glacier-pass"]);
  });

  it("every bundled map builds without issues and hosts at least 2 players", () => {
    for (const m of MAPS) {
      const { board, issues } = buildBoard(m);
      expect(issues, m.id).toEqual([]);
      expect(board.playerCounts(), m.id).toContain(2);
      for (const s of m.scenery) expect(SCENERY_TABLE.has(s.kind), `${m.id} ${s.kind}`).toBe(true);
    }
  });

  it("spreads two players far apart on every map", () => {
    for (const m of MAPS) {
      const { board } = buildBoard(m);
      const [a, b] = [board.startZone(board.zoneFor(0, 2)), board.startZone(board.zoneFor(1, 2))];
      const gap = Math.min(...a.flatMap((h) => b.map((k) => hexDistance(h, k))));
      expect(gap, m.id).toBeGreaterThanOrEqual(12);
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
    const { board } = buildBoard(m);
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

  it("has a roster of 30 units, 5 in each of 6 factions, three of them multi-hex", () => {
    expect(CARDS).toHaveLength(30);
    expect(FACTIONS).toEqual([
      "Iron Concord",
      "House Kagero",
      "Verdant Court",
      "Nexus Collective",
      "Ashen Host",
      "Dawnhold Covenant",
    ]);
    for (const f of FACTIONS) expect(CARDS.filter((c) => c.faction === f), f).toHaveLength(5);
    expect(CARDS.filter((c) => c.footprint !== "1").map((c) => [c.id, c.footprint])).toEqual([
      ["old-rootback", "2x1"],
      ["siege-walker-atlas", "2x2"],
      ["marrowcoil", "3x1"],
    ]);
    expect(new Set(CARDS.map((c) => c.tokenLabel)).size).toBe(CARDS.length);
  });

  it("balances heroes against squads and ranged against melee", () => {
    const heroes = CARDS.filter((c) => c.figureCount === 1);
    const ranged = CARDS.filter((c) => c.advanced.range > 1);
    expect(heroes).toHaveLength(15);
    expect(ranged).toHaveLength(15);
    // Every faction can field both kinds of unit and both kinds of attack.
    for (const f of FACTIONS) {
      const units = CARDS.filter((c) => c.faction === f);
      expect(units.some((c) => c.figureCount === 1), `${f} heroes`).toBe(true);
      expect(units.some((c) => c.figureCount > 1), `${f} squads`).toBe(true);
      expect(units.some((c) => c.advanced.range > 1), `${f} ranged`).toBe(true);
      expect(units.some((c) => c.advanced.range === 1), `${f} melee`).toBe(true);
    }
  });

  it("only uses abilities the engine implements", () => {
    const implemented = new Set([
      "flying", "trample", "smoke-step", "massed-volley", "grove-song", "rally-the-line", "deflector-field",
      "hidden-in-the-leaves", "moss-armor", "brace", "answering-blade", "thick-hide", "salvage-protocol",
      "field-dressing", "ember-spit", "mortar-barrage", "lantern-gaze",
      "charge", "steady-aim", "longshot", "pack-hunt", "duelist", "bloodrage", "smite-the-unholy",
      "command-the-dead", "shield-wall", "soul-reap", "reboot", "reassemble", "arc-lightning",
    ]);
    for (const c of CARDS) for (const a of c.advanced.abilities) expect(implemented.has(a.id), `${c.id} ${a.id}`).toBe(true);
  });

  it("gives every unit original, filled-in rules text on its back", () => {
    for (const c of CARDS) {
      expect(c.advanced.abilities.length, c.id).toBeGreaterThan(0);
      for (const a of c.advanced.abilities) expect(a.text.length, `${c.id} ${a.id}`).toBeGreaterThan(20);
    }
  });

  it("lets every multi-hex unit deploy in every start zone of every map", () => {
    const big = CARDS.filter((c) => c.footprint !== "1");
    for (const m of MAPS) {
      const { ctx } = contextFor(m);
      for (const n of ctx.board.playerCounts()) {
        const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: "#fff" }));
        const state = createGame({ mode: "advanced", seed: 1, mapId: m.id, players }, ctx).state;
        for (const p of state.players) {
          for (const card of big) {
            expect(deploymentPlacements(state, p.id, card, ctx).length, `${m.id}, ${n} players, ${p.id}, ${card.id}`).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("fits a full 4-card army of the largest squads in every start zone of every map", () => {
    const biggest = Math.max(...CARDS.map((c) => c.figureCount));
    for (const m of MAPS) {
      const { ctx } = contextFor(m);
      for (const z of m.startZones) {
        const spots = z.hexes.filter((h) => !ctx.board.sceneryAt(h, ctx.board.topSurface(h)!.elevation));
        expect(spots.length, `${m.id} seat ${z.seat}`).toBeGreaterThanOrEqual(4 * biggest);
      }
    }
  });
});
