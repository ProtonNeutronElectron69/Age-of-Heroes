import { useState } from "react";
import { COLOR_SCHEMES, type ColorScheme } from "../models";
import { TABLE_STYLES, setDisplay, useDisplay, type TableStyle } from "../settings";

/**
 * How this screen draws the game: figure models or tokens, the colour scheme
 * for models, and the gaming table. A small button opens the choices.
 */
export function DisplayMenu() {
  const display = useDisplay();
  const [open, setOpen] = useState(false);
  return (
    <div className="display-menu">
      {open && (
        <section className="panel display-panel" aria-label="Display">
          <h2>Figures</h2>
          <div className="segmented" role="radiogroup" aria-label="Figures">
            {(["models", "tokens"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={display.figures === v}
                className={display.figures === v ? "on" : ""}
                onClick={() => setDisplay({ figures: v })}
              >
                {v === "models" ? "Models" : "Tokens"}
              </button>
            ))}
          </div>
          <p className="muted small">Tokens show the hit band that line of sight checks. Press T to switch.</p>
          <label className="field">
            <span>Model colours</span>
            <select
              aria-label="Model colours"
              value={display.scheme}
              disabled={display.figures !== "models"}
              onChange={(e) => setDisplay({ scheme: e.target.value as ColorScheme })}
            >
              {COLOR_SCHEMES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Table</span>
            <select aria-label="Table" value={display.table} onChange={(e) => setDisplay({ table: e.target.value as TableStyle })}>
              {TABLE_STYLES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        </section>
      )}
      <button type="button" className="display-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Display
      </button>
    </div>
  );
}
