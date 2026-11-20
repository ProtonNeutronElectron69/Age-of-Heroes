import type { Board } from "../board";
import type { DieFace } from "../dice";
import type { Hex } from "../hex";
import type { UnitCard } from "../schema";
import type { TerrainTable } from "../terrain";
import type { Tuning } from "../tuning";

export type PlayerId = string;

/**
 * Activation tokens (order markers): numbered turns "1", "2", ... and the "X" bluff. Older games
 * have three numbered tokens; under `tokenAllowance: "half"` each player has half their army's
 * cards, rounded up (`tokenIdsFor` in `queries.ts`).
 */
export type TokenId = string;
export type NumberedToken = string;
/** The tokens of games without `tokenAllowance`: three numbered turns and a bluff. */
export const TOKEN_IDS: readonly TokenId[] = ["1", "2", "3", "X"];
export const NUMBERED_TOKENS: readonly NumberedToken[] = ["1", "2", "3"];
/** The bluff token: placed like the others, but it gives no turn. */
export const BLUFF_TOKEN = "X";

/** Which unit holds each token. A token left out was not placed (only under the "onePerUnit" rule). */
export type TokenAssignment = Partial<Record<TokenId, string>>;

/** A standing spot: a hex plus the elevation of the surface in it. */
export interface Step {
  readonly hex: Hex;
  readonly elevation: number;
}

/**
 * One step of a move: where the figure's front hex goes, and for multi-hex
 * figures which way it faces (0 to 5, in 60 degree steps).
 */
export interface PathStep extends Step {
  readonly rotation?: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: string;
  /** Seat index; turns pass "to the left" in increasing seat order. */
  readonly seat: number;
  /** The map start zone this player deploys in. */
  readonly zone: number;
  eliminated: boolean;
  conceded: boolean;
}

export interface FigurePosition extends Step {
  /** Footprint rotation in 60 degree steps (multi-hex figures only). */
  readonly rotation: number;
}

export interface FigureState {
  readonly id: string;
  wounds: number;
  destroyed: boolean;
  /** null before deployment and after destruction. */
  position: FigurePosition | null;
  /**
   * Which way the figure faces, in degrees (games with `config.facing`): one of eight for a
   * single-hex figure, along its base for a larger one. See `facing.ts`.
   */
  facing?: number;
}

export interface UnitState {
  /** Unique within the game, e.g. "p1:0". */
  readonly id: string;
  readonly cardId: string;
  readonly owner: PlayerId;
  figures: FigureState[];
}

/** "initiative": every token is down and the round waits for each player to roll (`initiative: "players"` games only). */
export type Phase = "draft" | "deploy" | "placeTokens" | "initiative" | "turns" | "gameOver";

/**
 * How armies are drafted. "snake": one pick at a time, the order reversing
 * each round of picks. "open": everyone picks at once, and each card can be
 * drafted by one player only.
 */
export type DraftMode = "snake" | "open";

/**
 * How initiative is rolled. "auto": as soon as the last tokens are placed.
 * "players": each player rolls for themselves, and nobody's roll is made
 * (or seen) until every player has rolled.
 */
export type InitiativeMode = "auto" | "players";

/**
 * How activation tokens are placed. "stack": all four, and one unit may hold several (older
 * games). "onePerUnit": at most one token on each living unit, so a player with fewer than four
 * units places one token on each and leaves the rest off.
 */
export type TokenRule = "stack" | "onePerUnit";

/** How many numbered tokens a player has: "half" their starting army's cards, rounded up. */
export type TokenAllowance = "half";

/**
 * Glyphs: small tiles scattered face down on the battlefield. A figure that ends a move on one
 * picks it up. Traps act at once (`pit`, `curse`); the rest are held off the board and used later.
 */
export type GlyphKind =
  | "attack"
  | "defense"
  | "initiative"
  | "range"
  | "move"
  | "heal"
  | "summon"
  | "wound"
  | "negate"
  | "pit"
  | "curse";
export const GLYPH_KINDS: readonly GlyphKind[] = ["attack", "defense", "initiative", "range", "move", "heal", "summon", "wound", "negate", "pit", "curse"];
/** Glyphs that boost one card's stats while it lives. */
export const STAT_GLYPHS: readonly GlyphKind[] = ["attack", "defense", "initiative", "range", "move"];
/** Glyphs that act on the figure that picks them up. */
export const TRAP_GLYPHS: readonly GlyphKind[] = ["pit", "curse"];

export interface GlyphState {
  /** Glyphs still on the battlefield. `kind` is null where the viewer may not know it. */
  onBoard: { readonly id: string; readonly kind: GlyphKind | null; readonly hex: Hex; readonly elevation: number }[];
  /** Glyphs each player holds, ready to use. `kind` is null where the viewer may not know it. */
  held: Record<PlayerId, { readonly id: string; readonly kind: GlyphKind | null }[]>;
  /** Stat glyphs in use: each boosts one unit until it is destroyed. */
  boosts: { readonly glyphId: string; readonly kind: GlyphKind; readonly unitId: string }[];
  /** Figures under a curse: each dies when its player has ended `turnsLeft` more turns. */
  curses: { readonly glyphId: string; readonly figureId: string; readonly player: PlayerId; turnsLeft: number }[];
}

export interface ActiveTurn {
  readonly player: PlayerId;
  readonly unitId: string;
  readonly token: NumberedToken;
  /** Figures of the active unit that have moved this turn. */
  moved: string[];
  /** Figures of the active unit that have attacked this turn. A figure cannot move after attacking. */
  attacked: string[];
  /** Every attack made this turn, in order (used by abilities such as Massed Volley). */
  attackLog: { attackerId: string; targetId: string }[];
  /** Extra moves granted after attacking (Smoke Step), by figure id: movement points allowed. */
  bonusMoves: Record<string, number>;
  /** Figures that may still be turned (games with facing): those that moved and have not attacked since. */
  turnable?: string[];
}

export interface TurnPointer {
  /** Which numbered token is being resolved this pass. */
  readonly token: NumberedToken;
  /** Index into the round's initiative order. */
  readonly orderIndex: number;
}

export interface RollOff {
  readonly player: PlayerId;
  readonly values: number[];
  /** Added to each roll (a glyph of initiative). */
  readonly bonus?: number;
}

export interface DraftState {
  /** Who picks at each step of the snake draft. An open draft keeps the roll-off order here, for deployment. */
  readonly order: PlayerId[];
  index: number;
  readonly rolls: RollOff[];
  picks: { player: PlayerId; cardId: string; unitId: string }[];
  /** Players who have finished drafting (points draft). */
  passed: PlayerId[];
}

export interface DeployState {
  /** Units are deployed one at a time in this order. */
  readonly queue: { player: PlayerId; unitId: string }[];
  index: number;
}

export type VictoryReason = "elimination" | "roundLimit";

export interface GameResult {
  readonly winners: PlayerId[];
  readonly reason: VictoryReason;
  /** Points still on the board: each surviving figure is worth its share of its card's points. */
  readonly scores: Record<PlayerId, number>;
}

export interface GameConfig {
  readonly seed: number;
  readonly mapId: string;
  /** Game ends after this round; null means play until one army remains. */
  readonly roundLimit: number | null;
  /** Each player's points budget for the draft; null means no limit. */
  readonly budget: number | null;
  /** Every unit in an army must share the faction of its first pick. */
  readonly factionPure: boolean;
  readonly draft: DraftMode;
  readonly initiative: InitiativeMode;
  /** Left out by games saved before the rule existed, which keep "stack". */
  readonly tokenRule?: TokenRule;
  /** How many glyphs are scattered when deployment ends; left out (or 0) for none. */
  readonly glyphs?: number;
  /**
   * "half": each player has numbered tokens for half the cards their army starts with, rounded
   * up, plus the bluff. Left out by older games, which have three.
   */
  readonly tokenAllowance?: TokenAllowance;
  /**
   * Figures face a way: ranged attacks need the target in front, and a melee attack from behind
   * rolls extra dice. Left out by games saved before the rule existed, which have no facing.
   */
  readonly facing?: boolean;
}

export interface GameState {
  readonly formatVersion: 1;
  readonly config: GameConfig;
  /** PRNG state; never sent to clients that should not predict dice. */
  rng: number;
  /** 0 during draft and deployment, then 1, 2, 3... */
  round: number;
  phase: Phase;
  players: PlayerState[];
  units: UnitState[];
  draft: DraftState | null;
  deploy: DeployState | null;
  /** This round's secret token placements; null until the player places them. */
  tokens: Record<PlayerId, TokenAssignment | null>;
  /** How many numbered tokens each player has (`tokenAllowance: "half"`), set as round 1 begins. */
  tokenCounts?: Record<PlayerId, number>;
  /**
   * Only in a state rebuilt from a player's view (online): the units holding each other player's
   * unrevealed tokens, without their numbers. The engine never sets it.
   */
  hiddenTokens?: Record<PlayerId, string[]>;
  /** Tokens that have been flipped face up this round. */
  revealed: Record<PlayerId, TokenId[]>;
  /** Turn order for this round, set by the initiative roll. */
  initiative: PlayerId[] | null;
  /** Players who have rolled for this round's initiative, while the round waits for the rest ("initiative" phase). */
  initiativeReady?: PlayerId[];
  /**
   * Start zones grown at deployment to fit each army (maps with `growZones`).
   * A player missing here uses the map's zone as drawn.
   */
  zones?: Record<PlayerId, Hex[]>;
  /**
   * Figures that cannot move on their unit's next turn (Pinning Shot and the
   * like). Cleared when that unit's turn ends.
   */
  pinned?: string[];
  pointer: TurnPointer | null;
  active: ActiveTurn | null;
  result: GameResult | null;
  /** Glyphs, in games that have them. */
  glyphs?: GlyphState;
}

export interface PlayerSetup {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: string;
}

export interface GameSetup {
  readonly seed: number;
  /** Must match the board in the rules context. */
  readonly mapId: string;
  readonly roundLimit?: number | null;
  /** In seat order (clockwise). 2 to 6 players. The map's layout picks each player's start zone. */
  readonly players: readonly PlayerSetup[];
  /** Skip the draft and use these armies (card ids per player). */
  readonly armies?: Readonly<Record<PlayerId, readonly string[]>>;
  /**
   * Each player's points budget for the draft. null (or leaving it out) means
   * no limit: players pick until they stop or their start zone is full.
   */
  readonly budget?: number | null;
  /** Every unit in an army must share the faction of its first pick. */
  readonly factionPure?: boolean;
  /** Older games and hot-seat games leave these out: a snake draft, and initiative rolled at once. */
  readonly draft?: DraftMode;
  readonly initiative?: InitiativeMode;
  /** New games use "onePerUnit"; older ones leave it out and keep "stack". */
  readonly tokenRule?: TokenRule;
  /** How many glyphs to scatter on the battlefield when deployment ends (0 to 11). */
  readonly glyphs?: number;
  /** New games give each player tokens for half their army; older ones leave it out and have three. */
  readonly tokenAllowance?: TokenAllowance;
  /** New games turn facing on; older ones leave it out and have none. */
  readonly facing?: boolean;
}

export interface RulesContext {
  readonly cards: ReadonlyMap<string, UnitCard>;
  readonly board: Board;
  readonly terrain: TerrainTable;
  /** Rule numbers; defaults to DEFAULT_TUNING. */
  readonly tuning?: Tuning;
}

export interface FigurePlacement extends PathStep {
  readonly figureId: string;
}

export type Command =
  | { readonly type: "draftPick"; readonly player: PlayerId; readonly cardId: string }
  | {
      readonly type: "deployUnit";
      readonly player: PlayerId;
      readonly unitId: string;
      readonly placements: readonly FigurePlacement[];
    }
  | { readonly type: "placeTokens"; readonly player: PlayerId; readonly tokens: TokenAssignment }
  | { readonly type: "move"; readonly player: PlayerId; readonly figureId: string; readonly path: readonly PathStep[] }
  | {
      readonly type: "attack";
      readonly player: PlayerId;
      readonly figureId: string;
      readonly targetId: string;
      /** Use a special attack or power from the card instead of a normal attack. */
      readonly ability?: string;
      /**
       * A blast's aimed hex: one of the target's hexes. Figures next to it take the splash.
       * Older saves have none; their blasts splash round every hex of the target, as they did then.
       */
      readonly aim?: Hex;
    }
  | {
      /** A blast aimed at an empty hex, for a blast that may be aimed at a hex (`hexTarget`). */
      readonly type: "blast";
      readonly player: PlayerId;
      readonly figureId: string;
      readonly ability: string;
      readonly at: Step;
    }
  | { readonly type: "draftPass"; readonly player: PlayerId }
  /** A player rolls for initiative (`initiative: "players"` games). */
  | { readonly type: "rollInitiative"; readonly player: PlayerId }
  | { readonly type: "endTurn"; readonly player: PlayerId }
  /** Turn a figure that has just moved (games with facing), to one of eight directions in degrees. */
  | { readonly type: "face"; readonly player: PlayerId; readonly figureId: string; readonly facing: number }
  /**
   * Use a held glyph. `unitId` is the unit it acts on: one of the player's own for a stat glyph,
   * Healer and Summoning (a destroyed one), an enemy's for Wound and Negation. Summoning also
   * places every figure of the unit.
   */
  | {
      readonly type: "useGlyph";
      readonly player: PlayerId;
      readonly glyphId: string;
      readonly unitId: string;
      readonly placements?: readonly FigurePlacement[];
    }
  | { readonly type: "concede"; readonly player: PlayerId };

export type DamageSource = "attack" | "swamp" | "lava" | "fall" | "passingStrike" | "ability" | "glyph";

export type GameEvent =
  | { readonly type: "draftStarted"; readonly rolls: RollOff[]; readonly order: PlayerId[] }
  | { readonly type: "cardDrafted"; readonly player: PlayerId; readonly cardId: string; readonly unitId: string }
  | { readonly type: "draftEnded" }
  /** A player has rolled for initiative; the roll is made once everyone has. */
  | { readonly type: "initiativeReady"; readonly player: PlayerId }
  | { readonly type: "deploymentStarted" }
  | {
      readonly type: "unitDeployed";
      readonly player: PlayerId;
      readonly unitId: string;
      readonly placements: FigurePlacement[];
    }
  | { readonly type: "deploymentEnded" }
  /** Glyphs laid face down on the battlefield. */
  | { readonly type: "glyphsPlaced"; readonly glyphs: readonly { readonly id: string; readonly hex: Hex; readonly elevation: number }[] }
  /** A figure picked up a glyph. Its kind is told only for a trap, which acts at once. */
  | { readonly type: "glyphTaken"; readonly player: PlayerId; readonly figureId: string; readonly glyphId: string; readonly trap?: GlyphKind }
  /** A held glyph was used on a unit. */
  | { readonly type: "glyphUsed"; readonly player: PlayerId; readonly glyphId: string; readonly kind: GlyphKind; readonly unitId: string }
  /** A boost a glyph gave a unit was cancelled (Negation). */
  | { readonly type: "glyphCancelled"; readonly glyphId: string; readonly kind: GlyphKind; readonly unitId: string }
  /** A one-roll glyph (the Herald) has been rolled with and is gone. */
  | { readonly type: "glyphSpent"; readonly glyphId: string; readonly kind: GlyphKind; readonly unitId: string }
  /** A cursed figure's time ran out. */
  | { readonly type: "curseStruck"; readonly figureId: string }
  /** A start zone grew by `added` hexes so the army fits (maps with `growZones`). */
  | { readonly type: "startZoneGrown"; readonly player: PlayerId; readonly added: number }
  /** Not even a grown start zone had room for the unit, so it sits this game out. */
  | { readonly type: "unitNotDeployed"; readonly player: PlayerId; readonly unitId: string }
  | { readonly type: "roundStarted"; readonly round: number }
  | { readonly type: "tokensPlaced"; readonly player: PlayerId }
  | { readonly type: "initiativeRolled"; readonly rolls: RollOff[]; readonly order: PlayerId[] }
  | { readonly type: "tokenRevealed"; readonly player: PlayerId; readonly token: TokenId; readonly unitId: string }
  | { readonly type: "turnLost"; readonly player: PlayerId; readonly token: NumberedToken; readonly unitId: string }
  | { readonly type: "turnStarted"; readonly player: PlayerId; readonly token: NumberedToken; readonly unitId: string }
  | { readonly type: "figureMoved"; readonly figureId: string; readonly from: PathStep; readonly path: PathStep[] }
  | {
      readonly type: "terrainRoll";
      readonly figureId: string;
      readonly terrain: string;
      readonly roll: number;
      readonly outcome: "safe" | "destroyed" | "slipped";
    }
  | { readonly type: "figureSlid"; readonly figureId: string; readonly to: Step }
  | { readonly type: "figureFaced"; readonly figureId: string; readonly facing: number }
  | {
      readonly type: "attackRolled";
      readonly source: DamageSource;
      /** Attacking figure, or null for terrain. */
      readonly attackerId: string | null;
      readonly targetId: string;
      readonly attack: DieFace[];
      readonly defense: DieFace[];
      readonly hits: number;
      readonly blocks: number;
      readonly wounds: number;
      /** Extra attack and defense dice from height and abilities. */
      readonly attackBonus: number;
      readonly defenseBonus: number;
      /** Why the dice changed, e.g. "Rally the Line +1 defense". */
      readonly notes?: string[];
      /** The special attack used, if any. */
      readonly ability?: string;
    }
  | { readonly type: "figureWounded"; readonly figureId: string; readonly wounds: number; readonly total: number }
  | {
      readonly type: "figureDestroyed";
      readonly figureId: string;
      readonly unitId: string;
      readonly cause: DamageSource;
    }
  | { readonly type: "turnEnded"; readonly player: PlayerId; readonly token: NumberedToken; readonly unitId: string }
  | { readonly type: "roundEnded"; readonly round: number }
  | { readonly type: "playerConceded"; readonly player: PlayerId }
  | { readonly type: "playerEliminated"; readonly player: PlayerId }
  | { readonly type: "gameOver"; readonly result: GameResult }
  | { readonly type: "draftPassed"; readonly player: PlayerId }
  | {
      /** A named ability did something worth logging. */
      readonly type: "abilityUsed";
      readonly ability: string;
      readonly figureId: string;
      readonly targetId?: string;
      readonly detail: string;
    }
  | {
      readonly type: "abilityRoll";
      readonly ability: string;
      readonly figureId: string;
      readonly targetId: string;
      readonly roll: number;
      readonly needed: number;
      readonly success: boolean;
    }
  | { readonly type: "figureHealed"; readonly figureId: string; readonly amount: number; readonly total: number }
  | { readonly type: "figureRevived"; readonly figureId: string; readonly at: Step }
  | {
      /** A figure changed sides (mind control). It now belongs to a new unit. */
      readonly type: "figureControlled";
      readonly figureId: string;
      readonly fromUnitId: string;
      readonly toUnitId: string;
      readonly player: PlayerId;
    }

export type CommandResult =
  | { readonly ok: true; readonly state: GameState; readonly events: GameEvent[]; readonly error?: undefined }
  | { readonly ok: false; readonly error: string; readonly state?: undefined; readonly events?: undefined };
