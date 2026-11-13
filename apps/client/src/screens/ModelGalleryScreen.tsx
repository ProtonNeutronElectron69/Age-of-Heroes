import { CARDS, FACTIONS, SEAT_COLORS, SEAT_COLOR_NAMES } from "@aoh/content";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { HEX_SIZE, LEVEL_HEIGHT, TOKEN_RADIUS, footprintCells, hex, hexKey, hexNeighbors, hexToWorld, isSquad, type Hex, type UnitCard } from "@aoh/rules";
import { useEffect, useMemo, useState } from "react";
import { CylinderGeometry } from "three";
import {
  BASE_COLOR,
  COLOR_SCHEMES,
  OVERHANG_LIMITS,
  UNIT_MODELS,
  baseFrame,
  baseGeometry,
  figureColors,
  figureGeometry,
  measure,
  type BaseFrame,
  type ColorScheme,
  type Fit,
  type UnitModel,
} from "../models";
import { HEX_GAP } from "../scene/scale";
import { TestHook } from "../scene/TestHook";
import { factionTheme } from "../ui/factionThemes";
import "./model-gallery.css";

/** A unit standing on the display board. */
interface Standing {
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
function lineUp(cards: readonly UnitCard[]): Standing[] {
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

interface Colors {
  readonly model: string;
  /** The ring round the edge of the base. */
  readonly ring: string;
}

function StandingUnit({ standing, colors, tokens }: { standing: Standing; colors: Colors; tokens: boolean }) {
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
function Tiles({ standings }: { standings: readonly Standing[] }) {
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

interface View {
  readonly target: [number, number, number];
  readonly distance: number;
  /** Which way the camera stands from the target. */
  readonly from: readonly [number, number, number];
}

/** One unit is seen from its front quarter; the whole board from higher up and more head on. */
const CLOSE = [0.8, 0.3, 0.52] as const;
const WIDE = [0.74, 0.62, 0.26] as const;

/** Points the camera at the chosen unit, or at the whole board. */
function Camera({ view }: { view: View }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  // A tall, narrow stage sees less to each side, so it stands further back.
  const aspect = useThree((s) => s.size.width / s.size.height);
  const back = aspect < 1 ? Math.min(2.2, 1 / aspect) : 1;
  useEffect(() => {
    const [x, y, z] = view.target;
    const distance = view.distance * back;
    camera.position.set(x + distance * view.from[0], y + distance * view.from[1], z + distance * view.from[2]);
    controls?.target.set(x, y, z);
    controls?.update();
  }, [camera, controls, view, back]);
  return null;
}

const FOOTPRINT_NAMES: Record<string, string> = { "1": "1 hex", "2x1": "2x1", "3x1": "3x1", "2x2": "2x2" };

function describe(s: Standing): string {
  const figures = isSquad(s.card) ? `${s.card.figureCount} figures, ${s.unit.figures.length} ${s.unit.figures.length === 1 ? "pose" : "poses"}` : "1 figure";
  return `${isSquad(s.card) ? "Squad" : "Hero"}, ${figures}. Height ${s.card.height}, base ${FOOTPRINT_NAMES[s.card.footprint]}.`;
}

const percent = (n: number) => `${Math.round(n * 100)}%`;

/** "each": every faction is a different player's, so the board shows all six player colours. */
type Player = "each" | number;

/**
 * The figure models, standing on their bases. A page for judging their size,
 * shape and colours, opened with `?models` in the address; add `=name` to show
 * one faction or unit, for example `?models=verdant`.
 */
export function ModelGalleryScreen({ filter = "" }: { filter?: string }) {
  const standings = useMemo(() => {
    const wanted = filter.toLowerCase();
    const cards = CARDS.filter((c) => UNIT_MODELS[c.id] && (!wanted || c.faction.toLowerCase().includes(wanted) || c.id.includes(wanted)));
    return lineUp(cards);
  }, [filter]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tokens, setTokens] = useState(false);
  const [scheme, setScheme] = useState<ColorScheme>("faction");
  const [player, setPlayer] = useState<Player>("each");

  const colorsOf = (s: Standing): Colors =>
    figureColors(scheme, factionTheme(s.card.faction).primary, SEAT_COLORS[player === "each" ? s.faction % SEAT_COLORS.length : player]!);

  const view = useMemo((): View => {
    const one = standings.find((s) => s.card.id === chosen);
    if (one) {
      const reach = Math.max(...one.frames.map((f) => Math.hypot(f.x - one.centre.x, f.z - one.centre.z)));
      const tall = one.card.height * LEVEL_HEIGHT;
      return { target: [one.centre.x, tall * 0.5, one.centre.z], distance: (reach + tall) * 1.25 + 1.8 + (one.frames[0]!.cells.length - 1) * 1.2, from: CLOSE };
    }
    const xs = standings.flatMap((s) => s.frames.map((f) => f.x));
    const zs = standings.flatMap((s) => s.frames.map((f) => f.z));
    const deep = Math.max(...xs) - Math.min(...xs);
    const wide = Math.max(...zs) - Math.min(...zs);
    // The camera looks down from the front, so the nearest rank needs more room than the furthest: aim a little in front of the middle.
    const middle = (Math.max(...xs) + Math.min(...xs)) / 2 + deep * 0.17;
    return { target: [middle, 0.6, (Math.max(...zs) + Math.min(...zs)) / 2], distance: Math.max(wide * 0.92, deep * 1.3) + 8, from: WIDE };
  }, [standings, chosen]);

  return (
    <main className="model-gallery">
      <header className="model-gallery-head">
        <div>
          <h1>Figure models</h1>
          <p className="muted">
            Stage 1: size and shape, in flat colours. Drag to turn the board, scroll to zoom, and pick a unit to look closer.
          </p>
        </div>
        <div className="model-gallery-controls">
          <fieldset>
            <legend>Colours</legend>
            {COLOR_SCHEMES.map((s) => (
              <label key={s.id}>
                <input type="radio" name="model-colours" checked={scheme === s.id} onChange={() => setScheme(s.id)} />
                {s.name}
              </label>
            ))}
          </fieldset>
          <label>
            Player
            <select value={String(player)} onChange={(e) => setPlayer(e.target.value === "each" ? "each" : Number(e.target.value))}>
              <option value="each">A different player for each faction</option>
              {SEAT_COLOR_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input type="checkbox" checked={tokens} onChange={(e) => setTokens(e.target.checked)} />
            Show tokens
          </label>
        </div>
      </header>
      <div className="model-gallery-stage">
        <Canvas camera={{ position: [10, 6, 6], fov: 40 }} dpr={[1, 2]}>
          <color attach="background" args={["#232d3b"]} />
          <hemisphereLight args={["#eef3ff", "#5a4e40", 1.5]} />
          <directionalLight position={[5, 16, 18]} intensity={2.6} />
          <directionalLight position={[14, 5, -12]} intensity={1.1} />
          <directionalLight position={[-12, 10, -3]} intensity={0.9} />
          <Tiles standings={standings} />
          {standings.map((s) => (
            <StandingUnit key={s.card.id} standing={s} colors={colorsOf(s)} tokens={tokens} />
          ))}
          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={2.5} maxDistance={140} />
          <Camera view={view} />
          <TestHook offset={{ x: 0, z: 0 }} />
        </Canvas>
      </div>
      <ul className="model-gallery-list" aria-label="Units">
        <li>
          <button type="button" className={chosen === null ? "chosen" : ""} aria-pressed={chosen === null} onClick={() => setChosen(null)}>
            <strong>All units</strong>
            <span className="muted">
              {standings.length === CARDS.length ? `All ${CARDS.length} units.` : `${standings.length} of ${CARDS.length} units shown.`}
            </span>
          </button>
        </li>
        {standings.map((s) => {
          const colors = colorsOf(s);
          return (
            <li key={s.card.id}>
              <button
                type="button"
                className={chosen === s.card.id ? "chosen" : ""}
                aria-pressed={chosen === s.card.id}
                data-unit={s.card.id}
                data-model-color={colors.model}
                data-ring-color={colors.ring}
                onClick={() => setChosen(s.card.id)}
              >
                <span className="model-gallery-swatch" style={{ background: colors.model, borderColor: colors.ring }} />
                <strong>{s.card.name}</strong>
                <span className="muted">
                  {s.card.faction}. {describe(s)}
                </span>
                <span className="muted">
                  {s.fit.triangles} triangles a figure. The body reaches {s.fit.reach.toFixed(2)} of a hex past its hexes, with {percent(s.fit.outside)} of it off them.
                </span>
                <span className={s.fit.fits ? "model-gallery-fit" : "model-gallery-fit over"}>{s.fit.fits ? "Fits its base" : "Needs a larger base"}</span>
              </button>
            </li>
          );
        })}
        <li className="muted model-gallery-note">
          A body may reach up to {OVERHANG_LIMITS.reach.toFixed(2)} of a hex past the hexes of its base, with up to {percent(OVERHANG_LIMITS.outside)} of it off them. Weapons do not count.
        </li>
      </ul>
    </main>
  );
}
