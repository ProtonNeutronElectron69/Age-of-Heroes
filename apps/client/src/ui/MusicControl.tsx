import { useState } from "react";
import { createPortal } from "react-dom";
import { LICENCE_LINKS, MOODS, PLAYLISTS, type Mood } from "../musicTracks";
import { SOUND_IDS, SOUNDS } from "../soundEffects";
import { setDisplay, useDisplay } from "../settings";

/** One on/off box and its volume slider. */
function VolumeControl({ kind }: { kind: "music" | "sounds" }) {
  const display = useDisplay();
  const on = kind === "music" ? display.music : display.sounds;
  const volume = kind === "music" ? display.musicVolume : display.soundsVolume;
  const label = kind === "music" ? "Music" : "Sounds";
  return (
    <div className="music-control">
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => setDisplay(kind === "music" ? { music: e.target.checked } : { sounds: e.target.checked })} />
        {label}
      </label>
      <input
        type="range"
        aria-label={`${label} volume`}
        min={0}
        max={1}
        step={0.05}
        value={volume}
        disabled={!on}
        onChange={(e) => setDisplay(kind === "music" ? { musicVolume: Number(e.target.value) } : { soundsVolume: Number(e.target.value) })}
      />
    </div>
  );
}

/** Music and sound effects: each on or off, and how loud. Shown on the main menu and in the Display panel. */
export function SoundControls() {
  return (
    <>
      <VolumeControl kind="music" />
      <VolumeControl kind="sounds" />
    </>
  );
}

const MOOD_NAMES: Readonly<Record<Mood, string>> = { menu: "Menu", play: "During play", battle: "Battle", victory: "Victory" };

/** Opens the list of the music and the sound effects, with their licences. */
export function CreditsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="credits-button" onClick={() => setOpen(true)}>
        Credits
      </button>
      {open && <Credits onClose={() => setOpen(false)} />}
    </>
  );
}

function Credits({ onClose }: { onClose: () => void }) {
  // On the page itself: the menu's stage is scaled, which would shrink a panel drawn inside it.
  return createPortal(
    <div className="overlay page-overlay" role="dialog" aria-modal="true" aria-label="Credits" onClick={onClose}>
      <section className="panel credits" onClick={(e) => e.stopPropagation()}>
        <h2>Music</h2>
        {MOODS.map((mood) => (
          <div key={mood}>
            <h3>{MOOD_NAMES[mood]}</h3>
            <ul>
              {PLAYLISTS[mood].map((t) => (
                <li key={t.file}>
                  <a href={t.source} target="_blank" rel="noreferrer">
                    {t.title}
                  </a>{" "}
                  by {t.composer}
                  {t.site && ` (${t.site})`},{" "}
                  <a href={LICENCE_LINKS[t.licence]} target="_blank" rel="noreferrer">
                    {t.licence}
                  </a>
                  . {t.changes}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="muted small">Every track was re-encoded and set to the same loudness.</p>
        <h2>Sound effects</h2>
        {SOUND_IDS.map((id) => (
          <div key={id}>
            <h3>{SOUNDS[id].name}</h3>
            <ul>
              {SOUNDS[id].files.map((f) => (
                <li key={f.file}>
                  <a href={f.source} target="_blank" rel="noreferrer">
                    {f.title}
                  </a>{" "}
                  by {f.maker},{" "}
                  <a href={LICENCE_LINKS[f.licence]} target="_blank" rel="noreferrer">
                    {f.licence}
                  </a>
                  .{f.changes && ` ${f.changes}.`}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="muted small">Every sound was trimmed and set to a similar level.</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </section>
    </div>,
    document.body,
  );
}
