import { LEVEL_HEIGHT, HEX_SIZE } from "@aoh/rules";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  ShaderChunk,
  type Material,
} from "three";
import { HEX_GAP } from "./scale";
import { SHARP, tileArt, type Surface } from "./tileArt";

/**
 * One level of a hex stack: a six-sided prism whose index is ordered so that a material array
 * draws it in two calls, the sides and bottom with the first material and the top with the second.
 */
export function tileGeometry(): BufferGeometry {
  const g = new CylinderGeometry(HEX_SIZE * HEX_GAP, HEX_SIZE * HEX_GAP, LEVEL_HEIGHT, 6);
  const index = g.getIndex()!;
  const [sides, top, bottom] = g.groups as [{ start: number; count: number }, { start: number; count: number }, { start: number; count: number }];
  const src = index.array;
  const order: number[] = [];
  for (const part of [sides, bottom, top]) for (let i = part.start; i < part.start + part.count; i++) order.push(src[i]!);
  g.setIndex(order);
  g.clearGroups();
  g.addGroup(0, sides.count + bottom.count, 0);
  g.addGroup(sides.count + bottom.count, top.count, 1);
  return g;
}

/**
 * The detailed tiles' plastic is darkened a little, since the board's lights are brighter than
 * the light the textures were painted for.
 */
const TINT = new Color(0.86, 0.86, 0.86);

/**
 * The clock that moves water and lava at high quality, in seconds. `FlowClock` in `BoardScene`
 * winds it on while the board shows either; every flowing material reads it.
 */
export const FLOW_TIME = { value: 0 };

/** The terrains that move at high quality. */
export const FLOWING_TERRAIN: ReadonlySet<string> = new Set(["water", "lava"]);

/**
 * How each flowing terrain moves, in GLSL, from the point's place on the board (`aohW`, world x and z)
 * and the time (`aohT`): `aohShift` slides the painting about (texture units), and `aohGlow` scales
 * the glow. Positions on the board, not on the tile, drive it, so neighbouring tiles move together
 * whichever way their pictures are turned.
 */
const FLOWS: Record<string, string> = {
  // Ripples: a slow swell with a quicker shimmer on top.
  water: `
    aohShift = 0.012 * vec2(sin(aohW.x * 1.7 + aohW.y * 0.6 + aohT * 1.1), cos(aohW.y * 1.9 - aohW.x * 0.5 + aohT * 0.9))
             + 0.005 * vec2(sin(aohW.y * 4.3 + aohT * 2.1), cos(aohW.x * 3.7 + aohT * 1.7));
    aohGlow = 1.0;`,
  // Lava creeps slowly and its cracks brighten and dim in waves across the pool.
  lava: `
    aohShift = 0.01 * vec2(sin(aohW.x * 0.9 + aohT * 0.35), cos(aohW.y * 0.8 + aohT * 0.3));
    aohGlow = 0.8 + 0.35 * (0.5 + 0.5 * sin(aohT * 1.3 + aohW.x * 1.1 + aohW.y * 0.7));`,
};

/**
 * A flowing terrain's shaders, edited so the painting slides and the glow breathes: the vertex
 * shader passes on each point's place on the board, and the fragment shader moves every texture
 * look-up by `aohShift` and scales the glow by `aohGlow`. Null for a terrain that does not flow.
 * Pure, so a test can check the edits still find their places in three.js's own shaders.
 */
export function flowShaders(terrainId: string, vertexShader: string, fragmentShader: string): { vertexShader: string; fragmentShader: string } | null {
  const flow = FLOWS[terrainId];
  if (!flow) return null;
  const uv = (chunk: string) => chunk.replace(/v(Map|NormalMap|BumpMap|EmissiveMap)Uv\b/g, "(v$1Uv + aohShift)");
  return {
    vertexShader: vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vAohWorld;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 aohAt = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          aohAt = instanceMatrix * aohAt;
        #endif
        vAohWorld = (modelMatrix * aohAt).xz;`,
      ),
    fragmentShader: fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uAohTime;\nvarying vec2 vAohWorld;\nvec2 aohShift;\nfloat aohGlow;")
      .replace("void main() {", `void main() {\n  vec2 aohW = vAohWorld; float aohT = uAohTime;${flow}`)
      .replace("#include <map_fragment>", uv(ShaderChunk.map_fragment))
      .replace("#include <bumpmap_pars_fragment>", uv(ShaderChunk.bumpmap_pars_fragment))
      .replace("#include <normal_fragment_maps>", uv(ShaderChunk.normal_fragment_maps))
      .replace("#include <emissivemap_fragment>", `${uv(ShaderChunk.emissivemap_fragment)}\n  totalEmissiveRadiance *= aohGlow;`),
  };
}

/** Make a material move as its terrain flows (`flowShaders`), on the clock `FLOW_TIME`. */
function flowing(material: MeshPhysicalMaterial, terrainId: string): void {
  if (!FLOWS[terrainId]) return;
  material.onBeforeCompile = (shader) => {
    const edited = flowShaders(terrainId, shader.vertexShader, shader.fragmentShader);
    if (!edited) return;
    shader.uniforms.uAohTime = FLOW_TIME;
    shader.vertexShader = edited.vertexShader;
    shader.fragmentShader = edited.fragmentShader;
  };
  material.customProgramCacheKey = () => `aoh-flow-${terrainId}`;
}

/**
 * A normal map worked out from a height map, so the relief catches the key light (high quality).
 * `strength` is how steep a full step from black to white is, across one painter's pixel.
 */
export function normalsFrom(height: HTMLCanvasElement, k: number, strength: number): HTMLCanvasElement {
  const w = height.width, h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  // One channel of the height map, as 0 to 1.
  const v = new Float32Array(w * h);
  for (let i = 0; i < v.length; i++) v[i] = src[i * 4]! / 255;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const g = out.getContext("2d")!;
  const img = g.createImageData(w, h);
  const d = img.data;
  // A painter's pixel is k canvas pixels across, so a slope measured per canvas pixel is k times too gentle.
  const s = (strength * k) / 8;
  for (let y = 0; y < h; y++) {
    // The edges wrap round, as the side textures do.
    const up = ((y + h - 1) % h) * w, row = y * w, down = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const l = (x + w - 1) % w, r = (x + 1) % w;
      const dx = v[up + r]! + 2 * v[row + r]! + v[down + r]! - v[up + l]! - 2 * v[row + l]! - v[down + l]!;
      const dy = v[down + l]! + 2 * v[down + x]! + v[down + r]! - v[up + l]! - 2 * v[up + x]! - v[up + r]!;
      const nx = -dx * s, ny = dy * s;
      const n = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (row + x) * 4;
      d[i] = (nx * n * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * n * 0.5 + 0.5) * 255;
      d[i + 2] = (n * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return out;
}

/** How steep the normal maps make the relief, for a terrain finish's bump depth. */
const RELIEF = 140;

const cache = new Map<string, Material[] | null>();

/**
 * The detailed look's [sides, top] materials for a terrain, or null for a terrain with no art.
 * At high quality (`high`) the textures are painted at twice the size, the relief is a normal map
 * that catches the key light, and water and lava move (`FLOW_TIME`).
 */
export function detailedMaterials(terrainId: string, anisotropy: number, high = false): Material[] | null {
  const id = `${terrainId}:${high ? "high" : "low"}`;
  if (cache.has(id)) return cache.get(id)!;
  const k = high ? SHARP : 1;
  const art = tileArt(terrainId, k);
  if (!art) {
    cache.set(id, null);
    return null;
  }
  const texture = (canvas: HTMLCanvasElement, color: boolean, around: boolean) => {
    const t = new CanvasTexture(canvas);
    if (color) t.colorSpace = SRGBColorSpace;
    t.anisotropy = anisotropy;
    // The side texture goes once round each of the six faces.
    if (around) {
      t.wrapS = RepeatWrapping;
      t.repeat.set(6, 1);
    }
    return t;
  };
  const make = (s: Surface, around: boolean) => {
    const relief = high
      ? { normalMap: texture(normalsFrom(s.height, k, art.finish.bump * RELIEF * (around ? 0.5 : 1)), false, around) }
      : { bumpMap: texture(s.height, false, around), bumpScale: around ? art.finish.bump * 0.4 : art.finish.bump };
    const m = new MeshPhysicalMaterial({
      color: TINT,
      map: texture(s.color, true, around),
      ...relief,
      roughness: art.finish.roughness,
      metalness: 0,
      clearcoat: art.finish.clearcoat,
      clearcoatRoughness: 0.35,
      // Lava's cracks give off their own light.
      ...(s.glowing ? { emissive: new Color(0xffffff), emissiveMap: texture(s.glow, true, around), emissiveIntensity: 1.2 } : {}),
      // Pushed back a little, so the outlines drawn on the tile's edges stay on top.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    if (high) flowing(m, terrainId);
    return m;
  };
  const materials = [make(art.side, true), make(art.top, false)];
  cache.set(id, materials);
  return materials;
}
