import { CARDS, FACTIONS } from "@aoh/content";
import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { HEX_SIZE, LEVEL_HEIGHT, TOKEN_RADIUS, hex, hexKey, hexNeighbors, hexToWorld, isSquad, type Hex, type UnitCard } from "@aoh/rules";
import { useEffect, useMemo, useState } from "react";
import { CylinderGeometry, type BufferGeometry } from "three";
import { OVERHANG_LIMITS, UNIT_MODELS, baseFrame, figureGeometry, figureModel, measure, type BaseFrame, type Fit, type UnitModel } from "../models";
import { HEX_GAP } from "../scene/scale";
import { TestHook } from "../scene/TestHook";
import { factionTheme } from "../ui/factionThemes";
import "./model-gallery.css";

/** A unit standing on the display board. */
interface Standing {
  readonly card: UnitCard;
  readonly unit: UnitModel;
  readonly color: string;
  /** Where each of its figures stands. */
  readonly frames: readonly BaseFrame[];
  /** The worst fit among its poses. */
  readonly fit: Fit;
  readonly centre: { x: number; z: number };
}

/** Every figure faces this way: footprint rotation 3 looks along +x. */
const FACING = 3;
/** Empty hexes left between two units in a rank, and columns between two ranks. */
const UNIT_GAP = 2;
const RANK_GAP = 5;

/** Hex number `slot` of a rank: a zig-zag line square to the way the figures face. */
function slotHex(rank: number, slot: number): Hex {
  return hex(-Math.floor(slot / 2) - rank * RANK_GAP, slot);
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
  factions.forEach((faction, rank) => {
    let slot = 0;
    for (const card of cards.filter((c) => c.faction === faction)) {
      const unit = UNIT_MODELS[card.id]!;
      const frames = Array.from({ length: card.figureCount }, () => baseFrame(card.footprint, slotHex(rank, slot++), FACING));
      slot += UNIT_GAP;
      out.push({
        card,
        unit,
        color: factionTheme(faction).primary,
        frames,
        fit: worst(unit.figures.map((f) => measure(f, card.footprint))),
        centre: {
          x: frames.reduce((s, f) => s + f.x, 0) / frames.length,
          z: frames.reduce((s, f) => s + f.z, 0) / frames.length,
        },
      });
    }
  });
  return out;
}

function Figure({ geometry, frame, color }: { geometry: BufferGeometry; frame: BaseFrame; color: string }) {
  return (
    <mesh geometry={geometry} position={[frame.x, 0, frame.z]} rotation={[0, frame.yaw, 0]}>
      <meshStandardMaterial color={color} roughness={0.7} />
    </mesh>
  );
}

function StandingUnit({ standing, tokens }: { standing: Standing; tokens: boolean }) {
  const geometries = useMemo(() => standing.unit.figures.map(figureGeometry), [standing.unit]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const tall = standing.card.height * LEVEL_HEIGHT;
  return (
    <>
      {standing.frames.map((frame, i) => (
        <group key={i}>
          <Figure geometry={geometries[i % geometries.length]!} frame={frame} color={standing.color} />
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

/** The display board: a base tile under every figure and the hexes around it. */
function Tiles({ standings }: { standings: readonly Standing[] }) {
  const geometry = useMemo(() => new CylinderGeometry(HEX_SIZE * HEX_GAP, HEX_SIZE * HEX_GAP, LEVEL_HEIGHT, 6), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const tiles = useMemo(() => {
    const all = new Map<string, { cell: Hex; base: boolean }>();
    for (const s of standings) {
      for (const frame of s.frames) {
        for (const cell of frame.cells) {
          all.set(hexKey(cell), { cell, base: true });
          for (const n of hexNeighbors(cell)) if (!all.has(hexKey(n))) all.set(hexKey(n), { cell: n, base: false });
        }
      }
    }
    return [...all.values()];
  }, [standings]);
  return (
    <>
      {tiles.map(({ cell, base }) => {
        const { x, z } = hexToWorld(cell, HEX_SIZE);
        return (
          <mesh key={hexKey(cell)} geometry={geometry} position={[x, -LEVEL_HEIGHT / 2, z]}>
            <meshStandardMaterial color={base ? "#d8d1bb" : "#7f8873"} roughness={0.9} />
          </mesh>
        );
      })}
    </>
  );
}

interface View {
  readonly target: [number, number, number];
  readonly distance: number;
}

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
    camera.position.set(x + distance * 0.8, y + distance * 0.3, z + distance * 0.52);
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

/**
 * The figure models, standing on their bases. A page for judging their size
 * and shape, opened with `?models` in the address; add `=name` to show one
 * faction or unit, for example `?models=verdant`.
 */
export function ModelGalleryScreen({ filter = "" }: { filter?: string }) {
  const standings = useMemo(() => {
    const wanted = filter.toLowerCase();
    const cards = CARDS.filter((c) => UNIT_MODELS[c.id] && (!wanted || c.faction.toLowerCase().includes(wanted) || c.id.includes(wanted)));
    return lineUp(cards);
  }, [filter]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [tokens, setTokens] = useState(false);

  const view = useMemo((): View => {
    const one = standings.find((s) => s.card.id === chosen);
    if (one) {
      const reach = Math.max(...one.frames.map((f) => Math.hypot(f.x - one.centre.x, f.z - one.centre.z)));
      const tall = one.card.height * LEVEL_HEIGHT;
      return { target: [one.centre.x, tall * 0.5, one.centre.z], distance: (reach + tall) * 1.25 + 1.8 };
    }
    const xs = standings.flatMap((s) => s.frames.map((f) => f.x));
    const zs = standings.flatMap((s) => s.frames.map((f) => f.z));
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs), 4);
    return { target: [(Math.max(...xs) + Math.min(...xs)) / 2, 0.6, (Math.max(...zs) + Math.min(...zs)) / 2], distance: span * 1.15 + 7 };
  }, [standings, chosen]);

  return (
    <main className="model-gallery">
      <header className="model-gallery-head">
        <div>
          <h1>Figure models</h1>
          <p className="muted">
            Stage 1: size and shape, in the faction's colour. Drag to turn the board, scroll to zoom, and pick a unit to look closer.
          </p>
        </div>
        <label className="model-gallery-toggle">
          <input type="checkbox" checked={tokens} onChange={(e) => setTokens(e.target.checked)} />
          Show tokens
        </label>
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
            <StandingUnit key={s.card.id} standing={s} tokens={tokens} />
          ))}
          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} minDistance={2.5} maxDistance={90} />
          <Camera view={view} />
          <TestHook offset={{ x: 0, z: 0 }} />
        </Canvas>
      </div>
      <ul className="model-gallery-list" aria-label="Units">
        <li>
          <button type="button" className={chosen === null ? "chosen" : ""} aria-pressed={chosen === null} onClick={() => setChosen(null)}>
            <strong>All units</strong>
            <span className="muted">
              {standings.length} of {CARDS.length} units have a model so far.
            </span>
          </button>
        </li>
        {standings.map((s) => (
          <li key={s.card.id}>
            <button
              type="button"
              className={chosen === s.card.id ? "chosen" : ""}
              aria-pressed={chosen === s.card.id}
              data-unit={s.card.id}
              onClick={() => setChosen(s.card.id)}
            >
              <span className="model-gallery-swatch" style={{ background: s.color }} />
              <strong>{s.card.name}</strong>
              <span className="muted">
                {s.card.faction}. {describe(s)}
              </span>
              <span className="muted">
                {s.fit.triangles} triangles a figure. The body reaches {s.fit.reach.toFixed(2)} of a hex past its base, with {percent(s.fit.outside)} of it off the base.
              </span>
              <span className={s.fit.fits ? "model-gallery-fit" : "model-gallery-fit over"}>{s.fit.fits ? "Fits its base" : "Needs a larger base"}</span>
            </button>
          </li>
        ))}
        <li className="muted model-gallery-note">
          A body may reach up to {OVERHANG_LIMITS.reach.toFixed(2)} of a hex past its base, with up to {percent(OVERHANG_LIMITS.outside)} of it off the base. Weapons do not count.
        </li>
      </ul>
    </main>
  );
}
