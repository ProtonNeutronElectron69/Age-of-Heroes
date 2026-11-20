import { GLYPHS } from "@aoh/content";
import type { GlyphKind } from "@aoh/rules";

/**
 * Simple art for each glyph, drawn in code: one light emblem on the glyph's colour. The table
 * paints it onto the face-up tiles on the cards, and the Glyphs panel shows it in its chips.
 */
export function drawGlyphArt(g: CanvasRenderingContext2D, kind: GlyphKind, cx: number, cy: number, size: number, ink = "#fbf4e2"): void {
  const s = size / 2;
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineWidth = Math.max(1, size * 0.08);
  g.lineCap = "round";
  g.lineJoin = "round";
  const line = (...pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * s, y * s) : g.lineTo(x * s, y * s)));
    g.stroke();
  };
  const shape = (...pts: [number, number][]) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x * s, y * s) : g.lineTo(x * s, y * s)));
    g.closePath();
    g.fill();
  };
  const ring = (x: number, y: number, r: number, fill = false) => {
    g.beginPath();
    g.arc(x * s, y * s, r * s, 0, Math.PI * 2);
    if (fill) g.fill();
    else g.stroke();
  };
  switch (kind) {
    case "attack":
      // A sword, point up.
      shape([0, -0.95], [0.13, -0.7], [0.13, 0.35], [-0.13, 0.35], [-0.13, -0.7]);
      line([-0.42, 0.38], [0.42, 0.38]);
      line([0, 0.38], [0, 0.82]);
      ring(0, 0.9, 0.09, true);
      break;
    case "defense":
      // A shield.
      g.beginPath();
      g.moveTo(-0.7 * s, -0.75 * s);
      g.lineTo(0.7 * s, -0.75 * s);
      g.lineTo(0.7 * s, -0.05 * s);
      g.quadraticCurveTo(0.6 * s, 0.6 * s, 0, 0.95 * s);
      g.quadraticCurveTo(-0.6 * s, 0.6 * s, -0.7 * s, -0.05 * s);
      g.closePath();
      g.stroke();
      line([0, -0.6], [0, 0.7]);
      line([-0.55, -0.15], [0.55, -0.15]);
      break;
    case "initiative":
      // The herald's horn.
      shape([-0.85, -0.12], [-0.85, 0.12], [0.35, 0.05], [0.85, 0.5], [0.85, -0.5], [0.35, -0.05]);
      line([-0.55, 0.12], [-0.2, 0.55], [0.2, 0.55], [0.5, 0.25]);
      break;
    case "range":
      // A hawk with spread wings.
      g.beginPath();
      g.moveTo(-0.95 * s, -0.25 * s);
      g.quadraticCurveTo(-0.45 * s, -0.6 * s, 0, 0.05 * s);
      g.quadraticCurveTo(0.45 * s, -0.6 * s, 0.95 * s, -0.25 * s);
      g.stroke();
      shape([-0.12, 0], [0.12, 0], [0.18, 0.55], [0, 0.85], [-0.18, 0.55]);
      break;
    case "move":
      // A stag's antlers.
      for (const m of [1, -1]) {
        line([0.12 * m, 0.85], [0.3 * m, 0.2], [0.55 * m, -0.4], [0.65 * m, -0.9]);
        line([0.3 * m, 0.2], [0.75 * m, 0.05]);
        line([0.48 * m, -0.25], [0.9 * m, -0.4]);
        line([0.58 * m, -0.6], [0.35 * m, -0.92]);
      }
      break;
    case "heal":
      // A cross of mending.
      shape([-0.2, -0.85], [0.2, -0.85], [0.2, -0.2], [0.85, -0.2], [0.85, 0.2], [0.2, 0.2], [0.2, 0.85], [-0.2, 0.85], [-0.2, 0.2], [-0.85, 0.2], [-0.85, -0.2], [-0.2, -0.2]);
      break;
    case "summon":
      // A rising sun over the grave line.
      ring(0, 0.15, 0.4);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI + (Math.PI * i) / 6;
        line([Math.cos(a) * 0.55, 0.15 + Math.sin(a) * 0.55], [Math.cos(a) * 0.85, 0.15 + Math.sin(a) * 0.85]);
      }
      g.fillStyle = GLYPHS[kind].color;
      g.fillRect(-0.9 * s, 0.17 * s, 1.8 * s, 0.6 * s);
      g.fillStyle = ink;
      line([-0.9, 0.2], [0.9, 0.2]);
      line([-0.5, 0.6], [0.5, 0.6]);
      break;
    case "wound":
      // A falling drop of blight, cracked.
      g.beginPath();
      g.moveTo(0, -0.9 * s);
      g.quadraticCurveTo(0.7 * s, 0.05 * s, 0.6 * s, 0.4 * s);
      g.arc(0, 0.4 * s, 0.6 * s, 0, Math.PI);
      g.quadraticCurveTo(-0.7 * s, 0.05 * s, 0, -0.9 * s);
      g.fill();
      g.strokeStyle = GLYPHS[kind].color;
      line([-0.1, -0.2], [0.12, 0.15], [-0.12, 0.45], [0.08, 0.75]);
      break;
    case "negate":
      // Undone: a ring struck through.
      ring(0, 0, 0.75);
      line([-0.53, 0.53], [0.53, -0.53]);
      break;
    case "pit":
      // A hole in the ground, rings going down.
      g.beginPath();
      g.ellipse(0, 0.1 * s, 0.85 * s, 0.45 * s, 0, 0, Math.PI * 2);
      g.stroke();
      g.beginPath();
      g.ellipse(0, 0.18 * s, 0.5 * s, 0.25 * s, 0, 0, Math.PI * 2);
      g.fill();
      line([0, -0.9], [0, -0.45]);
      line([-0.15, -0.6], [0, -0.45], [0.15, -0.6]);
      break;
    case "curse":
      // A skull.
      ring(0, -0.15, 0.62, true);
      shape([-0.35, 0.3], [0.35, 0.3], [0.3, 0.8], [-0.3, 0.8]);
      g.fillStyle = GLYPHS[kind].color;
      ring(-0.24, -0.15, 0.17, true);
      ring(0.24, -0.15, 0.17, true);
      shape([0, 0.08], [0.08, 0.25], [-0.08, 0.25]);
      for (const x of [-0.15, 0, 0.15]) g.fillRect((x - 0.03) * s, 0.55 * s, 0.06 * s, 0.25 * s);
      break;
  }
  g.restore();
}

/** The glyph's name without "Glyph of": "Fury", "the Bulwark". */
export function glyphShortName(kind: GlyphKind): string {
  return GLYPHS[kind].name.replace(/^Glyph of /, "");
}

const urls = new Map<GlyphKind, string>();

/** The glyph's art on its colour, as an image for the page (cached). Null where there is no canvas. */
export function glyphArtUrl(kind: GlyphKind): string | null {
  const done = urls.get(kind);
  if (done) return done;
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = GLYPHS[kind].color;
  g.fillRect(0, 0, 64, 64);
  drawGlyphArt(g, kind, 32, 32, 44);
  const url = c.toDataURL();
  urls.set(kind, url);
  return url;
}
