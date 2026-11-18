import {
  BufferGeometry,
  CanvasTexture,
  Color,
  IcosahedronGeometry,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  type Material,
} from "three";
import { T, both, cells, clamp, fbm, hex, mix, noise2, pixels, rng, shade, surface, type Surface } from "./tileArt";

/**
 * The detailed look of the scenery: stone blocks, fieldstones, bark, needles, weathered rock and
 * forest-floor soil, painted in code like the tiles (`tileArt.ts`) and finished as plastic.
 * Each texture is painted the first time a detailed board needs it, and kept.
 */

interface BlockOptions {
  /** The height of a course of blocks, in pixels. */
  readonly course?: number;
  /** The shortest block, and how much longer one may be. */
  readonly min?: number;
  readonly spread?: number;
  /** How round the blocks' corners are. */
  readonly round?: number;
  /** How many patches of moss, and how many trails of ivy. */
  readonly moss?: number;
  readonly ivy?: number;
}

function stoneBlocks(seed: number, palette: readonly string[], opts: BlockOptions = {}): Surface {
  const s = surface(T, T), r = rng(seed), n = noise2(seed + 1), course = opts.course ?? 64;
  pixels(s, (x, y) => [...mix(hex("#4b463f"), hex("#5d5750"), fbm(n, x / 20, y / 20)), 0.05]);
  for (let row = 0; row * course < T; row++) {
    let x = -r() * 120;
    while (x < T) {
      const w = (opts.min ?? 90) + r() * (opts.spread ?? 90), y = row * course + 2, h = course - 4;
      const base = hex(palette[Math.floor(r() * palette.length)]!);
      const tone = shade(base, 0.88 + r() * 0.22);
      s.cx.fillStyle = `rgb(${tone.map(Math.round).join(",")})`;
      s.cx.beginPath(); s.cx.roundRect(x + 2, y, w - 4, h, opts.round ?? 5); s.cx.fill();
      const hg = s.hx.createLinearGradient(0, y, 0, y + h);
      hg.addColorStop(0, "rgba(255,255,255,0.9)"); hg.addColorStop(1, "rgba(190,190,190,0.9)");
      s.hx.fillStyle = hg; s.hx.beginPath(); s.hx.roundRect(x + 2, y, w - 4, h, opts.round ?? 5); s.hx.fill();
      // A chipped corner now and then.
      if (r() < 0.35) {
        const cx = r() < 0.5 ? x + 2 : x + w - 2, cy = r() < 0.5 ? y : y + h, rad = 6 + r() * 10;
        for (const g of [s.cx, s.hx]) { g.save(); g.fillStyle = g === s.cx ? "#4b463f" : "#222"; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.fill(); g.restore(); }
      }
      x += w;
    }
  }
  // Grain and weathering over the whole face.
  const m = noise2(seed + 2);
  const img = s.cx.getImageData(0, 0, T, T);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4, k = 0.86 + fbm(m, x / 14, y / 14) * 0.26;
    const d = img.data;
    d[i] = d[i]! * k; d[i + 1] = d[i + 1]! * k; d[i + 2] = d[i + 2]! * k;
  }
  s.cx.putImageData(img, 0, 0);
  // Moss in the joints and on some faces.
  for (let i = 0; i < (opts.moss ?? 40); i++) {
    const x = r() * T, y = r() * T, rad = 4 + r() * 16;
    const g = s.cx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `hsla(${88 + r() * 25} 40% ${26 + r() * 12}% / 0.75)`); g.addColorStop(1, "hsla(95 40% 30% / 0)");
    s.cx.fillStyle = g; s.cx.beginPath(); s.cx.arc(x, y, rad, 0, 7); s.cx.fill();
  }
  for (let i = 0; i < (opts.ivy ?? 0); i++) {
    let x = r() * T, y = r() * T;
    for (let k = 0; k < 26; k++) {
      x += (r() - 0.5) * 18; y += r() * 12 - 3;
      both(s, (g) => { g.beginPath(); g.ellipse(x, y, 5, 3.4, r() * 3, 0, 7); g.fill(); }, `hsl(${100 + r() * 25} 45% ${24 + r() * 14}%)`, "rgba(255,255,255,0.8)");
    }
  }
  return s;
}
function fieldstone(seed: number, palette: readonly string[]): Surface {
  const s = surface(T, T), v = cells(seed, 46, T), n = noise2(seed + 1), r = rng(seed + 2);
  const tones = Array.from({ length: 46 }, () => shade(hex(palette[Math.floor(r() * palette.length)]!), 0.85 + r() * 0.3));
  pixels(s, (x, y) => {
    const c = v(x, y), f = fbm(n, x / 16, y / 16), k = Math.floor(c.v * 46) % 46;
    const edge = clamp(c.edge / 9), round = Math.sqrt(clamp(c.edge / 30));
    const col = mix(hex("#3e3a33"), shade(tones[k]!, 0.88 + f * 0.24 + round * 0.08), edge);
    return [...col, edge * (0.45 + round * 0.55)];
  });
  for (let i = 0; i < 50; i++) {
    const x = r() * T, y = r() * T, rad = 4 + r() * 10;
    const g = s.cx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "hsla(80 35% 35% / 0.7)"); g.addColorStop(1, "hsla(80 35% 35% / 0)");
    s.cx.fillStyle = g; s.cx.beginPath(); s.cx.arc(x, y, rad, 0, 7); s.cx.fill();
  }
  return s;
}
function bark(seed: number): Surface {
  const s = surface(T, T), n = noise2(seed);
  pixels(s, (x, y) => {
    const f = fbm(n, x / 9, y / 90), ridge = Math.abs(Math.sin(x / 7 + f * 6));
    const col = mix(hex("#3d2a1a"), hex("#7a5636"), ridge * 0.7 + f * 0.3);
    return [...col, ridge * 0.8 + f * 0.2];
  });
  return s;
}
function needles(seed: number, hue: number): Surface {
  const s = surface(T, T), n = noise2(seed), r = rng(seed + 1);
  pixels(s, (x, y) => { const v = fbm(n, x / 50, y / 50); return [...mix(hex("#173d22"), hex("#2c6a36"), v), 0.3 + v * 0.3]; });
  for (let i = 0; i < 5200; i++) {
    const x = r() * T, y = r() * T, len = 6 + r() * 9, a = Math.PI / 2 + (r() - 0.5) * 1.6;
    both(s, (g) => { g.lineWidth = 1.6; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke(); },
      `hsl(${hue + r() * 22} ${40 + r() * 20}% ${18 + r() * 24}%)`, `rgba(255,255,255,${0.3 + r() * 0.5})`);
  }
  return s;
}
function rockFace(seed: number): Surface {
  const s = surface(T, T), n = noise2(seed), v = cells(seed + 1, 10, T), r = rng(seed + 2);
  pixels(s, (x, y) => {
    const f = fbm(n, x / 40, y / 40), c = v(x, y), crack = clamp(c.edge / 4);
    const col = shade(mix(hex("#6e6a63"), hex("#a29d94"), f), 0.6 + 0.4 * crack);
    return [...col, 0.25 + f * 0.6 * crack];
  });
  for (let i = 0; i < 70; i++) {
    const x = r() * T, y = r() * T, rad = 3 + r() * 9, lich = r() < 0.6 ? "hsla(70 40% 55% / 0.75)" : "hsla(30 60% 55% / 0.7)";
    s.cx.fillStyle = lich; s.cx.beginPath(); s.cx.arc(x, y, rad, 0, 7); s.cx.fill();
    for (let k = 0; k < 4; k++) { s.cx.beginPath(); s.cx.arc(x + (r() - 0.5) * rad * 2, y + (r() - 0.5) * rad * 2, rad * 0.5, 0, 7); s.cx.fill(); }
  }
  return s;
}
function soil(seed: number): Surface {
  const s = surface(T, T), n = noise2(seed), r = rng(seed + 1);
  pixels(s, (x, y) => { const v = fbm(n, x / 40, y / 40); return [...mix(hex("#4a3522"), hex("#6d5036"), v), 0.3 + v * 0.4]; });
  for (let i = 0; i < 700; i++) {
    const x = r() * T, y = r() * T, a = r() * 3.2, w = 2 + r() * 4;
    both(s, (g) => { g.beginPath(); g.ellipse(x, y, w, w * 0.45, a, 0, 7); g.fill(); }, ["#7d6331", "#5a4a24", "#3f5a2c", "#8a6a33"][Math.floor(r() * 4)]!, "rgba(255,255,255,0.5)");
  }
  for (let i = 0; i < 40; i++) {
    const x = r() * T, y = r() * T, rad = 8 + r() * 18;
    const g = s.cx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "hsla(105 40% 32% / 0.8)"); g.addColorStop(1, "hsla(105 40% 32% / 0)");
    s.cx.fillStyle = g; s.cx.beginPath(); s.cx.arc(x, y, rad, 0, 7); s.cx.fill();
  }
  return s;
}


/** The scenery's surfaces. */
export type SceneryFinish = "sandstone" | "greystone" | "capstone" | "fieldstone" | "bark" | "needles" | "needlesLight" | "rock" | "soil";

const PAINT: Readonly<Record<SceneryFinish, { paint: () => Surface; bump: number; roughness: number }>> = {
  sandstone: { paint: () => stoneBlocks(301, ["#b8ad90", "#a99d80", "#c4b99c", "#b0a486"], { course: 70, min: 110, moss: 30 }), bump: 0.05, roughness: 0.55 },
  greystone: { paint: () => stoneBlocks(311, ["#9a968e", "#8a867f", "#a6a39b", "#7f7c75"], { course: 58, min: 80, moss: 60, ivy: 6 }), bump: 0.05, roughness: 0.55 },
  capstone: { paint: () => stoneBlocks(321, ["#a8a49c", "#9c988f", "#b2aea6"], { course: 128, min: 140, moss: 10, round: 10 }), bump: 0.04, roughness: 0.55 },
  fieldstone: { paint: () => fieldstone(331, ["#8f8b80", "#9c958a", "#7f7a70", "#a39d90", "#8a7d6b"]), bump: 0.06, roughness: 0.55 },
  bark: { paint: () => bark(341), bump: 0.05, roughness: 0.7 },
  needles: { paint: () => needles(351, 115), bump: 0.04, roughness: 0.6 },
  needlesLight: { paint: () => needles(361, 125), bump: 0.04, roughness: 0.6 },
  rock: { paint: () => rockFace(371), bump: 0.07, roughness: 0.55 },
  soil: { paint: () => soil(381), bump: 0.04, roughness: 0.55 },
};

/** Darkened a little, as the tiles are, for the board's brighter lights. */
const TINT = new Color(0.86, 0.86, 0.86);
const made = new Map<SceneryFinish, Material>();

/** The plastic material for one of the scenery's surfaces. Its textures repeat; see `worldUV`. */
export function sceneryMaterial(finish: SceneryFinish): Material {
  const done = made.get(finish);
  if (done) return done;
  const spec = PAINT[finish];
  const s = spec.paint();
  const texture = (canvas: HTMLCanvasElement, color: boolean) => {
    const t = new CanvasTexture(canvas);
    if (color) t.colorSpace = SRGBColorSpace;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.anisotropy = 8;
    return t;
  };
  const m = new MeshPhysicalMaterial({
    color: TINT,
    map: texture(s.color, true),
    bumpMap: texture(s.height, false),
    bumpScale: spec.bump,
    roughness: spec.roughness,
    metalness: 0,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
  });
  made.set(finish, m);
  return m;
}

/**
 * Texture coordinates taken from each point's position (on the face's own plane), so stone and
 * bark keep one size on faces of any size. `scale` is how many world units one texture covers.
 */
export function worldUV(geometry: BufferGeometry, scale: number): void {
  const pos = geometry.getAttribute("position"), nor = geometry.getAttribute("normal"), uv = geometry.getAttribute("uv");
  if (!pos || !nor || !uv) return;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ax >= ay && ax >= az) uv.setXY(i, z / scale, y / scale);
    else if (ay >= az) uv.setXY(i, x / scale, z / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  uv.needsUpdate = true;
}

const lumps = new Map<number, BufferGeometry>();

/** A lumpy rock of about this radius: a round shape pushed in and out by noise, the same each time. */
export function boulderGeometry(radius: number): BufferGeometry {
  const done = lumps.get(radius);
  if (done) return done;
  const geo = new IcosahedronGeometry(radius, 2);
  const pos = geo.getAttribute("position");
  const n = noise2(391);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.82 + fbm(n, v.x * 2.2 + 9, v.z * 2.2 + v.y * 1.7 + 9) * 0.38);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  lumps.set(radius, geo);
  return geo;
}
