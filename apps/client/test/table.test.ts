import { MAPS, contextFor } from "@aoh/content";
import { describe, expect, it } from "vitest";
import { boardBounds } from "../src/scene/tableData";
import { TABLE_CARD, cardSlot, layoutTable, type Bounds, type CardSpot, type TablePlayer } from "../src/scene/tableLayout";

const BOARD: Bounds = { minX: -15, maxX: 15, minZ: -12, maxZ: 12 };

function players(count: number, units: number, homes: readonly ({ x: number; z: number } | null)[]): TablePlayer[] {
  return Array.from({ length: count }, (_, p) => ({
    id: `p${p + 1}`,
    home: homes[p] ?? null,
    units: Array.from({ length: units }, (_, u) => `p${p + 1}:${u}`),
  }));
}

/** The box a card covers on the table; a card on the east or west side lies turned. */
function box(c: CardSpot): Bounds {
  const turned = c.side === "east" || c.side === "west";
  const w = (turned ? TABLE_CARD.depth : TABLE_CARD.width) / 2;
  const d = (turned ? TABLE_CARD.width : TABLE_CARD.depth) / 2;
  return { minX: c.x - w, maxX: c.x + w, minZ: c.z - d, maxZ: c.z + d };
}

const overlap = (a: Bounds, b: Bounds) => a.minX < b.maxX - 1e-6 && b.minX < a.maxX - 1e-6 && a.minZ < b.maxZ - 1e-6 && b.minZ < a.maxZ - 1e-6;
const inside = (a: Bounds, b: Bounds) => a.minX >= b.minX - 1e-6 && a.maxX <= b.maxX + 1e-6 && a.minZ >= b.minZ - 1e-6 && a.maxZ <= b.maxZ + 1e-6;

describe("the gaming table", () => {
  it("seats each player on the side nearest their start zone", () => {
    const layout = layoutTable(BOARD, players(4, 2, [{ x: 0, z: 11 }, { x: 0, z: -11 }, { x: 14, z: 0 }, { x: -14, z: 0 }]));
    const side = (p: string) => new Set(layout.cards.filter((c) => c.player === p).map((c) => c.side));
    expect([...side("p1")]).toEqual(["south"]);
    expect([...side("p2")]).toEqual(["north"]);
    expect([...side("p3")]).toEqual(["east"]);
    expect([...side("p4")]).toEqual(["west"]);
  });

  it("gives up to four players a side each, even when two start zones face the same side", () => {
    // A wide board with a start zone in each corner: by nearest side alone, two would share south and two north.
    const corners = [{ x: -14, z: 10 }, { x: 14, z: 10 }, { x: 14, z: -10 }, { x: -14, z: -10 }];
    for (const count of [3, 4]) {
      const layout = layoutTable(BOARD, players(count, 2, corners.slice(0, count)));
      const sides = Array.from({ length: count }, (_, i) => new Set(layout.cards.filter((c) => c.player === `p${i + 1}`).map((c) => c.side)));
      for (const s of sides) expect(s.size).toBe(1);
      expect(new Set(sides.map((s) => [...s][0])).size).toBe(count);
    }
    // Each still sits on a side next to their corner.
    const four = layoutTable(BOARD, players(4, 2, corners));
    const sideOf = (p: string) => four.cards.find((c) => c.player === p)!.side;
    expect(["south", "west"]).toContain(sideOf("p1"));
    expect(["south", "east"]).toContain(sideOf("p2"));
    expect(["north", "east"]).toContain(sideOf("p3"));
    expect(["north", "west"]).toContain(sideOf("p4"));
  });

  it("puts at most two players on a side when five or six play", () => {
    for (const count of [5, 6]) {
      const homes = Array.from({ length: count }, () => ({ x: 0, z: 11 }));
      const layout = layoutTable(BOARD, players(count, 1, homes));
      const perSide = new Map<string, Set<string>>();
      for (const c of layout.cards) perSide.set(c.side, (perSide.get(c.side) ?? new Set()).add(c.player));
      for (const ps of perSide.values()) expect(ps.size).toBeLessThanOrEqual(2);
    }
  });

  it("lays every card on the table, clear of the board and of each other", () => {
    for (const count of [2, 3, 4, 5, 6]) {
      for (const units of [1, 4, 9]) {
        // With and without start zones, and with every player crowded onto one side.
        const homes = [
          Array.from({ length: count }, () => null),
          Array.from({ length: count }, (_, i) => ({ x: Math.cos(i * 1.1) * 13, z: Math.sin(i * 1.1) * 10 })),
          Array.from({ length: count }, (_, i) => ({ x: -10 + i * 4, z: 11 })),
        ];
        for (const home of homes) {
          const layout = layoutTable(BOARD, players(count, units, home));
          expect(layout.cards).toHaveLength(count * units);
          const boxes = layout.cards.map(box);
          for (const [i, b] of boxes.entries()) {
            expect(inside(b, layout.table), `card ${i} is on the table`).toBe(true);
            expect(overlap(b, layout.mat), `card ${i} is clear of the board`).toBe(false);
            for (const other of boxes.slice(i + 1)) expect(overlap(b, other)).toBe(false);
          }
        }
      }
    }
  });

  it("is square", () => {
    for (const board of [BOARD, { minX: -8, maxX: 8, minZ: -20, maxZ: 20 }]) {
      const { table } = layoutTable(board, players(3, 4, []));
      expect(table.maxX - table.minX).toBeCloseTo(table.maxZ - table.minZ);
    }
  });

  it("grows with the board, which stays in the middle", () => {
    const small = layoutTable(BOARD, players(2, 3, []));
    const large = layoutTable({ minX: -30, maxX: 30, minZ: -24, maxZ: 24 }, players(2, 3, []));
    expect(large.table.maxX - large.table.minX).toBeGreaterThan(small.table.maxX - small.table.minX);
    expect(large.table.maxZ - large.table.minZ).toBeGreaterThan(small.table.maxZ - small.table.minZ);
    for (const t of [small.table, large.table]) {
      expect(t.minX + t.maxX).toBeCloseTo(0);
      expect(t.minZ + t.maxZ).toBeCloseTo(0);
    }
  });

  it("holds every premade map", () => {
    for (const map of MAPS) {
      const board = boardBounds(contextFor(map).ctx.board);
      const layout = layoutTable(board, players(2, 5, []));
      expect(inside(board, layout.mat), map.name).toBe(true);
      expect(inside(layout.mat, layout.table), map.name).toBe(true);
    }
  });

  it("gives each figure of a squad its own hex of the card", () => {
    expect(cardSlot(0, 1)).toEqual({ x: 0, z: 0 });
    const slots = [0, 1, 2, 3].map((i) => cardSlot(i, 4));
    for (const [i, a] of slots.entries()) {
      expect(Math.abs(a.x)).toBeLessThan(TABLE_CARD.width / 2);
      expect(Math.abs(a.z)).toBeLessThan(TABLE_CARD.depth / 2);
      for (const b of slots.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1.7);
    }
  });
});
