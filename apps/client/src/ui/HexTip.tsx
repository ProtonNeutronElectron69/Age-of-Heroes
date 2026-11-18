import { hexKey, playerZone, type Board, type GameState, type RulesContext, type TerrainTable } from "@aoh/rules";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { terrainEffect } from "../describe";
import type { HexInspect } from "../scene/BoardScene";

/** Whose start zone a hex is in, by hex key. */
export type ZoneOwners = ReadonlyMap<string, { readonly name: string; readonly color: string }>;

/** Every player's start zone (grown to fit the army, once it has been). */
export function zoneOwners(state: GameState, ctx: RulesContext): ZoneOwners {
  const owners = new Map<string, { name: string; color: string }>();
  for (const p of state.players) {
    for (const h of playerZone(state, p.id, ctx)) owners.set(hexKey(h), { name: p.name, color: p.color });
  }
  return owners;
}

/** The hex the player last middle-clicked, and a way to set or clear it. */
export function useHexTip() {
  return useState<HexInspect | null>(null);
}

/** Room kept between the tooltip and the window's edges, in pixels. */
const EDGE = 8;

/**
 * A small tooltip about the hex the player middle-clicked: its terrain,
 * elevation and any special rules, scenery or start zone. It closes on
 * Escape, on any other click, or when the wheel zooms the camera.
 */
export function HexTip({
  tip,
  board,
  terrain,
  zones,
  glyphs,
  onClose,
}: {
  tip: HexInspect | null;
  board: Board;
  terrain: TerrainTable;
  zones?: ZoneOwners;
  /** Glyphs lying face down on the battlefield. */
  glyphs?: readonly { hex: { q: number; r: number }; elevation: number }[];
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState({ left: 0, top: 0 });
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!tip) return;
    const down = (e: PointerEvent) => {
      if (e.button !== 1) close.current();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    const wheel = () => close.current();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    window.addEventListener("wheel", wheel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("wheel", wheel);
    };
  }, [tip]);
  // Beside the pointer, kept inside the window.
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const { width, height } = box.current.getBoundingClientRect();
    let left = tip.x + 14;
    let top = tip.y + 14;
    if (left + width > window.innerWidth - EDGE) left = Math.max(EDGE, tip.x - 14 - width);
    if (top + height > window.innerHeight - EDGE) top = Math.max(EDGE, tip.y - 14 - height);
    setAt({ left, top });
  }, [tip]);
  if (!tip) return null;

  const { step, cell } = tip;
  const surface = board.surfaceAt(step.hex, step.elevation);
  const rules = terrain.get(surface?.terrain ?? cell.terrain);
  const effect = rules ? terrainEffect(rules) : null;
  const scenery = board.sceneryIn(step.hex).filter((s) => s.placement.elevation === step.elevation);
  const zone = zones?.get(hexKey(step.hex));
  const headroom = surface && Number.isFinite(surface.clearance) ? surface.clearance : null;
  const bridge = surface ? board.isSpanPiece(surface.pieceId) : false;
  return (
    <div ref={box} className="hex-tip" role="tooltip" aria-label="Hex information" style={at}>
      <strong className="hex-tip-name">
        <span className="swatch" style={{ background: rules?.color ?? "#999" }} />
        {rules?.name ?? cell.terrain}
        {bridge ? " bridge" : ""}
      </strong>
      <span className="hex-tip-height">
        Elevation {step.elevation}
        {headroom !== null ? `, ${headroom} ${headroom === 1 ? "level" : "levels"} of headroom` : ""}
      </span>
      <p>{effect ?? "No special rules."}</p>
      {scenery.map((s) => (
        <p key={s.placement.id}>
          {s.rules.name}, {s.rules.height} levels tall: no figure can stand here, and it blocks line of sight.
          {s.rules.climb ? ` Figures that walk can climb across it for ${s.rules.climb} extra move.` : ""}
          {s.rules.cover ? ` A figure next to it gets +${s.rules.cover} defense against attacks from range across it.` : ""}
        </p>
      ))}
      {glyphs?.some((g) => hexKey(g.hex) === hexKey(step.hex) && g.elevation === step.elevation) && (
        <p className="hex-tip-glyph">A glyph lies face down here. A figure that ends its move on it picks it up.</p>
      )}
      {zone && (
        <p className="hex-tip-zone">
          <span className="swatch" style={{ background: zone.color }} />
          {zone.name}'s start zone
        </p>
      )}
    </div>
  );
}
