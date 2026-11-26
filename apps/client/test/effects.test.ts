import { describe, expect, it } from "vitest";
import { burst, burstSeconds, landingBurst, particleAt, type BurstKind, type ParticleNow } from "../src/scene/particles";
import { REACTION_SECONDS, REST, TOPPLE_TILT, reactionPose, type ReactionKind } from "../src/scene/reactions";

/**
 * The effects at high graphics quality: particle bursts and the figures' reactions in a fight.
 * Both are worked out in pure code, so these check that bursts are repeatable, stay above the
 * ground and end on time, and that reactions start and end at rest without jumps.
 */

const KINDS: BurstKind[] = ["sparks", "glint", "dust", "splash", "embers", "shatter", "heal"];
const AT = { x: 2, y: 0.6, z: -1 };
const now = (): ParticleNow => ({ x: 0, y: 0, z: 0, size: 0, alpha: 0 });

describe("particle bursts", () => {
  it("are the same for the same seed and differ for another", () => {
    for (const kind of KINDS) {
      expect(burst(kind, AT, 7)).toEqual(burst(kind, AT, 7));
      expect(burst(kind, AT, 7)).not.toEqual(burst(kind, AT, 8));
    }
  });

  it("stay above the ground they start from, show only while alive and end within the burst's time", () => {
    for (const kind of KINDS) {
      const end = burstSeconds(kind);
      for (const p of burst(kind, AT, 3, { scale: 1.5 })) {
        expect(p.delay + p.life).toBeLessThanOrEqual(end + 1e-9);
        expect(particleAt(p, end + 0.01, now())).toBeNull();
        expect(particleAt(p, p.delay - 0.01, now())).toBeNull();
        for (let t = p.delay; t < p.delay + p.life; t += 0.02) {
          const at = particleAt(p, t, now());
          if (!at) continue;
          expect(at.y).toBeGreaterThanOrEqual(AT.y);
          expect(at.alpha).toBeGreaterThanOrEqual(0);
          expect(at.alpha).toBeLessThanOrEqual(1);
          expect(at.size).toBeGreaterThan(0);
        }
      }
    }
  });

  it("lean the way they are thrown: sparks fly on in the direction of the blow", () => {
    const sparks = burst("sparks", AT, 11, { toward: { x: 1, z: 0 } });
    const across = sparks.reduce((n, p) => n + p.vx, 0) / sparks.length;
    expect(across).toBeGreaterThan(0.5);
    const even = burst("sparks", AT, 11);
    expect(Math.abs(even.reduce((n, p) => n + p.vx, 0) / even.length)).toBeLessThan(0.5);
  });

  it("grow with the figure, and take a colour or a tint when given one", () => {
    expect(burst("shatter", AT, 5, { scale: 2 }).length).toBeGreaterThan(burst("shatter", AT, 5).length);
    const snow = burst("dust", AT, 5, { colors: ["#ffffff"] });
    expect(snow.every((p) => p.r === 1 && p.g === 1 && p.b === 1)).toBe(true);
    const chips = burst("shatter", AT, 5, { tint: "#ff0000" });
    expect(chips.some((p) => p.r === 1 && p.g === 0 && p.b === 0)).toBe(true);
  });

  it("splash in water and swamp, throw embers on lava and raise dust elsewhere", () => {
    expect(landingBurst("water").kind).toBe("splash");
    expect(landingBurst("swamp").kind).toBe("splash");
    expect(landingBurst("lava").kind).toBe("embers");
    expect(landingBurst("grass")).toEqual({ kind: "dust" });
    expect(landingBurst("snow").colors?.length).toBeGreaterThan(0);
    expect(landingBurst(undefined).kind).toBe("dust");
  });
});

describe("figure reactions", () => {
  const MOVING: ReactionKind[] = ["lunge", "kick", "recoil"];

  it("start at rest, and every one but the topple ends at rest", () => {
    for (const kind of [...MOVING, "topple" as const]) expect(reactionPose(kind, 0)).toEqual(REST);
    for (const kind of MOVING) {
      const end = REACTION_SECONDS[kind];
      expect(reactionPose(kind, end)).toEqual(REST);
      const near = reactionPose(kind, end - 0.001);
      expect(Math.abs(near.push) + Math.abs(near.lift) + Math.abs(near.tilt)).toBeLessThan(0.02);
    }
  });

  it("move without jumps", () => {
    for (const kind of [...MOVING, "topple" as const]) {
      let last = reactionPose(kind, 0);
      for (let t = 0.002; t <= REACTION_SECONDS[kind] + 0.1; t += 0.002) {
        const pose = reactionPose(kind, t);
        expect(Math.abs(pose.push - last.push)).toBeLessThan(0.05);
        expect(Math.abs(pose.lift - last.lift)).toBeLessThan(0.05);
        expect(Math.abs(pose.tilt - last.tilt)).toBeLessThan(0.08);
        last = pose;
      }
    }
  });

  it("lunge toward the target and reel away from the attacker", () => {
    const strike = reactionPose("lunge", 0.35);
    expect(strike.push).toBeGreaterThan(0.2);
    expect(strike.tilt).toBeGreaterThan(0.1);
    expect(reactionPose("kick", 0.3).push).toBeLessThan(0);
    expect(reactionPose("recoil", 0.07).push).toBeGreaterThan(0.15);
  });

  it("topple to lie on its side and stay down", () => {
    const down = reactionPose("topple", REACTION_SECONDS.topple);
    expect(down.tilt).toBeGreaterThan(TOPPLE_TILT - 0.05);
    expect(reactionPose("topple", 5)).toEqual({ push: 0, lift: 0, tilt: TOPPLE_TILT });
  });
});
