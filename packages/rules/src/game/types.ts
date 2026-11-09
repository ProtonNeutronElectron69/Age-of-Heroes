import type { Hex } from "../hex";
import type { UnitCard } from "../schema";

export type PlayerId = string;
export type RulesMode = "basic" | "advanced";

/** The four activation tokens: three numbered turns and a bluff. */
export type TokenId = "1" | "2" | "3" | "X";
export type NumberedToken = "1" | "2" | "3";
export const TOKEN_IDS: readonly TokenId[] = ["1", "2", "3", "X"];
export const NUMBERED_TOKENS: readonly NumberedToken[] = ["1", "2", "3"];

/** Which unit card each token is placed on. One unit may hold several tokens. */
export type TokenAssignment = Record<TokenId, string>;

export interface PlayerState {
  readonly id: PlayerId;
  readonly name: string;
  readonly color: string;
  /** Seat index; turns pass "to the left" in increasing seat order. */
  readonly seat: number;
  eliminated: boolean;
  conceded: boolean;
}

export interface FigurePosition {
  /** Origin hex of the figure's footprint. */
  readonly hex: Hex;
  /** Elevation of the surface the figure stands on, in levels. */
  readonly elevation: number;
  /** Footprint rotation in 60 degree steps (multi-hex figures only). */
  readonly rotation: number;
}

export interface FigureState {
  readonly id: string;
  wounds: number;
  destroyed: boolean;
  position: FigurePosition | null;
}

export interface UnitState {
  /** Unique within the game, e.g. "p1:0". */
  readonly id: string;
  readonly cardId: string;
  readonly owner: PlayerId;
  figures: FigureState[];
}

export type Phase = "placeTokens" | "turns" | "gameOver";

export interface ActiveTurn {
  readonly player: PlayerId;
  readonly unitId: string;
  readonly token: NumberedToken;
}

export interface TurnPointer {
  /** Which numbered token is being resolved this pass. */
  readonly token: NumberedToken;
  /** Index into the round's initiative order. */
  readonly orderIndex: number;
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
  /** Game ends after this round; null means play until one army remains. */
  readonly roundLimit: number | null;
}

export interface GameState {
  readonly formatVersion: 1;
  readonly config: GameConfig;
  /** PRNG state; never sent to clients that should not predict dice. */
  rng: number;
  round: number;
  phase: Phase;
  players: PlayerState[];
  units: UnitState[];
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
  readonly roundLimit?: number | null;
  /** In seat order. 2 to 6 players. */
  readonly players: readonly PlayerSetup[];
  /** Card ids for each player's army, in the order they were drafted. */
  readonly armies: Readonly<Record<PlayerId, readonly string[]>>;
}

export interface RulesContext {
  readonly cards: ReadonlyMap<string, UnitCard>;
}

export type Command =
  | { readonly type: "placeTokens"; readonly player: PlayerId; readonly tokens: TokenAssignment }
  | { readonly type: "endTurn"; readonly player: PlayerId }
  | { readonly type: "concede"; readonly player: PlayerId };

export type GameEvent =
  | { readonly type: "roundStarted"; readonly round: number }
  | { readonly type: "tokensPlaced"; readonly player: PlayerId }
  | {
      readonly type: "initiativeRolled";
      readonly rolls: { readonly player: PlayerId; readonly values: number[] }[];
      readonly order: PlayerId[];
    }
  | { readonly type: "tokenRevealed"; readonly player: PlayerId; readonly token: TokenId; readonly unitId: string }
  | { readonly type: "turnLost"; readonly player: PlayerId; readonly token: NumberedToken; readonly unitId: string }
  | { readonly type: "turnStarted"; readonly player: PlayerId; readonly token: NumberedToken; readonly unitId: string }
  | { readonly type: "turnEnded"; readonly player: PlayerId; readonly token: NumberedToken; readonly unitId: string }
  | { readonly type: "roundEnded"; readonly round: number }
  | { readonly type: "playerConceded"; readonly player: PlayerId }
  | { readonly type: "playerEliminated"; readonly player: PlayerId }
  | { readonly type: "gameOver"; readonly result: GameResult };

export type CommandResult =
  | { readonly ok: true; readonly state: GameState; readonly events: GameEvent[] }
  | { readonly ok: false; readonly error: string };
