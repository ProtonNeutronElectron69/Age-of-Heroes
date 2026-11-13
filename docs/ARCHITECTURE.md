# Age of Heroes: Architecture

How the code is organised, how a game flows through it, and where to make common changes. For the rules themselves see [RULES.md](RULES.md); for adding units, abilities and maps see [CONTENT.md](CONTENT.md).

## Packages

```
packages/rules     the rules engine: pure, deterministic TypeScript (no DOM, no Node APIs)
packages/content   game data (units, maps, terrain, scenery, tuning) and the balance model
packages/protocol  online message schemas, the game record (save and replay) format, stateFromView
apps/client        the browser game: React UI, Three.js scene, map editor, online lobby, replay viewer
apps/server        the online game server (Node + ws): rooms, authority, per-player views
```

Dependencies only point downwards: `client` and `server` use `protocol`, `content` and `rules`; `protocol` uses `rules`; `content` uses `rules`; `rules` uses nothing of ours. Workspace packages are consumed as TypeScript source (no build step for packages); the client and server are built with Vite.

## Design principles

- **The engine is a reducer.** `applyCommand(state, command, ctx)` returns `{ ok: true, state, events }` or `{ ok: false, error }` and never mutates its input. Every player action is a `Command`; everything that happened is a `GameEvent` (the log, dice panel and animations read events).
- **Determinism.** All randomness goes through the seeded `Rng` whose state lives in `GameState.rng`. A game is fully described by its setup and command list, so `replayGame(setup, commands, ctx)` rebuilds it exactly. Saves, replays, online resume and bug reports all rely on this.
- **Hidden information.** `viewFor(state, viewer)` removes what a viewer may not see (other players' unrevealed tokens, the RNG and the dice seed). The server only ever sends views; `stateFromView` (in `protocol`) turns a view back into a state the client can draw and query.
- **Data-driven content.** Units, maps, terrain, scenery and tunable rule numbers are data validated with zod schemas. Abilities are code, named by id on the cards with numbers in `params`.
- **Line of sight** is computed against simple shapes (terrain prisms and figure cylinders), never against rendered models, so it is fast and identical on client and server.

## Rules engine (`packages/rules/src`)

| File | What it holds |
|---|---|
| `hex.ts` | Axial hex coordinates (pointy-top): distance, neighbours, rotation, lines, rings, world positions |
| `support.ts` | The balance check that decides whether a piece is held up (centre of mass over its contact points) |
| `shapes.ts`, `board.ts`, `world.ts` | Map pieces (1, 2, 3-line, 3-triangle, 2x2, 7, 24 hexes), the stacked board with bridges, overhangs, scenery and start zones (including which pieces are held up, detached pieces, sealed spaces, start zone hexes that cannot be used, and which pieces form one bridge span), and board-to-world conversion |
| `schema.ts` | Zod schemas for maps and unit cards, and engine-wide limits |
| `terrain.ts`, `tuning.ts` | The shape of terrain rules and tunable numbers (the values live in `content`) |
| `dice.ts`, `rng.ts` | Attack and defense dice, and the seeded RNG (mulberry32) |
| `los.ts` | Line of sight (Basic forgiving check, Advanced strict check to the hit band) |
| `editor.ts` | Pure map-editing operations used by the map editor: placing and removing pieces, side placement, start zones, fixing problems, and seeded random fills |
| `game/types.ts` | `GameState`, `Command`, `GameEvent`, `PlayerView` and friends |
| `game/engine.ts` | `createGame`, `applyCommand`, `replayGame`, `waitingOn` and the turn flow |
| `game/draft.ts`, `game/deploy.ts` | Snake draft (card count or points budget, faction-pure) and deployment. Zones that grow to fit an army are stored in `GameState.zones`; read a player's zone with `playerZone` |
| `game/rounds.ts` | Token placement, initiative, turn order, wounds, elimination and game over |
| `game/placement.ts`, `game/movement.ts` | Multi-hex footprints, reachable placements (Dijkstra with hazard tie-breaks), moving, falling, passing strikes, flying, trample |
| `game/engagement.ts`, `game/combat.ts` | Engagement, attack legality, dice, height bonuses, special actions, mind control |
| `game/abilities.ts` | Every ability: attack and defense modifiers, reactions after an attack, end-of-turn effects, special action specs |
| `game/queries.ts`, `game/view.ts` | Read-only helpers (stats, scores, figures) and per-player views |

Abilities hook in at fixed points: `abilityModifiers` (extra or fewer dice), `targetingProblem` (who may be targeted), `reduceWounds`, `afterAttack` (reactions, with the RNG), `endOfTurnAbilities` (healing, reassembling, and clearing pins), movement (`flying`, `trample`, `smoke-step`, `moveBonus`, pins), forced moves (`forcedMove` in `movement.ts`, used by shoves and pulls) and the special action specs (`AREA_IDS`, `MIND_IDS`, `PULL_IDS`, `SWAP_IDS`). Abilities only exist in the Advanced game.

## Content (`packages/content/src`)

- `cards/starter.json` (the first 16 units), `cards/legends.json` (14 more) and `cards/reinforcements.json` (18 more, for 48); `cards.ts` loads and validates them into `CARDS`, `CARD_CATALOG` and `FACTIONS`.
- `maps/*.json` and `maps/index.ts` (`MAPS`): the premade map library.
- `terrain.ts`, `scenery.ts`, `tuning.ts`, `players.ts` (seat colours).
- `context.ts`: `contextFor(map)` builds the `RulesContext` (board, terrain, cards, tuning) the engine needs.
- `balance.ts`: the balance model that sets point costs (`BALANCE_REPORT=1 pnpm test balance`).

## Protocol (`packages/protocol/src/index.ts`)

- `clientMessageSchema`: create, join, rejoin, spectate, start, command, leave, resume, claim, save. The server validates every message with it.
- `ServerMessage`: welcome (seat and secret token), room, game (view and events; `snapshot` marks a catch-up with the full log), replay, saved, error.
- `Replay` / `replaySchema` / `parseReplay`: the **game record** (setup, map, commands, optional name and save time). The same format is a save file, a replay and the input for resuming an online game.

## Server (`apps/server/src`)

- `server.ts`: HTTP `/health` and the WebSocket at `/ws` (1 MB messages, 40 messages a second, optional origin allow-list, sweeper).
- `rooms.ts`: `RoomManager`, transport-independent and unit-tested. Rooms have 5-letter codes, a host, seats with secret rejoin tokens and spectators. It runs the engine, checks that a player only acts for their own seat, and sends each connection its own view. Rooms live in memory and are cleared 2 hours after the last person disconnects. The host can `save` (gets the full record); `resume` opens a new room from a record, players `claim` their saved armies, and the host continues.
- `index.ts`: reads `PORT` and `ALLOWED_ORIGINS`. The Dockerfile builds a single-file bundle; `render.yaml` deploys it. See [HOSTING.md](HOSTING.md).

## Client (`apps/client/src`)

State lives in small stores read with `useSyncExternalStore`:
- `session.ts`: the game being played. Local (hot-seat) sessions run the engine in the browser; online sessions send commands through `online.ts` and apply server views (`pending` blocks double sends).
- `online.ts`: the WebSocket connection, lobby state, automatic reconnect and rejoin, host save requests.
- `saves.ts`: named saves in browser storage, summaries and file downloads. `maps.ts`: custom maps in browser storage.

Screens (`screens/`): `SetupScreen` (hot-seat or online setup, saved games, resume), `LobbyScreen`, `DraftScreen`, `PlayScreen` (deployment, tokens, turns, game over), `EditorScreen`, `ReplayScreen`. `App.tsx` picks the screen from the session and online state.

Scene (`scene/`): `BoardScene` (terrain as one instanced mesh per terrain type plus one set of outlines, scenery, markers, camera with WASD panning, and eye view with drag and arrow-key look-around), `Figures` (tokens, with multi-hex figures drawn as one rounded piece over their footprint, plus a single DOM label layer positioned each frame; per-figure React roots caused unmount errors), `TestHook` (projection helper and draw call stats for browser tests).

UI (`ui/`): unit cards, dice overlay, log, round bar, token panel, game menu and save dialog. The unit card is `ui/HexCard.tsx`: a seven-hex SVG drawing with the name and rules text laid over it and sized to fit, coloured from `ui/factionThemes.ts`, with emblems and stat icons in `ui/hexCardArt.tsx`. Unit art lives in `ui/art/`: a drawing is a list of flat shapes with roles (`types.ts`), built with the helpers in `build.ts`, one file per faction in `drawings/`, collected by card id in `drawings.ts`. `UnitArt.tsx` paints a drawing in the ink and colour style and as the hit zone picture. `ui/UnitCardView.tsx` wraps the card with the flip and enlarge controls the screens use. `screens/CardGalleryScreen.tsx` shows every card; open the game with `?cards` in the address.

Figure models (`models/`): each unit's 3D model is built in code from a few solid shapes, so there are no model files to load. `build.ts` has the shapes (`box`, `limb`, `ball`, `spine`, `plate`), and `figure` and `squad`, which size a model so that it and its base stand the card's Height; `human.ts` is a posable person, `horse.ts` a horse and `gear.ts` shared spears and shields; `units/` holds one file per faction, with models by card id, collected in `index.ts` (`UNIT_MODELS`, `figureGeometry`, `baseGeometry`). `base.ts` makes the base a figure stands on from its footprint. `colors.ts` holds the two colour schemes (`figureColors`): one of the faction's and the player's colours goes on the model and the other on the base. `measure.ts` works out how a model sits on the board (`baseFrame`) and how far its body hangs over the edge of its hexes (`measure`, `OVERHANG_LIMITS`). `screens/ModelGalleryScreen.tsx` stands the models on a board; open the game with `?models` in the address. The play screen still draws tokens: stage 1 of the models is not on the board yet.

Browser storage keys (all `localStorage`, each wrapped so the game works without storage):

| Key | Contents |
|---|---|
| `age-of-heroes:save:v2` | The unfinished hot-seat game (kept automatically) |
| `age-of-heroes:saves:v1` | Named saves |
| `age-of-heroes:maps:v1` | Custom maps |
| `age-of-heroes:online:v1` | The online seat (server, room code, rejoin token) |
| `age-of-heroes:server:v1`, `age-of-heroes:name:v1` | Last server address and player name |
| `age-of-heroes:show-card:v1` | Whether the selected unit's card stays on screen |

## Testing

- `pnpm test` (Vitest): engine unit tests (`packages/rules/test`, with fixtures in `fixtures.ts`), content and balance tests, 8 random full-game simulations that check invariants and exact replays, protocol tests, and server tests over real WebSockets.
- `pnpm e2e` (Playwright, needs `pnpm build` first): a full Basic and a full Advanced hot-seat game, the map editor, saved games, and an online game between two browsers with a spectator, a reload, and a save and resume. Browser tests drive the canvas through `window.__aoh` (projection) and `window.__aohUi` (current moves and targets). They render WebGL in software, so the suite takes about 10 minutes.
- CI (`.github/workflows/ci.yml`) runs only the checks a pull request's changes affect, chosen by `scripts/affected.mjs`, with each browser test as its own parallel job. Pushes to `main` run everything. See [TESTING.md](TESTING.md). `deploy.yml` publishes the client to GitHub Pages on every merge to `main`, with `VITE_SERVER_URL` from the `GAME_SERVER_URL` repository variable.
