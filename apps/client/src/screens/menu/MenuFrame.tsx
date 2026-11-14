import "@fontsource/cinzel-decorative/latin-700.css";
import "@fontsource/im-fell-english/latin-400.css";
import "@fontsource/im-fell-english/latin-400-italic.css";
import "@fontsource/im-fell-english-sc/latin-400.css";
import "@fontsource/marcellus-sc/latin-400.css";
import { useEffect, useId, useState, type ReactNode } from "react";
import { MENU_STYLES, setDisplay, useDisplay, type MenuStyle } from "../../settings";
import { CompassRose, Icon, type IconName } from "./icons";
import { MenuBoard } from "./MenuBoard";
import "./menu.css";

/** One choice on the main menu. */
export interface MenuCommand {
  /** Also picks its place and colours in each style. */
  readonly id: "local" | "online" | "continue" | "saves" | "replay" | "editor" | "gallery";
  readonly label: string;
  /** A short second line; it describes the button to screen readers too. */
  readonly sub?: string;
  readonly icon: IconName;
  readonly onClick: () => void;
  /** The view it opens is showing. */
  readonly on?: boolean;
  readonly disabled?: boolean;
}

interface Props {
  readonly commands: readonly MenuCommand[];
  /** The open view's heading and a line under it. */
  readonly heading: string;
  readonly sub: string;
  /** The open view: game settings, the online room or the saved games. */
  readonly children: ReactNode;
  /** Things outside the layout, such as hidden file inputs. */
  readonly extras?: ReactNode;
}

/** The stage every style is laid out on, scaled to fit the window. */
const STAGE_W = 1280;
const STAGE_H = 720;

/** Below these the window is too narrow or too tall for the landscape stage, and the menu becomes one scrolling column. */
const MIN_STAGE_WIDTH = 760;
const MIN_ASPECT = 1.15;

/** Banner and hex colours for each choice, from the faction palettes. */
const COLOURS: Record<MenuCommand["id"], readonly [string, string]> = {
  local: ["#234573", "#142947"],
  online: ["#8f1f2b", "#5a1018"],
  continue: ["#2f5d34", "#1b3a1f"],
  saves: ["#7a5a1e", "#4a360f"],
  replay: ["#1f6470", "#123d45"],
  editor: ["#4a3a5e", "#2c2238"],
  gallery: ["#6b5a3a", "#3a2e18"],
};

function useFit(): { compact: boolean; scale: number } {
  const [fit, setFit] = useState(() => measure());
  useEffect(() => {
    const onResize = () => setFit(measure());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return fit;
}

function measure(): { compact: boolean; scale: number } {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const compact = w < MIN_STAGE_WIDTH || w / h < MIN_ASPECT;
  return { compact, scale: Math.min(w / STAGE_W, h / STAGE_H) };
}

function CommandButton({ c }: { c: MenuCommand }) {
  const subId = useId();
  const [colour, shade] = COLOURS[c.id];
  const radio = c.id === "local" || c.id === "online";
  return (
    <button
      type="button"
      className={`mc mc-${c.id}${c.on ? " on" : ""}`}
      style={{ "--c": colour, "--c2": shade } as React.CSSProperties}
      onClick={c.onClick}
      disabled={c.disabled}
      aria-label={c.label}
      aria-describedby={c.sub ? subId : undefined}
      {...(radio ? { role: "radio", "aria-checked": !!c.on } : { "aria-pressed": c.id === "saves" ? !!c.on : undefined })}
    >
      <span className="mc-bg" aria-hidden="true" />
      <span className="mc-face">
        <span className="mc-icon">
          <Icon name={c.icon} />
        </span>
        <span className="mc-text">
          <b>{c.label}</b>
          {c.sub && <small id={subId}>{c.sub}</small>}
        </span>
      </span>
    </button>
  );
}

function StylePicker({ style }: { style: MenuStyle }) {
  return (
    <div className="menu-styles" role="radiogroup" aria-label="Menu style">
      <span className="menu-styles-label">Menu style</span>
      {MENU_STYLES.map((s) => (
        <button
          key={s.id}
          type="button"
          role="radio"
          aria-checked={style === s.id}
          className={style === s.id ? "on" : ""}
          onClick={() => setDisplay({ menu: s.id })}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

/**
 * The main menu's frame in the player's chosen style. Every style has the same
 * choices and the same settings; only the look and the layout change. On a
 * landscape window the menu is laid out on a 1280 by 720 stage scaled to fit, so
 * nothing scrolls; a narrow or upright window gets one scrolling column.
 */
export function MenuFrame({ commands, heading, sub, children, extras }: Props) {
  const { menu: style } = useDisplay();
  const { compact, scale } = useFit();
  const where = commands.filter((c) => c.id === "local" || c.id === "online");
  const rest = commands.filter((c) => c.id !== "local" && c.id !== "online");

  return (
    <div className={`screen menu ms-${style}${compact ? " compact" : ""}`} data-menu-style={style}>
      {style === "war-table" && <MenuBoard />}
      <div className="menu-fit">
        <div
          className="menu-stage"
          style={compact ? undefined : { width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <div className="menu-decor" aria-hidden="true">
            {style === "atlas" && (
              <>
                <span className="atlas-book">
                  <span className="atlas-page l" />
                  <span className="atlas-page r" />
                </span>
                <span className="atlas-grid" />
                <CompassRose className="atlas-rose" />
              </>
            )}
            {style === "banner-hall" && (
              <>
                <span className="hall-bricks" />
                <span className="hall-torch l" />
                <span className="hall-torch r" />
                <span className="hall-rod" />
              </>
            )}
            {style === "hex-command" && (
              <>
                <span className="hex-lattice" />
                <span className="hex-glow" />
              </>
            )}
          </div>
          <header className="menu-title">
            {style === "war-table" && <span className="war-crest" aria-hidden="true" />}
            <h1>
              Age of <span>Heroes</span>
            </h1>
            <p>{style === "banner-hall" ? "Choose your banner" : style === "atlas" ? "A tactics game for two to six commanders" : "A tactics game for 2 to 6 players"}</p>
          </header>
          <nav className="menu-cmds" aria-label="Main menu">
            <div role="radiogroup" aria-label="Where to play" className="mc-where">
              {where.map((c) => (
                <CommandButton key={c.id} c={c} />
              ))}
            </div>
            {rest.map((c) => (
              <CommandButton key={c.id} c={c} />
            ))}
          </nav>
          <section className="menu-panel" aria-label={heading}>
            <header className="menu-panel-head">
              <h2>{heading}</h2>
              <p>{sub}</p>
            </header>
            {children}
          </section>
          <StylePicker style={style} />
        </div>
      </div>
      {extras}
    </div>
  );
}
