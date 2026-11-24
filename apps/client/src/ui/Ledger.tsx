import { useState, type CSSProperties, type ReactNode } from "react";
import { factionTheme } from "./factionThemes";
import { Emblem } from "./hexCardArt";
import "./ledger.css";

/*
 * The play screen's ledger look: parchment sheets pinned to the gaming table, a ribbon in the acting
 * player's colour, short status pills, a one-line hint, and one drawer for the log, glyphs and keys.
 * The styles are in ledger.css, scoped to the play screen.
 */

/** A faction's emblem on its seal, as on the unit cards. */
export function FactionSeal({ faction, size = 34 }: { faction: string; size?: number }) {
  const t = factionTheme(faction);
  return (
    <svg className="faction-seal" viewBox="-17 -17 34 34" width={size} height={size} aria-hidden="true">
      <circle r={16} fill={t.deep} stroke={t.accent} strokeWidth={1.6} />
      <Emblem id={t.emblem} ink={t.accent} ground={t.deep} />
    </svg>
  );
}

/** Dark ink on a light player colour (yellow), white on the rest. */
function inkOn(color: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return "#fff";
  const [r, g, b] = [m[1]!, m[2]!, m[3]!].map((h) => parseInt(h, 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return luminance > 0.4 ? "#2b2014" : "#fff";
}

/**
 * The ribbon across the top of a sheet: who is acting, in their colour, with the unit's faction
 * emblem. Its text names the turn, so browser tests read it (`.turn-banner`).
 */
export function Ribbon({ color, faction, eyebrow, title }: { color: string; faction?: string; eyebrow: ReactNode; title: ReactNode }) {
  return (
    <div className="turn-banner ribbon" style={{ "--ribbon": color, "--ribbon-ink": inkOn(color) } as CSSProperties}>
      {faction && <FactionSeal faction={faction} />}
      <span className="ribbon-text">
        <span className="ribbon-eyebrow">{eyebrow}</span>{" "}
        <strong className="ribbon-title">{title}</strong>
      </span>
    </div>
  );
}

export interface Pill {
  readonly text: string;
  /** good: something the figure can do; warn: something holding it back. */
  readonly tone?: "good" | "warn";
}

/** Short facts about the chosen figure: can it move, has it a target, is it engaged or pinned. */
export function Pills({ pills }: { pills: readonly Pill[] }) {
  if (pills.length === 0) return null;
  return (
    <ul className="pills" aria-label="Chosen figure">
      {pills.map((p) => (
        <li key={p.text} className={`pill${p.tone ? ` ${p.tone}` : ""}`}>
          {p.text}
        </li>
      ))}
    </ul>
  );
}

/** One line saying what to do now; it changes with what the chosen figure can do. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="ledger-hint">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

export interface DrawerTab {
  readonly id: string;
  readonly label: string;
  /** A small count beside the label (glyphs held), or nothing. */
  readonly badge?: number;
  /** Something new to look at (a glyph just picked up): the tab glows. */
  readonly fresh?: boolean;
  readonly content: ReactNode;
}

const DRAWER_TAB = "age-of-heroes:hud-drawer:v1";

function storedTab(): string | null {
  try {
    const v = localStorage.getItem(DRAWER_TAB);
    return v === null ? "log" : v === "" ? null : v;
  } catch {
    return "log";
  }
}

/**
 * One drawer for the log, the glyphs and the keys: a tab each, one open at a time. Clicking the
 * open tab folds the drawer. The choice is remembered. Every tab's content stays in the page while
 * hidden, so the log keeps its place and tests can read it.
 */
export function Drawer({ tabs }: { tabs: readonly DrawerTab[] }) {
  const [open, setOpen] = useState<string | null>(storedTab);
  // A remembered tab this game does not have (no glyphs) opens the first one instead.
  const shown = open === null ? null : tabs.some((t) => t.id === open) ? open : (tabs[0]?.id ?? null);
  const choose = (id: string | null) => {
    setOpen(id);
    try {
      localStorage.setItem(DRAWER_TAB, id ?? "");
    } catch {
      // Kept for this visit only.
    }
  };
  return (
    <section className={`panel ledger-drawer${shown ? " open" : ""}`} aria-label="Log, glyphs and keys">
      <div className="drawer-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`drawer-tab-${t.id}`}
            aria-selected={shown === t.id}
            aria-controls={`drawer-panel-${t.id}`}
            className={`drawer-tab${t.fresh ? " fresh" : ""}`}
            title={shown === t.id ? `Fold the ${t.label.toLowerCase()} away` : undefined}
            onClick={() => choose(shown === t.id ? null : t.id)}
          >
            {t.label}
            {t.badge ? (
              <span className="tab-badge" aria-hidden="true">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`drawer-panel-${t.id}`} aria-labelledby={`drawer-tab-${t.id}`} className="drawer-body" hidden={shown !== t.id}>
          {t.content}
        </div>
      ))}
    </section>
  );
}

/** Small line icons for the round buttons in the corner. */
export function CornerIcon({ id }: { id: "display" | "save" | "quit" }) {
  return (
    <svg className="corner-icon" viewBox="0 0 24 24" aria-hidden="true">
      {id === "display" && (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
        </>
      )}
      {id === "save" && (
        <>
          <path d="M5 4h11l3 3v13H5Z" />
          <path d="M8 4v5h7V4M8 20v-6h8v6" />
        </>
      )}
      {id === "quit" && (
        <>
          <path d="M10 4H5v16h5" />
          <path d="M14 8l4 4-4 4M18 12H9" />
        </>
      )}
    </svg>
  );
}
