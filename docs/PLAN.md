# Age of Heroes: Implementation Plan

A browser-based, turn-based 3D tactics game for 2 to 6 players. See [RULES.md](RULES.md) for the game rules.

## Decisions

| Area | Decision |
|---|---|
| Platform | Browser game: TypeScript, Three.js (via React Three Fiber), React for menus and cards |
| Players | 2 to 6 in every mode |
| Play modes | Hot-seat first, then online; computer opponent maybe later |
| First milestone | Basic game playable end to end |
| Line of sight | Advanced: automatic check from eye point to hit band, plus a figure's-eye camera. Basic: forgiving |
| Art | None at first: units are tokens as tall as their Height, terrain is flat colour. Hovering or clicking a token shows its card |
| Unit roster | Original units built to the same balance targets as classic hex wargames (stat bands, hero and squad mix, point ranges). Point costs checked with a combat simulator |
| Involvement | Hands-off: each phase ends with a pull request and a playable link |

## Architecture

```
packages/rules     the rules engine in plain TypeScript, no graphics; runs in the browser or on a server
packages/content   unit cards, terrain, tile pieces and maps as data files, validated on load
apps/client        the game: 3D scene, cards, map editor
apps/server        Phase 5: online game server using the same rules engine
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

### Phase 2: Map editor (this PR)
- [x] Place, rotate and stack all seven piece shapes in all ten terrains; pieces land on whatever is under them
- [x] Bridges and overhangs, with a manual level control and live validation (overlaps, floating pieces, scenery, zones, layouts)
- [x] Scenery (trees, ruined walls, boulders) that blocks movement, deployment and line of sight
- [x] Start zone painting for up to 6 zones, and which zones each player count uses
- [x] Undo and redo
- [x] Save maps in the browser ("My maps"), export and import map files, and play any map
- [x] Library of four premade maps: Proving Grounds, Twin Fords, The Mesa and Glacier Pass
- [x] Setup screen offers only the player counts a map supports
- [x] Browser test that builds, exports, imports and plays a custom map

### Phase 3: Advanced rules core
- [ ] Card backs and Advanced stats (Life, wounds)
- [ ] Elevation bonuses, Height climbing limit, falling damage
- [ ] Engagement and passing strikes
- [ ] Strict 3D line of sight with the figure's-eye camera
- [ ] Multi-hex figure movement (2x1, 3x1, 2x2)
- [ ] Squad activations with interleaved moves and attacks

### Phase 4: Abilities and armies
- [ ] Ability hook system
- [ ] Flying and a first set of abilities (mind control, area attacks, shields, tag-based auras)
- [ ] Roster of about 16 original units across 4 crossover factions, growing toward 30
- [ ] Snake draft with points budget and unique limits
- [ ] Optional faction-pure mode
- [ ] Combat simulator to set and check point costs

### Phase 5: Online multiplayer
- [ ] Authoritative game server running the rules engine
- [ ] Lobbies with room codes, up to 6 players
- [ ] Secret token placement enforced by the server
- [ ] Reconnecting and spectating
- [ ] Game replays from the command log
- [ ] Choose and set up a host for the server

### Phase 6: Later (optional)
- [ ] Computer opponent
- [ ] Sound, real models and art
- [ ] Tutorial built on the Basic game
- [ ] Saved games
