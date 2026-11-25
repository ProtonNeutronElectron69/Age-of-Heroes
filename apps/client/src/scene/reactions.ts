/**
 * Short reactions a figure's drawing makes in a fight, at high graphics quality: the attacker's
 * lunge (a blow in melee) or kick (a shot from range) as the attack begins, a recoil when wounds
 * land, and a destroyed figure toppling before it leaves the board. Presentation only: the rules
 * have already settled the fight, and a figure's click target never moves.
 *
 * Pure (no DOM, no three.js): a pose at any moment, along a direction across the board.
 */

export type ReactionKind = "lunge" | "kick" | "recoil" | "topple";

/** How a figure's drawing is moved: along the reaction's direction, up, and tipped toward it (radians). */
export interface Pose {
  readonly push: number;
  readonly lift: number;
  readonly tilt: number;
}

export const REST: Pose = { push: 0, lift: 0, tilt: 0 };

/** How long each reaction takes, in seconds. A topple ends lying down, until the figure leaves. */
export const REACTION_SECONDS: Record<ReactionKind, number> = {
  lunge: 0.8,
  kick: 0.7,
  recoil: 0.6,
  topple: 0.6,
};

/** How far a topple tips: just short of flat, so a figure seems to land on its side. */
export const TOPPLE_TILT = Math.PI * 0.47;

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/** From `a` to `b` as time goes from `t0` to `t1`, eased at both ends. */
function ease(t: number, t0: number, t1: number, a: number, b: number): number {
  return a + (b - a) * smooth((t - t0) / (t1 - t0));
}

/**
 * The pose `t` seconds into a reaction. The direction is the caller's: toward the target for a
 * lunge or a kick, away from the attacker for a recoil or a topple. Every reaction but the topple
 * ends where it began.
 */
export function reactionPose(kind: ReactionKind, t: number): Pose {
  if (t <= 0) return REST;
  const end = REACTION_SECONDS[kind];
  if (kind === "topple") {
    // Tips slowly, then falls faster (as if under gravity), lands with a small bounce and stays down.
    const fall = 0.42;
    if (t < fall) {
      const u = t / fall;
      return { push: 0, lift: 0, tilt: TOPPLE_TILT * u * u };
    }
    const after = t - fall;
    const bounce = 0.12 * Math.exp(-after * 14) * Math.abs(Math.sin(after * 22));
    return { push: 0, lift: 0, tilt: TOPPLE_TILT - bounce };
  }
  if (t >= end) return REST;
  if (kind === "lunge") {
    // Draw back, strike forward, hold a moment, return.
    if (t < 0.18) return { push: ease(t, 0, 0.18, 0, -0.06), lift: 0, tilt: ease(t, 0, 0.18, 0, -0.1) };
    if (t < 0.3) return { push: ease(t, 0.18, 0.3, -0.06, 0.3), lift: ease(t, 0.18, 0.3, 0, 0.05), tilt: ease(t, 0.18, 0.3, -0.1, 0.24) };
    if (t < 0.42) return { push: 0.3, lift: ease(t, 0.3, 0.42, 0.05, 0), tilt: 0.24 };
    return { push: ease(t, 0.42, end, 0.3, 0), lift: 0, tilt: ease(t, 0.42, end, 0.24, 0) };
  }
  if (kind === "kick") {
    // A shot: lean back as it draws, a jolt back as it looses, then settle.
    if (t < 0.25) return { push: 0, lift: 0, tilt: ease(t, 0, 0.25, 0, -0.1) };
    if (t < 0.32) return { push: ease(t, 0.25, 0.32, 0, -0.1), lift: 0, tilt: ease(t, 0.25, 0.32, -0.1, -0.18) };
    return { push: ease(t, 0.32, end, -0.1, 0), lift: 0, tilt: ease(t, 0.32, end, -0.18, 0) };
  }
  // A recoil: knocked back and tipped away at once, then back on its feet with a small sway.
  if (t < 0.07) return { push: ease(t, 0, 0.07, 0, 0.22), lift: ease(t, 0, 0.07, 0, 0.05), tilt: ease(t, 0, 0.07, 0, 0.3) };
  const u = (t - 0.07) / (end - 0.07);
  const sway = Math.cos(u * Math.PI * 1.5) * (1 - u);
  return { push: 0.22 * Math.max(0, sway), lift: 0.05 * Math.max(0, 1 - u * 3), tilt: 0.3 * sway };
}
