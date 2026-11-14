import { useState } from "react";
import { COLOR_SCHEMES, type ColorScheme } from "../models";
import { setDisplay, useDisplay } from "../settings";

/**
 * How figures are drawn on this screen: models or tokens, and the colour
 * scheme for models. A small button opens the choices.
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
          <p className="muted small">Tokens show the hit band that Advanced line of sight checks. Press T to switch.</p>
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
        </section>
      )}
      <button type="button" className="display-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        Display
      </button>
    </div>
  );
}
