# Testing

Checks run only for the parts of the game a change can affect. The browser tests take a few minutes even run side by side, so a change to docs or unit stats should not wait for them. `scripts/affected.mjs` reads the changed files and picks the checks; CI and local runs use the same rules.

## The checks

| Check | What it covers | Time |
|---|---|---|
| Typecheck and build | Every package compiles, and the client and server build | under a minute |
| Unit tests | Vitest, by package: `packages/rules`, `packages/content`, `packages/protocol`, `apps/server`, `apps/client` (the figure models, classic and detailed, the table layout, the 3D dice, the tile and scenery shapes, the jukebox, the music and sound lists, the version) | seconds |
| Browser tests | Seven Playwright scripts in `apps/client/e2e`: `full-game`, `editor`, `saves`, `online`, `models`, `gallery`, `menu` | under a minute to about 4 minutes each in CI; `full-game` is the longest, at about 8 (9 locally), since the detailed tiles and scenery cost more to draw in software |

## The browser tests

| Test | What it plays through |
|---|---|
| `full-game` | A hot-seat game: the draft's battlefield view (opening first, the hex tooltip, coming back mid-draft), draft (filtering and sorting its cards), deployment (models and tokens, the detailed and classic tiles with the B key, the three tables, the board coming to rest), the initiative d20s, dragging a figure, a move made in two pieces, R turning a figure that has moved, H, the hover card, eye view, the camera following (and its three Display boxes), the hex tooltip on a middle click, the glyphs (the menu's stepper, and four face down once every unit is placed), squads, the attack intro (its melee or ranged icon and title; once Dice rolls is off, a click skips it), the music (play, battle with the first attack, victory at the end), the sound effects (drafting and placing, hops, an attack, dice, rounds), the attack scene and dice only (then **Dice rolls** set to None), a wound number floating up, the dice panel; then each turn is ended at once until the 5-round limit and the game-over screen |
| `online` | Through the real game server, one browser per player: the lobby and a spectator; the open draft (both players picking at the same moment, a taken unit greyed out on the other screen, a reload mid-draft); pings on the draft map and in play (`window.__aohPingsHeard`); initiative waiting for both players' rolls before showing any result; a few turns, host-only saving, leaving (which concedes), the replay, and resuming in a new room. Whole online games are played by the server's unit tests |
| `saves` | Saving a hot-seat game and bringing it back from the saved games list, after a reload, and from a file; the file in the replay viewer |
| `editor` | Building a map (with a large tree, refused first where it would overlap, and a low wall), exporting and importing it, and playing on it |
| `models` | Every figure model on the model page |
| `gallery` | The unit gallery: filters, sorts, sizes and the model viewer; then the map gallery: another map previewed and chosen for play |
| `menu` | The main menu in all four styles at three window sizes, with nothing scrolling, the version and last update in the corner, the music and sound controls and credits on every style, the menu music playing and being turned off, and menu hover and click sounds (silent with Sounds off) |; the Test game choice starting a game with every glyph down

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
| The map gallery (`MapGalleryScreen`, `map-gallery.css`) | yes | none | gallery |
| The test game (`testGame.ts`) | yes | none | menu |
| Any other client file | yes | client | all |
| A browser test script | yes | none | that script |
| Shared setup: `package.json`, the lockfile, `tsconfig.base.json`, `vitest.config.ts`, `ci.yml`, `scripts/` | yes | all | all |
| Anything else | yes | all | all |

Unit tests follow the package graph: `rules` is used by everything, `content` by the protocol, the server and the client, and the protocol by the server. The client's own tests (`apps/client/test`) cover the figure models (each one must be as tall as its card's Height, fit its base and stay low polygon) the gaming table's layout (every card on the table, clear of the board and of the other cards), and the 3D dice (each lands showing the result it was given).

Figure models (`apps/client/src/models`) are drawn on the game board too, so a model change runs every browser test, like the rest of the client.

## Test mode and reduced motion

Every browser test sets `window.__aohTest` before the page loads (`apps/client/src/testMode.ts`). In test mode the gaming table is drawn more simply (plainer lighting, a floor without a picture, drawn after the board), which is much quicker without a graphics card, and the camera keeps its older, narrower zoom limits. Players never have test mode: they get the full table and the wider zoom.

The browser tests that show the game board (`full-game`, `online`, `saves`, `editor`) run with reduced motion. The board is drawn only when something changes, and reduced motion stills its endless decorations (the selection arrow's bob, the rings' pulse), so it rests between actions instead of drawing every frame in software. `full-game` checks once that the decorations do move without it.

## Writing a browser test

- **Frames are slow.** CI has no graphics card, so WebGL is drawn in software: the gaming table view draws at about 2 frames a second. Wait for state (a button, `window.__aohUi`, a changed draw count, a settled camera, which includes `window.__aoh.cameraBusy()` being false: a glide waits for hops to land before it starts), never for a fixed time or for many frames in a row.
- **After changing screens, wait for the new canvas's hook:** `window.__aoh?.canvas.isConnected`. The old screen's canvas can still be closing, with its hook in place; a fixed pause before the first click made the editor test fail on `main` once.
- **Set test mode and reduced motion.** Call `addInitScript(() => { window.__aohTest = true; })` on the page or context before the first `goto`, and pass `reducedMotion: "reduce"` if the test shows the board. A test that plays turns but does not check the dice show sets **Dice rolls** to None in the same script (`aoh.display` in `localStorage`), so the show cannot cover the board. Copy the start of an existing test.
- **Let an attack's intro end before the next click.** Every attack opens with a two-second intro (the "Attack begins" dialog) whatever **Dice rolls** says, and a click on the board meanwhile only skips it. Wait for the dialog to go (`full-game`), or for `[data-pending]` to clear, which online also covers the other players' intros (`online`).
- **Give each browser test its own preview port**, so the jobs can run side by side locally too.
- **One browser per player** in a test with several players: pages in one browser share one software renderer and slow each other down.
- **Keep the heavy 3D work small.** Reload or wait on screens without a 3D board where you can, and leave long games to the unit tests and simulations, which play them in seconds.
- **Give a click that opens or closes a 3D view a long timeout.** Setting up or tearing down a canvas can keep a page busy for several seconds without a graphics card; the online test's `clickSceneChange` does this, and its 5 s `QUICK` timeout is for ordinary buttons.
- **Save a screenshot on failure** to `E2E_FAILURE_SCREENSHOTS` (or `E2E_SCREENSHOTS`), as every test does in its `catch`.

## Known pitfalls

A log of browser test failures that came from the test, not the game: what was seen, why, the fix, and the rule it taught. Read it before writing or changing a browser test. When a test fails for a test reason, add a row in the same pull request as the fix, and put a lasting rule in "Writing a browser test" above.

| Pull request | What failed | Why | Fix | Rule |
|---|---|---|---|---|
| #29 to #32 | `online`: Bob's page, reloaded mid-game, took 40 to 55 s to answer; the test waited 15 s | A freshly loaded play screen opens at the overview camera, which draws at about 2 frames a second in software. Three boards in one browser slowed each other | One browser per player; the reload moved to the draft, which has no 3D board; a few turns instead of a whole game | Keep the 3D work small: reload or wait on screens without a board, one browser per player |
| #33 | `full-game` took 9 minutes | It waited for 20 steady frames at a time, at about 2 frames a second, and played every round | Wait for the draw count to change; play to the lowest round limit and end turns at once after the checks | Never wait for many frames in a row; leave long games to the simulations |
| #33 | Pages that only waited still cost CPU | Every board drew every frame | Draw on demand (`frameloop="demand"`) | A resting board must draw nothing; `full-game` checks it |
| #34 to #36 | `editor` clicked the board before it was ready, once, on `main` | A fixed 800 ms pause; the menu's closing canvas still held `window.__aoh` | Wait for `window.__aoh?.canvas.isConnected` | After changing screens, wait for the new canvas's hook, never a fixed time |
| #40 | Draft clicks found no buttons | The draft now opens on the map | Every test that drafts clicks **Go to the draft** first | When a screen opens on a new view, update every test that passes through it (search `e2e` for the screen's heading) |
| #40 | `steadyCamera` could pass while a glide was still to come | The glide waits for hops to land, and a camera that is waiting looks still | `window.__aoh.cameraBusy()`, which `steadyCamera` also waits for | When the game waits before animating, expose a busy flag for tests |
| #41 | `online`: "Bob never rolled for initiative" | The Continue click closes the dice's 3D canvas as the first turn starts; in software that kept the page busy for more than the 5 s short timeout, so the click counted as failed although it worked | `clickSceneChange` in `online.mjs`, with a 30 s timeout | Clicks that open or close a 3D view (a dice show, the draft map, a new screen) get the long timeout |
| #41 | `online`: the draft could end before Bob's reload | With an open draft and 100 points, both players could be finished after one pick each | 150 points, and Bob takes the cheapest unit, so he is still drafting | Make the state a later step needs certain, not likely |
| #41 | The simulation's seed 9 game (online rules) had no attack | A fair game: one player drafted one unit, stopped, and lost it to terrain in round 2 | Seed 11 instead | When a random game fails a "something happened" check, trace its commands before calling it a bug |
| #50 | `full-game`: "Close dice" timed out, the button detached | A move drew a passing strike. Since #48 every attack roll plays the attack intro, which hides the dice panel, so the panel vanished under the click | Each step first lets a running attack intro or dice show finish (`handleAttackIntro`, `handleAttackShow`) | Before touching anything a show hides, wait for the show: a move can start one too, not only an attack |
| #51 | `full-game`: "Close dice" timed out, the button detached, more often on a busy machine | At a new round the dice panel is drawn one frame before the initiative show opens and hides it; the test saw the panel, then the show covered it | The click gets a short timeout, and if the panel has gone the step starts again, which lets the show play | A panel that a show can hide may vanish between seeing it and clicking it: give the click a short timeout and go round again |
| #54 | `saves`: "End turn" never came after two turns | With one token per unit, the test's one-unit armies get one turn each a round, so after two turns the next round was waiting for tokens | Play two turns, then stop at the next turn whichever round it falls in | Do not count on a set number of turns in a round: it depends on how many units each player has |
| #63, #68 | `full-game`: "A click did not skip the attack intro", now and then in CI, and once locally | Before clicking, Playwright waits for the element to hold still over two animation frames. Drawn in software while the camera glides to the fight, frames are slow, so the click timed out (its failure was ignored) and the two-second intro then ended by itself, which looked like a click that did not skip | The click is forced (the intro covers the board, so there is nothing to wait for), and the test checks the play screen's count of skipped intros (`__aohUi.introsSkipped()`) instead of a deadline; if the intro has gone before the click lands, it tries the next one | Never swallow a failed click and then judge by a timer; force clicks on full-screen overlays, and check what an action did through a hook |
| #70 | `full-game`: "The arrow keys did not turn the eye view camera" | Since facing, eye view turns only within the figure's front cone. The test dragged one way and then held the arrow key that turns the same way; once the drag had reached the edge of the cone, the key could not turn it further. It passed only when the view started with room on that side | The drag and the keys each try one way, then the other | When a control has limits, a check that it works must not assume there is room in one fixed direction |

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
