import { useEffect } from "react";
import { Jukebox } from "./jukebox";
import { MOODS, PLAYLISTS, type Mood } from "./musicTracks";
import { getDisplay, subscribe } from "./settings";

/** What the screen in front of the player calls for. */
export type MusicScene = "menu" | "play" | "victory";

/** How long the battle music stays after an attack's show ends, so attacks close together share it. */
export const BATTLE_LINGER_MS = 12000;
/** How often the player moves its fades on. */
const TICK_MS = 50;

declare global {
  interface Window {
    /** The music now, for the browser tests. */
    __aohMusic?: () => { scene: MusicScene; mood: Mood | null; track: string | null; playing: boolean; level: number; blocked: boolean };
  }
}

const files = Object.fromEntries(
  MOODS.map((m) => [m, PLAYLISTS[m].map((t) => `${import.meta.env.BASE_URL}music/${t.file}.mp3`)]),
) as unknown as Record<Mood, string[]>;

let jukebox: Jukebox | null = null;
let scene: MusicScene = "menu";
let attacking = false;
let battleUntil = 0;

function mood(now: number): Mood | null {
  if (!getDisplay().music || document.hidden) return null;
  if (scene === "play" && (attacking || now < battleUntil)) return "battle";
  return scene;
}

function tick(): void {
  if (!jukebox) return;
  const now = performance.now();
  const v = getDisplay().musicVolume;
  // The slider is squared so its lower half is not all of the change.
  jukebox.setVolume(v * v);
  jukebox.setMood(mood(now));
  jukebox.tick(now);
}

/** Starts the player the first time a screen asks for music. */
function ensure(): void {
  if (jukebox || typeof window === "undefined") return;
  jukebox = new Jukebox(files, () => {
    const audio = new Audio();
    audio.preload = "auto";
    return audio;
  });
  window.setInterval(tick, TICK_MS);
  subscribe(tick);
  document.addEventListener("visibilitychange", tick);
  // Browsers let sound start only after the player's first click or key.
  const unblock = () => {
    jukebox?.unblock();
    tick();
  };
  window.addEventListener("pointerdown", unblock, true);
  window.addEventListener("keydown", unblock, true);
  window.__aohMusic = () => ({ scene, ...jukebox!.status() });
}

/** Sets the music for the screen that calls it. */
export function useMusicScene(next: MusicScene): void {
  useEffect(() => {
    ensure();
    if (next !== "play") {
      attacking = false;
      battleUntil = 0;
    }
    scene = next;
    tick();
  }, [next]);
}

/** The play screen: battle music while an attack is shown, and for BATTLE_LINGER_MS after. */
export function useBattleMusic(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    attacking = true;
    tick();
    return () => {
      attacking = false;
      battleUntil = performance.now() + BATTLE_LINGER_MS;
    };
  }, [active]);
}
