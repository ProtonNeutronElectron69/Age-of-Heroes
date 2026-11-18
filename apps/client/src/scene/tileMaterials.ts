import { LEVEL_HEIGHT, HEX_SIZE } from "@aoh/rules";
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
} from "three";
import { HEX_GAP } from "./scale";
import { tileArt, type Surface } from "./tileArt";

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

const cache = new Map<string, Material[] | null>();

/** The detailed look's [sides, top] materials for a terrain, or null for a terrain with no art. */
export function detailedMaterials(terrainId: string, anisotropy: number): Material[] | null {
  if (cache.has(terrainId)) return cache.get(terrainId)!;
  const art = tileArt(terrainId);
  if (!art) {
    cache.set(terrainId, null);
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
  const make = (s: Surface, around: boolean) =>
    new MeshPhysicalMaterial({
      color: TINT,
      map: texture(s.color, true, around),
      bumpMap: texture(s.height, false, around),
      bumpScale: around ? art.finish.bump * 0.4 : art.finish.bump,
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
  const materials = [make(art.side, true), make(art.top, false)];
  cache.set(terrainId, materials);
  return materials;
}
