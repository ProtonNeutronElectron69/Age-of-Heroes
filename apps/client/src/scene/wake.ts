import { useThree } from "@react-three/fiber";
import { useCallback } from "react";

/** A gap between frames longer than this means the board was resting, not just drawing slowly. */
const RESTING_MS = 250;

/**
 * Asks for a frame to start an animation. The play and replay boards are only
 * drawn when something changes (`frameloop="demand"`), so after a rest the
 * clock's next step would cover the whole rest and an animation would jump to
 * its end. Waking resets the clock first, so the animation starts from its
 * beginning. A running animation asks for its next frame with `invalidate`.
 */
export function useWake(): () => void {
  const invalidate = useThree((s) => s.invalidate);
  const clock = useThree((s) => s.clock);
  return useCallback(() => {
    if (clock.running && performance.now() - clock.oldTime > RESTING_MS) clock.getDelta();
    invalidate();
  }, [clock, invalidate]);
}
