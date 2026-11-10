import {
  hexSchema,
  mapSchema,
  type Command,
  type GameEvent,
  type GameSetup,
  type GameState,
  type MapDefinition,
  type PlayerView,
  type RulesMode,
  type TokenAssignment,
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
  z.object({
    type: z.literal("deployUnit"),
    player: id,
    unitId: id,
    placements: z.array(stepSchema.extend({ figureId: id })).max(20),
  }),
  z.object({
    type: z.literal("placeTokens"),
    player: id,
    tokens: z.object({ "1": id, "2": id, "3": id, X: id }).strict(),
  }),
  z.object({ type: z.literal("move"), player: id, figureId: id, path: z.array(stepSchema).min(1).max(64) }),
  z.object({ type: z.literal("attack"), player: id, figureId: id, targetId: id, ability: id.optional() }),
  z.object({ type: z.literal("endTurn"), player: id }),
  z.object({ type: z.literal("concede"), player: id }),
]);

// ---------------------------------------------------------------------------
// Rooms

export const roomSettingsSchema = z.object({
  mode: z.enum(["basic", "advanced"]),
  roundLimit: z.number().int().min(1).max(50).nullable(),
  armySize: z.number().int().min(1).max(4).optional(),
  budget: z.number().int().min(50).max(2000).optional(),
  factionPure: z.boolean().optional(),
  map: mapSchema,
});
export type RoomSettings = z.infer<typeof roomSettingsSchema>;

const nameSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(MAX_NAME_LENGTH));
const codeSchema = z
  .string()
  .transform((s) => s.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z]{4,8}$/));

export const clientMessageSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("create"), name: nameSchema, settings: roomSettingsSchema }),
  z.object({ t: z.literal("join"), code: codeSchema, name: nameSchema }),
  z.object({ t: z.literal("rejoin"), code: codeSchema, token: z.string().min(8).max(128) }),
  z.object({ t: z.literal("spectate"), code: codeSchema }),
  z.object({ t: z.literal("start") }),
  z.object({ t: z.literal("command"), command: commandSchema }),
  z.object({ t: z.literal("leave") }),
]);
/** A client message. Commands are typed as the engine's own Command, which the schema checks the shape of. */
export type ClientMessage =
  | Exclude<z.infer<typeof clientMessageSchema>, { t: "command" }>
  | { readonly t: "command"; readonly command: Command };

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
  readonly mode: RulesMode;
  readonly roundLimit: number | null;
  readonly armySize: number | null;
  readonly budget: number | null;
  readonly factionPure: boolean;
  readonly members: RoomMember[];
  readonly spectators: number;
  readonly started: boolean;
  /** Player counts the map can host. */
  readonly playerCounts: number[];
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
      /** True when this is a full catch-up (after joining or reconnecting) rather than one move. */
      readonly snapshot: boolean;
    }
  | { readonly t: "replay"; readonly replay: Replay }
  | { readonly t: "error"; readonly message: string };

// ---------------------------------------------------------------------------
// Replays

const setupSchema = z.object({
  mode: z.enum(["basic", "advanced"]),
  seed: z.number().int(),
  mapId: z.string().min(1),
  roundLimit: z.number().int().nullable().optional(),
  players: z.array(z.object({ id, name: z.string().min(1), color: z.string().min(1) })).min(2).max(6),
  armies: z.record(z.string(), z.array(z.string())).optional(),
  armySize: z.number().int().optional(),
  budget: z.number().int().optional(),
  factionPure: z.boolean().optional(),
});

export const replaySchema = z.object({
  formatVersion: z.literal(1),
  setup: setupSchema,
  map: mapSchema,
  commands: z.array(commandSchema),
  name: z.string().max(80).optional(),
  savedAt: z.string().max(40).optional(),
});

/** Read a replay file. Throws with a readable message if it is malformed. */
export function parseReplay(data: unknown): Replay {
  const parsed = replaySchema.safeParse(data);
  if (!parsed.success) {
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
  const { viewer: _viewer, tokensPlaced, tokens, ...rest } = view;
  const full: Record<string, TokenAssignment | null> = {};
  for (const p of view.players) {
    if (!tokensPlaced[p.id]) {
      full[p.id] = null;
      continue;
    }
    const known = tokens[p.id] ?? {};
    full[p.id] = { "1": known["1"] ?? "", "2": known["2"] ?? "", "3": known["3"] ?? "", X: known.X ?? "" };
  }
  return { ...rest, rng: 0, tokens: full };
}
