import { ball, gear, limb, place } from "./build";
import type { Part, V3 } from "./types";

/** A spear from its butt to the tip of its leaf-shaped head. */
export function spear(butt: V3, tip: V3, thick = 0.015): Part[] {
  const neck: V3 = [tip[0] + (butt[0] - tip[0]) * 0.1, tip[1] + (butt[1] - tip[1]) * 0.1, tip[2] + (butt[2] - tip[2]) * 0.1];
  return gear([limb(butt, neck, thick, thick, 5), limb(neck, tip, thick * 3, 0, 4)]);
}

/** A round shield with a boss, centred on `at`. Unturned, its face looks along +z. */
export function roundShield(at: V3, radius: number, turn: V3 = [0, 0, 0]): Part[] {
  return gear(
    place([limb([0, 0, -0.02], [0, 0, 0.02], radius, radius * 0.9, 10), ball([0, 0, 0.03], [radius * 0.28, radius * 0.28, radius * 0.16], 0)], { at, turn }),
  );
}

/**
 * A flight stand, as on a tabletop miniature: a slim post from the base up to
 * `top`, for a figure that flies or hovers. It does not count towards the
 * figure's Height or its fit.
 */
export function flightStand(top: V3): Part[] {
  const [x, , z] = top;
  return [limb([x, 0, z], [x, 0.035, z], 0.1, 0.06, 6, "stand"), limb([x, 0.035, z], top, 0.036, 0.028, 5, "stand")];
}
