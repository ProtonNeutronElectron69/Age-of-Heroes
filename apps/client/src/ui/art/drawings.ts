import { ASHEN } from "./drawings/ashen";
import { CONCORD } from "./drawings/concord";
import { DAWNHOLD } from "./drawings/dawnhold";
import { KAGERO } from "./drawings/kagero";
import { NEXUS } from "./drawings/nexus";
import { VERDANT } from "./drawings/verdant";
import type { Drawing, Placed } from "./types";

/** Every unit drawing so far, by card id. Units without one keep the card's stand-ins. */
export const DRAWINGS: Readonly<Record<string, Drawing>> = {
  ...CONCORD,
  ...KAGERO,
  ...VERDANT,
  ...NEXUS,
  ...ASHEN,
  ...DAWNHOLD,
};

/** The box around every figure of an arrangement, for fitting it into a window. */
export function castBounds(cast: readonly Placed[]): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { figure, dx, dy, scale } of cast) {
    // Figures keep within about 20 to 180 across; gear can rise above the head.
    x0 = Math.min(x0, dx + 20 * scale);
    x1 = Math.max(x1, dx + 180 * scale);
    y0 = Math.min(y0, dy + Math.max(0, figure.top - 24) * scale);
    y1 = Math.max(y1, dy + figure.bottom * scale);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
