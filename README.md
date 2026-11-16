# Age of Heroes

A turn-based 3D tactics game for 2 to 6 players in the browser. Heroes and squads from every era and myth fight on battlefields built from stacked hex pieces. Sabre-tooth cats, samurai, musketeers, knights, World War 2 riflemen, robots, dragons, undead and angels can all share one battlefield.

**Play it:** <https://protonneutronelectron69.github.io/Age-of-Heroes/>, published from `main` on every merge. Online play uses our game server on Render; its health page is <https://age-of-heroes-server.onrender.com/health> (see [docs/HOSTING.md](docs/HOSTING.md)).

## What's in the game

- **Deep rules:**
  - Life and wounds;
  - a points-budget draft;
  - height bonuses, falling and engagement;
  - strict line of sight;
  - special abilities on every unit.
- **48 original units** in 6 factions of 8: 21 heroes and 27 squads, 24 ranged and 24 melee. Some figures cover 2 to 4 hexes.
- **Turns driven by secret tokens:** each player hides activation tokens on their units, rolls for initiative, then takes three turns a round.
- **3D battlefields** with ten terrain types, bridges, overhangs and scenery, a figure's-eye camera, and four premade maps.
- **Map editor:** build, save, export and import your own maps, and play on them. It finds and removes problem pieces, erases with a dragged box, joins pieces side by side into bridges (Shift+click) and can scatter terrain and scenery at random.
- **Hot-seat play** on one device, with a pass-the-device screen for the secret tokens.
- **Online play:** room codes, each device sees only what its player may see, reconnecting, spectators, and an authoritative server.
- **Saved games and replays:** named saves, save files, and online games the host can save and resume later. Finished games can be watched move by move.
- **A gaming table** under the board, in three styles, with every unit's card laid out round it and destroyed figures stood on their cards. Figures hop from hex to hex, can be dragged to where they should go, and the chosen figure jumps when you press H, so you can find it.
- **3D dice:** an attack zooms in on the fight, with both units' cards and models over a dimmed board, and rolls tumbling attack and defense dice; each player clicks a d20 for initiative. Choose the full scene, dice only or none under Display.
- **3D figure models** for all 48 units on the board, in three colour schemes, or plain tokens that show the hit band (Display, or the T key). The camera follows the acting unit, and resting the pointer on another unit shows its card beside the acting unit's.
- **Main menu in four styles** (War Table, Atlas, Banner Hall and Hex Command), each fitting a landscape window without scrolling, and a **unit gallery** of every card, filterable and sortable, with each unit's 3D model to turn and zoom.

**Keys in play:** WASD pans the map, 1 to 4 pick a squad's figures, E opens and closes eye view, H makes the chosen figure jump so you can find it, Space ends the turn, R turns a multi-hex figure, C shows or hides the unit card, T switches between figure models and tokens.

**Design pages:** add `?cards` to the address to see every unit card, and `?models` to see every figure model lined up on a board, with their fit to their bases.

The rules are in [docs/RULES.md](docs/RULES.md). Progress and what's next are in [docs/PLAN.md](docs/PLAN.md).

## Documentation

| Document | For |
|---|---|
| [docs/RULES.md](docs/RULES.md) | The full rules, which the engine implements |
| [docs/PLAN.md](docs/PLAN.md) | Status, roadmap and design decisions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the code is organised and how a game flows through it |
| [docs/CONTENT.md](docs/CONTENT.md) | Adding units, abilities and maps, and the rules the tests enforce |
| [docs/TESTING.md](docs/TESTING.md) | Which checks each kind of change runs, locally and in CI |
| [docs/HOSTING.md](docs/HOSTING.md) | Running and hosting the online game server |
| [CLAUDE.md](CLAUDE.md) | Working rules for contributors and coding agents |

## Development

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm dev        # the game at http://localhost:5173
pnpm server     # the online game server at ws://localhost:8080/ws (the dev build fills in this address)
pnpm typecheck  # type-check every package
pnpm test       # unit, content, balance, protocol, server and random full-game tests
pnpm build      # production builds: the game in apps/client/dist, the server in apps/server/dist
pnpm e2e        # browser tests (run pnpm build first; about 7 minutes one after another)
pnpm affected   # which checks this branch's changes need
pnpm check:affected  # run just those checks
```

```bash
BALANCE_REPORT=1 pnpm test balance   # unit point costs against the balance model
```

Before pushing, run `pnpm check:affected`. CI runs the checks a pull request's changes affect, and every check on each push to `main`; see [docs/TESTING.md](docs/TESTING.md). The browser tests use Playwright's headless Chromium; locally, run `pnpm --filter @aoh/client exec playwright install --only-shell chromium` once if it is missing.

## Project layout

| Path | What it is |
|---|---|
| `packages/rules` | The rules engine: hex math, the stacked map model, dice, line of sight, draft, movement, combat and abilities. Pure, deterministic TypeScript, so it runs the same in the browser and on the server. |
| `packages/content` | Game data: the 48 units, four premade maps, terrain, scenery, tunable rule numbers, and the balance model for point costs. |
| `packages/protocol` | The online message format (checked with schemas) and the game record format used for saves and replays. |
| `apps/client` | The browser game: main menu, unit gallery, draft, battle, map editor, online lobby, saved games and replay viewer, built with React and Three.js. Figure models are built in code in `src/models`. Browser tests live in `apps/client/e2e`. |
| `apps/server` | The online game server: rooms, room codes, seats and reconnecting, spectators, and saving and resuming games. It runs the rules engine and sends each player only their own view. |
| `docs` | Rules, roadmap, architecture, content guide, testing guide and hosting guide. |

## Deployment

- **The game:** `.github/workflows/deploy.yml` builds the client and publishes it to GitHub Pages on every merge to `main`. The `GAME_SERVER_URL` repository variable, if set, becomes the server the published game offers for online play.
- **The online server:** a Docker image (`apps/server/Dockerfile`) and a Render blueprint (`render.yaml`). See [docs/HOSTING.md](docs/HOSTING.md).
