/**
 * The detailed look of the board's tiles: a texture for the top and one for the sides of each
 * terrain, painted in code on canvases (a colour map, a height map for the moulded relief and,
 * for lava, a glow map). Nothing is downloaded. Each terrain is painted once for each sharpness,
 * the first time a board with it is drawn in the detailed look, and kept.
 *
 * The painters draw on a 512-pixel square (`T`). At high graphics quality the same painting is
 * made at twice the resolution (`SHARP`): the smooth fields are scaled up and every stroke (grass
 * blades, grains, speckles, cobbles, cracks) is drawn through a doubled transform, so the picture
 * is the same, only sharper.
 */

export type Noise = (x: number, y: number) => number;
export type RGB = [number, number, number];

/** A painted surface: its colour, height (relief) and glow canvases. */
export interface Surface {
  /** Its size in the painters' units; the canvases are `k` times as many pixels across. */
  readonly w: number;
  readonly h: number;
  readonly k: number;
  readonly color: HTMLCanvasElement;
  readonly height: HTMLCanvasElement;
  readonly glow: HTMLCanvasElement;
  readonly cx: CanvasRenderingContext2D;
  readonly hx: CanvasRenderingContext2D;
  readonly gx: CanvasRenderingContext2D;
  /** Whether any of it glows (lava). */
  glowing: boolean;
}

interface SideOptions {
  /** How much of the side the top material's lip covers (0 to 1). */
  readonly lip?: number;
  /** How many layers of earth or stone show below it. */
  readonly bands?: number;
  /** The lip glows (lava). */
  readonly glowLip?: boolean;
  /** A colour for thin glowing veins in the layers. */
  readonly vein?: string;
}

// ---------- Small helpers: seeded random, value noise, colours ----------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function noise2(seed: number): Noise {
  const r = rng(seed), N = 256, g = new Float32Array(N * N);
  for (let i = 0; i < g.length; i++) g[i] = r();
  const at = (x: number, y: number) => g[((y & 255) << 8) | (x & 255)]!;
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
export function fbm(n: Noise, x: number, y: number, oct = 4): number {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += n(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
  return v / norm;
}
export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
export const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** A surface `w` by `h` in the painters' units, drawn `k` times as sharp (1, or `SHARP` at high quality). */
export function surface(w: number, h: number, k = 1): Surface {
  const mk = () => { const c = document.createElement("canvas"); c.width = w * k; c.height = h * k; return c; };
  const color = mk(), height = mk(), glow = mk();
  const ctx = (c: HTMLCanvasElement) => { const g = c.getContext("2d")!; g.setTransform(k, 0, 0, k, 0, 0); return g; };
  return { w, h, k, color, height, glow, cx: ctx(color), hx: ctx(height), gx: ctx(glow), glowing: false };
}
/**
 * Fill every pixel: fn returns [r,g,b, height 0..1, glow rgb or null] for a point in the painters' units.
 * The fields painted this way are smooth (noise, cells, ripples), so on a sharper surface they are
 * worked out at the painters' size and scaled up; only the strokes drawn after them gain detail.
 * That keeps a sharp painting about as quick as a plain one.
 */
export function pixels(s: Surface, fn: (x: number, y: number) => readonly [number, number, number, number, (RGB | null)?]): void {
  const W = s.w, H = s.h;
  const c = new ImageData(W, H), h = new ImageData(W, H), g = new ImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, gg, b, ht, glow] = fn(x, y), i = (y * W + x) * 4;
    c.data[i] = r; c.data[i + 1] = gg; c.data[i + 2] = b; c.data[i + 3] = 255;
    const hv = clamp(ht) * 255; h.data[i] = h.data[i + 1] = h.data[i + 2] = hv; h.data[i + 3] = 255;
    if (glow) { s.glowing = true; g.data[i] = glow[0]; g.data[i + 1] = glow[1]; g.data[i + 2] = glow[2]; }
    g.data[i + 3] = 255;
  }
  const put = (ctx: CanvasRenderingContext2D, data: ImageData) => {
    if (s.k === 1) return ctx.putImageData(data, 0, 0);
    const small = document.createElement("canvas");
    small.width = W;
    small.height = H;
    small.getContext("2d")!.putImageData(data, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // The context's transform scales the painters' units up to the sharper canvas.
    ctx.drawImage(small, 0, 0, W, H);
    ctx.restore();
  };
  put(s.cx, c); put(s.hx, h); put(s.gx, g);
}
/** Voronoi cells: nearest and second-nearest distances and the nearest cell's index. */
export function cells(seed: number, count: number, size: number): (x: number, y: number) => { d1: number; d2: number; edge: number; v: number } {
  const r = rng(seed), pts: [number, number, number][] = [];
  for (let i = 0; i < count; i++) pts.push([r() * size, r() * size, r()]);
  return (x, y) => {
    let d1 = 1e9, d2 = 1e9, k = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]!, dx = x - p[0], dy = y - p[1], d = Math.sqrt(dx * dx + dy * dy);
      if (d < d1) { d2 = d1; d1 = d; k = i; } else if (d < d2) d2 = d;
    }
    return { d1, d2, edge: d2 - d1, v: pts[k]![2] };
  };
}
/** Draw the same stroke on the colour canvas and, raised, on the height canvas. */
export function both(s: Surface, draw: (g: CanvasRenderingContext2D) => void, color: string, lift: string): void {
  s.cx.save(); s.cx.fillStyle = s.cx.strokeStyle = color; draw(s.cx); s.cx.restore();
  s.hx.save(); s.hx.fillStyle = s.hx.strokeStyle = lift; draw(s.hx); s.hx.restore();
}

// ---------- The tops: one painter per terrain (512 px square, the hex cap uses the middle) ----------
/** The size of a painted texture, in pixels. */
export const T = 512;
const TOPS: Record<string, (s: Surface) => void> = {
  grass(s) {
    const n = noise2(11), m = noise2(12);
    pixels(s, (x, y) => { const v = fbm(n, x / 70, y / 70); const c = mix(hex("#4c8a37"), hex("#78b24f"), v); return [...c, 0.35 + v * 0.25]; });
    const r = rng(13);
    for (let i = 0; i < 3200; i++) {
      const x = r() * T, y = r() * T, len = 5 + r() * 9, a = r() * Math.PI * 2;
      const l = 26 + r() * 26 + fbm(m, x / 60, y / 60) * 10;
      both(s, (g) => { g.lineWidth = 1.7; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); },
        `hsl(${92 + r() * 22} ${42 + r() * 18}% ${l}%)`, `rgba(255,255,255,${0.35 + r() * 0.4})`);
    }
    for (let i = 0; i < 22; i++) {
      const x = r() * T, y = r() * T;
      both(s, (g) => { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }, r() < 0.6 ? "#f4e27a" : "#f7f4ea", "#fff");
    }
  },
  sand(s) {
    const n = noise2(21), r = rng(22);
    pixels(s, (x, y) => {
      const v = fbm(n, x / 90, y / 90), rip = Math.sin((y + v * 70 + x * 0.25) / 7.5) * 0.5 + 0.5;
      const c = mix(hex("#cdb06a"), hex("#ecd99b"), v * 0.55 + rip * 0.45);
      return [...c, 0.3 + rip * 0.45 + v * 0.15];
    });
    for (let i = 0; i < 4000; i++) {
      const x = r() * T, y = r() * T;
      both(s, (g) => g.fillRect(x, y, 1.6, 1.6), r() < 0.5 ? "rgba(150,118,60,0.55)" : "rgba(255,248,220,0.6)", "rgba(255,255,255,0.4)");
    }
    for (let i = 0; i < 14; i++) {
      const x = r() * T, y = r() * T, rad = 2 + r() * 3;
      both(s, (g) => { g.beginPath(); g.ellipse(x, y, rad * 1.3, rad, r() * 3, 0, 7); g.fill(); }, "#b9a27a", "#fff");
    }
  },
  rock(s) {
    const n = noise2(31), v = cells(32, 20, T), r = rng(33);
    for (let i = 0; i < 20; i++) r(); // keeps the same speckles as the mockup
    pixels(s, (x, y) => {
      const c = v(x, y), f = fbm(n, x / 40, y / 40);
      const base = mix(hex("#8a857c"), hex("#b3ada3"), f);
      const crack = clamp(c.edge / 5), rim = clamp(c.edge / 22);
      const col = shade(base, (0.8 + c.v * 0.32) * (0.45 + 0.55 * crack) * (0.92 + rim * 0.08));
      return [...col, 0.12 + 0.58 * crack * (0.6 + 0.4 * rim) + f * 0.25];
    });
    for (let i = 0; i < 2600; i++) {
      const x = r() * T, y = r() * T;
      both(s, (g) => g.fillRect(x, y, 1.4, 1.4), r() < 0.5 ? "rgba(70,66,60,0.5)" : "rgba(230,226,218,0.45)", "rgba(255,255,255,0.25)");
    }
  },
  snow(s) {
    const n = noise2(41), m = noise2(42), r = rng(43);
    pixels(s, (x, y) => {
      const v = fbm(n, x / 80, y / 80), d = fbm(m, x / 30, y / 30);
      const c = mix(hex("#c9d6e3"), hex("#fbfdff"), clamp(v * 1.3 - 0.1 + d * 0.15));
      return [...c, v * 0.75 + d * 0.2];
    });
    for (let i = 0; i < 700; i++) {
      const x = r() * T, y = r() * T;
      both(s, (g) => g.fillRect(x, y, 1.5, 1.5), "rgba(255,255,255,0.95)", "rgba(255,255,255,0.3)");
    }
    for (let i = 0; i < 260; i++) {
      const x = r() * T, y = r() * T;
      both(s, (g) => g.fillRect(x, y, 1.2, 1.2), "rgba(150,175,205,0.6)", "rgba(0,0,0,0)");
    }
  },
  forest(s) {
    const n = noise2(51), r = rng(52);
    pixels(s, (x, y) => { const v = fbm(n, x / 60, y / 60); return [...mix(hex("#21482a"), hex("#3c6f3c"), v), 0.3 + v * 0.3]; });
    for (let i = 0; i < 90; i++) {
      const x = r() * T, y = r() * T, rad = 10 + r() * 22;
      s.cx.save();
      const g = s.cx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `hsla(${100 + r() * 20} 45% ${32 + r() * 12}% / 0.85)`); g.addColorStop(1, "hsla(110 40% 30% / 0)");
      s.cx.fillStyle = g; s.cx.beginPath(); s.cx.arc(x, y, rad, 0, 7); s.cx.fill(); s.cx.restore();
      const h = s.hx.createRadialGradient(x, y, 0, x, y, rad);
      h.addColorStop(0, "rgba(255,255,255,0.55)"); h.addColorStop(1, "rgba(255,255,255,0)");
      s.hx.fillStyle = h; s.hx.beginPath(); s.hx.arc(x, y, rad, 0, 7); s.hx.fill();
    }
    const leaf = ["#6b5a2a", "#7d6331", "#4f5a26", "#8a6a33", "#355a2c"];
    for (let i = 0; i < 900; i++) {
      const x = r() * T, y = r() * T, a = r() * 3.2, w = 2.5 + r() * 3;
      both(s, (g) => { g.beginPath(); g.ellipse(x, y, w, w * 0.45, a, 0, 7); g.fill(); }, leaf[Math.floor(r() * leaf.length)]!, "rgba(255,255,255,0.45)");
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * T, y = r() * T, a = r() * 6.3, l = 12 + r() * 18;
      both(s, (g) => { g.lineWidth = 2; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.moveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5); g.lineTo(x + Math.cos(a + 0.6) * l * 0.85, y + Math.sin(a + 0.6) * l * 0.85); g.stroke(); }, "#5a4024", "rgba(255,255,255,0.7)");
    }
  },
  water(s) {
    const n = noise2(61), r = rng(62);
    pixels(s, (x, y) => {
      const v = fbm(n, x / 110, y / 110), w = Math.sin((x * 0.55 + y * 0.83) / 11 + v * 9) * 0.5 + 0.5;
      const c = mix(mix(hex("#245f9f"), hex("#4b91d6"), v), hex("#9fd0f4"), Math.pow(w, 6) * 0.55);
      return [...c, 0.35 + w * 0.4];
    });
    for (let i = 0; i < 46; i++) {
      const x = r() * T, y = r() * T, rad = 6 + r() * 12, a = r() * 6.3;
      both(s, (g) => { g.lineWidth = 2; g.lineCap = "round"; g.beginPath(); g.arc(x, y, rad, a, a + 1.2); g.stroke(); }, "rgba(225,242,255,0.75)", "rgba(255,255,255,0.6)");
    }
  },
  swamp(s) {
    const n = noise2(71), p = noise2(72), r = rng(73);
    pixels(s, (x, y) => {
      const v = fbm(n, x / 60, y / 60), pool = fbm(p, x / 95, y / 95);
      if (pool < 0.43) { const k = clamp((0.43 - pool) * 12); return [...mix(hex("#4b5530"), hex("#2a3a26"), k), 0.15 - k * 0.1]; }
      return [...mix(hex("#5b5631"), hex("#7f7744"), v), 0.35 + v * 0.35];
    });
    for (let i = 0; i < 12; i++) {
      const x = r() * T, y = r() * T, rad = 7 + r() * 8, a = r() * 6.3;
      both(s, (g) => { g.beginPath(); g.moveTo(x, y); g.arc(x, y, rad, a + 0.35, a + 6.0); g.closePath(); g.fill(); }, `hsl(${95 + r() * 20} 45% ${30 + r() * 10}%)`, "rgba(255,255,255,0.6)");
    }
    for (let i = 0; i < 90; i++) {
      const x = r() * T, y = r() * T, a = r() * 6.3, l = 6 + r() * 8;
      both(s, (g) => { g.lineWidth = 2; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }, "#3f4a22", "rgba(255,255,255,0.7)");
    }
    for (let i = 0; i < 40; i++) {
      const x = r() * T, y = r() * T, rad = 1.5 + r() * 2.5;
      both(s, (g) => { g.lineWidth = 1; g.beginPath(); g.arc(x, y, rad, 0, 7); g.stroke(); }, "rgba(200,210,160,0.7)", "rgba(255,255,255,0.5)");
    }
  },
  lava(s) {
    const n = noise2(81), v = cells(82, 17, T);
    pixels(s, (x, y) => {
      const c = v(x, y), f = fbm(n, x / 35, y / 35);
      const glow = clamp(1 - c.edge / (13 + f * 10));
      const crust = shade(mix(hex("#2b1b17"), hex("#4a2c22"), f), 0.85 + c.v * 0.3);
      const hot = mix(hex("#ff5a10"), hex("#ffd04a"), Math.pow(glow, 3));
      const col = mix(crust, hot, Math.pow(glow, 1.4));
      const em = glow > 0.05 ? shade(hot, Math.pow(glow, 1.6)) : null;
      return [...col, 0.65 - glow * 0.6 + f * 0.2, em];
    });
  },
  road(s) {
    const n = noise2(91), r = rng(92);
    pixels(s, (x, y) => [...mix(hex("#3f3126"), hex("#55432f"), fbm(n, x / 30, y / 30)), 0.05]);
    const rowH = 44;
    for (let row = 0; row * rowH < T + rowH; row++) {
      let x = -r() * 40;
      while (x < T) {
        const w = 46 + r() * 22, y = row * rowH + 3, h = rowH - 6, cx = x + w / 2, cy = y + h / 2;
        const tone = `hsl(${24 + r() * 14} ${12 + r() * 14}% ${36 + r() * 16}%)`;
        s.cx.fillStyle = tone; s.cx.beginPath(); s.cx.roundRect(x + 3, y, w - 6, h, 12); s.cx.fill();
        const hg = s.hx.createRadialGradient(cx, cy, 2, cx, cy, w * 0.55);
        hg.addColorStop(0, "rgba(255,255,255,0.95)"); hg.addColorStop(1, "rgba(150,150,150,0.9)");
        s.hx.fillStyle = hg; s.hx.beginPath(); s.hx.roundRect(x + 3, y, w - 6, h, 12); s.hx.fill();
        const lg = s.cx.createLinearGradient(x, y, x, y + h);
        lg.addColorStop(0, "rgba(255,240,220,0.18)"); lg.addColorStop(1, "rgba(0,0,0,0.18)");
        s.cx.fillStyle = lg; s.cx.beginPath(); s.cx.roundRect(x + 3, y, w - 6, h, 12); s.cx.fill();
        x += w;
      }
    }
    for (let i = 0; i < 2200; i++) {
      const x = r() * T, y = r() * T;
      s.cx.fillStyle = r() < 0.5 ? "rgba(40,30,20,0.35)" : "rgba(220,205,180,0.3)"; s.cx.fillRect(x, y, 1.5, 1.5);
    }
  },
  ice(s) {
    const n = noise2(101), r = rng(102);
    pixels(s, (x, y) => { const v = fbm(n, x / 100, y / 100); return [...mix(hex("#86c6df"), hex("#d3f1fb"), v), 0.6 + v * 0.2]; });
    const crack = (x: number, y: number, a: number, steps: number, w: number): void => {
      for (let i = 0; i < steps; i++) {
        const nx = x + Math.cos(a) * (10 + r() * 14), ny = y + Math.sin(a) * (10 + r() * 14);
        s.cx.strokeStyle = "rgba(245,252,255,0.9)"; s.cx.lineWidth = w; s.cx.beginPath(); s.cx.moveTo(x, y); s.cx.lineTo(nx, ny); s.cx.stroke();
        s.hx.strokeStyle = "rgba(0,0,0,0.85)"; s.hx.lineWidth = w + 0.6; s.hx.beginPath(); s.hx.moveTo(x, y); s.hx.lineTo(nx, ny); s.hx.stroke();
        if (r() < 0.22 && w > 0.9) crack(nx, ny, a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.7), Math.floor(steps / 2), w * 0.6);
        x = nx; y = ny; a += (r() - 0.5) * 0.7;
      }
    };
    s.cx.lineCap = s.hx.lineCap = "round";
    for (let i = 0; i < 6; i++) crack(r() * T, r() * T, r() * 6.3, 10 + Math.floor(r() * 8), 2);
    for (let i = 0; i < 500; i++) {
      const x = r() * T, y = r() * T;
      s.cx.fillStyle = "rgba(255,255,255,0.7)"; s.cx.fillRect(x, y, 1.3, 1.3);
    }
  },
};

// ---------- The sides: a lip of the top material over layered earth or stone ----------
const SW = 512, SH = 128;
function side(k: number, seed: number, lip: string, layers: readonly string[], opts: SideOptions = {}): Surface {
  const s = surface(SW, SH, k), n = noise2(seed), m = noise2(seed + 1);
  const lipC = hex(lip), lay = layers.map(hex), lipH = opts.lip ?? 0.16;
  pixels(s, (x, y) => {
    const t = y / SH, edge = lipH + (fbm(n, x / 26, 0.5) - 0.5) * 0.1;
    const f = fbm(m, x / 22, y / 22);
    if (t < edge) {
      const glow = opts.glowLip ? shade(lipC, 0.8 + f * 0.4) : null;
      return [...shade(lipC, 0.82 + f * 0.3), 0.7 + f * 0.2, glow];
    }
    const band = (t - edge) * (opts.bands ?? 5) + (fbm(n, x / 50, t * 3) - 0.5) * 0.9;
    const k = ((Math.floor(band) % lay.length) + lay.length) % lay.length, inBand = band - Math.floor(band);
    const groove = inBand < 0.1 ? 0.9 : 1;
    const vein = opts.vein && Math.abs(Math.sin(x / 23 + band * 4)) < 0.05 ? hex(opts.vein) : null;
    const base = shade(lay[k]!, (0.82 + f * 0.32) * groove);
    return [...(vein ?? base), (groove < 1 ? 0.2 : 0.5) + f * 0.3, vein ? shade(vein, 0.8) : null];
  });
  return s;
}
const SIDES: Record<string, (k: number) => Surface> = {
  grass: (k) => side(k, 201, "#5e9b43", ["#6b4a2f", "#7d5a3a", "#5e4029", "#73513a"]),
  sand: (k) => side(k, 211, "#e0c88a", ["#c9a462", "#b48c4e", "#d4b373", "#bd9655"], { lip: 0.16 }),
  rock: (k) => side(k, 221, "#a19c93", ["#8c877f", "#7b766f", "#97928a", "#85807a"], { lip: 0.1, bands: 4 }),
  snow: (k) => side(k, 231, "#f2f6fa", ["#8a8f96", "#9aa0a8", "#7d838b"], { lip: 0.3 }),
  forest: (k) => side(k, 241, "#2f5e34", ["#5a3f27", "#6b4a2f", "#4e3622", "#62452c"]),
  water: (k) => side(k, 251, "#5d9fdc", ["#2b6aab", "#3a7cbf", "#2f71b3"], { lip: 0.14, bands: 3 }),
  swamp: (k) => side(k, 261, "#6e6a3a", ["#3f3a26", "#4b452c", "#38331f", "#453f28"]),
  lava: (k) => side(k, 271, "#ff7a1c", ["#2f201b", "#3a2620", "#2a1b17"], { lip: 0.12, glowLip: true, vein: "#ff6a14" }),
  road: (k) => side(k, 281, "#6b5440", ["#6a4b30", "#5c4029", "#71523a", "#62462e"], { lip: 0.14 }),
  ice: (k) => side(k, 291, "#e4f6fc", ["#8ccae0", "#a6d8ea", "#7fbdd5"], { lip: 0.2, bands: 3 }),
};


/** How a terrain's plastic is finished: roughness, clear coat and how deep its relief looks. */
export interface TileFinish {
  readonly roughness: number;
  readonly clearcoat: number;
  readonly bump: number;
}

/** Each terrain's finish; the watery and icy ones are glossier. */
export const TILE_FINISH: Readonly<Record<string, TileFinish>> = {
  grass: { roughness: 0.55, clearcoat: 0.35, bump: 0.035 },
  sand: { roughness: 0.62, clearcoat: 0.3, bump: 0.03 },
  rock: { roughness: 0.5, clearcoat: 0.35, bump: 0.05 },
  snow: { roughness: 0.42, clearcoat: 0.4, bump: 0.03 },
  forest: { roughness: 0.58, clearcoat: 0.3, bump: 0.04 },
  water: { roughness: 0.12, clearcoat: 1, bump: 0.025 },
  swamp: { roughness: 0.45, clearcoat: 0.45, bump: 0.035 },
  lava: { roughness: 0.5, clearcoat: 0.3, bump: 0.05 },
  road: { roughness: 0.5, clearcoat: 0.35, bump: 0.05 },
  ice: { roughness: 0.08, clearcoat: 1, bump: 0.03 },
};

export interface TileArt {
  readonly top: Surface;
  readonly side: Surface;
  readonly finish: TileFinish;
}

/** How much sharper the textures are painted at high graphics quality: 1024 pixels across instead of 512. */
export const SHARP = 2;

const painted = new Map<string, TileArt>();

/**
 * The painted top and sides of a terrain, `k` times as sharp (1, or `SHARP` at high quality), or
 * null for a terrain with no art (it keeps its flat colour).
 */
export function tileArt(terrainId: string, k = 1): TileArt | null {
  const done = painted.get(`${terrainId}@${k}`);
  if (done) return done;
  const paintTop = TOPS[terrainId], paintSide = SIDES[terrainId], finish = TILE_FINISH[terrainId];
  if (!paintTop || !paintSide || !finish) return null;
  const top = surface(T, T, k);
  paintTop(top);
  const art = { top, side: paintSide(k), finish };
  painted.set(`${terrainId}@${k}`, art);
  return art;
}
