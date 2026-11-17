import { useEffect, useRef } from "react";
import type { GameEvent } from "@aoh/rules";
import { SOUND_IDS, SOUNDS, pickFile, type SoundId } from "./soundEffects";
import { getDisplay } from "./settings";

/**
 * Plays the sound effects through the Web Audio API, so short sounds start at once and may
 * overlap. Browsers allow no sound before the player's first click or key, so the audio
 * starts then and the files load; a sound asked for before that is not heard.
 */

declare global {
  interface Window {
    /** How many times each sound has been asked for while sounds are on, for the browser tests. */
    __aohSfx?: () => Partial<Record<SoundId, number>>;
  }
}

const url = (file: string) => `${import.meta.env.BASE_URL}sfx/${file}.mp3`;

let audio: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const lastFile = new Map<SoundId, number>();
const lastAt = new Map<SoundId, number>();
const playing = new Map<SoundId, AudioBufferSourceNode>();
const asked: Partial<Record<SoundId, number>> = {};

function load(ctx: AudioContext): void {
  for (const id of SOUND_IDS) {
    for (const f of SOUNDS[id].files) {
      fetch(url(f.file))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => void buffers.set(f.file, buffer))
        .catch(() => {
          // A sound that will not load is left out; the game goes on without it.
        });
    }
  }
}

/** Starts the audio on the player's first click or key. */
function wake(): void {
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch {
      return;
    }
    load(audio);
  }
  if (audio.state === "suspended") void audio.resume().catch(() => {});
}

/** Plays one of a sound's files, if sounds are on. */
export function playSound(id: SoundId): void {
  const settings = getDisplay();
  if (!settings.sounds) return;
  const sound = SOUNDS[id];
  const now = performance.now();
  if (now - (lastAt.get(id) ?? -Infinity) < sound.gapMs) return;
  lastAt.set(id, now);
  asked[id] = (asked[id] ?? 0) + 1;
  if (!audio || audio.state !== "running" || document.hidden) return;
  const index = pickFile(sound.files.length, lastFile.get(id) ?? -1, Math.random);
  lastFile.set(id, index);
  const buffer = buffers.get(sound.files[index]!.file);
  if (!buffer) return;
  if (sound.exclusive) playing.get(id)?.stop();
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const gain = audio.createGain();
  // The slider is squared so its lower half is not all of the change.
  gain.gain.value = sound.gain * settings.soundsVolume * settings.soundsVolume;
  source.connect(gain).connect(audio.destination);
  source.onended = () => {
    if (playing.get(id) === source) playing.delete(id);
  };
  playing.set(id, source);
  source.start();
}

/** Mouse over: menu buttons and the unit cards in the draft and the gallery. */
const HOVER = ".main-menu button:not(:disabled), .draft-card, .unit-gallery-card";

let started = false;
/** Listens for the first click or key, and plays the hover and click sounds everywhere. */
export function startSounds(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("pointerdown", wake, true);
  window.addEventListener("keydown", wake, true);
  document.addEventListener(
    "pointerover",
    (e) => {
      if (e.pointerType === "touch") return;
      const target = e.target instanceof Element ? e.target.closest(HOVER) : null;
      if (!target) return;
      // Moving between the parts of one button or card is not a new hover.
      if (e.relatedTarget instanceof Node && target.contains(e.relatedTarget)) return;
      playSound("hover");
    },
    true,
  );
  document.addEventListener(
    "click",
    (e) => {
      const button = e.target instanceof Element ? e.target.closest("button") : null;
      if (button && !button.disabled) playSound("click");
    },
    true,
  );
  window.__aohSfx = () => ({ ...asked });
}

/**
 * Sounds for what a game command did that need no timing of their own: a new round, and a
 * unit drafted or deployed. A game that has just been opened or loaded plays nothing for the
 * events it arrived with.
 */
export function useEventSounds(events: readonly GameEvent[] | null, count: number | null): void {
  const seen = useRef<number | null>(null);
  useEffect(() => {
    if (events === null || count === null) {
      seen.current = null;
      return;
    }
    const before = seen.current;
    seen.current = count;
    if (before === null || count <= before) return;
    if (events.some((e) => e.type === "roundStarted")) playSound("round");
    if (events.some((e) => e.type === "cardDrafted" || e.type === "unitDeployed")) playSound("placed");
  }, [events, count]);
}
