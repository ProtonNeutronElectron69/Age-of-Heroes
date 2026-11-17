import { describe, expect, it } from "vitest";
import { BLEND_MS, Jukebox, RETRY_MS, TRACK_FADE_MS, TRACK_GAP_MS, type AudioLike } from "../src/jukebox";
import { MOODS, PLAYLISTS } from "../src/musicTracks";

/** A stand-in for an `<audio>` element whose clock the test moves. */
class FakeAudio implements AudioLike {
  volume = 1;
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  private file = "";
  constructor(
    private readonly lengths: Record<string, number>,
    /** True, or the name of the error the browser refuses with. */
    private readonly mayPlay: () => true | string,
  ) {}
  get src() {
    return this.file;
  }
  set src(file: string) {
    this.file = file;
    this.currentTime = 0;
    this.duration = this.lengths[file]!;
    this.paused = true;
    this.ended = false;
  }
  play() {
    const refusal = this.mayPlay();
    if (refusal !== true) return Promise.reject(Object.assign(new Error(refusal), { name: refusal }));
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  advance(ms: number) {
    if (this.paused) return;
    this.currentTime = Math.min(this.duration, this.currentTime + ms / 1000);
    if (this.currentTime >= this.duration) {
      this.ended = true;
      this.paused = true;
    }
  }
}

const LENGTHS = { a1: 10, a2: 8, b1: 6, v1: 5 };
const FILES = { menu: ["a1", "a2"], play: [], battle: ["b1"], victory: ["v1"] };
const STEP = 50;

function setup(mayPlay: () => true | string = () => true) {
  const audios: FakeAudio[] = [];
  const box = new Jukebox(FILES, () => {
    const a = new FakeAudio(LENGTHS, mayPlay);
    audios.push(a);
    return a;
  });
  let now = 0;
  /** Lets time pass, as the page's timer and the browser's playback would. */
  const run = (ms: number) => {
    for (let t = 0; t < ms; t += STEP) {
      now += STEP;
      for (const a of audios) a.advance(STEP);
      box.tick(now);
    }
  };
  box.tick(now);
  return { box, audios, run };
}

describe("the music player", () => {
  it("fades a mood in from silence", () => {
    const { box, audios, run } = setup();
    box.setMood("menu");
    run(STEP * 2);
    expect(box.status()).toMatchObject({ mood: "menu", track: "a1", playing: true });
    expect(audios[0]!.volume).toBeLessThan(0.2);
    run(TRACK_FADE_MS + BLEND_MS.menu);
    expect(audios[0]!.volume).toBe(1);
  });

  it("fades a track out at its end, waits, then fades the next one in, and goes round", () => {
    const { box, audios, run } = setup();
    box.setMood("menu");
    run(9000);
    // One second from the end of a ten second track: half way through its fade out.
    expect(audios[0]!.volume).toBeGreaterThan(0.3);
    expect(audios[0]!.volume).toBeLessThan(0.7);
    run(1000 + 3 * STEP);
    expect(box.status().playing).toBe(false);
    run(TRACK_GAP_MS - 6 * STEP);
    expect(box.status()).toMatchObject({ track: "a1", playing: false });
    run(10 * STEP);
    expect(box.status()).toMatchObject({ track: "a2", playing: true });
    expect(audios[0]!.volume).toBeLessThan(0.3);
    run(8000 + TRACK_GAP_MS + 10 * STEP);
    expect(box.status()).toMatchObject({ track: "a1", playing: true });
  });

  it("plays a mood's only track again after the same quiet", () => {
    const { box, run } = setup();
    box.setMood("battle");
    run(6000 + 3 * STEP);
    expect(box.status().playing).toBe(false);
    run(TRACK_GAP_MS + 2 * STEP);
    expect(box.status()).toMatchObject({ track: "b1", playing: true });
  });

  it("fades the old mood out before the new one comes in, and keeps the old one's place", () => {
    const { box, audios, run } = setup();
    box.setMood("menu");
    run(4000);
    box.setMood("battle");
    run(BLEND_MS.battle / 2);
    expect(audios[0]!.paused).toBe(false);
    expect(audios[0]!.volume).toBeLessThan(1);
    expect(audios.length).toBe(1);
    run(BLEND_MS.battle / 2 + 2 * STEP);
    expect(audios[0]!.paused).toBe(true);
    expect(box.status()).toMatchObject({ mood: "battle", track: "b1", playing: true });
    const left = audios[0]!.currentTime;
    run(1000);
    box.setMood("menu");
    run(BLEND_MS.menu + 4 * STEP);
    expect(box.status()).toMatchObject({ mood: "menu", track: "a1", playing: true });
    expect(audios[0]!.currentTime).toBeGreaterThan(left);
    expect(audios[0]!.currentTime).toBeLessThan(left + 1);
  });

  it("starts the victory music from its beginning each time", () => {
    const { box, audios, run } = setup();
    box.setMood("victory");
    run(3000);
    box.setMood("menu");
    run(3000);
    box.setMood("victory");
    run(BLEND_MS.victory + 4 * STEP);
    const victory = audios[0]!;
    expect(victory.paused).toBe(false);
    expect(victory.currentTime).toBeLessThan(1.5);
  });

  it("goes quiet for no mood and for a mood without tracks, and follows the volume", () => {
    const { box, audios, run } = setup();
    box.setVolume(0.5);
    box.setMood("menu");
    run(5000);
    expect(audios[0]!.volume).toBe(0.5);
    box.setMood("play");
    expect(box.status().mood).toBeNull();
    run(BLEND_MS.silence + 2 * STEP);
    expect(audios[0]!.paused).toBe(true);
  });

  it("waits for the player's first click when the browser will not play", async () => {
    let allowed = false;
    const { box, run } = setup(() => allowed || "NotAllowedError");
    box.setMood("menu");
    run(STEP);
    await Promise.resolve();
    expect(box.status()).toMatchObject({ playing: false, blocked: true });
    allowed = true;
    box.unblock();
    run(2 * STEP);
    expect(box.status()).toMatchObject({ playing: true, blocked: false });
  });
});

describe("a track that will not load", () => {
  it("is tried again later, not on every tick, and does not wait for a click", async () => {
    let tries = 0;
    let works = false;
    const { box, run } = setup(() => {
      tries++;
      return works || "NotSupportedError";
    });
    box.setMood("menu");
    run(STEP);
    await Promise.resolve();
    run(RETRY_MS / 2);
    expect(tries).toBe(1);
    expect(box.status().blocked).toBe(false);
    works = true;
    run(RETRY_MS / 2 + 2 * STEP);
    expect(box.status().playing).toBe(true);
  });
});

describe("the music list", () => {
  it("has a title, a composer and a source for every track, and no file twice", () => {
    const files = new Set<string>();
    for (const mood of MOODS) {
      expect(PLAYLISTS[mood].length).toBeGreaterThan(0);
      for (const t of PLAYLISTS[mood]) {
        expect(files.has(t.file)).toBe(false);
        files.add(t.file);
        expect(t.title && t.composer).toBeTruthy();
        expect(t.source).toMatch(/^https:\/\//);
      }
    }
  });

  it("matches the files in public/music", async () => {
    const { readdirSync } = await import("node:fs");
    const onDisk = readdirSync(new URL("../public/music", import.meta.url)).filter((f) => f.endsWith(".mp3")).sort();
    const listed = MOODS.flatMap((m) => PLAYLISTS[m].map((t) => `${t.file}.mp3`)).sort();
    expect(onDisk).toEqual(listed);
  });
});
