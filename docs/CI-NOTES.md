# CI notes: slow browser tests and the online test failure (November 2026)

A record for whoever picks this up next. Delete this page once the open questions are settled.

## Fixed: the online test
The online test no longer plays a whole game across three 3D boards; the server's unit tests already play whole games over the protocol. It now reloads Bob's page during the draft, which has no 3D board, plays a few turns, saves, has Bob leave (which concedes), and checks the replay and resuming. Each player has their own browser, and the spectator's is closed once she has seen the board. Locally it takes about 2 minutes. The rest of this page is the record from before that change.

## Fixed: `full-game` and CI setup
`full-game` now plays to the lowest round limit (5) and ends each turn at once after its one-off checks and three attacks. Its display checks wait for the triangle count to change and then hold for 3 frames, instead of holding for 20. Locally it takes about 3.5 minutes instead of 9. Each browser job now installs only Chromium's headless shell, cached, with no system packages; that step took 16 to 33 s.

Points 2, 4, 5 (the cache) and 6 below are done.

## Where things stood
- **`main` is red.** `e2e (online)` failed on both pushes to `main` after the gaming table (#29, #30), in the same step as before: Bob's page is reloaded mid-game and must come back to his seat. The state `57c6037` that passed twice on the pull request fails too, so the wider zoom was not the cause.
- **It reproduces locally**, first try, failing in the same step.
- **CI time on `main`:** `full-game` takes 7.5 to 9 minutes; every other browser test takes under a minute (`models` 15 s, `menu` and `editor` 30 s, `gallery` 45 s, `saves` 50 s; `online` fails at about 95 s). Installing Playwright takes 12 to 29 s in each of the 7 browser jobs. Typecheck, unit tests and build take about 20 s.

## What was found
- **The page comes back, just too slowly.** With the reload step instrumented: Alice's page drew 36 frames a second while Bob's page loaded, then about 2 once it had. Bob's page took about 40 s to answer at all, and showed "Playing as Bob" and the "drafts" log line by about 55 s. Given that long, the test passes unchanged (about 9.5 minutes in all). The test waits 15 s.
- **The cause is the opening camera.** A freshly loaded play screen starts at the overview, with the whole table and floor on screen. A page that has followed the action is zoomed in and cheap to draw. On its own, at 1400 by 860, the deployment overview draws at about 2 frames a second in software rendering.
- **The cost is fill (pixels drawn), not antialiasing.** Antialiasing off: no change. A 1000 by 640 window: 3.6 frames a second instead of 1.9.
- **Every play screen draws every frame, even when nothing moves.** Three such pages (Alice, Bob, Carol) share the runner's 4 cores, so one expensive page slows all of them.
- **One browser per player helps, but not enough.** Launching a browser for each player (closer to real play: three devices) brought Bob back in about 30 s instead of 55, and the whole test ran in 5.5 minutes instead of 9.5. Pages still drew about 2 frames a second.
- **Waits that count frames are slow at this frame rate.** `full-game` waits for 20 steady frames in `steadyTriangles` (six times) and `steadyCamera(20)`, which is 5 to 10 s each. It also plays all 8 rounds, though its one-off checks (dragging, H, hover card, eye view, camera follow) are done in the first round or two.

## What to do, most useful first
1. **Draw only when something changes.** Render the play and replay screens on demand (`frameloop="demand"`, calling `invalidate` from the camera glide, hops, drags and label updates), or drop to a low frame rate when nothing moves. This speeds up every browser test and helps players without a graphics card. It touches every `useFrame` animation, so it needs care.
2. **Online test (done):** one browser per player, and the reload moved to the draft.
3. **A cheaper overview:** bring back the cheaper table drawing (`225a7ca`, `f85528a`, below), or open a reloaded page with the camera on the player's own start zone.
4. **`full-game` (done):** fewer rounds, turns ended at once after the one-off checks, and no long runs of steady frames.
5. **CI:** cache the Playwright browser download (done), and upload screenshots when a browser test fails (`E2E_SCREENSHOTS` plus `actions/upload-artifact`).
6. **Online test, fewer boards (done):** a few turns instead of a whole game, and the spectator's browser closed once she has seen the board.

## History: what failed on pull request #29
| Commit | Change | Failure |
|---|---|---|
| `37b1f03` | Wider zoom (`minDistance` 6 to 2.5, `maxDistance` 2 to 4 board widths, least 60 to 140) | The log line with "drafts" did not appear in 15 seconds |
| `cc1ddea` | Cards painted one at a time; that wait raised to 40 seconds; editor test waits for its canvas | "Playing as Bob" did not appear in 15 seconds |
| `f85528a` | Cheaper table materials; that wait raised to 40 seconds too | "Playing as Bob" appeared, but the "drafts" log line did not in 40 seconds |

`4596bc2` and `57c6037` passed CI once each; given the above, that was luck. Measured then: the table halved the software frame rate on the deployment screen (8.4 to 4.2 frames a second), and the cheaper materials brought it to 5.4 to 6.8.

## Where the reverted work is
Under `refs/pull/29/head` (`git fetch origin pull/29/head`): the wider zoom (`37b1f03`, asked for by the owner), the cheaper table drawing and one-at-a-time card painting (`225a7ca`, `f85528a`), and the editor test's wait for `window.__aoh` before its first click (`cc1ddea`; its fixed 800 ms wait failed once locally under load).
