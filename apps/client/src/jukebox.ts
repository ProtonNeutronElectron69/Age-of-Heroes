import { MOODS, type Mood } from "./musicTracks";

/** The part of an `<audio>` element the jukebox uses, so tests can stand in for it. */
export interface AudioLike {
  src: string;
  volume: number;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  readonly ended: boolean;
  play(): Promise<void>;
  pause(): void;
}

/** How long one mood takes to fade out, and the next to fade in, by the mood being changed to. */
export const BLEND_MS: Readonly<Record<Mood | "silence", number>> = { menu: 1500, play: 1500, battle: 600, victory: 1000, silence: 400 };
/** A track fades out over its last seconds, and the next one fades in over as long. */
export const TRACK_FADE_MS = 2000;
/** The quiet between one track of a mood and the next. */
export const TRACK_GAP_MS = 2000;
/** How long to wait before trying again a track that would not load. */
export const RETRY_MS = 5000;
/** Moods that start again from their first track each time they come up; the others carry on from where they stopped. */
const FRESH: readonly Mood[] = ["victory"];

interface Channel {
  readonly audio: AudioLike;
  /** Which of the mood's tracks is loaded (-1 before the first). */
  index: number;
  /** 0 to 1: how far this mood has faded in. */
  level: number;
  /** Between two tracks: when the next one starts. */
  gapUntil: number | null;
  /** After a track would not load: when to try it again. */
  retryAt: number;
}

/**
 * Plays one mood's music at a time and blends between moods: the old mood fades out, then the new
 * one fades in. Inside a mood, each track fades out at its end, a short quiet follows, and the next
 * track fades in; a mood with one track plays it again the same way. A mood that is left keeps its
 * place and carries on from there when it returns.
 *
 * It holds no timers of its own: `tick(now)` moves everything on, so it can be tested with a clock.
 */
export class Jukebox {
  private readonly channels = new Map<Mood, Channel>();
  private wanted: Mood | null = null;
  private volume = 1;
  private last: number | null = null;
  /** The browser refused to play before the player's first click or key; `unblock` clears it. */
  blocked = false;

  constructor(
    private readonly files: Readonly<Record<Mood, readonly string[]>>,
    private readonly makeAudio: () => AudioLike,
  ) {}

  /** The mood to play, or null for silence. */
  setMood(mood: Mood | null): void {
    this.wanted = mood !== null && this.files[mood].length > 0 ? mood : null;
  }

  /** The loudest any track plays, 0 to 1. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  /** Call after the player's first click or key, when the browser lets sound start. */
  unblock(): void {
    this.blocked = false;
  }

  /** What is going on, for the tests. */
  status(): { mood: Mood | null; track: string | null; playing: boolean; level: number; blocked: boolean } {
    const c = this.wanted ? this.channels.get(this.wanted) : undefined;
    return {
      mood: this.wanted,
      track: c && c.index >= 0 ? this.files[this.wanted!][c.index]! : null,
      playing: !!c && !c.audio.paused,
      level: c ? c.level : 0,
      blocked: this.blocked,
    };
  }

  tick(now: number): void {
    const dt = this.last === null ? 0 : Math.max(0, now - this.last);
    this.last = now;
    const step = dt / BLEND_MS[this.wanted ?? "silence"];

    // Moods that are not wanted fade out first.
    let othersQuiet = true;
    for (const mood of MOODS) {
      const c = this.channels.get(mood);
      if (!c || mood === this.wanted) continue;
      if (c.level > 0) {
        c.level = Math.max(0, c.level - step);
        this.apply(c);
      }
      if (c.level > 0) othersQuiet = false;
      else if (!c.audio.paused) c.audio.pause();
    }
    if (!this.wanted || !othersQuiet || this.blocked) return;

    const mood = this.wanted;
    const files = this.files[mood];
    let c = this.channels.get(mood);
    if (!c) {
      c = { audio: this.makeAudio(), index: -1, level: 0, gapUntil: null, retryAt: 0 };
      this.channels.set(mood, c);
    }
    // Coming up from silence: some moods always open with their first track.
    if (c.level === 0 && c.audio.paused && c.index >= 0 && FRESH.includes(mood) && c.gapUntil === null) c.index = -1;
    if (c.index < 0) this.load(c, files, 0);

    if (c.gapUntil !== null) {
      if (now < c.gapUntil) return;
      this.load(c, files, (c.index + 1) % files.length);
    }
    if (c.audio.ended || this.left(c) <= 0) {
      // The track is over: a short quiet, then the next one.
      c.audio.pause();
      c.gapUntil = now + TRACK_GAP_MS;
      return;
    }
    if (c.audio.paused) {
      if (now < c.retryAt) return;
      this.start(c, now);
    }
    c.level = Math.min(1, c.level + step);
    this.apply(c);
  }

  private load(c: Channel, files: readonly string[], index: number): void {
    c.index = index;
    c.gapUntil = null;
    c.audio.src = files[index]!;
  }

  private start(c: Channel, now: number): void {
    c.audio.play().catch((e: unknown) => {
      const name = (e as { name?: string } | null)?.name;
      // No sound before the player's first click or key: wait for `unblock`.
      if (name === "NotAllowedError") this.blocked = true;
      // A pause that came before the track had started is nothing; a file that will not load is tried again later.
      else if (name !== "AbortError") c.retryAt = now + RETRY_MS;
    });
  }

  /** Milliseconds of the loaded track still to play; Infinity until the browser knows its length. */
  private left(c: Channel): number {
    const d = c.audio.duration;
    return Number.isFinite(d) && d > 0 ? (d - c.audio.currentTime) * 1000 : Infinity;
  }

  /** Sets the element's volume from the mood's level and the track's own fade in and fade out. */
  private apply(c: Channel): void {
    const fadeOut = Math.min(1, this.left(c) / TRACK_FADE_MS);
    // A track fades in over its first seconds; one picked up part way through only has the mood's blend.
    const fadeIn = Math.min(1, (c.audio.currentTime * 1000) / TRACK_FADE_MS);
    c.audio.volume = Math.min(1, Math.max(0, c.level * fadeIn * fadeOut * this.volume));
  }
}
