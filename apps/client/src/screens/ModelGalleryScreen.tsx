import { CARDS, SEAT_COLORS, SEAT_COLOR_NAMES } from "@aoh/content";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { isSquad } from "@aoh/rules";
import { useMemo, useState } from "react";
import { COLOR_SCHEMES, OVERHANG_LIMITS, UNIT_MODELS, figureColors, type ColorScheme } from "../models";
import { Camera, StandingUnit, Tiles, WIDE, closeView, lineUp, type Colors, type Standing, type View } from "../scene/standing";
import { TestHook } from "../scene/TestHook";
import { factionTheme } from "../ui/factionThemes";
import "./model-gallery.css";

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
    if (one) return closeView(one);
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
