import { useState } from "react";
import { COLOR_SCHEMES, type ColorScheme } from "../models";
import { CornerIcon } from "./Ledger";
import { SoundControls } from "./MusicControl";
import { DICE_SHOWS, GRAPHICS_QUALITIES, TABLE_STYLES, TILE_LOOKS, setDisplay, useDisplay, type DiceShow, type TableStyle } from "../settings";

/**
 * How this screen draws the game: figure models or tokens, the colour scheme
 * for models, the gaming table, how dice rolls are shown and how the camera
 * follows the acting unit, and the music. A small button opens the choices.
 */
export function DisplayMenu() {
  const display = useDisplay();
  const [open, setOpen] = useState(false);
  return (
    <div className="display-menu">
      {open && (
        <section className="panel display-panel" aria-label="Display">
          <h2>Graphics</h2>
          <div className="segmented" role="radiogroup" aria-label="Graphics">
            {GRAPHICS_QUALITIES.map((g) => (
              <button
                key={g.id}
                type="button"
                role="radio"
                aria-checked={display.graphics === g.id}
                className={display.graphics === g.id ? "on" : ""}
                onClick={() => setDisplay({ graphics: g.id })}
              >
                {g.name}
              </button>
            ))}
          </div>
          <p className="muted small">High turns every effect on: soft shadows, sharper tiles and effects in fights. Low is plainer and quicker on slow computers.</p>
          <label className="check">
            <input type="checkbox" checked={display.flow} disabled={display.graphics !== "high"} onChange={(e) => setDisplay({ flow: e.target.checked })} />
            Moving water and lava
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={display.outlineGlow}
              disabled={display.graphics !== "high"}
              onChange={(e) => setDisplay({ outlineGlow: e.target.checked })}
            />
            Outline glow in player colours
          </label>
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
          <p className="muted small">Tokens show what line of sight checks: the hit band, or with hit zones the body in its colour and gear in grey. Press T to switch.</p>
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
          <h2>Look</h2>
          <div className="segmented" role="radiogroup" aria-label="Look">
            {TILE_LOOKS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={display.tiles === t.id}
                className={display.tiles === t.id ? "on" : ""}
                onClick={() => setDisplay({ tiles: t.id })}
              >
                {t.name}
              </button>
            ))}
          </div>
          <p className="muted small">Detailed: textured tiles with bold outlines to count the levels, textured scenery, and painted figures where a unit has one so far. Classic: flat colours and plain figures. Press B to switch.</p>
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
          <label className="field">
            <span>Dice rolls</span>
            <select aria-label="Dice rolls" value={display.dice} onChange={(e) => setDisplay({ dice: e.target.value as DiceShow })}>
              {DICE_SHOWS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">The full scene zooms in on each attack; a click skips it.</p>
          <fieldset className="checks">
            <legend>Camera follows the acting unit</legend>
            {(
              [
                ["autoPan", "Auto pan"],
                ["autoRotate", "Auto rotate"],
                ["autoZoom", "Auto zoom"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="check">
                <input type="checkbox" checked={display[key]} onChange={(e) => setDisplay({ [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </fieldset>
          <p className="muted small">The camera waits for a figure to finish moving. Attacks in the full scene always frame the fight.</p>
          <h2>Sound</h2>
          <SoundControls />
        </section>
      )}
      <button type="button" className="display-toggle round-button" aria-label="Display" title="Display" aria-expanded={open} onClick={() => setOpen(!open)}>
        <CornerIcon id="display" />
      </button>
    </div>
  );
}
