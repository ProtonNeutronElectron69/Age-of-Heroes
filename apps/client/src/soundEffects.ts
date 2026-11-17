/** The game's sound effects: when each plays, and the files it picks from. */
export type SoundId =
  | "hop"
  | "water"
  | "lava"
  | "melee"
  | "ranged"
  | "dice"
  | "wounds"
  | "destroyed"
  | "round"
  | "placed"
  | "hover"
  | "click"
  | "ping";

/** One recording in `public/sfx`, with what its licence asks us to say. */
export interface SoundFile {
  /** The file in `public/sfx`, without ".mp3". */
  readonly file: string;
  readonly title: string;
  readonly maker: string;
  readonly licence: "CC0" | "CC-BY 3.0" | "CC-BY 4.0";
  /** Where it was published under that licence. */
  readonly source: string;
  /** What we changed beyond trimming silence and setting the level. */
  readonly changes?: string;
}

export interface Sound {
  /** What it is for, for the credits. */
  readonly name: string;
  /** One is picked at random each time, never the same twice running when there is a choice. */
  readonly files: readonly SoundFile[];
  /** How loud, 0 to 1, before the player's volume. Sounds heard all the time are kept quiet. */
  readonly gain: number;
  /** The fewest milliseconds between two plays; one asked for sooner is dropped. */
  readonly gapMs: number;
  /** A new play stops the one before (the long dice roll would otherwise pile up). */
  readonly exclusive?: boolean;
}

const OGA = "https://opengameart.org/content/";
const KENNEY_UI = { maker: "Kenney", licence: "CC0", source: `${OGA}51-ui-sound-effects-buttons-switches-and-clicks` } as const;
const KENNEY_CASINO = { maker: "Kenney", licence: "CC0", source: `${OGA}54-casino-sound-effects-cards-dice-chips` } as const;
const KENNEY_INTERFACE = { maker: "Kenney", licence: "CC0", source: `${OGA}interface-sounds` } as const;
const SWORDS = { maker: "StarNinjas", licence: "CC0", source: `${OGA}20-sword-sound-effects-attacks-and-clashes` } as const;
const JC = { maker: "JC Sounds", licence: "CC-BY 4.0", source: `${OGA}jc-sounds-fantasy-sfx-pack-vol-1` } as const;

export const SOUNDS: Readonly<Record<SoundId, Sound>> = {
  hop: { name: "A figure hops", gain: 0.55, gapMs: 40, files: [{ file: "piece-set-down", title: "chip-lay-3", ...KENNEY_CASINO }] },
  water: {
    name: "A figure lands in water or swamp",
    gain: 0.75,
    gapMs: 40,
    files: [{ file: "heavy-splash", title: "Water Splashes (splash1)", maker: "qubodup", licence: "CC-BY 3.0", source: `${OGA}water-splashes` }],
  },
  lava: { name: "A figure lands in lava", gain: 0.75, gapMs: 40, files: [{ file: "fireball-impact", title: "Fireball Impact 01", ...JC }] },
  melee: {
    name: "A melee attack begins",
    gain: 0.85,
    gapMs: 100,
    files: [
      { file: "sword-clash-ringing", title: "sword_clash.6", ...SWORDS },
      {
        file: "swing-then-clash",
        title: "swish-4 and sword_clash.4",
        maker: "artisticdude and StarNinjas",
        licence: "CC0",
        source: `${OGA}swishes-sound-pack`,
        changes: "A swish and a sword clash joined",
      },
      {
        file: "sword-on-shield",
        title: "sword_clash.1 and impact.3",
        maker: "StarNinjas",
        licence: "CC0",
        source: `${OGA}10-impactshield-blocks`,
        changes: "A sword clash laid over a shield block",
      },
    ],
  },
  ranged: {
    name: "A ranged attack begins",
    gain: 0.85,
    gapMs: 100,
    files: [
      { file: "bow-draw-then-shoot", title: "Bow Arrow Draw 01 and Bow Arrow Shoot 01", ...JC, changes: "The draw and the shot joined" },
      {
        file: "arrow-volley",
        title: "Archers shooting",
        maker: "copyc4t (Paolo D'Emilio), from sounds by Anton and Benboncan on Freesound",
        licence: "CC-BY 3.0",
        source: `${OGA}archers-shooting`,
      },
    ],
  },
  dice: {
    name: "Dice roll",
    gain: 0.8,
    gapMs: 150,
    exclusive: true,
    files: [
      { file: "dice-handful", title: "Multiple Dice Rolling", maker: "Justin Nichol", licence: "CC-BY 3.0", source: `${OGA}multiple-dice-rolling` },
      { file: "die-single", title: "die-throw-2", ...KENNEY_CASINO },
    ],
  },
  wounds: {
    name: "Wounds land",
    gain: 0.8,
    gapMs: 100,
    files: [{ file: "heavy-blow", title: "impact.7", maker: "StarNinjas", licence: "CC0", source: `${OGA}10-impactshield-blocks` }],
  },
  destroyed: {
    name: "A figure is destroyed",
    gain: 0.8,
    gapMs: 100,
    files: [{ file: "clatter", title: "bfh1_falling_01", maker: "rubberduck", licence: "CC0", source: `${OGA}75-cc0-breaking-falling-hit-sfx` }],
  },
  round: { name: "A round begins", gain: 0.7, gapMs: 500, files: [{ file: "gong", title: "gong_01", maker: "rubberduck", licence: "CC0", source: `${OGA}100-cc0-sfx` }] },
  placed: { name: "A unit is drafted or placed", gain: 0.7, gapMs: 100, files: [{ file: "card-placed", title: "card-place-1", ...KENNEY_CASINO }] },
  hover: { name: "Mouse over a menu button or unit card", gain: 0.35, gapMs: 60, files: [{ file: "tick", title: "tick_001", ...KENNEY_INTERFACE }] },
  click: { name: "A button is clicked", gain: 0.5, gapMs: 40, files: [{ file: "mouse-click", title: "mouseclick1", ...KENNEY_UI }] },
  ping: { name: "Another player pings", gain: 0.7, gapMs: 200, files: [{ file: "glass-ping", title: "glass_001", ...KENNEY_INTERFACE }] },
};

export const SOUND_IDS = Object.keys(SOUNDS) as SoundId[];

/**
 * Which of `count` files to play: any at random, but not `last` again when there is a choice.
 * `random` returns a number in [0, 1).
 */
export function pickFile(count: number, last: number, random: () => number): number {
  if (count <= 1) return 0;
  if (last < 0 || last >= count) return Math.min(count - 1, Math.floor(random() * count));
  const i = Math.min(count - 2, Math.floor(random() * (count - 1)));
  return i >= last ? i + 1 : i;
}

/** Which sound a figure makes landing on a hex of this terrain. */
export function landingSound(terrain: string | undefined): SoundId {
  if (terrain === "lava") return "lava";
  if (terrain === "water" || terrain === "swamp") return "water";
  return "hop";
}
