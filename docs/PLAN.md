# Age of Heroes: Implementation Plan

A browser-based, turn-based 3D tactics game for 2 to 6 players. See [RULES.md](RULES.md) for the game rules.

## Decisions

| Area | Decision |
|---|---|
| Platform | Browser game: TypeScript, Three.js (via React Three Fiber), React for menus and cards |
| Players | 2 to 6 in every mode |
| Play modes | Hot-seat first, then online; computer opponent maybe later |
| Online hosting | Game server in a Docker image; Render recommended (free tier, deploys from `render.yaml`). See [HOSTING.md](HOSTING.md) |
| First milestone | Basic game playable end to end |
| Line of sight | Advanced: automatic check from eye point to hit band, plus a figure's-eye camera. Basic: forgiving |
| Art | None at first: units are tokens as tall as their Height, terrain is flat colour. Hovering or clicking a token shows its card |
| Unit roster | Original units built to the same balance targets as classic hex wargames (stat bands, hero and squad mix, point ranges). Point costs checked with a combat simulator |
| Involvement | Hands-off: each phase ends with a pull request and a playable link |

## Architecture

```
packages/rules     the rules engine in plain TypeScript, no graphics; runs in the browser or on a server
packages/content   unit cards, terrain, tile pieces and maps as data files, validated on load
packages/protocol  online messages, validated with schemas, plus replay files
apps/client        the game: 3D scene, cards, map editor, online lobby, replay viewer
apps/server        online game server: rooms, authority and secrecy, using the same rules engine
docs/              this plan and the rules
```

- **Replayable turns.** The engine is a pure reducer: `applyCommand(state, command) -> (state, events)`. All dice use a seeded RNG stored in the state, so a game can be replayed exactly from its setup and command log. This is the base for online play, save games and bug reports.
- **Hidden information.** `viewFor(state, player)` strips other players' unrevealed tokens and the RNG state. A server will only ever send views.
- **Data-driven rules.** Terrain effects, dice faces and unit cards are data validated with schemas, so tuning does not need code changes.
- **Line of sight** is checked against simple shapes (terrain cells and figure tokens), not visual models, so it is fast, deterministic and server-safe.
- **Abilities** are code modules that hook into rule steps; cards reference them by id.
- **Testing:** Vitest for the engine and content; Playwright for browser smoke tests and screenshots.
- **Deployment:** GitHub Pages, built and published by GitHub Actions on every merge to `main`.

## Phases

### Phase 0: Foundations (done)
- [x] pnpm workspace with `rules`, `content` and `client` packages
- [x] Hex math (axial coordinates, distance, rotation, lines, rings, world conversion)
- [x] Piece and footprint shapes: 1, 2, 3-line, 3-triangle, 2x2, 7 and 24-hex
- [x] Stacked map model with bridges and overhangs, plus validation (overlaps, floating pieces, start zones)
- [x] Terrain table with all ten terrain types and their rule data
- [x] Seeded RNG and attack and defense dice
- [x] Unit card and map schemas
- [x] Turn engine: secret token placement, d20 initiative with tie rerolls, token 1, 2, 3 turn order, lost turns, X reveal, round limit, elimination, concession, scoring
- [x] Per-player views that hide secret tokens and the RNG
- [x] Sample map using every terrain type, with 6 start zones and a bridge
- [x] Client preview: 3D map, hex inspector, dice roller
- [x] CI (typecheck, test, build) and GitHub Pages deployment
- [x] Rules written up in `docs/RULES.md`

### Phase 1: Basic game (milestone 1, done)
- [x] 8 original starter units across 4 factions, with both card sides filled in
- [x] Game setup screen: 2 to 6 players, names, army size, round limit, map
- [x] Snake draft by card count, with unique cards exclusive and start zone room checked
- [x] Deployment into start zones in draft order, with auto place
- [x] Map layouts that pick spread-out start zones for each player count
- [x] Unit tokens on the board, as tall as their Height, with the hit band shown; hover or click for the unit card
- [x] Token placement with a pass-the-device screen between players
- [x] Initiative and round bar showing revealed tokens
- [x] Movement: reachable hexes, path preview and cost, climbing and headroom, friendly pass-through, water and swamp, lava, ice, road bonus
- [x] Basic line of sight against terrain
- [x] Attacks with dice results; destruction on any wound; swamp damage at the end of a turn
- [x] Round limit and elimination victory screens
- [x] Game log, and games saved in the browser so a reload can continue them
- [x] Tests: engine unit tests, random full-game simulations, and a browser test that plays a full game through the UI

### Phase 2: Map editor (done)
- [x] Place, rotate and stack all seven piece shapes in all ten terrains; pieces land on whatever is under them
- [x] Bridges and overhangs, with a manual level control and live validation (overlaps, floating pieces, scenery, zones, layouts)
- [x] Scenery (trees, ruined walls, boulders) that blocks movement, deployment and line of sight
- [x] Start zone painting for up to 6 zones, and which zones each player count uses
- [x] Undo and redo
- [x] Save maps in the browser ("My maps"), export and import map files, and play any map
- [x] Library of four premade maps: Proving Grounds, Twin Fords, The Mesa and Glacier Pass
- [x] Setup screen offers only the player counts a map supports
- [x] Browser test that builds, exports, imports and plays a custom map

### Phase 3: Advanced rules core (done)
- [x] Advanced mode selectable at setup; drafts by card count until the Phase 4 points budget
- [x] Card backs shown in the Advanced game; Life and wounds tracked, with life badges on tokens
- [x] Elevation bonuses, the Height climbing limit, and falling damage on every step
- [x] Engagement, the engaged-attack restriction, melee needing engagement, and passing strikes
- [x] Strict 3D line of sight against hit bands, with figures blocking, plus a figure's-eye camera
- [x] Multi-hex figures (2x1, 3x1, 2x2): standing with a 1-level straddle, shifting and turning, deployment with facing, sight and range from any hex
- [x] Squad activations with interleaved moves and attacks (both rule sets)
- [x] Risky paths (lava, ice, falls, passing strikes) shown in orange and avoided by the suggested path
- [x] Rule numbers (falling dice, passing strike dice, height bonuses, straddle) as tuning data
- [x] One original 2x1 unit, Old Rootback, to bring big figures into play
- [x] Tests: Advanced rule and multi-hex unit tests, random Advanced games, and an Advanced browser game

### Phase 4: Abilities and armies (done)
- [x] Ability system: abilities named on cards with tunable params, implemented as hooks into attacks, defense, movement, reactions and end of turn
- [x] All 17 abilities on the roster: flying, trample, smoke step, massed volley, grove song, rally the line, deflector field, hidden in the leaves, moss armor, brace, answering blade, thick hide, salvage protocol, field dressing, and the special actions ember spit and mortar barrage (area attacks) and lantern gaze (mind control)
- [x] Roster of 16 original units, 4 in each of 4 crossover factions (two of them multi-hex)
- [x] Snake draft with a points budget, passing, unique limits and start zone room
- [x] Optional faction-pure mode
- [x] Balance model to set and check point costs, enforced by a test
- [x] Client: budget and faction options, points in the draft, special action buttons, ability rolls and notes in the dice panel and log
- [ ] Grow the roster toward 30 units (later content drops)

### Phase 5: Online multiplayer (this PR)
- [x] Shared protocol package: every client message checked with a schema before the server acts on it
- [x] Authoritative game server running the rules engine; a player can only act for their own seat
- [x] Lobbies with 5-letter room codes, up to 6 players, host starts the game; any map, including custom ones, with every setup option
- [x] Each device sees only its own view: other players' secret tokens, the dice seed and the RNG never leave the server
- [x] Reconnecting: a seat token kept in the browser puts a player back in their seat after a dropped connection or a reload
- [x] Spectating by room code, with the same hidden information as an outsider
- [x] Leaving mid-game concedes; the game goes on for the rest
- [x] Game replays: download the record at game over and step through it in the replay viewer (online and hot-seat games)
- [x] Client: Online panel on the setup screen, lobby, turn gating per device, connection status, no pass-the-device screen online
- [x] Docker image for the server, a Render blueprint, and hosting steps in [HOSTING.md](HOSTING.md)
- [x] Tests: protocol and server tests (secrecy, authority, rejoin, spectators, replays) and a browser test with two players and a spectator on separate devices
- [ ] Create the Render service and set `GAME_SERVER_URL` (needs the repository owner's Render account; steps in HOSTING.md)

### Phase 6: Later (optional)
- [ ] Computer opponent
- [ ] Sound, real models and art
- [ ] Tutorial built on the Basic game
- [ ] Saved games
