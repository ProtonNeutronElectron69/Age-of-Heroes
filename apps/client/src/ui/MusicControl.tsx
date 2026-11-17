import { useState } from "react";
import { createPortal } from "react-dom";
import { LICENCE_LINKS, MOODS, PLAYLISTS, type Mood } from "../musicTracks";
import { setDisplay, useDisplay } from "../settings";

/** Music on or off, and how loud. Shown on the main menu and in the Display panel. */
export function MusicControl() {
  const { music, musicVolume } = useDisplay();
  return (
    <div className="music-control">
      <label className="check">
        <input type="checkbox" checked={music} onChange={(e) => setDisplay({ music: e.target.checked })} />
        Music
      </label>
      <input
        type="range"
        aria-label="Music volume"
        min={0}
        max={1}
        step={0.05}
        value={musicVolume}
        disabled={!music}
        onChange={(e) => setDisplay({ musicVolume: Number(e.target.value) })}
      />
    </div>
  );
}

const MOOD_NAMES: Readonly<Record<Mood, string>> = { menu: "Menu", play: "During play", battle: "Battle", victory: "Victory" };

/** Opens the list of the music and its licences. */
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
        <button type="button" onClick={onClose}>
          Close
        </button>
      </section>
    </div>,
    document.body,
  );
}
