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

### Phase 0: Foundations (this PR)
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

### Phase 1: Basic game (milestone 1)
- [ ] About 8 original starter units (Basic stats, plus Height and footprint for tokens)
- [ ] Game setup screen: players (2 to 6), map, Basic draft by card count
- [ ] Deployment into start zones
- [ ] Unit tokens on the board; hover or click to show the unit card
- [ ] Token placement UI with a pass-the-device screen between players
- [ ] Initiative and turn display
- [ ] Movement: reachable hexes, climbing cost, friendly pass-through, all terrain effects
- [ ] Basic line of sight
- [ ] Attacks with animated dice; destruction on any wound
- [ ] Round limit and elimination victory screens
- [ ] Browser smoke test that plays a full scripted game

### Phase 2: Map editor
- [ ] Place, rotate and stack all piece shapes in every terrain
- [ ] Bridges and overhangs, with live validation
- [ ] Scenery objects (trees, walls) that block line of sight and movement
- [ ] Start zone painting for up to 6 seats
- [ ] Save and load maps as files; library of premade maps

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
