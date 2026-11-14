import { FACTIONS } from "@aoh/content";
import { useThree } from "@react-three/fiber";
import { HEX_SIZE, LEVEL_HEIGHT, TOKEN_RADIUS, footprintCells, hex, hexKey, hexNeighbors, hexToWorld, type Hex, type UnitCard } from "@aoh/rules";
import { useEffect, useMemo } from "react";
import { CylinderGeometry } from "three";
import { BASE_COLOR, UNIT_MODELS, baseFrame, baseGeometry, figureGeometry, measure, type BaseFrame, type Fit, type UnitModel } from "../models";
import { HEX_GAP } from "./scale";

// Units standing on a display board: the model page (?models) and the unit gallery draw them.

/** A unit standing on the display board. */
export interface Standing {
  readonly card: UnitCard;
  readonly unit: UnitModel;
  /** Its faction's place in the roster, which picks its player colour when every faction gets its own. */
  readonly faction: number;
  /** Where each of its figures stands. */
  readonly frames: readonly BaseFrame[];
  /** The worst fit among its poses. */
  readonly fit: Fit;
  readonly centre: { x: number; z: number };
}


/** Every figure faces this way: footprint rotation 3 looks along +x. */
const FACING = 3;
/** Empty hexes left between two units in a rank and between two ranks side by side, and columns between two ranks. */
const UNIT_GAP = 1;
const RANK_GAP = 3;
const ROW_GAP = 4;
/** Ranks side by side before the next row starts behind them. */
const RANKS_ACROSS = 1;

/** Hex number `slot` along a row: a zig-zag line square to the way the figures face. */
function slotHex(row: number, slot: number): Hex {
  return hex(-Math.floor(slot / 2) - row * ROW_GAP, slot);
}

function worst(fits: readonly Fit[]): Fit {
  return fits.reduce((a, b) => ({
    height: Math.max(a.height, b.height),
    triangles: Math.max(a.triangles, b.triangles),
    reach: Math.max(a.reach, b.reach),
    outside: Math.max(a.outside, b.outside),
    fits: a.fits && b.fits,
  }));
}

/** Stand the units in ranks, a faction to a rank, squads shoulder to shoulder. */
export function lineUp(cards: readonly UnitCard[]): Standing[] {
  const out: Standing[] = [];
  const factions = FACTIONS.filter((f) => cards.some((c) => c.faction === f));
  let slot = 0;
  factions.forEach((faction, rank) => {
    const row = Math.floor(rank / RANKS_ACROSS);
    if (rank % RANKS_ACROSS === 0) slot = 0;
    for (const card of cards.filter((c) => c.faction === faction)) {
      const unit = UNIT_MODELS[card.id]!;
      // A wide base covers more than one slot of the row.
      const across = footprintCells(card.footprint, hex(0, 0), FACING).map((c) => c.r);
      const wide = Math.max(...across) - Math.min(...across) + 1;
      const frames = Array.from({ length: card.figureCount }, () => {
        const frame = baseFrame(card.footprint, slotHex(row, slot - Math.min(...across)), FACING);
        slot += wide;
        return frame;
      });
      slot += UNIT_GAP;
      out.push({
        card,
        unit,
        faction: FACTIONS.indexOf(faction),
        frames,
        fit: worst(unit.figures.map((f) => measure(f, card.footprint))),
        centre: {
          x: frames.reduce((s, f) => s + f.x, 0) / frames.length,
          z: frames.reduce((s, f) => s + f.z, 0) / frames.length,
        },
      });
    }
    slot += RANK_GAP - UNIT_GAP;
  });
  return out;
}

export interface Colors {
  readonly model: string;
  /** The ring round the edge of the base. */
  readonly ring: string;
}

export function StandingUnit({ standing, colors, tokens }: { standing: Standing; colors: Colors; tokens: boolean }) {
  const figures = useMemo(() => standing.unit.figures.map(figureGeometry), [standing.unit]);
  const base = useMemo(() => baseGeometry(standing.card.footprint), [standing.card.footprint]);
  useEffect(() => () => figures.forEach((g) => g.dispose()), [figures]);
  useEffect(
    () => () => {
      base.top.dispose();
      base.rim.dispose();
    },
    [base],
  );
  const tall = standing.card.height * LEVEL_HEIGHT;
  return (
    <>
      {standing.frames.map((frame, i) => (
        <group key={i}>
          <group position={[frame.x, 0, frame.z]} rotation={[0, frame.yaw, 0]}>
            <mesh geometry={figures[i % figures.length]!}>
              <meshStandardMaterial color={colors.model} roughness={0.7} />
            </mesh>
            <mesh geometry={base.top}>
              <meshStandardMaterial color={BASE_COLOR} roughness={0.75} />
            </mesh>
            <mesh geometry={base.rim}>
              <meshStandardMaterial color={colors.ring} roughness={0.55} />
            </mesh>
          </group>
          {tokens &&
            frame.cells.map((cell) => {
              const { x, z } = hexToWorld(cell, HEX_SIZE);
              return (
                <mesh key={hexKey(cell)} position={[x, tall / 2, z]}>
                  <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS, tall, 24]} />
                  <meshBasicMaterial color="#ffffff" transparent opacity={0.22} depthWrite={false} />
                </mesh>
              );
            })}
        </group>
      ))}
    </>
  );
}

/** The display board: the hexes the figures stand on and the hexes around them. */
export function Tiles({ standings }: { standings: readonly Standing[] }) {
  const geometry = useMemo(() => new CylinderGeometry(HEX_SIZE * HEX_GAP, HEX_SIZE * HEX_GAP, LEVEL_HEIGHT, 6), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const tiles = useMemo(() => {
    const all = new Map<string, Hex>();
    for (const s of standings) {
      for (const frame of s.frames) {
        for (const cell of frame.cells) for (const tile of [cell, ...hexNeighbors(cell)]) all.set(hexKey(tile), tile);
      }
    }
    return [...all.values()];
  }, [standings]);
  return (
    <>
      {tiles.map((cell) => {
        const { x, z } = hexToWorld(cell, HEX_SIZE);
        return (
          <mesh key={hexKey(cell)} geometry={geometry} position={[x, -LEVEL_HEIGHT / 2, z]}>
            <meshStandardMaterial color="#8a917f" roughness={0.9} />
          </mesh>
        );
      })}
    </>
  );
}

export interface View {
  readonly target: [number, number, number];
  readonly distance: number;
  /** Which way the camera stands from the target. */
  readonly from: readonly [number, number, number];
}

/** One unit is seen from its front quarter; the whole board from higher up and more head on. */
export const CLOSE = [0.8, 0.3, 0.52] as const;
export const WIDE = [0.74, 0.62, 0.26] as const;

/** Points the camera at the chosen unit, or at the whole board. */
export function Camera({ view }: { view: View }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  // A tall, narrow stage sees less to each side, so it stands further back.
  const aspect = useThree((s) => s.size.width / s.size.height);
  const back = aspect < 1 ? Math.min(2.2, 1 / aspect) : 1;
  // A canvas that draws on demand needs telling when the camera has moved.
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const [x, y, z] = view.target;
    const distance = view.distance * back;
    camera.position.set(x + distance * view.from[0], y + distance * view.from[1], z + distance * view.from[2]);
    controls?.target.set(x, y, z);
    controls?.update();
    invalidate();
  }, [camera, controls, view, back, invalidate]);
  return null;
}

/** A view of one standing unit from its front quarter, close enough to fill the stage. */
export function closeView(one: Standing): View {
  const reach = Math.max(...one.frames.map((f) => Math.hypot(f.x - one.centre.x, f.z - one.centre.z)));
  const tall = one.card.height * LEVEL_HEIGHT;
  return { target: [one.centre.x, tall * 0.5, one.centre.z], distance: (reach + tall) * 1.25 + 1.8 + (one.frames[0]!.cells.length - 1) * 1.2, from: CLOSE };
}
