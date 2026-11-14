import { CARDS, MAPS, SEAT_COLORS, TERRAIN_TABLE, buildBoard } from "@aoh/content";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { HEX_SIZE, footprintCells, hexKey, hexToWorld, type Hex, type Step } from "@aoh/rules";
import { useEffect, useMemo } from "react";
import { baseFrame } from "../../models";
import { BoardScene, boardCenter } from "../../scene/BoardScene";
import { Figures, type FigureView } from "../../scene/Figures";
import { TestHook } from "../../scene/TestHook";

/** Six small armies, one per start zone, for the War Table menu's backdrop. */
const ARMIES: readonly (readonly string[])[] = [
  ["marisol-vance", "concord-fusiliers", "brass-hussars"],
  ["siege-walker-atlas", "nexus-reclaimers", "sentinel-k7"],
  ["old-rootback", "glade-wardens", "cinderjaw"],
  ["marrowcoil", "barrow-legion", "vorhal"],
  ["ashfang-oni", "crimson-lotus-guard", "lady-asagiri"],
  ["solenne", "silverlance-knights", "sunbound-archers"],
];

/** Frames drawn per second: the drift is slow, so a modest rate looks smooth and spares the computer. */
const FPS = 30;
/** One turn round the battlefield every four minutes. */
const TURN_SECONDS = 240;

/** Stands each army at the front of its start zone, every figure facing the middle of the board. */
function muster(): { figures: FigureView[]; board: ReturnType<typeof buildBoard>["board"] } {
  const map = MAPS[0]!;
  const { board } = buildBoard(map);
  const middle = boardCenter(board);
  const used = new Set<string>();
  const figures: FigureView[] = [];
  const toMiddle = (h: Hex) => {
    const p = hexToWorld(h, HEX_SIZE);
    return Math.hypot(p.x - middle.x, p.z - middle.z);
  };
  ARMIES.forEach((army, seat) => {
    const zone = map.startZones.find((z) => z.seat === seat) ?? map.startZones[seat];
    if (!zone) return;
    const hexes = [...zone.hexes].sort((a, b) => toMiddle(a) - toMiddle(b));
    for (const id of army) {
      const card = CARDS.find((c) => c.id === id);
      if (!card) continue;
      let placed = 0;
      for (const h of hexes) {
        if (placed >= card.figureCount) break;
        const p = hexToWorld(h, HEX_SIZE);
        const want = Math.atan2(middle.x - p.x, middle.z - p.z);
        const turn = (r: number) => {
          const y = baseFrame(card.footprint, h, r).yaw;
          return Math.abs(Math.atan2(Math.sin(y - want), Math.cos(y - want)));
        };
        const rotation = [0, 1, 2, 3, 4, 5].reduce((best, r) => (turn(r) < turn(best) ? r : best), 0);
        const cells = footprintCells(card.footprint, h, rotation);
        if (cells.some((c) => !board.has(c) || used.has(hexKey(c)) || !board.topSurface(c) || board.sceneryIn(c).length > 0)) continue;
        cells.forEach((c) => used.add(hexKey(c)));
        const spots: Step[] = cells.map((c) => ({ hex: c, elevation: board.topSurface(c)!.elevation }));
        figures.push({
          id: `menu:${seat}:${id}:${placed}`,
          cardId: id,
          footprint: card.footprint,
          faction: card.faction,
          owner: `p${seat + 1}`,
          pose: placed,
          spots,
          height: card.height,
          color: SEAT_COLORS[seat]!,
          label: card.tokenLabel,
          hero: card.figureCount === 1,
          status: "idle",
        });
        placed++;
      }
    }
  });
  return { figures, board };
}

/** Circles the battlefield slowly, looking a little to the right of the middle so the board fills the open side of the menu. */
function Drift({ span, still }: { span: number; still: boolean }) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (still) {
      invalidate();
      return;
    }
    const timer = window.setInterval(() => invalidate(), 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [invalidate, still]);
  useFrame(({ clock }) => {
    const t = still ? 40 : clock.elapsedTime;
    const a = 0.9 + (t * Math.PI * 2) / TURN_SECONDS;
    const radius = span * 0.48 + 2.5 * Math.sin(t * 0.05);
    camera.position.set(Math.cos(a) * radius, span * 0.29 + 1.5 * Math.sin(t * 0.07), Math.sin(a) * radius);
    // Aim to the right of the middle, at a point across the board from the camera.
    camera.lookAt(Math.sin(a) * 5.5, 0.6, -Math.cos(a) * 5.5);
  });
  return null;
}

/** The War Table backdrop: the Proving Grounds with six armies on it, drawn by the game itself. */
export function MenuBoard() {
  const { figures, board } = useMemo(muster, []);
  const centre = useMemo(() => boardCenter(board), [board]);
  const span = centre.span;
  const still = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);
  return (
    <div className="menu-board" aria-hidden="true">
      <Canvas frameloop="demand" camera={{ fov: 38, near: 0.5, far: 200 }} dpr={[1, 1.5]}>
        <fog attach="fog" args={["#18202c", span * 0.7, span * 1.6]} />
        <BoardScene board={board} terrain={TERRAIN_TABLE} still>
          <Figures figures={figures} style="models" />
        </BoardScene>
        <Drift span={span} still={still} />
        <TestHook offset={centre} />
      </Canvas>
    </div>
  );
}
