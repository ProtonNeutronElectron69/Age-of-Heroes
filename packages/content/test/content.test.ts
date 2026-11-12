import { applyCommand, createGame, currentDeployment, deploymentPlacements, hexDistance, playerZone, type Step } from "@aoh/rules";
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

  it("has a roster of 48 units, 8 in each of 6 factions, three of them multi-hex", () => {
    expect(CARDS).toHaveLength(48);
    expect(FACTIONS).toEqual([
      "Iron Concord",
      "House Kagero",
      "Verdant Court",
      "Nexus Collective",
      "Ashen Host",
      "Dawnhold Covenant",
    ]);
    for (const f of FACTIONS) expect(CARDS.filter((c) => c.faction === f), f).toHaveLength(8);
    expect(CARDS.filter((c) => c.footprint !== "1").map((c) => [c.id, c.footprint])).toEqual([
      ["old-rootback", "2x1"],
      ["siege-walker-atlas", "2x2"],
      ["marrowcoil", "3x1"],
    ]);
    expect(new Set(CARDS.map((c) => c.tokenLabel)).size).toBe(CARDS.length);
  });

  it("keeps heroes and squads, and ranged and melee, within about 60/40 of each other", () => {
    const heroes = CARDS.filter((c) => c.figureCount === 1);
    const ranged = CARDS.filter((c) => c.advanced.range > 1);
    for (const share of [heroes.length / CARDS.length, ranged.length / CARDS.length]) {
      expect(share).toBeGreaterThanOrEqual(0.35);
      expect(share).toBeLessThanOrEqual(0.65);
    }
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
      "command-the-dead", "shield-wall", "soul-reap", "reboot", "reassemble", "arc-lightning", "fury",
      "pin", "shove", "grapple-line", "last-stand", "fae-step", "will-o-wisp", "regrowth", "volatile-core",
      "war-drums", "corpse-feast", "challenge", "piercing", "mending-hymn",
    ]);
    for (const c of CARDS) for (const a of c.advanced.abilities) expect(implemented.has(a.id), `${c.id} ${a.id}`).toBe(true);
  });

  it("gives heroes 2 to 8 Life, and most squads 1 (tough squads of 2 or 3 figures up to 3)", () => {
    const squads = CARDS.filter((c) => c.figureCount > 1);
    for (const c of CARDS) {
      const life = c.advanced.life;
      if (c.figureCount === 1) {
        expect(life, c.id).toBeGreaterThanOrEqual(2);
        expect(life, c.id).toBeLessThanOrEqual(8);
      } else if (life > 1) {
        expect(c.figureCount, `${c.id}: only squads of 2 or 3 may have more than 1 Life`).toBeLessThanOrEqual(3);
        expect(life, c.id).toBeLessThanOrEqual(3);
      }
    }
    expect(squads.filter((c) => c.advanced.life === 1).length).toBeGreaterThan(squads.length / 2);
  });

  it("gives every squad 1 special ability and every hero 2, not counting Flying", () => {
    for (const c of CARDS) {
      const special = c.advanced.abilities.filter((a) => a.id !== "flying");
      expect(special.length, c.id).toBe(c.figureCount === 1 ? 2 : 1);
      expect(new Set(special.map((a) => a.id)).size, `${c.id} repeats an ability`).toBe(special.length);
    }
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

describe("start zones that grow to fit the army", () => {
  /** Deploy every unit with the first free placement for each figure, as Auto place does. */
  function deployAll(setup: Parameters<typeof createGame>[0], ctx: ReturnType<typeof contextFor>["ctx"]) {
    let { state, events } = createGame(setup, ctx);
    const all = [...events];
    for (let guard = 0; state.phase === "deploy" && guard < 200; guard++) {
      const { player, unitId } = currentDeployment(state)!;
      const unit = state.units.find((u) => u.id === unitId)!;
      const card = ctx.cards.get(unit.cardId)!;
      const taken: Step[] = [];
      const placements = unit.figures.map((f) => {
        const choice = deploymentPlacements(state, player, card, ctx, taken)[0];
        if (!choice) throw new Error(`no room for ${unit.cardId} of ${player}`);
        taken.push(...choice.spots);
        return { figureId: f.id, ...choice.placement };
      });
      const r = applyCommand(state, { type: "deployUnit", player, unitId, placements }, ctx);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
      all.push(...r.events);
    }
    return { state, events: all };
  }

  it("fits the largest armies the draft allows, for every player count of every premade map", () => {
    // 600 points of 4-figure squads is the most figures a draft can produce; add the big figures too.
    const swarm = Array.from({ length: 8 }, () => "barrow-legion");
    const giants = ["siege-walker-atlas", "marrowcoil", "old-rootback", "barrow-legion", "barrow-legion", "barrow-legion"];
    for (const m of MAPS) {
      expect(m.growZones, m.id).toBe(true);
      const { ctx } = contextFor(m);
      for (const n of ctx.board.playerCounts()) {
        for (const army of [swarm, giants]) {
          const players = Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, color: "#fff" }));
          const armies = Object.fromEntries(players.map((p) => [p.id, army]));
          const { state, events } = deployAll({ mode: "advanced", seed: 1, mapId: m.id, players, armies }, ctx);
          const where = `${m.id}, ${n} players, ${army === swarm ? "swarm" : "giants"}`;
          expect(events.filter((e) => e.type === "unitNotDeployed"), where).toEqual([]);
          expect(state.phase, where).toBe("placeTokens");
          // Grown zones never overlap.
          const seen = new Set<string>();
          for (const p of state.players) {
            for (const h of playerZone(state, p.id, ctx)) {
              const key = `${h.q},${h.r}`;
              expect(seen.has(key), `${where}: ${key} in two zones`).toBe(false);
              seen.add(key);
            }
          }
        }
      }
    }
  });

  it("leaves zones as drawn on maps that do not grow them", () => {
    const m = { ...MAPS[0]!, growZones: false };
    const { ctx } = contextFor(m);
    const players = [
      { id: "p1", name: "A", color: "#fff" },
      { id: "p2", name: "B", color: "#fff" },
    ];
    const state = createGame({ mode: "advanced", seed: 1, mapId: m.id, players, armies: { p1: ["barrow-legion"], p2: ["barrow-legion"] } }, ctx).state;
    expect(state.zones).toBeUndefined();
    expect(playerZone(state, "p1", ctx)).toEqual(ctx.board.startZone(state.players[0]!.zone));
  });
});
