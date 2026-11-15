# Testing

Checks run only for the parts of the game a change can affect. The browser tests take a few minutes even run side by side, so a change to docs or unit stats should not wait for them. `scripts/affected.mjs` reads the changed files and picks the checks; CI and local runs use the same rules.

## The checks

| Check | What it covers | Time |
|---|---|---|
| Typecheck and build | Every package compiles, and the client and server build | under a minute |
| Unit tests | Vitest, by package: `packages/rules`, `packages/content`, `packages/protocol`, `apps/server`, `apps/client` (the figure models and the table layout) | seconds |
| Browser tests | Seven Playwright scripts in `apps/client/e2e`: `full-game`, `editor`, `saves`, `online`, `models`, `gallery`, `menu` | under a minute to about 2 minutes each in CI; `full-game` is the longest, at about 2.5 to 4 |

## The browser tests

| Test | What it plays through |
|---|---|
| `full-game` | A hot-seat game: draft, deployment (models and tokens, the three tables, the board coming to rest), dragging a figure, H, the hover card, eye view, the camera following, squads, the dice; then each turn is ended at once until the 5-round limit and the game-over screen |
| `online` | Through the real game server, one browser per player: the lobby, a spectator, a reload during the draft, a few turns, host-only saving, leaving (which concedes), the replay, and resuming in a new room. Whole online games are played by the server's unit tests |
| `saves` | Saving a hot-seat game and bringing it back from the saved games list, after a reload, and from a file; the file in the replay viewer |
| `editor` | Building a map, exporting and importing it, and playing on it |
| `models` | Every figure model on the model page |
| `gallery` | The unit gallery: filters, sorts, sizes and the model viewer |
| `menu` | The main menu in all four styles at three window sizes, with nothing scrolling |

## What a change runs

The first matching row decides for each file; a change runs everything its files need together.

| Changed files | Typecheck and build | Unit tests | Browser tests |
|---|---|---|---|
| Docs and other `.md` files | no | none | none |
| Deployment files (`.dockerignore`, `render.yaml`, the server `Dockerfile`, `deploy.yml`) | no | none | none |
| Unit card data (`packages/content/src/cards/*.json`) and the balance model | yes | content, protocol, server, client | none |
| Other content: maps, terrain, scenery, tuning, the card loader | yes | content, protocol, server, client | all |
| Engine (`packages/rules`) | yes | all | all |
| Protocol | yes | protocol, server | saves, online |
| Server | yes | server | online |
| A package's own tests only | yes | that package | none |
| Map editor screen | yes | none | editor |
| Online lobby and connection (`online.ts`, `LobbyScreen`, `OnlineBar`) | yes | none | online |
| Saves and replays (`saves.ts`, `SaveDialog`, `ReplayScreen`) | yes | none | saves, online |
| The display board shared by the model page and the gallery (`scene/standing.tsx`) | yes | none | models, gallery |
| The model page (`ModelGalleryScreen`, `model-gallery.css`) | yes | none | models |
| The unit gallery (`UnitGalleryScreen`, `unit-gallery.css`) | yes | none | gallery |
| Any other client file | yes | client | all |
| A browser test script | yes | none | that script |
| Shared setup: `package.json`, the lockfile, `tsconfig.base.json`, `vitest.config.ts`, `ci.yml`, `scripts/` | yes | all | all |
| Anything else | yes | all | all |

Unit tests follow the package graph: `rules` is used by everything, `content` by the protocol, the server and the client, and the protocol by the server. The client's own tests (`apps/client/test`) cover the figure models (each one must be as tall as its card's Height, fit its base and stay low polygon) and the gaming table's layout (every card on the table, clear of the board and of the other cards).

Figure models (`apps/client/src/models`) are drawn on the game board too, so a model change runs every browser test, like the rest of the client.

## Test mode and reduced motion

Every browser test sets `window.__aohTest` before the page loads (`apps/client/src/testMode.ts`). In test mode the gaming table is drawn more simply (plainer lighting, a floor without a picture, drawn after the board), which is much quicker without a graphics card, and the camera keeps its older, narrower zoom limits. Players never have test mode: they get the full table and the wider zoom.

The browser tests that show the game board (`full-game`, `online`, `saves`, `editor`) run with reduced motion. The board is drawn only when something changes, and reduced motion stills its endless decorations (the selection arrow's bob, the rings' pulse), so it rests between actions instead of drawing every frame in software. `full-game` checks once that the decorations do move without it.

## Writing a browser test

- **Frames are slow.** CI has no graphics card, so WebGL is drawn in software: the gaming table view draws at about 2 frames a second. Wait for state (a button, `window.__aohUi`, a changed draw count, a settled camera), never for a fixed time or for many frames in a row.
- **Set test mode and reduced motion.** Call `addInitScript(() => { window.__aohTest = true; })` on the page or context before the first `goto`, and pass `reducedMotion: "reduce"` if the test shows the board. Copy the start of an existing test.
- **Give each browser test its own preview port**, so the jobs can run side by side locally too.
- **One browser per player** in a test with several players: pages in one browser share one software renderer and slow each other down.
- **Keep the heavy 3D work small.** Reload or wait on screens without a 3D board where you can, and leave long games to the unit tests and simulations, which play them in seconds.
- **Save a screenshot on failure** to `E2E_FAILURE_SCREENSHOTS` (or `E2E_SCREENSHOTS`), as every test does in its `catch`.

## Safety nets

- Every push to `main` runs every check, so anything a narrow pull request run missed shows up at once.
- **Run workflow** on the CI workflow in GitHub's Actions tab runs everything for any branch.
- Files no rule knows run everything.

## In CI

`.github/workflows/ci.yml` has four jobs:
1. **plan** runs `scripts/affected.mjs` against the pull request's base and lists its choices in the run summary.
2. **check** runs typecheck, the chosen unit tests and the build, or is skipped.
3. **e2e** runs each chosen browser test as its own parallel job, named `e2e (online)` and so on. It installs only Chromium's headless shell, cached by Playwright version, and no system packages: GitHub's Ubuntu machines already have the libraries it needs. When a browser test fails, a screenshot of its page (every player's, in the online test) is attached to the run as `failure-screenshots-<test>`, on the run's summary page.
4. **CI result** passes when every other job passed or was skipped. Make this the one required check in branch protection, since skipped and parallel jobs change name from run to run.

## Locally

```sh
pnpm affected          # show what this branch needs, against origin/main plus uncommitted edits
pnpm check:affected    # run it
node scripts/affected.mjs --all --run   # run everything
```

## Keeping it current

The rules live in `RULES` in `scripts/affected.mjs`. When you add a package, a browser test or a client file that only one browser test uses, update the rules, this page and `scripts/affected.test.mjs`. A test fails if the browser tests in `apps/client/package.json` and the script's list differ.
