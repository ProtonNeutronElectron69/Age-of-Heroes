import type { ReactNode } from "react";
import type { FactionTheme } from "../factionThemes";
import type { Figure, Part, Placed, Role } from "./types";

/**
 * Paints unit drawings in the game's art style, ink and colour: dark outlines,
 * flat natural colours and hatched shadows, like a printed comic or woodblock.
 * Also paints the red and grey hit zone picture from the same drawings.
 */

type Palette = Record<Role, string>;

const INK = "#17100f";

const url = (id: string) => `url(#${id})`;

/** Natural colours for each kind of shape. Armour and cloaks take the faction's colours. */
function palette(t: FactionTheme): Palette {
  return {
    hair: "#1d1618",
    skin: "#eac7a2",
    bone: "#ebe4cf",
    helmet: t.primaryDark,
    crest: t.accent,
    jewel: t.accentLight,
    glow: t.accentLight,
    armor: t.primary,
    plate: t.primaryLight,
    metal: "#9fabb3",
    cloth: "#2b2630",
    cape: t.primaryDark,
    sash: t.accent,
    wood: "#9a6a3a",
    leather: "#6b4a2e",
    blade: "#e6ecef",
    hilt: "#3a2c2a",
    boot: "#191416",
  };
}

function Shapes({ parts, paint }: { parts: readonly Part[]; paint: (part: Part, index: number) => ReactNode }): ReactNode {
  return <>{parts.map((part, i) => paint(part, i))}</>;
}

/** Each figure of a cast in its place, painted by `paint`. */
function Cast({ cast, paint }: { cast: readonly Placed[]; paint: (figure: Figure, index: number) => ReactNode }): ReactNode {
  return (
    <>
      {cast.map(({ figure, dx, dy, scale }, i) => (
        <g key={i} transform={`translate(${dx},${dy}) scale(${scale})`}>
          {paint(figure, i)}
        </g>
      ))}
    </>
  );
}

interface Props {
  /** The unit's figures, back to front, each with its place in the drawing's box. */
  cast: readonly Placed[];
  theme: FactionTheme;
  /** Makes ids unique to the card. */
  id: (name: string) => string;
}

/**
 * A unit drawing with its backdrop. It is drawn in the drawing's own 200 by
 * 250 box; the card places and scales it.
 */
export function UnitArt({ cast, theme: t, id }: Props): ReactNode {
  const base = palette(t);
  return (
    <g>
      <defs>
        <pattern id={id("hatch")} width={3.2} height={3.2} patternUnits="userSpaceOnUse" patternTransform="rotate(-42)">
          <path d="M0,1 H3.2" stroke={INK} strokeWidth={0.8} />
        </pattern>
        {cast.map(({ figure }, n) => (
          <clipPath key={n} id={id(`body-${n}`)}>
            {figure.parts.map((part, i) => (
              <path key={i} d={part.d} />
            ))}
          </clipPath>
        ))}
      </defs>
      {/* Bands of mist, outlined like the figures. */}
      <g fill={t.paper} fillOpacity={0.9} stroke={INK} strokeWidth={1.3} strokeLinejoin="round">
        <path d="M-60,70 q14,-16 34,-8 q10,-14 28,-6 q16,-8 26,6 h60 a7,7 0 0 1 0,14 h-170 a8,8 0 0 1 22,-6 Z" transform="translate(-20,-30)" />
        <path d="M120,150 q12,-14 30,-6 q12,-12 28,-2 q14,-6 22,8 h70 a7,7 0 0 1 0,14 h-190 a8,8 0 0 1 40,-14 Z" transform="translate(20,-20)" />
        <path d="M-150,200 q14,-14 32,-6 q14,-12 30,0 h90 a7,7 0 0 1 0,14 h-200 a8,8 0 0 1 48,-8 Z" />
      </g>
      <path d="M-700,244 H900" stroke={INK} strokeWidth={1.6} />
      <path d="M-700,244 H900 V900 H-700 Z" fill={t.primaryDark} fillOpacity={0.55} />
      <Cast
        cast={cast}
        paint={(figure, n) => {
          const colour = { ...base, ...figure.tint };
          return (
            <>
              <ellipse cx={102} cy={245} rx={62} ry={5} fill={INK} fillOpacity={0.55} />
              <Shapes
                parts={figure.parts}
                paint={(part, i) => (
                  <g key={i}>
                    <path d={part.d} fill={colour[part.role]} stroke={INK} strokeWidth={1.7} strokeLinejoin="round" />
                    {part.lines && <path d={part.lines} fill="none" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />}
                  </g>
                )}
              />
              {/* Hatched shadow down the side away from the light. */}
              <g clipPath={url(id(`body-${n}`))}>
                <path d="M112,0 L200,0 V250 H96 L108,150 Z" fill={url(id("hatch"))} opacity={0.55} />
                <path d="M40,120 L78,116 L70,250 H40 Z" fill={url(id("hatch"))} opacity={0.3} />
              </g>
            </>
          );
        }}
      />
    </g>
  );
}

// ---- Hit zone ---------------------------------------------------------------

const GREY: Palette = {
  hair: "#5d6167",
  skin: "#b9bdc2",
  bone: "#c4c8cc",
  helmet: "#7b8087",
  crest: "#a5a9ae",
  jewel: "#c9cdd1",
  glow: "#d5d8db",
  armor: "#8d9299",
  plate: "#a0a5ab",
  metal: "#989da3",
  cloth: "#6b7076",
  cape: "#62666c",
  sash: "#b0b4b9",
  wood: "#b4b8bd",
  leather: "#7d8288",
  blade: "#cfd3d7",
  hilt: "#73787e",
  boot: "#565a60",
};

const RED: Palette = {
  hair: "#8f1420",
  skin: "#f0646a",
  bone: "#f47a7f",
  helmet: "#b81a27",
  crest: "#d93440",
  jewel: "#f0646a",
  glow: "#f8999c",
  armor: "#cf2532",
  plate: "#e23c47",
  metal: "#d6303c",
  cloth: "#a31622",
  cape: "#8f1420",
  sash: "#ee5860",
  wood: "#e23c47",
  leather: "#b01a26",
  blade: "#f0646a",
  hilt: "#a31622",
  boot: "#8f1420",
};

/**
 * The hit zone picture: each figure in greys, with the part an attacker must be
 * able to see in red. `bandFrom` is where the hit band starts, as a share of
 * the figure's height from the ground; gear such as weapons is never red.
 */
export function HitZoneArt({ cast, bandFrom, id }: { cast: readonly Placed[]; bandFrom: number; id: (name: string) => string }): ReactNode {
  const outline = { stroke: "#24262a", strokeWidth: 1.6, strokeLinejoin: "round" as const };
  return (
    <Cast
      cast={cast}
      paint={(figure, n) => {
        const bandBottom = figure.bottom - (figure.bottom - figure.top) * bandFrom;
        return (
          <>
            <clipPath id={id(`band-${n}`)}>
              <rect x={-50} y={-50} width={300} height={bandBottom + 50} />
            </clipPath>
            <Shapes
              parts={figure.parts}
              paint={(part, i) => (
                <g key={i}>
                  <path d={part.d} fill={GREY[part.role]} {...outline} />
                  {part.lines && <path d={part.lines} fill="none" stroke="#24262a" strokeOpacity={0.55} strokeWidth={1} strokeLinecap="round" />}
                </g>
              )}
            />
            <g clipPath={url(id(`band-${n}`))}>
              <Shapes
                parts={figure.parts}
                paint={(part, i) =>
                  figure.gear.includes(part.role) ? (
                    // Gear in front of the body keeps its grey.
                    <path key={i} d={part.d} fill={GREY[part.role]} {...outline} />
                  ) : (
                    <g key={i}>
                      <path d={part.d} fill={RED[part.role]} stroke="#4a070d" strokeWidth={1.6} strokeLinejoin="round" />
                      {part.lines && <path d={part.lines} fill="none" stroke="#4a070d" strokeOpacity={0.6} strokeWidth={1} strokeLinecap="round" />}
                    </g>
                  )
                }
              />
            </g>
          </>
        );
      }}
    />
  );
}
