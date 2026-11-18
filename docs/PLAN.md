# Age of Heroes: Roadmap and Progress

A browser-based, turn-based 3D tactics game for 2 to 6 players. See [RULES.md](RULES.md) for the rules, [ARCHITECTURE.md](ARCHITECTURE.md) for how the code fits together, and [CONTENT.md](CONTENT.md) for adding units, abilities and maps.

## Status

The core game is complete and playable, online too: the game server runs on Render and the published site uses it ([HOSTING.md](HOSTING.md)). It has one full set of rules, a 48-unit roster in 6 factions, a map editor with six premade maps, hot-seat and online play, saved games and replays. 560 unit and simulation tests and 7 browser tests run in CI, each pull request running only the ones its changes affect, and a full run takes about 3 minutes ([TESTING.md](TESTING.md)); every merge to `main` publishes the game to GitHub Pages.

### Next
- **On hold (Phase 6):** a computer opponent, and a tutorial.
- **Phase 7, figure models:** stage 1 is done. Every unit has a low polygon model in flat colour, drawn on the board in place of tokens (the Display button or the T key switches back to tokens and picks one of three colour schemes; see every model at `?models`). **Next, when the owner asks:** later stages add detail and colour.
- **Phase 7, music and sound effects:** done. Menu, play, battle and victory music, and sound effects for hops, landings in water and lava, attacks, dice, wounds, destroyed figures, rounds, drafting and placing, menu hover and clicks, and pings. Each has an on/off box and a volume slider on the menu and under Display.
- **On hold (Phase 7):** terrain and scenery art.
- **Done lately:** Phase 8 (the tabletop feel) and Phase 9 (playtest updates, below). The game as it stood after Phase 9 is version 1.0.
- **Done lately:** more scenery, and glyphs (below).

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
| Line of sight | Automatic check from eye point to hit band, plus a figure's-eye camera |
| Table | The board stands in the middle of a square gaming table sized to the board and the unit cards, so a board of any shape sits well on it, in one of three styles each player picks for their own screen. Cards lie on a side of the table chosen by where their player's start zone lies, and face that side; up to four players get a side each, and five or six share, two to a side, as they would for a player sitting there. A card is seven hexes of the board's own size, so its figures fit on it: they stand on it before deployment and are stood back on it once destroyed. The table does not change the camera |
| Art | Unit cards are seven-hex cards in faction colours. Unit art is drawn, not rendered from models, in an ink and colour style; every unit has a drawing and a red and grey hit zone picture. Otherwise none for now: units are figure models on the board (or tokens as tall as their Height, if a player prefers), terrain is flat colour, hovering or clicking a figure shows its card, and a red arrow marks the figure chosen to act. Figure models are built in code from a few solid shapes, like the drawings, and arrive in stages: size and shape first, detail later. A figure stands on a round base a little smaller than its hex; a larger footprint gets one base with a lobe on each hex, thinner where it passes from hex to hex. Figure and base together are as tall as the card's Height; in a squad, a figure that kneels or crouches may be shorter. Flying figures stand on flight stands, as tabletop miniatures do. The body may reach a fifth of a hex past its hexes; a unit that reaches further gets a larger footprint on its card. Bases are light brown, with a ring of colour round the bevelled edge. Model and ring are coloured in one of three schemes: faction models with player rings, player models with faction rings, or every model in the same medium grey with player rings. In every scheme only the ring takes the second colour; the rest of the base stays brown. The Brass Hussars stay at Height 6 for now, on horses a little under life size, rather than growing to Height 7. On the board a single-hex figure faces the nearest enemy figure, across a side of its hex; a larger figure faces along its base. Line of sight keeps using the token shape. Sound effects and the rest of the art come in Phase 7 |
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
- [x] Game replays: download the record at game over and step through it in the replay viewer (online and hot-seat games)
- [x] Client: Online panel on the setup screen, lobby, turn gating per device, connection status, no pass-the-device screen online
- [x] Docker image for the server, a Render blueprint, and hosting steps in [HOSTING.md](HOSTING.md)
- [x] Tests: protocol and server tests (secrecy, authority, rejoin, spectators, replays) and a browser test with two players and a spectator on separate devices
- [x] Create the Render service and set `GAME_SERVER_URL`: the server runs at `wss://Age-of-Heroes-server.onrender.com/ws` (health page: <https://age-of-heroes-server.onrender.com/health>)

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

### Phase 7: Sound, models and art (models in progress; sound done; art on hold)
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
- [ ] 3D models for the figures in place of tokens
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
  - [ ] Later stages: more detail and colour
- [ ] Terrain textures and scenery art

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

### Glyphs
- [x] Glyphs: small hex tiles scattered face down on the battlefield once every unit is placed, from none to all 11 (a menu setting, 4 at first; one of each kind). A figure that ends a move on one picks it up; only its player learns what it is, and holds it beside the board to use at any time in their own turn
- [x] Five stat glyphs (+1 attack, +1 defense, +8 initiative, +4 range, +2 move), one per unit, lasting until the unit is destroyed; healing a unit fully; bringing back a destroyed unit beside the player's other figures; wounding an enemy unit; cancelling an enemy's stat glyph; and two traps that spring when picked up (a wound, and a curse that destroys the figure two of its player's turns later)
- [x] The Glyphs panel lists held glyphs, the stat glyphs in play and the curses counting down; the hex tooltip says where one lies; the online lobby shows how many; the initiative show adds the bonus to the roll
