import type { Board } from "../board";
import type { DieFace } from "../dice";
import type { Hex } from "../hex";
import type { UnitCard } from "../schema";
import type { TerrainTable } from "../terrain";
import type { Tuning } from "../tuning";

export type PlayerId = string;
export type RulesMode = "basic" | "advanced";

/** The four activation tokens: three numbered turns and a bluff. */
export type TokenId = "1" | "2" | "3" | "X";
export type NumberedToken = "1" | "2" | "3";
export const TOKEN_IDS: readonly TokenId[] = ["1", "2", "3", "X"];
export const NUMBERED_TOKENS: readonly NumberedToken[] = ["1", "2", "3"];

/** Which unit card each token is placed on. One unit may hold several tokens. */
export type TokenAssignment = Record<TokenId, string>;

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
}

export interface UnitState {
  /** Unique within the game, e.g. "p1:0". */
  readonly id: string;
  readonly cardId: string;
  readonly owner: PlayerId;
  figures: FigureState[];
}

export type Phase = "draft" | "deploy" | "placeTokens" | "turns" | "gameOver";

export interface ActiveTurn {
  readonly player: PlayerId;
  readonly unitId: string;
  readonly token: NumberedToken;
  /** Figures of the active unit that have moved this turn. */
  moved: string[];
  /** Figures of the active unit that have attacked this turn. A figure cannot move after attacking. */
  attacked: string[];
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
}

export interface DraftState {
  /** Who picks at each step of the snake draft. */
  readonly order: PlayerId[];
  index: number;
  readonly rolls: RollOff[];
  picks: { player: PlayerId; cardId: string; unitId: string }[];
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
  /** Points (Advanced) or surviving figures (Basic) still on the board. */
  readonly scores: Record<PlayerId, number>;
}

export interface GameConfig {
  readonly mode: RulesMode;
  readonly seed: number;
  readonly mapId: string;
  /** Game ends after this round; null means play until one army remains. */
  readonly roundLimit: number | null;
  /** Basic draft: cards per player. */
  readonly armySize: number | null;
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
  /** Tokens that have been flipped face up this round. */
  revealed: Record<PlayerId, TokenId[]>;
  /** Turn order for this round, set by the initiative roll. */
  initiative: PlayerId[] | null;
  pointer: TurnPointer | null;
  active: ActiveTurn | null;
  result: GameResult | null;
}

export interface PlayerSetup {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: string;
}

export interface GameSetup {
  readonly mode: RulesMode;
  readonly seed: number;
  /** Must match the board in the rules context. */
  readonly mapId: string;
  readonly roundLimit?: number | null;
  /** In seat order (clockwise). 2 to 6 players. The map's layout picks each player's start zone. */
  readonly players: readonly PlayerSetup[];
  /** Skip the draft and use these armies (card ids per player). */
  readonly armies?: Readonly<Record<PlayerId, readonly string[]>>;
  /** Basic draft: cards per player (default 4). */
  readonly armySize?: number;
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
  | { readonly type: "attack"; readonly player: PlayerId; readonly figureId: string; readonly targetId: string }
  | { readonly type: "endTurn"; readonly player: PlayerId }
  | { readonly type: "concede"; readonly player: PlayerId };

export type DamageSource = "attack" | "swamp" | "lava" | "fall" | "passingStrike";

export type GameEvent =
  | { readonly type: "draftStarted"; readonly rolls: RollOff[]; readonly order: PlayerId[] }
  | { readonly type: "cardDrafted"; readonly player: PlayerId; readonly cardId: string; readonly unitId: string }
  | { readonly type: "draftEnded" }
  | { readonly type: "deploymentStarted" }
  | {
      readonly type: "unitDeployed";
      readonly player: PlayerId;
      readonly unitId: string;
      readonly placements: FigurePlacement[];
    }
  | { readonly type: "deploymentEnded" }
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
      /** Extra attack and defense dice from height (Advanced). */
      readonly attackBonus: number;
      readonly defenseBonus: number;
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
  | { readonly type: "gameOver"; readonly result: GameResult };

export type CommandResult =
  | { readonly ok: true; readonly state: GameState; readonly events: GameEvent[]; readonly error?: undefined }
  | { readonly ok: false; readonly error: string; readonly state?: undefined; readonly events?: undefined };
