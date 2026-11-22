import {
  MAX_BUDGET,
  hexSchema,
  mapSchema,
  type Command,
  type GameEvent,
  type GameSetup,
  type GameState,
  type MapDefinition,
  type Phase,
  type PlayerView,
  type TokenAssignment,
  tokenIdsFor,
} from "@aoh/rules";
import { z } from "zod";

/**
 * The online protocol: JSON messages over a WebSocket. Clients send
 * requests; the server owns the game and answers with what each person is
 * allowed to see. Every client message is validated here before the server
 * touches it.
 */

export const PROTOCOL_VERSION = 1;
export const MAX_NAME_LENGTH = 24;

// ---------------------------------------------------------------------------
// Commands (structure only; the rules engine checks whether they are legal)

const id = z.string().min(1).max(64);
const stepSchema = z.object({
  hex: hexSchema,
  elevation: z.number().int().min(0).max(100),
  rotation: z.number().int().min(0).max(5).optional(),
});

export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draftPick"), player: id, cardId: id }),
  z.object({ type: z.literal("draftPass"), player: id }),
  z.object({ type: z.literal("rollInitiative"), player: id }),
  z.object({
    type: z.literal("deployUnit"),
    player: id,
    unitId: id,
    placements: z.array(stepSchema.extend({ figureId: id })).max(20),
  }),
  z.object({
    type: z.literal("placeTokens"),
    player: id,
    // Token "1" up to the player's count, and "X": every one in older games; under the "onePerUnit" rule, one for each of the player's units.
    tokens: z.record(z.string().regex(/^([1-9][0-9]?|X)$/), id).refine((t) => Object.keys(t).length <= 100),
  }),
  z.object({ type: z.literal("move"), player: id, figureId: id, path: z.array(stepSchema).min(1).max(64) }),
  z.object({ type: z.literal("attack"), player: id, figureId: id, targetId: id, ability: id.optional(), aim: hexSchema.optional() }),
  z.object({ type: z.literal("blast"), player: id, figureId: id, ability: id, at: stepSchema.omit({ rotation: true }) }),
  z.object({ type: z.literal("endTurn"), player: id }),
  z.object({ type: z.literal("face"), player: id, figureId: id, facing: z.number().int().min(0).max(359) }),
  z.object({
    type: z.literal("useGlyph"),
    player: id,
    glyphId: id,
    unitId: id,
    placements: z.array(stepSchema.extend({ figureId: id })).max(20).optional(),
  }),
  z.object({ type: z.literal("concede"), player: id }),
]);

// ---------------------------------------------------------------------------
// Rooms

export const roomSettingsSchema = z.object({
  roundLimit: z.number().int().min(1).max(50).nullable(),
  /** Each player's points budget; null means no limit. */
  budget: z.number().int().min(50).max(MAX_BUDGET).nullable().optional(),
  factionPure: z.boolean().optional(),
  /** Glyphs scattered on the battlefield, 0 to 11. */
  glyphs: z.number().int().min(0).max(11).optional(),
  map: mapSchema,
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

// ---------------------------------------------------------------------------
// Replays

/** Why an older game file cannot be played any more. */
export const BASIC_RULES_GONE = "This game used the Basic rules, which are no longer in the game.";
export const CARD_DRAFT_GONE = "This game drafted a set number of cards per player, which is no longer in the game.";

const setupSchema = z
  .object({
    /** Older files name their rule set: "basic" or "advanced". */
    mode: z.string().optional(),
    seed: z.number().int(),
    mapId: z.string().min(1),
    roundLimit: z.number().int().nullable().optional(),
    players: z.array(z.object({ id, name: z.string().min(1), color: z.string().min(1) })).min(2).max(6),
    armies: z.record(z.string(), z.array(z.string())).optional(),
    /** Older files: cards per player in a card-count draft. */
    armySize: z.number().int().optional(),
    budget: z.number().int().nullable().optional(),
    factionPure: z.boolean().optional(),
    /** Online games: everyone drafts at once, and each player rolls their own initiative. Older files leave these out. */
    draft: z.enum(["snake", "open"]).optional(),
    initiative: z.enum(["auto", "players"]).optional(),
    /** New games: at most one activation token on each unit. Older files leave it out. */
    tokenRule: z.enum(["stack", "onePerUnit"]).optional(),
    /** How many glyphs are scattered on the battlefield; older files leave it out (none). */
    glyphs: z.number().int().min(0).max(11).optional(),
    /** New games: figures face a way. Older files leave it out (no facing). */
    facing: z.boolean().optional(),
    /** New games: tokens for half each army, rounded up. Older files leave it out (three). */
    tokenAllowance: z.enum(["half"]).optional(),
    /** New games: swamp rolls a d20. Older files leave it out (an attack die). */
    swampRoll: z.enum(["d20"]).optional(),
    /** New games: zone of control. Older files leave it out. */
    zoneOfControl: z.boolean().optional(),
  })
  .superRefine((s, ctx) => {
    if (s.mode === "basic") ctx.addIssue({ code: "custom", path: ["mode"], message: BASIC_RULES_GONE });
    // An older file without a budget drafted by card count; files written now leave the rule set out.
    else if (s.mode !== undefined && !s.armies && s.budget === undefined) {
      ctx.addIssue({ code: "custom", path: ["armySize"], message: CARD_DRAFT_GONE });
    }
  })
  .transform(({ mode: _mode, armySize: _armySize, ...setup }) => setup);

export const replaySchema = z.object({
  formatVersion: z.literal(1),
  setup: setupSchema,
  map: mapSchema,
  commands: z.array(commandSchema),
  name: z.string().max(80).optional(),
  savedAt: z.string().max(40).optional(),
});

const nameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(MAX_NAME_LENGTH));
const codeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{4,8}$/));

/** A point on the board, in board coordinates (the same as `hexToWorld`). */
const coord = z.number().finite().min(-1000).max(1000);
const pingPointSchema = z.object({ x: coord, y: coord, z: coord }).strict();

/** The fewest milliseconds between two pings from one player. */
export const PING_INTERVAL_MS = 1000;

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create"), name: nameSchema, settings: roomSettingsSchema }),
  z.object({ t: z.literal("join"), code: codeSchema, name: nameSchema }),
  z.object({ t: z.literal("rejoin"), code: codeSchema, token: z.string().min(8).max(128) }),
  z.object({ t: z.literal("spectate"), code: codeSchema }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("command"), command: commandSchema }),
  z.object({ t: z.literal("leave") }),
  /** Open a room for a saved game, playing the chosen army. */
  z.object({ t: z.literal("resume"), record: replaySchema, playerId: id }),
  /** In a resumed room: take one of the saved armies. */
  z.object({ t: z.literal("claim"), playerId: id }),
  /** Host only: get the whole game as a file to resume later. */
  z.object({ t: z.literal("save") }),
  /** Point at a spot on the board for everyone else to see (the P key). Not part of the game: never saved or replayed. */
  z.object({ t: z.literal("ping"), at: pingPointSchema }),
  /**
   * This player has finished watching an attack show, or clicked to skip it. `show` is the
   * number of game events once the attack happened, which every player's log agrees on.
   */
  z.object({ t: z.literal("watched"), show: z.number().int().min(0) }),
]);
/** A client message. Commands are typed as the engine's own Command, which the schema checks the shape of. */
export type ClientMessage =
  | Exclude<z.infer<typeof clientMessageSchema>, { t: "command" } | { t: "resume" }>
  | { readonly t: "command"; readonly command: Command }
  | { readonly t: "resume"; readonly record: Replay; readonly playerId: string };

export interface RoomMember {
  readonly playerId: string;
  readonly name: string;
  readonly seat: number;
  readonly color: string;
  readonly connected: boolean;
  readonly host: boolean;
}

export interface RoomInfo {
  readonly code: string;
  readonly mapName: string;
  readonly roundLimit: number | null;
  readonly budget: number | null;
  readonly factionPure: boolean;
  /** Glyphs scattered on the battlefield. */
  readonly glyphs: number;
  readonly members: RoomMember[];
  readonly spectators: number;
  readonly started: boolean;
  /** Player counts the map can host. */
  readonly playerCounts: number[];
  /** A saved game waiting for its players to claim their armies; null for a new game. */
  readonly resume: ResumeInfo | null;
}

export interface ResumeInfo {
  /** The save's name, if it has one. */
  readonly name: string | null;
  readonly phase: Phase;
  readonly round: number;
  readonly armies: {
    readonly playerId: string;
    readonly name: string;
    readonly color: string;
    /** Someone in the room has claimed it. */
    readonly taken: boolean;
    /** Already out of the game; it does not need a player to continue. */
    readonly out: boolean;
  }[];
}

/**
 * The full record of a game: its setup, map and every command. Replaying the
 * commands rebuilds the game exactly, so the same file serves as a replay of a
 * finished game and as a save of one in progress.
 */
export interface Replay {
  readonly formatVersion: 1;
  readonly setup: GameSetup;
  readonly map: MapDefinition;
  readonly commands: Command[];
  /** Saves only: the name the players gave it. */
  readonly name?: string;
  /** Saves only: when it was saved (ISO 8601). */
  readonly savedAt?: string;
}

export type ServerMessage =
  | {
      /** You are in a room: as a player (with a token to rejoin later) or as a spectator. */
      readonly t: "welcome";
      readonly protocol: number;
      readonly code: string;
      readonly playerId: string | null;
      readonly token: string | null;
      readonly room: RoomInfo;
      readonly map: MapDefinition;
    }
  | { readonly t: "room"; readonly room: RoomInfo }
  | {
      /** The game as you may see it, and what just happened. */
      readonly t: "game";
      readonly view: PlayerView;
      readonly events: GameEvent[];
      /**
       * True for a full catch-up (after joining or reconnecting): `events` is then the whole
       * log so far rather than what one move did.
       */
      readonly snapshot: boolean;
    }
  | { readonly t: "replay"; readonly replay: Replay }
  /** The host's save of the game (sent only to the host, who asked for it). */
  | { readonly t: "saved"; readonly record: Replay }
  /** Another player pointed at this spot on the board (board coordinates). */
  | { readonly t: "ping"; readonly player: string; readonly at: { readonly x: number; readonly y: number; readonly z: number } }
  /**
   * Who is still watching an attack show (`show`: the number of game events once the attack happened).
   * Sent when the show starts and each time a player finishes or skips it. A show is skipped only
   * once every connected player has skipped or finished it: `waiting` is then empty.
   */
  | { readonly t: "watching"; readonly show: number; readonly waiting: string[] }
  | { readonly t: "error"; readonly message: string };

/** Read a replay file. Throws with a readable message if it is malformed. */
export function parseReplay(data: unknown): Replay {
  const parsed = replaySchema.safeParse(data);
  if (!parsed.success) {
    // A game from rules that are no longer in the game gets its own plain message.
    const gone = parsed.error.issues.find((i) => i.message === BASIC_RULES_GONE || i.message === CARD_DRAFT_GONE);
    if (gone) throw new Error(gone.message);
    const details = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`This is not a valid game file:\n${details.join("\n")}`);
  }
  return parsed.data as Replay;
}

// ---------------------------------------------------------------------------
// Views

/**
 * Turn a player's view back into a game state the client can render and run
 * rules queries on (reachable hexes, targets...). Hidden tokens become empty
 * strings, and the RNG is zero: neither is needed to show the game.
 */
export function stateFromView(view: PlayerView): GameState {
  const { viewer: _viewer, tokensPlaced, tokens, hiddenTokens, ...rest } = view;
  const full: Record<string, TokenAssignment | null> = {};
  for (const p of view.players) {
    if (!tokensPlaced[p.id]) {
      full[p.id] = null;
      continue;
    }
    const known = tokens[p.id] ?? {};
    // The viewer's own tokens are all known, placed or not; another player's hidden ones are blank.
    full[p.id] = p.id === view.viewer ? { ...known } : Object.fromEntries(tokenIdsFor(view, p.id).map((t) => [t, known[t] ?? ""]));
  }
  // Where the other players' hidden tokens lie (the units, not which token is which), for the table.
  return { ...rest, rng: 0, tokens: full, ...(hiddenTokens ? { hiddenTokens } : {}) };
}
