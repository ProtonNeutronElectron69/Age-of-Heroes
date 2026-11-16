import { useThree } from "@react-three/fiber";

/**
 * What is moving on one board, shared by the parts of its scene: the figures
 * report their hops and the camera waits for them, so it only follows a unit
 * once that unit has finished moving. Browser tests read it through
 * `window.__aoh.cameraBusy()` to know when the camera is about to move.
 */
export interface BoardActivity {
  /** Figures hopping along a move right now, or about to. */
  readonly hopping: Set<string>;
  /** The camera has a glide to make, or is making one. */
  gliding: boolean;
  /** How many wound numbers this board has floated, for browser tests (`window.__aoh.woundsShown()`). */
  woundsShown: number;
}

const byScene = new WeakMap<object, BoardActivity>();

/** This canvas's activity record. */
export function useBoardActivity(): BoardActivity {
  const scene = useThree((s) => s.scene);
  let activity = byScene.get(scene);
  if (!activity) {
    activity = { hopping: new Set(), gliding: false, woundsShown: 0 };
    byScene.set(scene, activity);
  }
  return activity;
}
