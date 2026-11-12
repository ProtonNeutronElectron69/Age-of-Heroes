# Age of Heroes: Roadmap and Progress

A browser-based, turn-based 3D tactics game for 2 to 6 players. See [RULES.md](RULES.md) for the rules, [ARCHITECTURE.md](ARCHITECTURE.md) for how the code fits together, and [CONTENT.md](CONTENT.md) for adding units, abilities and maps.

## Status

The core game is complete and playable: the Basic and Advanced rules, a 48-unit roster in 6 factions, a map editor with four premade maps, hot-seat and online play, saved games and replays. Over 200 unit and simulation tests and 5 browser tests run in CI, each pull request running only the ones its changes affect ([TESTING.md](TESTING.md)); every merge to `main` publishes the game to GitHub Pages.

### Next
- **Needs the repository owner:** create the online game server on Render and set the `GAME_SERVER_URL` repository variable (about 10 minutes; see [HOSTING.md](HOSTING.md)). Until then the published site can only play online against a server whose address is typed in.
- **On hold (Phase 6):** a computer opponent, and a tutorial built on the Basic game.
- **On hold until the core game is complete (Phase 7):** sound and music, 3D figure models, terrain and scenery art.

### Ideas, not scheduled
- More premade maps.
- A balance pass from real playtests (costs come from the balance model so far).
- Further content drops: units, factions and abilities.

### How work is delivered
Each phase or drop is one pull request from a working branch, with CI green before it is merged. The owner asks for each merge. Keep [RULES.md](RULES.md), this file and the other docs up to date in the same pull request as the change.

## Decisions

| Area | Decision |
|---|---|
| Platform | Browser game: TypeScript, Three.js (via React Three Fiber), React for menus and cards |
| Players | 2 to 6 in every mode |
| Play modes | Hot-seat and online (done); computer opponent on hold |
| Online hosting | Game server in a Docker image; Render recommended (free tier, deploys from `render.yaml`). The server keeps rooms in memory only; the host saves a game to a file to resume it later. See [HOSTING.md](HOSTING.md) |
| Line of sight | Advanced: automatic check from eye point to hit band, plus a figure's-eye camera. Basic: forgiving |
| Art | Unit cards are seven-hex cards in faction colours, with windows waiting for unit art and hit zone pictures. Otherwise none for now: units are tokens as tall as their Height, terrain is flat colour, hovering or clicking a token shows its card, and a red arrow marks the figure chosen to act. Sound, models and the rest of the art come in Phase 7 |
| Unit roster | Original units only, across all eras and myths. Squads have 1 special ability and heroes 2 (Flying not counted); heroes have 2 to 8 Life, most squads 1 (tough squads of 2 or 3 figures up to 3). Heroes and squads, and ranged and melee, stay within about 60/40. Point costs set with the balance model |
| Involvement | Hands-off: work arrives as pull requests with a playable build; the owner decides when to merge |

## Phases

### Phase 0: Foundations (done, #1)
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

### Phase 1: Basic game (done, #2)
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

### Phase 2: Map editor (done, #3)
- [x] Place, rotate and stack all seven piece shapes in all ten terrains; pieces land on whatever is under them
- [x] Bridges and overhangs, with a manual level control and live validation (overlaps, floating pieces, scenery, zones, layouts)
- [x] Scenery (trees, ruined walls, boulders) that blocks movement, deployment and line of sight
- [x] Start zone painting for up to 6 zones, and which zones each player count uses
- [x] Undo and redo
- [x] Save maps in the browser ("My maps"), export and import map files, and play any map
- [x] Library of four premade maps: Proving Grounds, Twin Fords, The Mesa and Glacier Pass
- [x] Setup screen offers only the player counts a map supports
- [x] Browser test that builds, exports, imports and plays a custom map

### Phase 3: Advanced rules core (done, #4)
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

### Phase 4: Abilities and armies (done, #5)
- [x] Ability system: abilities named on cards with tunable params, implemented as hooks into attacks, defense, movement, reactions and end of turn
- [x] All 17 abilities on the roster: flying, trample, smoke step, massed volley, grove song, rally the line, deflector field, hidden in the leaves, moss armor, brace, answering blade, thick hide, salvage protocol, field dressing, and the special actions ember spit and mortar barrage (area attacks) and lantern gaze (mind control)
- [x] Roster of 16 original units, 4 in each of 4 crossover factions (two of them multi-hex)
- [x] Snake draft with a points budget, passing, unique limits and start zone room
- [x] Optional faction-pure mode
- [x] Balance model to set and check point costs, enforced by a test
- [x] Client: budget and faction options, points in the draft, special action buttons, ability rolls and notes in the dice panel and log
- [x] Grow the roster to 30 units (see Roster, below)

### Roster: 30 units (done, #8)
- [x] 14 new original units across all eras and myths: sabre-tooth predators, ancient desert archers, Viking huscarls, medieval knights, samurai, World War 2 riflemen, relentless hunter robots, skeleton legions, orc raiders, a necromancer, a death knight, a bone wyrm, an angel and a battle mage
- [x] Two new factions, the Ashen Host (undead, orcs and dark magic) and the Dawnhold Covenant (knights, northmen, archers, an angel and a wizard), and one new unit for each starter faction: 6 factions of 5
- [x] Balance across the roster: 15 heroes and 15 squads, 15 ranged and 15 melee units, and every faction has heroes, squads, ranged and melee units
- [x] 14 new abilities: Charge, Steady Aim, Longshot, Pack Hunt, Way of the Blade, Bloodrage, Fury, Smite the Unholy, Command the Dead, Shield Wall, Soul Reap, Reboot, Reassemble, and the Arc Lightning special action
- [x] Life: heroes have 2 to 8 (the Siege Walker drops from 9 to 8); most squads have 1, and three tough squads of 2 or 3 figures have more: Hollowsteel Hunters (2 figures, 3 Life), Silverlance Knights and Duskfang Prowlers (3 figures, 2 Life). A test enforces it
- [x] Every squad has 1 special ability and every hero 2 (Flying not counted); the starter heroes, and the Skyhook Raiders, gained one each, mostly reusing existing rules under names of their own. A test enforces the counts
- [x] The first 3x1 figure (Marrowcoil, the Bone Wyrm), checked to deploy on every map
- [x] Point costs set with the balance model, every unit within 0.9 to 1.05 of its modelled value (some starter costs moved by 5 to 15 points to get there); random full games now close in and fight, exercising the new abilities

### Phase 5: Online multiplayer (done, #6)
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
- [ ] Create the Render service and set `GAME_SERVER_URL` (needs the repository owner's Render account; see Next, below)

### Phase 6: Saved games, computer opponent, tutorial
Saved games are done (#7); the computer opponent and the tutorial are on hold.
- [x] Saved games
  - [x] Named saves of hot-seat games in the browser: save from the draft or the battle, then load, download or delete them from the setup screen
  - [x] Save files: download a game and load it on any device; the same file opens in the replay viewer
  - [x] The unfinished game is still kept automatically, and the setup screen says which game "Continue" resumes
  - [x] Online save files: the host can save at any moment and download the game; later the host resumes it in a new room from the Online panel, each player claims their army, and the host continues from the exact same position. The server keeps nothing on disk
  - [x] Coming back to an online game (reload, dropped connection) brings back the whole game log, not just the board
  - [x] The client waits up to 90 seconds for a sleeping server to wake, and says so
  - [x] Tests: host-only saving, resuming and claiming armies on the server; browser tests that save, quit, reload and load a hot-seat game three ways, and save an online game mid-battle and resume it in a new room with both players
- [ ] Computer opponent (on hold)
- [ ] Tutorial built on the Basic game (on hold)

### Playtest fixes
- [x] Eye view must be closed before ending a turn, and it closes itself when a turn ends any other way. Ending a turn in eye view used to crash the play screen to a grey page
- [x] Eye view faces the enemy last clicked, else a target, else the nearest enemy. It no longer follows the pointer, which made the camera swing back and forth
- [x] A red arrow floats and spins above the figure chosen to act
- [x] Eye view looks all the way around: drag, or hold the arrow keys. It still starts facing the enemy last clicked, else a target
- [x] Smoother camera: the board draws each terrain type as one instanced mesh with one set of outlines (about 130 draw calls instead of over 1000), hovering skips work while the camera is dragged, and the camera follows the pointer more closely
- [x] Start zones on premade maps grow at deployment to fit the drafted army. Custom maps keep the zones painted in the editor, which can also turn growing on. A unit with no room at all sits the game out instead of stalling the game
- [x] Multi-hex figures are one larger piece instead of one token per hex
- [x] The selected unit's card stays on screen, with a button (or C) to hide it
- [x] The dice panel is larger, sits at the bottom of the screen and stays up until closed or the next action
- [x] The initiative roll shows its d20s in the dice panel
- [x] Keys: WASD pans the map, 1 to 4 pick a squad's figures, E opens and closes eye view, Space ends the turn, R turns a multi-hex figure, C shows or hides the unit card
- [x] Eye view uses a wider lens, so distances look true to the hex count
- [x] After a squad figure moves or attacks, the next figure that has not acted is selected

### Editor tools and custom points
- [x] Advanced games take any points budget from 50 to 9999, or no limit
- [x] Editor: "Show next problem" moves the camera to each problem in turn, and "Remove problem pieces" deletes every floating piece and every piece of scenery with a problem
- [x] Editor: drag a box in the Erase tool to remove everything in it, at every level
- [x] Editor: the grid is about 10 times larger and square; special terrain buttons explain their effect after a second
- [x] Editor: "Reset start zones"
- [x] Editor: random fill adds a light scatter of small pieces on a chosen level, matching the terrain under them, or scenery; click again for more
- [x] Editor: Shift+click puts a piece beside another at the same level. Bridges count as held up when they touch held-up pieces on two opposite sides, and a bridge of 1, 2 and 3-hex line pieces is drawn as one span with its hex outlines

### Map rules
- [x] Pieces stand by balance: a piece's middle must sit between at least 2 points it rests on or touches (1 for a single hex). Bridges and caves stand; a slab held at one edge does not. The editor shows a piece that would not be held up in orange before it is placed
- [x] No sealed empty spaces inside the terrain, and no pieces off on their own
- [x] No scenery in start zones
- [x] "Fix problems" removes loose and detached pieces and problem scenery, fills sealed spaces and takes bad hexes out of start zones

### Roster: 48 units
- [x] A hero and two squads for every faction (18 units), with points from the balance model
- [x] 12 new rules: Pin, Shove, Grapple Line, Last Stand, Fae Step, Will-o'-the-Wisp, Regrowth, Volatile Core, War Drums, Corpse Feast, Challenge, Piercing and Mending Hymn
- [x] Heroes and squads, and ranged and melee, kept within about 60/40 (now 21 heroes and 27 squads, 24 ranged and 24 melee)

### Faster checks
- [x] CI runs only the checks a change affects: docs run nothing, unit card data runs the content tests, and each browser test runs only for the code it covers, in parallel. Pushes to `main` still run everything. `pnpm check:affected` does the same locally. See [TESTING.md](TESTING.md)

### Phase 7: Sound, models and art (on hold until the core game is complete)
- [x] Unit cards redrawn as seven-hex cards in faction colours, for the whole roster, on the draft, play and replay screens. Each faction has a colour theme and an emblem. The card shows the unit's token label in its owner's colour and counts down Life as wounds land; clicking a card shows it large. Open the game with `?cards` in the address to see every card
- [ ] Unit art and hit zone pictures for the cards. In progress: one unit (Lady Asagiri) is drawn, and the art style is being chosen from four mockups (open the game with `?cards&art` in the address). Drawings are flat shapes in code (`ui/art/figures.ts`), so one drawing serves every style and the hit zone picture. The hit zone picture is grey with the hit band, the top 40% of the body, in red. Units without a drawing keep the stand-ins
- [ ] Sound effects and music
- [ ] 3D models for the figures in place of tokens
- [ ] Terrain textures and scenery art
