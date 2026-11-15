import { useSyncExternalStore } from "react";

const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

const subscribe = (onChange: () => void) => {
  const query = window.matchMedia?.(REDUCE_MOTION);
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
};

/** True when the player's system asks for less motion. */
export const motionReduced = (): boolean => window.matchMedia?.(REDUCE_MOTION).matches ?? false;

/**
 * Whether the player's system asks for reduced motion, kept up to date. Decorative
 * animations (the arrow's bob, the rings' pulse, tumbling dice) stand still then.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, motionReduced);
}
