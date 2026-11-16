import { MAPS, contextFor } from "@aoh/content";
import { createGame, hex, type GameEvent, type GameState } from "@aoh/rules";
import { describe, expect, it } from "vitest";
import { fallenSpots, fightIn, woundMarksIn } from "../src/fight";

/**
 * The attack intro, the wound numbers and the figures left standing where they fell
 * are all read from a command's events. These check that reading.
 */

const map = MAPS.find((m) => m.id === "proving-grounds")!;
const { ctx } = contextFor(map);

/** Ana has a sharpshooter (Range 4) and a melee hero; Bo has a melee hero and a squad of pikemen. */
function game(): GameState {
  const { state } = createGame(
    {
      seed: 1,
      mapId: map.id,
      players: [
        { id: "p1", name: "Ana", color: "#e53935" },
        { id: "p2", name: "Bo", color: "#1e88e5" },
      ],
      armies: { p1: ["marisol-vance", "kenzo"], p2: ["lady-asagiri", "gatewarden-pikemen"] },
    },
    ctx,
  );
  return state;
}

const figureOf = (state: GameState, cardId: string, n = 0) => state.units.find((u) => u.cardId === cardId)!.figures[n]!;

function roll(attackerId: string, targetId: string, wounds: number, extra: Partial<Extract<GameEvent, { type: "attackRolled" }>> = {}): GameEvent {
  return { type: "attackRolled", source: "attack", attackerId, targetId, attack: [], defense: [], hits: wounds, blocks: 0, wounds, attackBonus: 0, defenseBonus: 0, ...extra };
}

describe("the attack intro", () => {
  it("knows a shot from range from a blow in melee", () => {
    const state = game();
    const marisol = figureOf(state, "marisol-vance").id;
    const kenzo = figureOf(state, "kenzo").id;
    const asagiri = figureOf(state, "lady-asagiri").id;
    expect(fightIn([roll(marisol, asagiri, 1)], state, ctx)!.pairs).toEqual([{ attackerId: marisol, targetId: asagiri, ranged: true }]);
    expect(fightIn([roll(kenzo, asagiri, 0)], state, ctx)!.pairs[0]!.ranged).toBe(false);
    // A strike at a figure leaving is melee, whoever makes it.
    expect(fightIn([roll(marisol, asagiri, 0, { source: "passingStrike" })], state, ctx)!.pairs[0]!.ranged).toBe(false);
    expect(fightIn([{ type: "roundEnded", round: 1 }], state, ctx)).toBeNull();
  });

  it("shows the first attacker and everything it hit, but not a blow struck back as a figure falls", () => {
    const state = game();
    const kenzo = figureOf(state, "kenzo").id;
    const pikes = [0, 1, 2].map((n) => figureOf(state, "gatewarden-pikemen", n).id);
    const fight = fightIn(
      [roll(kenzo, pikes[0]!, 1), roll(kenzo, pikes[1]!, 0), { type: "figureDestroyed", figureId: pikes[0]!, unitId: "x", cause: "attack" }, roll(pikes[0]!, kenzo, 1)],
      state,
      ctx,
    )!;
    expect(fight.attackers).toEqual([kenzo]);
    expect(fight.targets).toEqual([pikes[0], pikes[1]]);
    expect(fight.pairs.map((p) => p.targetId)).toEqual([pikes[0]]);
  });
});

describe("wound numbers", () => {
  it("numbers every figure attacked, 0 included, and other damage only when it wounds", () => {
    const events: GameEvent[] = [
      roll("a", "b", 2),
      { type: "figureWounded", figureId: "b", wounds: 2, total: 2 },
      { type: "figureDestroyed", figureId: "b", unitId: "u", cause: "attack" },
      roll("a", "c", 0),
      // A fall wounds; lava destroys without a wound; a swamp roll by no figure is not an attack.
      { type: "figureWounded", figureId: "d", wounds: 1, total: 1 },
      { type: "figureDestroyed", figureId: "e", unitId: "u", cause: "lava" },
      { type: "attackRolled", source: "swamp", attackerId: null, targetId: "f", attack: [], defense: [], hits: 0, blocks: 0, wounds: 0, attackBonus: 0, defenseBonus: 0 },
    ];
    expect(woundMarksIn(events)).toEqual([
      { figureId: "b", wounds: 2, destroyed: true },
      { figureId: "c", wounds: 0, destroyed: false },
      { figureId: "d", wounds: 1, destroyed: false },
      { figureId: "e", wounds: null, destroyed: true },
    ]);
  });
});

describe("figures that fell", () => {
  it("are found where they stood, or at the end of the move that killed them", () => {
    const before = game();
    const asagiri = figureOf(before, "lady-asagiri");
    const pike = figureOf(before, "gatewarden-pikemen");
    asagiri.position = { hex: hex(2, 3), elevation: 1, rotation: 0 };
    pike.position = { hex: hex(4, 4), elevation: 0, rotation: 0 };
    const fallen = fallenSpots(
      before,
      [
        { type: "figureDestroyed", figureId: asagiri.id, unitId: "x", cause: "attack" },
        { type: "figureMoved", figureId: pike.id, from: { hex: hex(4, 4), elevation: 0 }, path: [{ hex: hex(5, 4), elevation: 0 }, { hex: hex(6, 4), elevation: 2 }] },
        { type: "figureDestroyed", figureId: pike.id, unitId: "y", cause: "fall" },
      ],
      ctx,
    );
    expect(fallen.get(asagiri.id)).toEqual([{ hex: hex(2, 3), elevation: 1 }]);
    expect(fallen.get(pike.id)).toEqual([{ hex: hex(6, 4), elevation: 2 }]);
    expect(fallen.size).toBe(2);
  });
});
