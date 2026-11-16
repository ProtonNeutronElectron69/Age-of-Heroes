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
| `los.ts` | Line of sight: a strict check from the eye point to the hit band, with terrain, scenery and other figures blocking |
| `editor.ts` | Pure map-editing operations used by the map editor: placing and removing pieces, side placement, start zones, fixing problems, and seeded random fills |
| `game/types.ts` | `GameState`, `Command`, `GameEvent`, `PlayerView` and friends |
| `game/engine.ts` | `createGame`, `applyCommand`, `replayGame`, `waitingOn` and the turn flow |
| `game/draft.ts`, `game/deploy.ts` | Snake draft to a points budget (optionally faction-pure) and deployment. An open draft (`GameSetup.draft: "open"`, online games) lets every player pick at once (`drafters`) with every card exclusive, and deploys one unit each in roll-off order. Zones that grow to fit an army are stored in `GameState.zones`; read a player's zone with `playerZone` |
| `game/rounds.ts` | Token placement, initiative, turn order, wounds, elimination and game over. With `GameSetup.initiative: "players"` (online games) a round waits in the `initiative` phase for every player's `rollInitiative` command before rolling |
| `game/placement.ts`, `game/movement.ts` | Multi-hex footprints, reachable placements (Dijkstra with hazard tie-breaks), moving, falling, passing strikes, flying, trample |
| `game/engagement.ts`, `game/combat.ts` | Engagement, attack legality, dice, height bonuses, special actions, mind control |
| `game/abilities.ts` | Every ability: attack and defense modifiers, reactions after an attack, end-of-turn effects, special action specs |
| `game/queries.ts`, `game/view.ts` | Read-only helpers (stats, scores, figures) and per-player views |

Abilities hook in at fixed points: `abilityModifiers` (extra or fewer dice), `targetingProblem` (who may be targeted), `reduceWounds`, `afterAttack` (reactions, with the RNG), `endOfTurnAbilities` (healing, reassembling, and clearing pins), movement (`flying`, `trample`, `smoke-step`, `moveBonus`, pins), forced moves (`forcedMove` in `movement.ts`, used by shoves and pulls) and the special action specs (`AREA_IDS`, `MIND_IDS`, `PULL_IDS`, `SWAP_IDS`).

## Content (`packages/content/src`)

- `cards/starter.json` (the first 16 units), `cards/legends.json` (14 more) and `cards/reinforcements.json` (18 more, for 48); `cards.ts` loads and validates them into `CARDS`, `CARD_CATALOG` and `FACTIONS`.
- `maps/*.json` and `maps/index.ts` (`MAPS`): the premade map library.
- `terrain.ts`, `scenery.ts`, `tuning.ts`, `players.ts` (seat colours).
- `context.ts`: `contextFor(map)` builds the `RulesContext` (board, terrain, cards, tuning) the engine needs.
- `balance.ts`: the balance model that sets point costs (`BALANCE_REPORT=1 pnpm test balance`).

## Protocol (`packages/protocol/src/index.ts`)

- `clientMessageSchema`: create, join, rejoin, spectate, start, command, leave, resume, claim, save, ping. The server validates every message with it.
- `ServerMessage`: welcome (seat and secret token), room, game (view and events; `snapshot` marks a catch-up with the full log), replay, saved, ping, error.
- A ping is not a game command: the server passes it to everyone else in the room, at most once a second per player (`PING_INTERVAL_MS`), and never logs, saves or replays it.
- `Replay` / `replaySchema` / `parseReplay`: the **game record** (setup, map, commands, optional name and save time). The same format is a save file, a replay and the input for resuming an online game.

## Server (`apps/server/src`)

- `server.ts`: HTTP `/health` and the WebSocket at `/ws` (1 MB messages, 40 messages a second, optional origin allow-list, sweeper).
- `rooms.ts`: `RoomManager`, transport-independent and unit-tested. Rooms have 5-letter codes, a host, seats with secret rejoin tokens and spectators. It runs the engine, checks that a player only acts for their own seat, and sends each connection its own view. Rooms live in memory and are cleared 2 hours after the last person disconnects. The host can `save` (gets the full record); `resume` opens a new room from a record, players `claim` their saved armies, and the host continues.
- `index.ts`: reads `PORT` and `ALLOWED_ORIGINS`. The Dockerfile builds a single-file bundle; `render.yaml` deploys it. See [HOSTING.md](HOSTING.md).

## Client (`apps/client/src`)

State lives in small stores read with `useSyncExternalStore`:
- `session.ts`: the game being played. Local (hot-seat) sessions run the engine in the browser; online sessions send commands through `online.ts` and apply server views (`pending` blocks double sends).
- `online.ts`: the WebSocket connection, lobby state, automatic reconnect and rejoin, host save requests, and pings (`sendPing`, `onPing`): spots a player points at with P, passed on by the server outside the game. `scene/Pings.tsx` reads the P key and draws the arrows, on the play screen and the draft map.
- `saves.ts`: named saves in browser storage, summaries and file downloads. `maps.ts`: custom maps in browser storage.
- `testMode.ts`: `TEST_MODE`, set only by the browser tests (`window.__aohTest`). It draws a simpler gaming table and keeps the camera's narrower zoom limits; players never have it.

Screens (`screens/`): `SetupScreen` (the main menu: hot-seat or online setup, saved games, resume), `LobbyScreen`, `DraftScreen` (with `DraftMap`, the battlefield it opens on), `PlayScreen` (deployment, tokens, turns, game over), `EditorScreen`, `ReplayScreen`. `App.tsx` picks the screen from the session and online state.

The play screen:
- **Unit cards.** The right-hand column shows the acting unit's card (`.unit-card-main`, shown again at each new turn) and below it, smaller, the card of a unit the pointer has rested on for half a second or that was clicked (`.unit-card-other`). `useDelayedHover` keeps the hover card from flickering as the pointer crosses a figure's parts.
- **Camera follow.** A new turn, or a squad passing the selection to its next figure, asks `BoardScene` (its `focus` prop) for a framed glide to that figure, which stops as soon as the player turns or zooms the camera. The glide makes only the parts the player has ticked under Display (Auto pan, Auto rotate, Auto zoom; the request's `parts`); the attack scene's glide to a fight always makes all three. It waits until every figure has finished hopping: `scene/activity.ts` keeps, per canvas, which figures are hopping and whether a glide is due, and browser tests read the latter through `window.__aoh.cameraBusy()`.
- **Hex tooltip.** A middle click on the play, replay or draft board (`BoardScene`'s `onInspect`, a ray cast to the terrain under any figure) opens `ui/HexTip.tsx`: the hex's terrain, elevation, headroom, special rules, scenery and start zone.
- **Pings (online).** `scene/Pings.tsx` reads the P key (`PingInput`), keeps the pings on screen (`useOnlinePings`, shared with the draft map) and draws the arcing arrows.

The draft: `DraftScreen` opens on `DraftMap`, the board with each player's start zone in their colour and a name label over it, until the first pick has been made; **View map** brings it back at any time. In an open draft (online) every player picks from the same cards at once, and a card someone has taken shows who took it.

Main menu (`screens/menu/`): `SetupScreen` keeps the menu's state and builds its choices and panels; `MenuFrame` draws them in the player's menu style: War Table, Atlas, Banner Hall or Hex Command (`settings.ts` keeps the choice). Every style has the same choices and the same panel markup (`.mp-*` classes), dressed by `menu.css`. On a landscape window the menu is laid out on a 1280 by 720 stage scaled to fit, so nothing scrolls; a narrow or upright window gets one scrolling column (`.compact`). `MenuBoard` is the War Table's backdrop: the Proving Grounds with six armies, drawn by `BoardScene` (with `still`, so it has no camera controls) and `Figures`, while the camera circles slowly at 30 frames a second.

Scene (`scene/`):
- `BoardScene`: terrain as one instanced mesh per terrain type plus one set of outlines, scenery, markers, the camera with WASD panning and the follow glide, eye view with drag and arrow-key look-around, and the middle-click inspector.
- `Figures`: figure models on their bases, or tokens with multi-hex figures drawn as one rounded piece over their footprint, as the display setting says; plus a single DOM label layer positioned each frame, since per-figure React roots caused unmount errors. A model shares its unit's meshes with the unit's other figures, takes clicks and hovers through a hidden token-shaped target, shows its state with a ring round its base, and is drawn darker once it has acted. A single-hex model faces the nearest enemy figure across a side of its hex; a larger one faces along its base.
- `Pings.tsx` (online pings), `activity.ts` (what is moving on a board, so the camera waits for hops), `wake.ts` (starting an animation after a rest), `dice3d.tsx` (the 3D dice), `Table.tsx` and `tableLayout.ts` (the gaming table, below).
- `TestHook`: the projection helper, draw call stats and camera state for browser tests.

Moving figures (`scene/Figures.tsx`): the rules put a figure on its new hex at once, and only its drawing lags behind. `useFigureAnimation` moves the drawing about the figure's place: it hops hex by hex along a `figureMoved` event's path (`motions`), hangs from the pointer while dragged (`carry`), jumps for the H key (`jump`), and glides after any other change of place. A model's hidden click target stays on the figure's real hex throughout. The play and replay boards are drawn only when something changes: each animation asks for frames while it runs (`invalidate`, or `useWake` in `scene/wake.ts` to start one after a rest), and only the decorative loops (the selection arrow's bob, the ready and target rings' pulse) run for good, standing still when the player's system asks for reduced motion. A press on a figure that may act holds the camera still, and moving the pointer then drags the figure; the play screen makes the move when it is let go over a hex it can reach.

The table (`scene/Table.tsx`): `GamingTable` draws the table, its legs and the floor in one of three styles, with wood and cloth painted into canvases in code. `TableCards` lays each unit's card on it, with the figures that are off the board standing on it, as the same models the board draws: those waiting to deploy and those destroyed. The card's picture is the `HexCard` drawing painted into a texture once (`scene/cardTexture.tsx`). `scene/tableLayout.ts` is the pure arithmetic: which side each player sits on, where each card goes, and how large the square table must be; `scene/tableData.ts` feeds it from a game. The play and replay screens draw the table; the editor and the menu backdrop do not.

UI (`ui/`): unit cards, dice overlay, log, the hot keys panel (`KeysPanel` in `panels.tsx`), round bar, token panel, game menu and save dialog. `ui/RollShow.tsx` is the dice show on the play screen: `AttackShow` (the full scene, or dice only) for a command's attack rolls, and `InitiativeShow` with a d20 per player. It only shows results the events already hold, except that in online games the initiative show sends the player's `rollInitiative` and waits for everyone's before the dice tumble. In an attack the attack dice land first and then the defense dice roll, with the timings as constants at the top of the file; `scene/dice3d.tsx` has the 3D dice (cube attack and defense dice, the d20), which tumble and land on a given face, and the landing turns that `apps/client/test/dice.test.ts` checks. **Dice rolls** under Display (`settings.ts`) picks the full scene, dice only or none. The unit card is `ui/HexCard.tsx`: a seven-hex SVG drawing with the name and rules text laid over it and sized to fit, coloured from `ui/factionThemes.ts`, with emblems and stat icons in `ui/hexCardArt.tsx`. Unit art lives in `ui/art/`: a drawing is a list of flat shapes with roles (`types.ts`), built with the helpers in `build.ts`, one file per faction in `drawings/`, collected by card id in `drawings.ts`. `UnitArt.tsx` paints a drawing in the ink and colour style and as the hit zone picture. `ui/UnitCardView.tsx` wraps the card with the enlarge control and the figures left that the screens use. `screens/CardGalleryScreen.tsx` shows every card; open the game with `?cards` in the address.

Figure models (`models/`): each unit's 3D model is built in code from a few solid shapes, so there are no model files to load. `build.ts` has the shapes (`box`, `limb`, `ball`, `spine`, `plate`), and `figure` and `squad`, which size a model so that it and its base stand the card's Height; `human.ts` is a posable person, `horse.ts` a horse, `poses.ts` shared stances, and `gear.ts` shared spears, shields, bows and flight stands; `units/` holds one file per faction, with a model for every card by its id, collected in `index.ts` (`UNIT_MODELS`, `figureGeometry`, `baseGeometry`). `base.ts` makes the base a figure stands on from its footprint: a top and a bevelled rim, with a lobe on each hex and a waist between hexes. `colors.ts` holds the base's light brown and the three colour schemes (`figureColors`): the model takes the faction's colour, the player's colour or a plain grey, and the rim of the base takes the player's or the faction's colour. `measure.ts` works out how a model sits on the board (`baseFrame`) and how far its body hangs over the edge of its hexes (`measure`, `OVERHANG_LIMITS`). `screens/ModelGalleryScreen.tsx` stands the models on a board; open the game with `?models` in the address. `scene/standing.tsx` lines units up on a display board and draws them; the model page and the unit gallery share it. `screens/UnitGalleryScreen.tsx` is the unit gallery on the main menu: every card in a grid of 5, 3 or 1 across, filtered by faction, type, attack and a search, and sorted by name, faction or a stat. Choosing a card opens its model in a viewer that turns and zooms; that canvas draws on demand, not every frame, so the card grid stays quick. The play and replay screens draw the models on the board (`scene/Figures.tsx`). `settings.ts` keeps each player's display choices in the browser: models or tokens, the colour scheme, the menu style, the gaming table, the dice show and the camera follow boxes; `ui/DisplayMenu.tsx` sets them.

Browser storage keys (all `localStorage`, each wrapped so the game works without storage):

| Key | Contents |
|---|---|
| `age-of-heroes:save:v2` | The unfinished hot-seat game (kept automatically) |
| `age-of-heroes:saves:v1` | Named saves |
| `age-of-heroes:maps:v1` | Custom maps |
| `age-of-heroes:online:v1` | The online seat (server, room code, rejoin token) |
| `age-of-heroes:server:v1`, `age-of-heroes:name:v1` | Last server address and player name |
| `age-of-heroes:show-card:v1` | Whether the selected unit's card stays on screen |
| `age-of-heroes:show-keys:v1` | Whether the Keys panel under the log is open |
| `aoh.display` | Display settings: models or tokens, the colour scheme, the menu style, the gaming table, the dice show and the three camera follow boxes (`settings.ts`) |
| `aoh.gallery.*` | The unit gallery's card size, sort and model colours |

## Testing

- `pnpm test` (Vitest): engine unit tests (`packages/rules/test`, with fixtures in `fixtures.ts`), content and balance tests, 10 random full-game simulations (2 with the online rules) that check invariants and exact replays, protocol tests, server tests over real WebSockets (whole online games, pings), and the client's figure model, table layout and 3D dice tests.
- `pnpm e2e` (Playwright, needs `pnpm build` first): seven browser tests that drive the real interface. They reach the canvas through `window.__aoh` (projection, draw stats and a frame count; `scene/TestHook.tsx`) and `window.__aohUi` (current moves and targets, and the figure being dragged; `PlayScreen.tsx`), plus `window.__aohPingsHeard` (pings heard, set by `online.ts`).
- CI (`.github/workflows/ci.yml`) runs only the checks a pull request's changes affect, chosen by `scripts/affected.mjs`, with each browser test as its own parallel job; pushes to `main` run everything. `deploy.yml` publishes the client to GitHub Pages on every merge to `main`, with `VITE_SERVER_URL` from the `GAME_SERVER_URL` repository variable.

[TESTING.md](TESTING.md) has what each browser test covers, what each kind of change runs, and how to write a browser test.
