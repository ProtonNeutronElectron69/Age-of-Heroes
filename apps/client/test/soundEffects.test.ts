import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOUND_IDS, SOUNDS, landingSound, pickFile } from "../src/soundEffects";

describe("picking a sound's file", () => {
  it("always takes the only file", () => {
    expect(pickFile(1, 0, () => 0.99)).toBe(0);
    expect(pickFile(1, -1, () => 0.5)).toBe(0);
  });

  it("can take any file the first time", () => {
    const seen = new Set([0, 0.34, 0.67, 0.999].map((r) => pickFile(3, -1, () => r)));
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("never takes the same file twice running, and can reach every other one", () => {
    for (let last = 0; last < 3; last++) {
      const picks = new Set([0, 0.25, 0.5, 0.75, 0.999].map((r) => pickFile(3, last, () => r)));
      expect(picks.has(last)).toBe(false);
      expect(picks.size).toBe(2);
    }
    expect(pickFile(2, 0, () => 0.1)).toBe(1);
    expect(pickFile(2, 1, () => 0.9)).toBe(0);
  });
});

describe("landing sounds", () => {
  it("splash in water and swamp, flare in lava, and tap elsewhere", () => {
    expect(landingSound("water")).toBe("water");
    expect(landingSound("swamp")).toBe("water");
    expect(landingSound("lava")).toBe("lava");
    expect(landingSound("grass")).toBe("hop");
    expect(landingSound(undefined)).toBe("hop");
  });
});

describe("the sound list", () => {
  it("credits every file, and keeps levels and gaps in range", () => {
    for (const id of SOUND_IDS) {
      const s = SOUNDS[id];
      expect(s.files.length).toBeGreaterThan(0);
      expect(s.gain).toBeGreaterThan(0);
      expect(s.gain).toBeLessThanOrEqual(1);
      for (const f of s.files) {
        expect(f.title && f.maker).toBeTruthy();
        expect(f.source).toMatch(/^https:\/\//);
      }
    }
  });

  it("matches the files in public/sfx", () => {
    const onDisk = readdirSync(new URL("../public/sfx", import.meta.url)).filter((f) => f.endsWith(".mp3")).sort();
    const listed = [...new Set(SOUND_IDS.flatMap((id) => SOUNDS[id].files.map((f) => `${f.file}.mp3`)))].sort();
    expect(onDisk).toEqual(listed);
  });
});
