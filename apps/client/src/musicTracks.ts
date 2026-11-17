/** The four places music plays: the menus, a game in play, around attacks, and the victory screen. */
export type Mood = "menu" | "play" | "battle" | "victory";

/** One piece of music in `public/music`, with what its licence asks us to say. */
export interface Track {
  /** The file in `public/music`, without ".mp3". */
  readonly file: string;
  readonly title: string;
  readonly composer: string;
  readonly licence: "CC0" | "CC-BY 3.0" | "CC-BY 4.0";
  /** Where the track was published under that licence. */
  readonly source: string;
  /** The composer's own site, when their credit line asks for it. */
  readonly site?: string;
  /** What we changed, as the CC-BY licences ask us to say. */
  readonly changes?: string;
}

const OGA = "https://opengameart.org/content/";
const INCOMPETECH = "https://incompetech.com/music/royalty-free/music.html";

/**
 * The music for each mood, in playing order. A mood with several tracks plays them in turn.
 * Every file was re-encoded and set to the same loudness; `changes` lists anything more.
 */
export const PLAYLISTS: Readonly<Record<Mood, readonly Track[]>> = {
  menu: [
    {
      file: "fall-of-arcana",
      title: "The Fall of Arcana",
      composer: "Matthew Pablo",
      licence: "CC-BY 3.0",
      source: `${OGA}the-fall-of-arcana-epic-game-theme-music`,
      site: "www.matthewpablo.com",
    },
    { file: "for-the-king", title: "For the King", composer: "Alexandr Zhelanov", licence: "CC-BY 4.0", source: `${OGA}for-the-king` },
  ],
  play: [
    {
      file: "woodland-fantasy",
      title: "Woodland Fantasy",
      composer: "Matthew Pablo",
      licence: "CC-BY 3.0",
      source: `${OGA}woodland-fantasy`,
      site: "www.matthewpablo.com",
    },
    {
      file: "old-tower-inn",
      title: "Medieval: The Old Tower Inn",
      composer: "RandomMind",
      licence: "CC0",
      source: `${OGA}medieval-the-old-tower-inn`,
      changes: "The loop plays twice.",
    },
    { file: "teller-of-the-tales", title: "Teller of the Tales", composer: "Kevin MacLeod", licence: "CC-BY 4.0", source: INCOMPETECH, site: "incompetech.com" },
  ],
  battle: [
    { file: "battle-theme-a", title: "Battle Theme A", composer: "cynicmusic", licence: "CC0", source: `${OGA}battle-theme-a` },
    { file: "battle-theme", title: "Battle Theme", composer: "Wolfgang_", licence: "CC0", source: `${OGA}battle-theme-0` },
    {
      file: "clash-defiant",
      title: "Clash Defiant",
      composer: "Kevin MacLeod",
      licence: "CC-BY 4.0",
      source: INCOMPETECH,
      site: "incompetech.com",
      changes: "Cut to its first 72 seconds, with a fade out.",
    },
  ],
  victory: [
    {
      file: "cant-stop-winning",
      title: "Can't Stop Winning",
      composer: "Jonathan Shaw",
      licence: "CC-BY 3.0",
      source: `${OGA}cant-stop-winning-rpg-orchestral-essentials-battle-victory-music`,
      site: "www.jshaw.co.uk",
    },
  ],
};

/** Where each licence is written out. */
export const LICENCE_LINKS: Readonly<Record<Track["licence"], string>> = {
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC-BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
};

export const MOODS: readonly Mood[] = ["menu", "play", "battle", "victory"];
