import { HIT_BAND_FROM, type UnitCard } from "@aoh/rules";
import { type CSSProperties, type ReactNode, type RefObject, useId, useLayoutEffect, useRef } from "react";
import { factionTheme, type FactionTheme } from "./factionThemes";
import { castBounds, DRAWINGS } from "./art/figures";
import { type ArtStyle, HitZoneArt, UnitArt } from "./art/UnitArt";
import { Emblem, StatIcon, type StatIconId } from "./hexCardArt";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource/cinzel/latin-800.css";
import "@fontsource/alegreya-sans/latin-400.css";
import "@fontsource/alegreya-sans/latin-500.css";
import "@fontsource/alegreya-sans/latin-700.css";
import "./hex-card.css";

/** Which face of the card: the front is the Basic game, the back the Advanced game. */
export type CardSide = "basic" | "advanced";

interface Props {
  card: UnitCard;
  side: CardSide;
  /** The owning player's colour, for the token disc. Without it the disc is in the faction's colours. */
  ownerColor?: string;
  /** Wounds on the figure being shown; the Life gem then counts what is left. */
  wounds?: number;
  /** The art style to paint the unit's drawing in, while the style is being chosen. */
  artStyle?: ArtStyle;
}

const TYPE_NAMES: Record<UnitCard["unitType"], string> = {
  uniqueHero: "Unique Hero",
  commonHero: "Common Hero",
  uniqueSquad: "Unique Squad",
  commonSquad: "Common Squad",
};

const SIZE_NAMES: Record<UnitCard["size"], string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  huge: "Huge",
};

// ---- Geometry ---------------------------------------------------------------
// The card is seven pointy-top hexes, like the board: one in the middle and six
// around it. One unit is one pixel when the card is 520 wide. Everything below
// is laid out in these units, so the card scales as a whole.

type Pt = readonly [number, number];

const W = 520;
const H = 500;
/** Room around the outline for the frame's rounded edge and its shadow. */
const PAD = 6;
/** Half the width of one hex. */
const A = 86.6025;
const X0 = 260 - 3 * A;
const X1 = 260 - 2 * A;
const X2 = 260 - A;
const X3 = 260;
const X4 = 260 + A;
const X5 = 260 + 2 * A;
const X6 = 260 + 3 * A;

/** The card's outline, clockwise from the top of the upper-left hex. */
const OUTLINE: readonly Pt[] = [
  [X2, 0],
  [X3, 50],
  [X4, 0],
  [X5, 50],
  [X5, 150],
  [X6, 200],
  [X6, 300],
  [X5, 350],
  [X5, 450],
  [X4, 500],
  [X3, 450],
  [X2, 500],
  [X1, 450],
  [X1, 350],
  [X0, 300],
  [X0, 200],
  [X1, 150],
  [X1, 50],
];

/** Move every edge of a clockwise polygon inward by `d`. */
function inset(points: readonly Pt[], d: number): Pt[] {
  const n = points.length;
  const normal = (a: Pt, b: Pt): Pt => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    return [-dy / len, dx / len];
  };
  return points.map((p, i) => {
    const prev = points[(i + n - 1) % n]!;
    const next = points[(i + 1) % n]!;
    const n1 = normal(prev, p);
    const n2 = normal(p, next);
    const k = d / (1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k] as const;
  });
}

const f = (v: number) => Math.round(v * 100) / 100;

/** A closed path through the points, with each corner rounded by `r`. */
function roundedPath(points: readonly Pt[], r: number): string {
  const n = points.length;
  const toward = (from: Pt, to: Pt): Pt => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy);
    const t = Math.min(r, len / 2) / len;
    return [from[0] + dx * t, from[1] + dy * t];
  };
  let d = "";
  points.forEach((p, i) => {
    const a = toward(p, points[(i + n - 1) % n]!);
    const b = toward(p, points[(i + 1) % n]!);
    d += `${i === 0 ? "M" : "L"}${f(a[0])},${f(a[1])} Q${f(p[0])},${f(p[1])} ${f(b[0])},${f(b[1])} `;
  });
  return `${d}Z`;
}

const poly = (points: readonly Pt[]) => points.map((p) => `${f(p[0])},${f(p[1])}`).join(" ");

/** A pointy-top hexagon. */
function hexPoints(cx: number, cy: number, r: number): Pt[] {
  const a = (r * Math.sqrt(3)) / 2;
  return [
    [cx, cy - r],
    [cx + a, cy - r / 2],
    [cx + a, cy + r / 2],
    [cx, cy + r],
    [cx - a, cy + r / 2],
    [cx - a, cy - r / 2],
  ];
}

/** Width of the coloured frame. */
const FRAME = 11;
const OUTER_PATH = roundedPath(OUTLINE, 5);
const BEVEL_PATH = roundedPath(inset(OUTLINE, 1.6), 4);
const PINLINE_PATH = roundedPath(inset(OUTLINE, 7), 3);
const INNER_PATH = roundedPath(inset(OUTLINE, FRAME), 2.5);

/** The line down the middle of the Advanced side: rules to the left, art and stats to the right. */
const SPINE_X = X3;
/** Where the name banner ends. */
const BANNER_BOTTOM = 138;
/** The left edge of the rules panel beside the trait tabs. */
const PAPER_LEFT = 122;
/** The rules panel: under the banner, around the trait tabs, down into the lower-left hex. */
const PAPER: readonly Pt[] = [
  [PAPER_LEFT, BANNER_BOTTOM],
  [SPINE_X, BANNER_BOTTOM],
  [SPINE_X, 510],
  [80, 510],
  [80, 335 + (PAPER_LEFT - 80) * 0.5774],
  [PAPER_LEFT, 335],
];
/** The caption panel on the Basic side. */
const CAPTION_TOP = 408;

const HIT_ZONE = { cx: 455, cy: 242, r: 61 };
const TABS = { right: PAPER_LEFT - 7, first: 197, step: 26 };
const ROWS = { x0: 283, x1: 409, top: 298, h: 30, gap: 4 };
const PLATE_ADVANCED: readonly Pt[] = [
  [276, 290],
  [416, 290],
  [416, 440],
  [346, 481],
  [276, 440],
];
const PLATE_BASIC: readonly Pt[] = [
  [276, 290],
  [416, 290],
  [416, 422],
  [346, 462],
  [276, 422],
];
const LIFE_GEM = { cx: 346, cy: 271, r: 20 };
/** The faction seal sits at the top of the upper-left hex, the unit's token at the top of the upper-right. */
const SEAL = { cx: 176, cy: 38, r: 18 };
const TOKEN = { cx: X4, cy: 38, r: 16 };

const STAT_ROWS: readonly { id: StatIconId; label: string }[] = [
  { id: "move", label: "Move" },
  { id: "range", label: "Range" },
  { id: "attack", label: "Attack" },
  { id: "defense", label: "Defense" },
];

// ---- Text fitting ------------------------------------------------------------

/**
 * Pick the largest font size (in card units) at which `fits` holds, and store it
 * in `--fs` on the box. Card text scales with the card, so one size fits every
 * display size; it is measured again when the box resizes or the fonts arrive.
 */
function useFitText(
  box: RefObject<HTMLElement | null>,
  fits: (el: HTMLElement) => boolean,
  max: number,
  min: number,
  key: string,
) {
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      if (el.clientHeight === 0) return;
      let lo = min;
      let hi = max;
      el.style.setProperty("--fs", String(hi));
      if (!fits(el)) {
        while (hi - lo > 0.2) {
          const mid = (lo + hi) / 2;
          el.style.setProperty("--fs", String(mid));
          if (fits(el)) lo = mid;
          else hi = mid;
        }
        el.style.setProperty("--fs", String(lo));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    let live = true;
    document.fonts?.ready.then(() => live && fit());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [box, max, min, key]);
}

const nameFits = (el: HTMLElement) => {
  const inner = el.firstElementChild as HTMLElement | null;
  return !inner || (inner.offsetHeight <= el.clientHeight && inner.scrollWidth <= el.clientWidth);
};
const rulesFit = (el: HTMLElement) => el.scrollHeight <= el.clientHeight + 1;

// ---- The card ---------------------------------------------------------------

/**
 * A unit card in the shape of seven hexes, painted in its faction's colours.
 * The front shows the Basic game; the back adds the traits, abilities, Life and
 * points of the Advanced game. The art and hit zone windows are placeholders.
 * Only the card's own shape takes clicks, so the corners of its box let the
 * board underneath be used.
 */
export function HexCard({ card, side, ownerColor, wounds = 0, artStyle }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string) => `hc${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const t = factionTheme(card.faction);
  const advanced = side === "advanced";
  const lifeLeft = Math.max(0, card.advanced.life - wounds);
  // Units without a drawing yet show the faction emblem and dashed outlines instead.
  const figure = artStyle ? DRAWINGS[card.id] : undefined;
  const hitBox = figure && castBounds(figure.tall);
  const hitScale = hitBox ? Math.min(98 / hitBox.height, 96 / hitBox.width) : 1;
  const stats = advanced ? card.advanced : card.basic;
  const squad = card.figureCount > 1;

  const [title, epithet] = splitName(card.name);
  const nameRef = useRef<HTMLDivElement>(null);
  const rulesRef = useRef<HTMLDivElement>(null);
  useFitText(nameRef, nameFits, 17, 8, card.name);
  useFitText(rulesRef, rulesFit, 14, 7, `${card.id}:${side}`);

  const vars = {
    "--hc-on-primary": t.onPrimary,
    "--hc-ink": t.ink,
    "--hc-heading": t.heading,
    "--hc-accent": t.accent,
  } as CSSProperties;

  const tabs = [
    card.species,
    `${TYPE_NAMES[card.unitType]}${squad ? ` ×${card.figureCount}` : ""}`,
    card.unitClass,
    card.personality,
  ];
  const sizeTabY = TABS.first + TABS.step * tabs.length;
  const plate = advanced ? PLATE_ADVANCED : PLATE_BASIC;
  const artCentre: Pt = advanced ? [346, 138] : [196, 286];

  return (
    <div className={`hex-card hc-${side}`} style={vars} data-card={card.id} data-side={side}>
      <svg viewBox={`${-PAD} ${-PAD} ${W + PAD * 2} ${H + PAD * 2}`} role="img" aria-label={`${card.name}, ${side} side`}>
        <defs>
          <clipPath id={id("inner")}>
            <path d={INNER_PATH} />
          </clipPath>
          <clipPath id={id("window")}>
            <rect x={advanced ? SPINE_X : -PAD} y={-PAD} width={W} height={H + PAD * 2} />
          </clipPath>
          <clipPath id={id("hit")}>
            <polygon points={poly(hexPoints(HIT_ZONE.cx, HIT_ZONE.cy, HIT_ZONE.r - 1))} />
          </clipPath>
          <linearGradient id={id("frame")} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={t.primaryLight} />
            <stop offset="0.45" stopColor={t.primary} />
            <stop offset="1" stopColor={t.primaryDark} />
          </linearGradient>
          <linearGradient id={id("base")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.primary} />
            <stop offset="1" stopColor={t.primaryDark} />
          </linearGradient>
          <linearGradient id={id("art")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.art[0]} />
            <stop offset="1" stopColor={t.art[1]} />
          </linearGradient>
          <linearGradient id={id("paper")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={t.paper} />
            <stop offset="1" stopColor={t.paperShade} />
          </linearGradient>
          <linearGradient id={id("life")} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d23a45" />
            <stop offset="1" stopColor="#7a0f1c" />
          </linearGradient>
          <pattern id={id("hexes")} width={27.71} height={48} patternUnits="userSpaceOnUse">
            <path
              d="M13.86,0 L27.71,8 V24 L13.86,32 L0,24 V8 Z M13.86,32 V48 M0,24 V8 M27.71,24 V8"
              fill="none"
              stroke="#fff"
              strokeOpacity={0.09}
              strokeWidth={1}
            />
          </pattern>
        </defs>

        <g className="hc-shadow">
          {/* The frame, then everything inside it. */}
          <g>
            <path d={OUTER_PATH} fill={url("frame")} />
            <path d={OUTER_PATH} fill="none" stroke={t.primaryDark} strokeWidth={1.2} />
            <path d={BEVEL_PATH} fill="none" stroke={t.primaryLight} strokeOpacity={0.85} strokeWidth={1.4} />

            <g clipPath={url("inner")}>
              <rect x={-PAD} y={-PAD} width={W + PAD * 2} height={H + PAD * 2} fill={url("base")} />

              {/* The art window. Unit art will fill it; for now it shows the faction's backdrop,
                  and a faint emblem that goes when the art arrives. */}
              <g className="hc-art">
                <rect x={advanced ? SPINE_X : -PAD} y={-PAD} width={W} height={H + PAD * 2} fill={url("art")} />
                <rect x={advanced ? SPINE_X : -PAD} y={-PAD} width={W} height={H + PAD * 2} fill={url("hexes")} />
                {figure && artStyle ? (
                  <g clipPath={url("window")}>
                    <g transform={advanced ? "translate(232,46) scale(0.84)" : "translate(88,130) scale(1.12)"}>
                      <UnitArt cast={advanced ? figure.tall : figure.wide} style={artStyle} theme={t} id={id} />
                    </g>
                  </g>
                ) : (
                  <g transform={`translate(${artCentre[0]},${artCentre[1]}) scale(${advanced ? 4.2 : 5.6})`} opacity={0.13}>
                    <Emblem id={t.emblem} ink="#fff" ground={t.art[1]} />
                  </g>
                )}
              </g>

              {!advanced && (
                <>
                  {/* The banner is the upper-left hex. */}
                  <polygon points={poly([[0, -PAD], [SPINE_X, -PAD], [SPINE_X, BANNER_BOTTOM], [0, BANNER_BOTTOM]])} fill={url("base")} />
                  <path d={`M0,${BANNER_BOTTOM} H${SPINE_X} V0`} fill="none" stroke={t.accent} strokeWidth={1.4} />
                  <rect x={0} y={CAPTION_TOP} width={SPINE_X} height={H} fill={url("paper")} />
                  <path d={`M0,${CAPTION_TOP} H${SPINE_X} V${H}`} fill="none" stroke={t.accent} strokeWidth={1.4} />
                </>
              )}

              {advanced && (
                <>
                  <polygon points={poly(PAPER)} fill={url("paper")} />
                  <polyline points={poly([PAPER[4]!, PAPER[5]!, PAPER[0]!, PAPER[1]!])} fill="none" stroke={t.accent} strokeWidth={1.4} />
                  <path d={`M${SPINE_X},40 V470`} stroke={t.primaryDark} strokeOpacity={0.55} strokeWidth={3.4} />
                  <path d={`M${SPINE_X},40 V470`} stroke={t.accent} strokeWidth={1.4} />

                  {/* The size and height tab stands out from the other traits. */}
                  <rect x={0} y={sizeTabY - 15} width={PAPER_LEFT} height={26} fill={t.deep} />
                  {tabs.map((_, i) => (
                    <path
                      key={i}
                      d={`M0,${TABS.first + TABS.step * i - 15} H${PAPER_LEFT}`}
                      stroke={t.accent}
                      strokeOpacity={0.55}
                      strokeWidth={0.8}
                    />
                  ))}

                  {/* The hit zone window. */}
                  <polygon points={poly(hexPoints(HIT_ZONE.cx, HIT_ZONE.cy, HIT_ZONE.r))} fill={figure ? "#0c0c0e" : t.deep} stroke={t.accent} strokeWidth={1.6} strokeLinejoin="round" />
                  {figure && hitBox && (
                    <g clipPath={url("hit")}>
                      <g transform={`translate(${HIT_ZONE.cx - (hitBox.x + hitBox.width / 2) * hitScale},${HIT_ZONE.cy - (hitBox.y + hitBox.height / 2) * hitScale}) scale(${hitScale})`}>
                        <HitZoneArt cast={figure.tall} bandFrom={HIT_BAND_FROM} id={id} />
                      </g>
                    </g>
                  )}
                </>
              )}

              {/* The stat plate. */}
              <polygon points={poly(plate)} fill={url("paper")} stroke={t.deep} strokeWidth={3.2} strokeLinejoin="round" />
              <polygon points={poly(plate)} fill="none" stroke={t.accent} strokeWidth={1.3} strokeLinejoin="round" />
              {STAT_ROWS.map((row, i) => {
                const y = ROWS.top + i * (ROWS.h + ROWS.gap);
                const { x0, x1, h } = ROWS;
                const bar: Pt[] = [
                  [x0 + 9, y],
                  [x1 - 9, y],
                  [x1, y + h / 2],
                  [x1 - 9, y + h],
                  [x0 + 9, y + h],
                  [x0, y + h / 2],
                ];
                return <polygon key={row.id} points={poly(bar)} fill={t.deep} />;
              })}
              {advanced && (
                <polygon
                  points={poly(hexPoints(LIFE_GEM.cx, LIFE_GEM.cy, LIFE_GEM.r))}
                  fill={url("life")}
                  stroke={t.accentLight}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                />
              )}
            </g>

            <path d={INNER_PATH} fill="none" stroke={t.deep} strokeOpacity={0.6} strokeWidth={1.4} />
            <path d={PINLINE_PATH} fill="none" stroke={t.accent} strokeWidth={1.5} />
          </g>

        </g>

        {/* Marks and lettering. */}
        <g transform={`translate(${SEAL.cx},${SEAL.cy})`}>
          <circle r={SEAL.r} fill={t.deep} stroke={t.accent} strokeWidth={1.6} />
          <Emblem id={t.emblem} ink={t.accent} ground={t.deep} />
        </g>
        {/* The label on the unit's board tokens, in the owner's colour once it has one. */}
        <g transform={`translate(${TOKEN.cx},${TOKEN.cy})`}>
          <circle r={TOKEN.r} fill={ownerColor ?? t.deep} stroke={ownerColor ? "#fff" : t.accent} strokeOpacity={ownerColor ? 0.85 : 1} strokeWidth={1.8} />
          <text className="hc-text" y={4.3} fontSize={card.tokenLabel.length > 2 ? 10.5 : 12.5} fontWeight={700} textAnchor="middle" fill="#fff" stroke="#000" strokeOpacity={0.45} strokeWidth={2} paintOrder="stroke">
            {card.tokenLabel}
          </text>
        </g>
        <text className="hc-display" x={176} y={131} fontSize={8} fontWeight={700} letterSpacing={1.1} textAnchor="middle" fill={bannerTrim(t)}>
          {card.faction.toUpperCase()}
        </text>

        {!figure && <ArtNote x={artCentre[0]} y={artCentre[1] + (advanced ? 84 : 112)} text="Unit art" />}

        {advanced ? (
          <>
            {tabs.map((label, i) => (
              <text
                key={i}
                className="hc-text"
                x={TABS.right}
                y={TABS.first + TABS.step * i + 2.4}
                fontSize={10}
                fontWeight={700}
                letterSpacing={0.5}
                textAnchor="end"
                fill={t.onPrimary}
              >
                {label.toUpperCase()}
              </text>
            ))}
            <text className="hc-text" x={TABS.right} y={sizeTabY + 2.6} fontSize={11.5} fontWeight={700} letterSpacing={0.5} textAnchor="end" fill={t.accentLight}>
              {`${SIZE_NAMES[card.size].toUpperCase()} ${card.height}`}
            </text>

            {!figure && <HitZoneNote theme={t} squad={squad} />}

            <text className="hc-display" x={LIFE_GEM.cx} y={LIFE_GEM.cy + 4.5} fontSize={19} fontWeight={800} textAnchor="middle" fill="#fff">
              {lifeLeft}
            </text>
            <text className="hc-display" x={LIFE_GEM.cx} y={LIFE_GEM.cy + 13.5} fontSize={5.4} fontWeight={700} letterSpacing={0.9} textAnchor="middle" fill="#fff" fillOpacity={0.92}>
              {wounds > 0 ? `OF ${card.advanced.life}` : "LIFE"}
            </text>

            <text className="hc-display" x={346} y={457.5} fontSize={17.5} fontWeight={800} textAnchor="middle" fill={t.ink}>
              {card.advanced.points}
            </text>
            <text className="hc-display" x={346} y={467.5} fontSize={6.6} fontWeight={700} letterSpacing={1.2} textAnchor="middle" fill={t.heading}>
              POINTS
            </text>
          </>
        ) : (
          <>
            <text className="hc-display" x={X2 + 3} y={427} fontSize={10} fontWeight={700} letterSpacing={0.9} textAnchor="middle" fill={t.heading}>
              {TYPE_NAMES[card.unitType].toUpperCase()}
            </text>
            <text className="hc-text" x={X2 + 3} y={441} fontSize={10.5} fontWeight={500} textAnchor="middle" fill={t.ink}>
              {`${card.species} ${card.unitClass}${squad ? `, ${card.figureCount} figures` : ""}`}
            </text>
            <text className="hc-text" x={X2 + 3} y={454} fontSize={8} fontWeight={700} letterSpacing={1} textAnchor="middle" fill={t.ink} fillOpacity={0.6}>
              BASIC GAME
            </text>
            <path d="M346,438 l6,7 l-6,7 l-6,-7 Z" fill={t.accent} stroke={t.deep} strokeWidth={0.8} />
          </>
        )}

        {STAT_ROWS.map((row, i) => {
          const y = ROWS.top + i * (ROWS.h + ROWS.gap) + ROWS.h / 2;
          return (
            <g key={row.id}>
              <g transform={`translate(${ROWS.x0 + 21},${y}) scale(0.92)`}>
                <StatIcon id={row.id} ink={t.accent} />
              </g>
              <text className="hc-display" x={ROWS.x0 + 35} y={y + 3.7} fontSize={10.5} fontWeight={700} letterSpacing={0.9} fill={t.paper}>
                {row.label.toUpperCase()}
              </text>
              <text className="hc-display" x={ROWS.x1 - 22} y={y + 7.4} fontSize={21} fontWeight={800} textAnchor="middle" fill={t.accentLight}>
                {stats[row.id]}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="hc-overlay">
        <div className="hc-name" ref={nameRef}>
          <div className="hc-name-fit">
            <span className="hc-title">{title}</span>
            {epithet && <span className="hc-epithet">{epithet}</span>}
          </div>
        </div>
        {advanced && (
          <div className="hc-rules" ref={rulesRef}>
            <span className="hc-shape hc-shape-left" />
            <span className="hc-shape hc-shape-right" />
            {card.advanced.abilities.map((a) => (
              <p key={a.id}>
                <span className="hc-ability">{a.name}</span>
                {a.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** "Solenne, Herald of Dawn" is set as a name with its epithet beneath. */
function splitName(name: string): [string, string | null] {
  const at = name.indexOf(", ");
  return at < 0 ? [name, null] : [name.slice(0, at), name.slice(at + 2)];
}

/** The faction line under the name: the trim colour, darkened where the banner is pale. */
function bannerTrim(t: FactionTheme): string {
  return isLight(t.primary) ? t.heading : t.accentLight;
}

function isLight(hex: string): boolean {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

/** A label marking where art will go. */
function ArtNote({ x, y, text }: { x: number; y: number; text: string }): ReactNode {
  return (
    <text className="hc-text" x={x} y={y} fontSize={8} fontWeight={700} letterSpacing={1.6} textAnchor="middle" fill="#fff" fillOpacity={0.55}>
      {text.toUpperCase()}
    </text>
  );
}

/** A stand-in for the hit zone picture: figure outlines, one or a group. */
function HitZoneNote({ theme, squad }: { theme: FactionTheme; squad: boolean }): ReactNode {
  const figure = "M0,-22 a6,6 0 1 1 0.01,0 Z M-9,-8 Q0,-13 9,-8 L7,10 H4 L3,26 H-3 L-4,10 H-7 Z";
  const { cx, cy } = HIT_ZONE;
  return (
    <g>
      <g transform={`translate(${cx},${cy - 2})`} fill="none" stroke={theme.accent} strokeOpacity={0.6} strokeWidth={1.1} strokeDasharray="3 2.4">
        {squad ? (
          <>
            <path d={figure} transform="translate(-17,2) scale(0.9)" />
            <path d={figure} transform="translate(17,2) scale(0.9)" />
            <path d={figure} transform="translate(0,-4)" fill={theme.deep} />
          </>
        ) : (
          <path d={figure} transform="scale(1.15)" />
        )}
      </g>
      <text className="hc-text" x={cx} y={cy + 44} fontSize={6.6} fontWeight={700} letterSpacing={1.3} textAnchor="middle" fill={theme.accent} fillOpacity={0.75}>
        HIT ZONE
      </text>
    </g>
  );
}
