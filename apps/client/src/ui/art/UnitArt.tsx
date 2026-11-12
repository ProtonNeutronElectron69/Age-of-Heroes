import type { ReactNode } from "react";
import type { FactionTheme } from "../factionThemes";
import type { Figure, Part, Placed, Role } from "./figures";

/** The ways a unit drawing can be painted. */
export type ArtStyle = "paper" | "ink" | "glass" | "brush";

export const ART_STYLES: readonly { id: ArtStyle; name: string; note: string }[] = [
  { id: "paper", name: "Cut paper", note: "Flat layers in the faction's colours, each casting a small shadow." },
  { id: "ink", name: "Ink and colour", note: "Dark outlines, flat natural colours and hatched shadows, like a printed comic or woodblock." },
  { id: "glass", name: "Stained glass", note: "Heavy leading around glowing panes, with a window of rays behind." },
  { id: "brush", name: "Brush silhouette", note: "A rough inked silhouette on a pale wash, with one or two accents of colour." },
];

interface Props {
  /** The unit's figures, back to front, each with its place in the drawing's box. */
  cast: readonly Placed[];
  style: ArtStyle;
  theme: FactionTheme;
  /** Makes ids unique to the card. */
  id: (name: string) => string;
}

type Palette = Record<Role, string>;

const url = (id: string) => `url(#${id})`;

/** Natural colours, used by the inked and glass styles. Armour takes the faction's colour. */
function naturalPalette(t: FactionTheme): Palette {
  return {
    hair: "#1d1618",
    skin: "#eac7a2",
    helmet: t.primaryDark,
    crest: t.accent,
    jewel: t.accentLight,
    armor: t.primary,
    plate: t.primaryLight,
    cloth: "#2b2630",
    cape: t.primaryDark,
    sash: t.accent,
    wood: "#9a6a3a",
    blade: "#e6ecef",
    hilt: "#3a2c2a",
    boot: "#191416",
  };
}

/** Only the faction's own tones, for the cut paper style. */
function paperPalette(t: FactionTheme): Palette {
  return {
    hair: t.deep,
    skin: t.paper,
    helmet: t.primaryDark,
    crest: t.accent,
    jewel: t.accentLight,
    armor: t.primary,
    plate: t.primaryLight,
    cloth: t.deep,
    cape: t.primaryDark,
    sash: t.accent,
    wood: t.accent,
    blade: t.paper,
    hilt: t.primaryDark,
    boot: t.deep,
  };
}

const INK = "#17100f";

/**
 * A unit drawing in one art style, with its backdrop. It is drawn in the
 * drawing's own 200 by 250 box; the card places and scales it.
 */
export function UnitArt({ cast, style, theme, id }: Props): ReactNode {
  switch (style) {
    case "paper":
      return <PaperArt cast={cast} theme={theme} id={id} />;
    case "ink":
      return <InkArt cast={cast} theme={theme} id={id} />;
    case "glass":
      return <GlassArt cast={cast} theme={theme} id={id} />;
    case "brush":
      return <BrushArt cast={cast} theme={theme} id={id} />;
  }
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

type StyleProps = Omit<Props, "style">;

/** A rectangle large enough to cover the art window wherever the figure is placed. */
const WIDE = { x: -700, y: -700, width: 1600, height: 1600 };

function Shapes({ parts, paint }: { parts: readonly Part[]; paint: (part: Part, index: number) => ReactNode }): ReactNode {
  return <>{parts.map((part, i) => paint(part, i))}</>;
}

// ---- Cut paper ----------------------------------------------------------------

function PaperArt({ cast, theme: t, id }: StyleProps): ReactNode {
  const palette = paperPalette(t);
  return (
    <g>
      <defs>
        <filter id={id("paper-shadow")} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx={1.2} dy={1.8} stdDeviation={1.1} floodColor="#000" floodOpacity={0.42} />
        </filter>
      </defs>
      <g filter={url(id("paper-shadow"))}>
        <circle cx={104} cy={86} r={92} fill={t.accentLight} opacity={0.9} />
      </g>
      <g filter={url(id("paper-shadow"))}>
        <path d="M-700,196 L-80,176 L10,150 L70,172 L150,140 L230,170 L330,150 L900,190 V900 H-700 Z" fill={t.primaryDark} />
      </g>
      <g filter={url(id("paper-shadow"))}>
        <path d="M-700,236 L-40,222 L60,238 L160,226 L260,240 L900,226 V900 H-700 Z" fill={t.deep} />
      </g>
      <Cast
        cast={cast}
        paint={(figure) => (
          <Shapes
            parts={figure.parts}
            paint={(part, i) => (
              <g key={i} filter={url(id("paper-shadow"))}>
                <path d={part.d} fill={palette[part.role]} />
                {part.lines && <path d={part.lines} fill="none" stroke="#000" strokeOpacity={0.28} strokeWidth={0.9} strokeLinecap="round" />}
              </g>
            )}
          />
        )}
      />
    </g>
  );
}

// ---- Ink and colour -----------------------------------------------------------

function InkArt({ cast, theme: t, id }: StyleProps): ReactNode {
  const palette = naturalPalette(t);
  return (
    <g>
      <defs>
        <pattern id={id("hatch")} width={3.2} height={3.2} patternUnits="userSpaceOnUse" patternTransform="rotate(-42)">
          <path d="M0,1 H3.2" stroke={INK} strokeWidth={0.8} />
        </pattern>
        {cast.map(({ figure }, n) => (
          <clipPath key={n} id={id(`ink-body-${n}`)}>
            {figure.parts.map((part, i) => (
              <path key={i} d={part.d} />
            ))}
          </clipPath>
        ))}
      </defs>
      {/* Bands of mist, outlined like the figure. */}
      <g fill={t.paper} fillOpacity={0.9} stroke={INK} strokeWidth={1.3} strokeLinejoin="round">
        <path d="M-60,70 q14,-16 34,-8 q10,-14 28,-6 q16,-8 26,6 h60 a7,7 0 0 1 0,14 h-170 a8,8 0 0 1 22,-6 Z" transform="translate(-20,-30)" />
        <path d="M120,150 q12,-14 30,-6 q12,-12 28,-2 q14,-6 22,8 h70 a7,7 0 0 1 0,14 h-190 a8,8 0 0 1 40,-14 Z" transform="translate(20,-20)" />
        <path d="M-150,200 q14,-14 32,-6 q14,-12 30,0 h90 a7,7 0 0 1 0,14 h-200 a8,8 0 0 1 48,-8 Z" />
      </g>
      <path d="M-700,244 H900" stroke={INK} strokeWidth={1.6} />
      <path d="M-700,244 H900 V900 H-700 Z" fill={t.primaryDark} fillOpacity={0.55} />
      <Cast
        cast={cast}
        paint={(figure, n) => (
          <>
            <ellipse cx={102} cy={245} rx={62} ry={5} fill={INK} fillOpacity={0.55} />
            <Shapes
              parts={figure.parts}
              paint={(part, i) => (
                <g key={i}>
                  <path d={part.d} fill={palette[part.role]} stroke={INK} strokeWidth={1.7} strokeLinejoin="round" />
                  {part.lines && <path d={part.lines} fill="none" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />}
                </g>
              )}
            />
            {/* Hatched shadow down the side away from the light. */}
            <g clipPath={url(id(`ink-body-${n}`))}>
              <path d="M112,20 L200,20 V250 H96 L108,150 Z" fill={url(id("hatch"))} opacity={0.55} />
              <path d="M40,120 L78,116 L70,250 H40 Z" fill={url(id("hatch"))} opacity={0.3} />
            </g>
          </>
        )}
      />
    </g>
  );
}

// ---- Stained glass ------------------------------------------------------------

const LEAD = "#120d0c";

function GlassArt({ cast, theme: t, id }: StyleProps): ReactNode {
  const palette = naturalPalette(t);
  const roles = [...new Set(cast.flatMap(({ figure }) => figure.parts.map((p) => p.role)))];
  const sun = { x: 100, y: 78 };
  const rays = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16 + 0.2);
  const far = 1200;
  const ray = (a: number) => `${sun.x + Math.cos(a) * far},${sun.y + Math.sin(a) * far}`;
  return (
    <g>
      <defs>
        {roles.map((role) => (
          <linearGradient key={role} id={id(`glass-${role}`)} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity={0.55} />
            <stop offset="0.45" stopColor="#fff" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.3} />
          </linearGradient>
        ))}
        <radialGradient id={id("glass-glow")} gradientUnits="userSpaceOnUse" cx={sun.x} cy={sun.y} r={330}>
          <stop offset="0" stopColor="#fff" stopOpacity={0.5} />
          <stop offset="0.5" stopColor="#fff" stopOpacity={0.08} />
          <stop offset="1" stopColor="#000" stopOpacity={0.35} />
        </radialGradient>
      </defs>
      {/* The window behind: panes fanning out from a sun. */}
      {rays.map((a, i) => (
        <polygon
          key={i}
          points={`${sun.x},${sun.y} ${ray(a)} ${ray(rays[(i + 1) % rays.length] ?? a + 0.4)}`}
          fill={i % 2 ? t.art[0] : t.primary}
          stroke={LEAD}
          strokeWidth={2.4}
          strokeLinejoin="round"
        />
      ))}
      <circle cx={sun.x} cy={sun.y} r={150} fill="none" stroke={LEAD} strokeWidth={2.4} />
      <circle cx={sun.x} cy={sun.y} r={64} fill={t.accentLight} stroke={LEAD} strokeWidth={2.6} />
      <rect {...WIDE} fill={url(id("glass-glow"))} />
      <path d="M-700,244 H900 V900 H-700 Z" fill={t.deep} stroke={LEAD} strokeWidth={2.6} />
      <Cast
        cast={cast}
        paint={(figure) => (
          <Shapes
            parts={figure.parts}
            paint={(part, i) => (
              <g key={i}>
                <path d={part.d} fill={palette[part.role]} />
                <path d={part.d} fill={url(id(`glass-${part.role}`))} stroke={LEAD} strokeWidth={2.6} strokeLinejoin="round" />
                {part.lines && <path d={part.lines} fill="none" stroke={LEAD} strokeWidth={1.5} strokeLinecap="round" />}
              </g>
            )}
          />
        )}
      />
    </g>
  );
}

// ---- Brush silhouette ----------------------------------------------------------

function BrushArt({ cast, theme: t, id }: StyleProps): ReactNode {
  const accents: Partial<Palette> = { sash: t.primary, jewel: t.primary, crest: t.accent, blade: "#ece6da" };
  return (
    <g>
      <defs>
        <filter id={id("brush")} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={3} seed={11} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={5.5} xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={id("wash")} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.02" numOctaves={4} seed={5} />
          <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.2  1.5 0 0 0 -0.62" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <filter id={id("dry")} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.5" numOctaves={2} seed={3} />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  5 0 0 0 -2.1" result="streaks" />
          <feComposite in="SourceGraphic" in2="streaks" operator="in" />
        </filter>
      </defs>
      <rect {...WIDE} fill="#efe6d4" />
      <rect {...WIDE} fill="#000" filter={url(id("wash"))} opacity={0.5} />
      <g filter={url(id("brush"))}>
        <circle cx={108} cy={82} r={78} fill={t.primary} opacity={0.92} />
        {/* The ground: one dry stroke. */}
        <path d="M-90,243 Q60,234 290,246 Q120,252 -90,251 Z" fill={INK} />
        <path d="M-150,246 H360 V252 H-150 Z" fill={INK} filter={url(id("dry"))} />
        <Cast
          cast={cast}
          paint={(figure) => (
            <Shapes
              parts={figure.parts}
              paint={(part, i) => {
                const accent = accents[part.role];
                return (
                  <g key={i}>
                    {/* A pale rim keeps overlapping figures apart. */}
                    <path d={part.d} fill={accent ?? INK} stroke={accent ? "none" : "#efe6d4"} strokeOpacity={0.55} strokeWidth={1} strokeLinejoin="round" />
                    {part.lines && !accent && <path d={part.lines} fill="none" stroke="#efe6d4" strokeOpacity={0.5} strokeWidth={0.8} strokeLinecap="round" />}
                  </g>
                );
              }}
            />
          )}
        />
      </g>
    </g>
  );
}

// ---- Hit zone ---------------------------------------------------------------

const GREY: Record<Role, string> = {
  hair: "#5d6167",
  skin: "#b9bdc2",
  helmet: "#7b8087",
  crest: "#a5a9ae",
  jewel: "#c9cdd1",
  armor: "#8d9299",
  plate: "#a0a5ab",
  cloth: "#6b7076",
  cape: "#62666c",
  sash: "#b0b4b9",
  wood: "#b4b8bd",
  blade: "#cfd3d7",
  hilt: "#73787e",
  boot: "#565a60",
};

const RED: Record<Role, string> = {
  hair: "#8f1420",
  skin: "#f0646a",
  helmet: "#b81a27",
  crest: "#d93440",
  jewel: "#f0646a",
  armor: "#cf2532",
  plate: "#e23c47",
  cloth: "#a31622",
  cape: "#8f1420",
  sash: "#ee5860",
  wood: "#e23c47",
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
