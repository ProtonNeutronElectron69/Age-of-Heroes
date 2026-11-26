# Age of Heroes: Roadmap and Progress

A browser-based, turn-based 3D tactics game for 2 to 6 players. See [RULES.md](RULES.md) for the rules, [ARCHITECTURE.md](ARCHITECTURE.md) for how the code fits together, and [CONTENT.md](CONTENT.md) for adding units, abilities and maps.

## Status

The core game is complete and playable, online too: the game server runs on Render and the published site uses it ([HOSTING.md](HOSTING.md)). It has one full set of rules, a 56-unit roster in 7 factions, a map editor with seven premade maps, hot-seat and online play, and saved games. 805 unit and simulation tests and 8 browser tests run in CI, each pull request running only the ones its changes affect, and a full run takes about 8 minutes, most of it `full-game` ([TESTING.md](TESTING.md)); every merge to `main` publishes the game to GitHub Pages.

### Next
In progress: better graphics (item 2 below). Planned, in no set order; each starts when the owner asks:
1. **A balance pass on unit stats.** Point costs come from the balance model so far; use real playtests to adjust each card's Life, Move, Range, Attack and Defense, and then its cost, faction by faction. Glyph numbers (`TUNING.glyphs`) and the newer rule numbers (the swamp d20, the strike from behind) are part of it.
2. **Better graphics** (in progress, in four parts with the owner's review after each; see "Better graphics" below). A **Graphics** setting, High (the default, every effect on) or Low, with test mode on Low; lighting and shadows first, then effects and reactions in play, then sharper terrain, then more detailed figures.
3. **Better hit boxes.** Line of sight now needs some part of the target's hit band, the top 40% of a token as tall as its Height (`HIT_BAND_FROM` in `world.ts`). Fit it better to each unit: a shape or band per unit or per kind (crouching, wide, flying on a stand, large beasts), still from the rules, never the 3D model. It changes who can see whom, so it is a new rule option for new games (see CLAUDE.md), and the eye view and token display should show the new shape.

Also open:
- **More premade maps.** Riverbend shows a quick way: lay the map out in code, check it with `buildBoard`, and save the JSON (see [CONTENT.md](CONTENT.md), Maps).
- **Further content drops:** units, factions and abilities.
- **The dice show, further:** the initiative d20 still follows a scripted tumble; it could be thrown into the tray too. Very large attack rolls (17 or more dice) now and then leave a die that will not settle in time, which is then set on the nearest free spot, a small jump (`placeFlat` in `scene/diceRoll.ts`).

On hold (Phase 6): a computer opponent, and a tutorial.

Done lately, newest first: more varied abilities (25 new ones, every ability on two units at most, and a new `power` command); the ledger play screen (parchment sheets, a ribbon in the player's colour, one line of help, and one drawer for the log, glyphs and keys); the move preview (a see-through copy of the figure where a move ends, facing the way it will face, R to pick a big figure's end facing, and more natural routes for big figures); more playtest tweaks (glyphs picked up as a turn ends, the strike from behind for melee units only, special actions while engaged, coloured and bouncier dice, glowing move markers, #76); playtest tweaks (zone of control, a d20 for swamp, Resurrection for squads that lost figures, turning before a move, a glyph pickup animation, and no more replay viewer, #75); a dice tray for the attack show, with dice that tumble by physics (#73); the Sunken Hive, a seventh faction of swamp aliens (#72); the map gallery, draft filters, test game and moves in pieces (#70); every attack needing its target in front (#69); tokens and glyphs on the table and the token allowance (#68); facing (#67); detailed figure models for every unit (#63 to #66, finishing Phase 7); the detailed look for scenery and board tiles; the Riverbend map; glyphs; more scenery; fixes after v1.0. Phases 8 (the tabletop feel) and 9 (playtest updates) came before; the game as it stood after Phase 9 is version 1.0. Each has its section below.

Worth knowing before the next change: games saved with facing before #69 may not replay exactly (the facing rules changed twice after #67), and new rule options must stay optional fields of the setup (see [CLAUDE.md](../CLAUDE.md)): every new game takes the shared `NEW_GAME_RULES` (eight options), plus `glyphs`, and online `draft` and `initiative`. The dice show only shows rolls the rules have made; its throws are seeded from the roll, so changing the simulation never changes a game. The design pages (`?cards`, `?models`, `?dice`) are the quickest way to look at cards, models and the dice show.

### How work is delivered
Each phase or drop is one pull request from a working branch, with CI green before it is merged. The owner asks for each merge. Keep [RULES.md](RULES.md), this file and the other docs up to date in the same pull request as the change.

## Decisions

| Area | Decision |
|---|---|
| Platform | Browser game: TypeScript, Three.js (via React Three Fiber), React for menus and cards |
| Players | 2 to 6 in every mode |
| Play modes | Hot-seat and online (done); computer opponent on hold |
| Online hosting | Game server in a Docker image; Render recommended (free tier, deploys from `render.yaml`). The server keeps rooms in memory only; the host saves a game to a file to resume it later. See [HOSTING.md](HOSTING.md) |
| Line of sight | Automatic check from eye point to hit band, plus a figure's-eye camera |
| Table | The board stands in the middle of a square gaming table sized to the board and the unit cards, so a board of any shape sits well on it, in one of three styles each player picks for their own screen. Cards lie on a side of the table chosen by where their player's start zone lies, and face that side; up to four players get a side each, and five or six share, two to a side, as they would for a player sitting there. A card is seven hexes of the board's own size, so its figures fit on it: they stand on it before deployment and are stood back on it once destroyed. The table does not change the camera |
| Art | Unit cards are seven-hex cards in faction colours. Unit art is drawn, not rendered from models, in an ink and colour style; every unit has a drawing and a red and grey hit zone picture. Units are figure models on the board (or tokens as tall as their Height, if a player prefers). The board's tiles and scenery are painted in code: a detailed look (textured and moulded like plastic, with bold outlines; the default) or the classic flat colours, as each player chooses. Hovering or clicking a figure shows its card, and a red arrow marks the figure chosen to act. Figure models are built in code from a few solid shapes, like the drawings, and arrive in stages: size and shape first, detail later. A figure stands on a round base a little smaller than its hex; a larger footprint gets one base with a lobe on each hex, thinner where it passes from hex to hex. Figure and base together are as tall as the card's Height; in a squad, a figure that kneels or crouches may be shorter. Flying figures stand on flight stands, as tabletop miniatures do. The body may reach a fifth of a hex past its hexes; a unit that reaches further gets a larger footprint on its card. Bases are light brown, with a ring of colour round the bevelled edge. Model and ring are coloured in one of three schemes: faction models with player rings, player models with faction rings, or every model in the same medium grey with player rings. In every scheme only the ring takes the second colour; the rest of the base stays brown. The Brass Hussars stay at Height 6 for now, on horses a little under life size, rather than growing to Height 7. On the board a single-hex figure faces the nearest enemy figure, across a side of its hex; a larger figure faces along its base. Line of sight keeps using the token shape |
| Sound effects | Open licences only, like the music. They play through the Web Audio API so short sounds start at once and may overlap. Sounds heard all the time (hops, hover, clicks) are kept quiet |
| Music | Instrumental, open licences only (CC0 or CC-BY, never share-alike or non-commercial), every track credited in the game and in [CREDITS.md](CREDITS.md). Separate music for the menus, play, battle and the victory screen. A round ending has no music of its own |
| Unit roster | Original units only, across all eras and myths. Squads have 1 special ability and heroes 2 (Flying not counted); heroes have 2 to 8 Life, most squads 1 (tough squads of 2 or 3 figures up to 3). Heroes and squads, and ranged and melee, stay within about 60/40. Point costs set with the balance model |
| Drafting | Hot-seat: a snake draft; unique units once per game, common units any number of times. Online: an open draft, everyone picking at once, each card once per game. Either way the d20 roll-off winner deploys first; after an open draft players deploy one unit each in turn |
| Online extras | Initiative waits until every player has rolled, so nobody sees a result early. Players can ping a spot (P); pings are passed on by the server outside the game and never saved or replayed. Hot-seat games and older saves keep the automatic roll |
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

### Phase 1: First playable game (done, #2)
- [x] 8 original starter units across 4 factions, with both card sides filled in
- [x] Game setup screen: 2 to 6 players, names, army size, round limit, map
- [x] Snake draft by card count, with unique cards exclusive and start zone room checked
- [x] Deployment into start zones in draft order, with auto place
- [x] Map layouts that pick spread-out start zones for each player count
- [x] Unit tokens on the board, as tall as their Height, with the hit band shown; hover or click for the unit card
- [x] Token placement with a pass-the-device screen between players
- [x] Initiative and round bar showing revealed tokens
- [x] Movement: reachable hexes, path preview and cost, climbing and headroom, friendly pass-through, water and swamp, lava, ice, road bonus
- [x] Simple line of sight against terrain
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
- [x] Library of four premade maps: Proving Grounds, Twin Fords, The Mesa and Glacier Pass (two large ones joined later; see Phase 9)
- [x] Setup screen offers only the player counts a map supports
- [x] Browser test that builds, exports, imports and plays a custom map

### Phase 3: Full rules core (done, #4)
- [x] The full rules as a second rule set at setup; drafts by card count until the Phase 4 points budget (the simpler rule set has since been removed)
- [x] Card backs with Life and abilities; Life and wounds tracked, with life badges on tokens
- [x] Elevation bonuses, the Height climbing limit, and falling damage on every step
- [x] Engagement, the engaged-attack restriction, melee needing engagement, and passing strikes
- [x] Strict 3D line of sight against hit bands, with figures blocking, plus a figure's-eye camera
- [x] Multi-hex figures (2x1, 3x1, 2x2): standing with a 1-level straddle, shifting and turning, deployment with facing, sight and range from any hex
- [x] Squad activations with interleaved moves and attacks (both rule sets)
- [x] Risky paths (lava, ice, falls, passing strikes) shown in orange and avoided by the suggested path
- [x] Rule numbers (falling dice, passing strike dice, height bonuses, straddle) as tuning data
- [x] One original 2x1 unit, Old Rootback, to bring big figures into play
- [x] Tests: rule and multi-hex unit tests, random games, and a browser game

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
- [x] Game replays: download the record at game over and step through it in the replay viewer (online and hot-seat games). Removed later at the owner's request (playtest tweaks)
- [x] Client: Online panel on the setup screen, lobby, turn gating per device, connection status, no pass-the-device screen online
- [x] Docker image for the server, a Render blueprint, and hosting steps in [HOSTING.md](HOSTING.md)
- [x] Tests: protocol and server tests (secrecy, authority, rejoin, spectators, replays) and a browser test with two players and a spectator on separate devices
- [x] Create the Render service and set `GAME_SERVER_URL`: the server runs at `wss://Age-of-Heroes-server.onrender.com/ws` (health page: <https://age-of-heroes-server.onrender.com/health>)

### Phase 6: Saved games, computer opponent, tutorial
Saved games are done (#7); the computer opponent and the tutorial are on hold.
- [x] Saved games
  - [x] Named saves of hot-seat games in the browser: save from the draft or the battle, then load, download or delete them from the setup screen
  - [x] Save files: download a game and load it on any device
  - [x] The unfinished game is still kept automatically, and the setup screen says which game "Continue" resumes
  - [x] Online save files: the host can save at any moment and download the game; later the host resumes it in a new room from the Online panel, each player claims their army, and the host continues from the exact same position. The server keeps nothing on disk
  - [x] Coming back to an online game (reload, dropped connection) brings back the whole game log, not just the board
  - [x] The client waits up to 90 seconds for a sleeping server to wake, and says so
  - [x] Tests: host-only saving, resuming and claiming armies on the server; browser tests that save, quit, reload and load a hot-seat game three ways, and save an online game mid-battle and resume it in a new room with both players
- [ ] Computer opponent (on hold)
- [ ] Tutorial (on hold)

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
- [x] Games take any points budget from 50 to 9999, or no limit
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
- [x] A full CI run down from 10 to 11 minutes to about 3 (#31 to #34):
  - [x] The online browser test reloads a page during the draft, plays a few turns rather than a whole game (the server's unit tests play whole games), and gives each player their own browser. It had failed on `main` since the gaming table
  - [x] `full-game` plays to the 5-round limit and ends each turn at once after its one-off checks
  - [x] Browser jobs install only Chromium's headless shell, cached, and no system packages
  - [x] The play and replay boards draw only when something changes; the selection arrow and the rings keep moving unless the system asks for reduced motion, as the browser tests do
  - [x] Browser tests run in test mode, with a simpler gaming table to draw; players keep the full table
  - [x] A failing browser test's screenshot is attached to the CI run

### Menus, gallery and play screen (done, #22 to #27)
- [x] A unit gallery on the main menu: every unit card in a scrolling grid, 5, 3 or 1 across, filtered by faction, type, attack and a search, and sorted by name, faction or a stat. Choosing a card opens its figure model to turn and zoom (#22)
- [x] Figure models drawn on the board (#23)
- [x] A reworked main menu in four styles chosen under **Menu style**: War Table (the board and its armies drift behind the menu), Atlas (an inked atlas on parchment), Banner Hall (house banners in a torchlit hall) and Hex Command (a honeycomb of faction hexes). Each fits a landscape window without scrolling and animates its buttons on hover (#24)
- [x] Menu defaults: no round limit, a 1000 point army, Proving Grounds and 2 players, with army buttons for 500, 750, 1000 and 1500 points. Gallery cards lift and glow gold on hover (#25)
- [x] The play screen follows the action. On every player's turn the camera glides to the acting unit at a standard zoom and angle and its card comes up; after a squad figure acts, the camera moves on to the next figure. Resting the pointer on another unit for half a second shows its card, smaller, below the acting unit's card until the pointer leaves; clicking a unit keeps its card there (#26)
- [x] One set of rules. The simpler second rule set was removed, with its card fronts and its card-count drafts: every game has Life, abilities, height bonuses, engagement and strict line of sight, and armies are drafted to a points budget. Saves and replays of games under the removed rules are refused with a message (#27)

### Phase 7: Sound, models and art (done)
- [x] Unit cards redrawn as seven-hex cards in faction colours, for the whole roster, on the draft, play and replay screens. Each faction has a colour theme and an emblem. The card shows the unit's token label in its owner's colour and counts down Life as wounds land; clicking a card shows it large. Open the game with `?cards` in the address to see every card
- [x] Unit art and hit zone pictures for all 48 cards, drawn in five batches. The art style is ink and colour: dark outlines, flat natural colours and hatched shadows. The hit zone picture is the same drawing in greys, with the hit band (the top 40% of the body) in red and gear left grey. The faint emblem that stood in for art is gone. Open the game with `?cards` in the address to see every card
  - [x] Batch 1 (10 of 48): Captain Marisol Vance, Harrow Line Riflemen, Lady Asagiri, Glade Wardens, Sentinel K-7, Nexus Breachers, Vorhal, Barrow Legion, Dame Rowena Ashgrove, Stormwake Huscarls
  - [x] Batch 2 (20 of 48): Sister Maren Holloway, Gatewarden Pikemen, Lady Suzume, Crimson Lotus Guard, Sylvanne, Briar Sprites, Proxima, Swarmling Drones, Morvane, Covenant Crossbowmen
  - [x] Batch 3 (30 of 48): Sergeant Brannock, Concord Grenadiers, Kenzo, Shirokage Ronin, Queen Ilyth, Mossback Treefolk, Nexus Reclaimers, Grubnak, Bonebow Archers, Solenne
  - [x] Batch 4 (40 of 48): Concord Fusiliers, Teppo Gunners, Ashfang Oni, Duskfang Prowlers, Cinderjaw, Skyhook Raiders, Ruinmaw Orc Raiders, Ghoul Pack, Magister Orrin Vael, Silverlance Knights
  - [x] Batch 5 (48 of 48): Brass Hussars, Hollow Reed Shinobi, Old Rootback, Hollowsteel Hunters, Siege Walker Atlas, Marrowcoil, Sunbound Archers, Dawn Acolytes
- [x] Music, all instrumental and under open licences (CC0 or CC-BY; [CREDITS.md](CREDITS.md) and the menu's Credits button list them). The owner picked the tracks from a menu of options
  - [x] Four moods: the menus, a game in play, battle (from an attack's intro until 12 seconds after its show) and the victory screen
  - [x] A mood with several tracks plays them in turn: each fades out over its last 2 seconds, 2 seconds of quiet follow, and the next fades in. Changing mood fades the old music out, then the new in; the old mood keeps its place for next time
  - [x] Music on or off and its volume, on the main menu and under Display, kept in the browser
- [x] Sound effects, under open licences (CC0 or CC-BY), listed with the music in [CREDITS.md](CREDITS.md) and the Credits panel. The owner picked them from a menu of options; where several were picked, one plays at random, never the same twice running
  - [x] Board: a piece set down for each hop (a dragged figure makes it as the move is made), a splash on water or swamp, a fiery thump on lava
  - [x] Attacks: a sword sound (three to pick from) or a bow sound (two) as the intro begins, dice as they are thrown (attack, then defense, and each initiative d20), a blow as wounds land, and a clatter as a destroyed figure shakes
  - [x] Game: a gong as each round begins, a card placed when a unit is drafted or deployed, a glass ping when another player pings
  - [x] Interface: a tick when the pointer moves onto a menu button or a unit card in the draft or the gallery, and a click for every button
  - Not wanted for now: sounds for a blocked attack, your turn, or a refused action
- [x] 3D models for the figures in place of tokens
  - [x] Stage 1: a low polygon model for every unit, sized to its Height and its base. Open the game with `?models` in the address to see them
    - [x] Mockup (4 of 48): Captain Marisol Vance, Brass Hussars, Glade Wardens, Old Rootback
    - [x] Light brown bases with a coloured ring round the edge, waisted between hexes on larger footprints, and two colour schemes to switch between: faction models with player rings, or player models with faction rings
    - [x] A hero and a squad for every faction (12 of 48): Lady Asagiri, Hollow Reed Shinobi, Siege Walker Atlas, Nexus Reclaimers, Marrowcoil, Barrow Legion, Solenne, Stormwake Huscarls
    - [x] Ten more (22 of 48): Concord Fusiliers, Ashfang Oni, Shirokage Ronin, Cinderjaw, Mossback Treefolk, Sentinel K-7, Swarmling Drones, Vorhal, Ghoul Pack, Dame Rowena Ashgrove
    - [x] Ten more (32 of 48): Gatewarden Pikemen, Sister Maren Holloway, Kenzo, Teppo Gunners, Queen Ilyth, Briar Sprites, Skyhook Raiders, Proxima, Grubnak, Covenant Crossbowmen
    - [x] A third colour scheme: every model in medium grey, with the player's colour on the ring
    - [x] Ten more (42 of 48): Sergeant Brannock, Concord Grenadiers, Lady Suzume, Sylvanne, Duskfang Prowlers, Nexus Breachers, Morvane, Bonebow Archers, Magister Orrin Vael, Silverlance Knights
    - [x] The last 6 units (48 of 48): Harrow Line Riflemen, Crimson Lotus Guard, Hollowsteel Hunters, Ruinmaw Orc Raiders, Dawn Acolytes, Sunbound Archers
    - [x] Draw the models on the board in place of tokens, with Models or Tokens and the colour scheme as settings under Display (T switches). Line of sight and the hit band keep using the token shape
  - [x] Stage 2: more detail and colour, painted part by part (a uniform, armour, scales or fur in the scheme's model colour, the rest in natural colours), drawn in the detailed look; the classic look keeps the stage 1 models
    - [x] Six units: Captain Marisol Vance and the Concord Fusiliers (Iron Concord), Lady Asagiri and the Crimson Lotus Guard (House Kagero), Cinderjaw and the Duskfang Prowlers (Verdant Court)
    - [x] Ten more: Siege Walker Atlas and the Nexus Reclaimers (Nexus Collective), Vorhal and the Barrow Legion (Ashen Host), Dame Rowena Ashgrove and the Stormwake Huscarls (Dawnhold Covenant), Sister Maren Holloway and the Gatewarden Pikemen (Iron Concord), the Teppo Gunners (House Kagero) and the Glade Wardens (Verdant Court)
    - [x] Ten more: Sergeant Brannock and the Harrow Line Riflemen (Iron Concord), Kenzo and the Shirokage Ronin (House Kagero), Sylvanne and the Mossback Treefolk (Verdant Court), Sentinel K-7 and the Nexus Breachers (Nexus Collective), the Bonebow Archers (Ashen Host) and the Covenant Crossbowmen (Dawnhold Covenant)
    - [x] The last 22: the Brass Hussars (on painted horses) and the Concord Grenadiers (Iron Concord); Solenne, Magister Orrin Vael, the Silverlance Knights, the Dawn Acolytes and the Sunbound Archers (Dawnhold Covenant); Lady Suzume, the Ashfang Oni and the Hollow Reed Shinobi (House Kagero); Proxima, the Skyhook Raiders, the Swarmling Drones and the Hollowsteel Hunters (Nexus Collective); Marrowcoil, Morvane, Grubnak, the Ghoul Pack and the Ruinmaw Orc Raiders (Ashen Host); Old Rootback, Queen Ilyth and the Briar Sprites (Verdant Court). Every unit now has one
- [x] Board tiles: a detailed look for each of the ten terrains, painted in code (a moulded relief and colour variation under a plastic finish; the tile sides show a lip of the top over layers of earth or stone; lava glows), each tile turned by a random sixth so neighbours differ, and bold black outlines so the levels of a stack are easy to count. The classic flat look stays: **Look** under Display, or the B key, switches between them during a game, along with the scenery and the figures
- [x] Scenery art, in the same detailed look: stone blocks with moss (and ivy on the small ruined wall), fieldstones under capstones on the low wall, sandstone on the large wall, bark and needled tiers on the trees, a lumpy lichen-spotted boulder, and forest-floor or flagstone bases. Shapes stay within the classic outlines, so line of sight is unchanged. The classic look keeps the flat colours

### Phase 8: Tabletop feel (done)
The game should feel like a game played on a table. Nothing here changes the rules: the engine, saves, replays and online play are untouched.
- [x] Part 1: the table and the figures
  - [x] The board stands in the middle of a square gaming table that is as large as the board and the cards need. The camera is as it was without the table. Three tables to choose from under Display: Tavern oak, Felt gaming table, and Play mat on a workbench
  - [x] Every unit's card lies on the table, on a side chosen by where its player's start zone lies, facing that side; up to four players get a side each, five or six share, two to a side. Figures wait on their card until they are deployed, and destroyed figures are stood back on it, as the same models. Resting the pointer on a card, or clicking it, shows the card beside the board
  - [x] A figure that moves hops hex by hex along its path; a slide, shove or swap glides. Online and in replays too
  - [x] A figure can be dragged with the left button onto the hex it should move to, as well as moved by clicking the hex
  - [x] H makes the chosen figure jump (the one under the arrow; on another player's turn, the whole acting unit), so it is easy to find
  - [x] The camera zooms in close enough to look a figure in the face and pulls back far enough to see the whole table in its room (#34)
- [x] Part 2: dice
  - [x] An attack zooms in on the fight: the camera glides to the two figures and both unit cards and models come up over a dimmed board, then 3D attack and defense dice tumble and land on the faces the rules rolled. A command with several rolls (an area attack) plays them in turn. A click skips it, and the dice panel keeps the result afterwards. **Dice rolls** under Display chooses the full scene, dice only (just the 3D dice, in a small tray), or none
  - [x] Initiative: each player clicks a d20, which tumbles and lands on their roll; a tie rolls again. Skip shows every result at once. Online, each player clicks their own die, and since #41 no die is rolled until everyone has
  - [x] Apart from online initiative (#41), the engine rolls everything in one step; only the showing changes. With reduced motion the dice appear already landed. Replays show the dice panel as before

### Phase 9: Playtest updates (done, #40 to #50)
Small changes asked for after playing, online games especially.
- [x] Camera follow: three boxes under Display (Auto pan, Auto rotate, Auto zoom), the follow about a fifth further back, and every glide waits for a moving figure to land (#40)
- [x] The draft opens on the battlefield, with each start zone in its player's colour and name; **View map** brings it back at any time (#40)
- [x] A middle click on a hex shows its terrain, elevation, headroom, special rules, scenery and start zone (#40)
- [x] Online drafts are open: everyone picks at once, each card once per game, and a taken card greys out for everyone with who took it (#41)
- [x] Online initiative waits for every player's roll before any result is made or shown (#41)
- [x] Browser tests: a "Known pitfalls" log in [TESTING.md](TESTING.md), and a long timeout for clicks that open or close a 3D view (#42)
- [x] Online pings: P points at the spot under the pointer for everyone, in play (#43) and on the draft map (#44)
- [x] Attack roll pacing: the attack dice tumble longer and land first, then the defense dice; the result stays 30% longer (#45)
- [x] A **Keys** panel under the game log lists the hot keys; click its heading to fold it away, and the choice is remembered
- [x] Attack effects: every attack opens with a two-second intro (click to skip), whatever **Dice rolls** says: the camera frames the two figures side by side, a red aura rises round the attacker and a blue one round each target, a red arrow arcs from attacker to target, and a bow (a shot from range) or crossed sword and shield (melee) floats over them. After the dice, a red number of wounds floats up from each figure hit (0 for an attack that did no harm; falls, terrain and abilities too), and a destroyed figure stays where it fell until it has shaken. Replays float the numbers and shake the fallen. Online, a skip needs every player's click, and the player whose turn it is waits until everyone has finished watching (#48)
- [x] The game is **v1.0**. The main menu shows the version and the date of the last update (MM/DD/YYYY) in its bottom right corner (#49)
- [x] Two large 4-player maps, about twice the size of Twin Fords on a square outline (24 by 28 hexes), with a start zone in each corner. The same turned 180 degrees and nearly mirror-symmetric, so every corner is equally far from the centre. **Frostspine Peaks**: a summit 13 levels high, snowy ridges and passes between the corners, glaciers and frozen tarns. **Mirewood Fen**: pools, channels and swamp under about a hundred trees, with causeways to a walled mound in the middle

### Fixes after v1.0
- [x] Activation tokens: one token per unit. A player with fewer than four living units places one on each and leaves the rest off; a token left off skips that turn. New games use it (`tokenRule: "onePerUnit"`); older saves keep stacking, so they replay exactly
- [x] The attack intro shows the melee sign for a normal attack on a neighbouring figure, whatever the attacker's Range
- [x] The gaming table no longer flickers when zoomed far out: the camera's near plane now scales with its distance, and the table's slab sits clear of its top surface

### More scenery
- [x] Four new pieces, after the owner's reference art, each filling its hexes on a base: a **large tree** (12 levels, 4 hexes), a **large wall** (a ruined castle wall, 7 levels, 3 hexes in a line), a **small ruined wall** (5 levels, 2 hexes) and a **low wall** (3 levels, 3 hexes). A figure next to a low wall rolls 1 extra defense die against attacks from range across it, and walking figures can climb across a low wall for 1 extra move but not stop on it. The one-hex tree has a base too
- [x] The editor turns bigger scenery with R and previews where it goes; random scenery fill scatters every kind, bigger pieces turned at random, and random terrain fill leaves the hexes under bigger scenery alone

### Glyphs (#56 to #58)
- [x] Glyphs: small hex tiles scattered face down on the battlefield once every unit is placed, from none to all 11 (a menu setting, 4 at first; one of each kind). A figure that ends a move on one picks it up; only its player learns what it is, and holds it beside the board to use at any time in their own turn
- [x] Five stat glyphs (+1 attack, +1 defense, +8 initiative, +3 range, +2 move), one per unit, lasting until the unit is destroyed; healing a unit fully; resurrecting a destroyed unit beside the player's other figures; wounding an enemy unit; cancelling an enemy's stat glyph; and two traps that spring when picked up (a wound, and a curse that destroys the figure two of its player's turns later)
- [x] The Glyphs panel lists held glyphs, the stat glyphs in play and the curses counting down; the hex tooltip says where one lies; the online lobby shows how many; the initiative show adds the bonus to the roll
- [x] Glyph changes: the Herald counts for the next initiative roll only, then is spent; the Hawk gives +3 range and goes only on a unit with a Range above 1; Return is renamed Resurrection
- [x] Resurrected units are placed by hand: the player clicks highlighted hexes for each figure, as at deployment, with Auto place, Clear, Cancel and Confirm

### Riverbend (#60)
- [x] A new 2-player map, built from the textured tile mockup: a river bends across open fields below a rocky hill with a snowy top, with a cobbled road and ford, a grassy knoll, a wood, a swamp, a frozen pond and a lava vent on the hill's flank. Scenery: four trees in the wood, a large tree, two boulders, a ruined wall, a small ruined wall on the knoll, a large wall by the pond and a low wall at the ford. Start zones run along the west and east edges and grow to fit the armies

### Facing (#67, changed in #68 and #69)
- [x] Figures face a way in new games (`facing`; older saves have none and play as before). A single-hex figure faces one of eight directions; a multi-hex figure faces along its base. Figures start facing the middle of the battlefield
- [x] After a move a figure faces along its last step; until it attacks, R turns it an eighth (Shift+R the other way), with an outline of its front cone on the ground. Tokens show their facing with a pointer on the cap
- [x] An attack needs its target in the attacker's front cone (180 degrees; at first only ranged attacks, every attack since #69); a melee attack from wholly behind the defender's cone rolls 2 more attack dice (`TUNING.behindBonus`), adding to the higher-ground bonus
- [x] Eye view turns only as far as the figure's front cone, so nothing behind it is ever on screen

### Tokens and glyphs on the table (#68, #69)
- [x] Every attack, melee as well as ranged, needs its target in the attacker's front cone (#69, which also took back #68's turning of melee fighters to face each other)
- [x] Stat glyphs in play lie face up on their unit's card on the table, with simple art drawn in code and their name; the Glyphs panel shows the same art
- [x] Activation tokens stand on the cards on the table: a player sees their own numbers, the others only the backs until a token is revealed
- [x] New games give each player numbered tokens for half the cards their army starts with, rounded up, plus X (`tokenAllowance: "half"`); older saves keep three

### Map gallery, draft filters, test game, moves in pieces (#70)
- [x] A map gallery, from **Preview maps** in the menu's Battlefield choice: every map in 3D with its start zones for each player count, its size, scenery and ground, and **Play on this map**
- [x] The draft's cards filter and sort as the unit gallery's do (search, faction, type, attack, sort), with **Only units I can draft**
- [x] **Test game** in the menu: two players with 500-point armies already drafted and deployed on Twin Fords, all 11 glyphs, new-game rules; play starts at token placement
- [x] A figure's move may be made in pieces, until it attacks: a figure keeps the selection while it has movement left

### The Sunken Hive (#72)
- [x] A seventh faction of eight swamp aliens, for 56 units: Vothrek the Overmind, Ixaru Mirestrider, Gulpmaw and Ulshae, Brood Tender (heroes), and the Hive Spawn, Murk Stalkers, Spore Lobbers and Fen Leapers (squads). Four ranged and four melee; points from the balance model
- [x] 5 new rules: Spawning Pool (a squad that rolls to bring back its fallen when it does not attack, more easily in water), Hive Command (an attack aura for Aliens), Numbing Glare (a d20 that leaves the target without defense dice), Long Strides (wading through water and swamp) and Mire Skin (defense in water and swamp). Swamp never wounds the last two
- [x] A murky olive card theme with an acid green trim and an eye emblem, card art for all eight, and a classic and a detailed model for each, built from one set of poses (`models/units/hive.ts`)
- [x] The roster is now 25 heroes and 31 squads, 28 ranged and 28 melee

### The dice tray (#73)
- [x] An attack's dice are thrown into a felt-lined wooden tray on a wooden table under a lamp, with soft shadows, instead of onto a flat green plane
- [x] The dice tumble by physics, worked out before they are shown: they bounce off the felt, the walls and each other, and come to rest flat, apart and inside the tray, on the faces the rules rolled. The attack dice come from the attacker's end and settle before the defense dice are thrown from the defender's
- [x] The two figures stand on the table at the tray's ends, outside its walls, drawn about twice as large as before; the camera frames the tray and both figures, and the tray grows with the number of dice
- [x] `?dice` in the address opens the show on its own, to roll any two units with any number of dice

### Playtest tweaks (#75)
- [x] **Zone of control** (`zoneOfControl`; older saves leave it out and play as before): a figure gets one free step a turn that keeps it beside an enemy it was already beside; each later such step draws a passing strike from every enemy it stays beside. A move in pieces counts as one
- [x] **Ride Them Down fixed**: the Brass Hussars' path went round the enemy they meant to ride through, because riding through drew that enemy's passing strike and the path finder avoids strikes. Under zone of control an enemy being ridden down makes no passing strikes on the rider that turn, so the safe path goes straight through
- [x] **Swamp** rolls a d20 at the end of a turn (`swampRoll: "d20"`): 1 to 5 is 1 wound, 6 or more nothing (`endTurnRoll` in the terrain data). Older saves keep the attack die
- [x] **Glyph of Resurrection** also works on a squad that has lost some figures: every lost figure returns unwounded; the survivors keep their wounds and the squad keeps its stat glyph
- [x] **Turning before a move**: a figure that has not attacked may turn (R) before it moves, at no cost, and still move and attack after
- [x] **No auto cycle away from an attack**: after a squad figure moves, it keeps the selection while it has something to attack (turning first if it must), as it does while it has movement left
- [x] **Glyph pickup animation**: once the figure lands, the tile lifts off its hex, spinning, and shows its face over the figure (a question mark for another player's glyph), then fades; the new glyph glows in the Glyphs panel
- [x] **Replays removed**: the menu's "Watch a replay", the replay viewer and the game over screen's "Download replay" are gone. Saves and resuming are unchanged

### More playtest tweaks (#76)
- [x] **Glyphs are picked up as a turn ends** (`glyphPickup: "turnEnd"`; older saves pick up as a move ends): a figure must end its unit's turn on the glyph, so stopping on one and moving on leaves it. The pickup animation lasts a second longer (2.4 s) and rises higher; on one device it shows the glyph's face to the player whose turn just ended
- [x] **Strike from behind for melee units only** (`strikeFromBehind: "meleeOnly"`): a unit whose card has a Range above 1 never gets the +2, even from right next to its target
- [x] **Special actions while engaged** (`engagedSpecials`): engagement only limits an engaged figure's normal attack; its blasts, mind control and pulls may still reach any target in their range
- [x] **Dice**: attack dice are a light red and defense dice a light blue, in the tray and the dice panel; the dice bounce more, so a throw takes a little longer to settle (about 4 s on average, from about 3.3 s)
- [x] **Move markers glow**: each hex a figure may move to has a soft glowing ring in a lighter shade of its green or orange, all drawn in one instanced mesh

### Move preview
- [x] Hovering a hex the chosen figure may move to shows a see-through copy of it where the move ends, turned the way the move leaves it, with its front cone in games with facing. Single-hex figures show it too (they still turn freely with R after moving)
- [x] A figure on several hexes may end a move on a hex facing several ways: R (Shift+R the other way round) steps through them while hovering, and the choice holds for other hexes until the move is made. Without a choice it ends the safest way, then facing most nearly the way it travels, so moves no longer end facing the wrong way
- [x] More natural routes: among equally safe and long routes, a big figure turns to face where it goes and walks forward rather than crabbing sideways; it still shuffles back a hex or two rather than spinning round. Only the suggested path changes, so saves replay as before

### The ledger play screen
The owner chose the "ledger" from three tabletop mockups (a ledger, a tray along the bottom, and a player mat).
- [x] The left column's panels are parchment sheets pinned to the table, with brass buttons, in the cards' typefaces
- [x] The turn sheet opens with a ribbon in the acting player's colour and the unit's faction emblem, then short pills for the chosen figure (can move, targets, engaged, pinned) and one line saying what to do now, which changes with what the figure can do and with the hovered move (its cost, and a warning when it is risky). The long help paragraph and its list of keys are gone; the keys are under the Keys tab. A squad still lists its figures; a lone figure does not
- [x] Deployment and Resurrection use the same sheet and ribbon
- [x] The log, glyphs and keys share one drawer with a tab each; the open tab is remembered, a click on it folds the drawer, the Glyphs tab counts the glyphs the viewer holds and glows when one is picked up
- [x] The round track is a wooden strip, with each player's revealed tokens in their colour; Display, Save and Quit are round wooden buttons in the corner, and the card's hide button is a leather tab

### More varied abilities
The owner approved a list of 25 changes, made after the kinds of ability in classic hex-miniature games but with our own names and rules text. Each swaps a plain dice bonus or a much-repeated ability.
- [x] More attacks: Blood Surge (Ruinmaw Raiders), Second Arrow (Lady Suzume), Twin Cannons (Sentinel K-7)
- [x] Special actions aimed at a figure: Life Tap (Morvane), Constrict (Marrowcoil), Circle Cut (Lady Asagiri)
- [x] Powers, through the new `power` command: Hurl (Ashfang Oni), Quake Stomp (Siege Walker Atlas), Fire Breath (Cinderjaw), Bonecall (Grubnak), Call to Arms (Captain Vance, a squad takes a turn after hers)
- [x] Movement: Blink (Orrin Vael), Treewalk (Sylvanne), Phase Walk (Proxima), Mag-Lock Boots (Nexus Breachers), Wings of Refuge (Solenne carries a friend)
- [x] Reactions and defence: Grave Dread (Marrowcoil), Mist Form (Kenzo), Shieldbearers (Gatewarden Pikemen), Second Wind (Sister Maren, once a game), Lurk (Murk Stalkers, who keep their swamp immunity), Harry (Duskfang Prowlers)
- [x] Reach: Piercing Bolts now fly on into the next figure (Covenant Crossbowmen), Spotter's Call (Sunbound Archers), Caustic Spores poison (Spore Lobbers)
- [x] Plain dice-bonus slots down from 34 to 18; no ability (Flying aside) is on more than two units, and a content test keeps it so
- [x] Point costs set again from the balance model (Solenne, Orrin and Morvane cheaper; Captain Vance, K-7, the Pikemen, Marrowcoil, Lady Asagiri, Sister Maren, the Ruinmaw Raiders and the Murk Stalkers dearer)
- [x] Games saved before this change may not load: the owner accepted that

### Better graphics
The owner chose two qualities, Low and High (the default, every effect on), no visual effects for special abilities for now, and a review after each part.
- [x] Part 1: **Graphics** under Display (High or Low; browser tests draw at Low). High lights the board with a warm key light casting soft shadows from figures, scenery and stacked tiles onto the board and the table, a cool fill and a softer sky light; Low keeps the plain light. A `graphics` browser test checks High, run only when graphics code changes
- [x] Part 2: effects and reactions in play, at High and not under reduced motion: sparks as wounds land (a blue glint off a blow that does no harm), dust where figures land (the ground's colour; splashes in water and swamp, embers on lava), a burst of dust and chips as a destroyed figure leaves, a sparkle on a heal or a return from the dead; the attacker's lunge (or kick as it shoots), the wounded figure's recoil, and a destroyed figure toppling instead of shaking. They fit the existing timings, so a fight takes no longer. Poison bubbles were left out with the other visuals for special abilities
- [x] Part 3: sharper terrain at High: 1024-pixel tile textures (the strokes drawn at full size, so painting takes no longer), relief as normal maps that catch the key light, rippling water and slowly flowing, glowing lava. **Moving water and lava** under Display switches the movement off, and it stays still under reduced motion. Switching from High to Low mid-game no longer darkens the board
- [ ] Part 4: more detailed figures: bevelled bases and a soft edge light for every model, then each faction's detailed models; the triangle budget per figure doubles to 3,000
