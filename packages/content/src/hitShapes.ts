import { decodeHitShapes, type HitShapes } from "@aoh/rules";
import data from "./hitShapes.json";

/**
 * Each unit's hit shapes, one per pose, for games with hit zones: boxes made from its detailed
 * model by `apps/client/test/hitShapes.test.ts` (see docs/CONTENT.md).
 */
export const HIT_SHAPES: HitShapes = decodeHitShapes(data as Record<string, number[][]>);
