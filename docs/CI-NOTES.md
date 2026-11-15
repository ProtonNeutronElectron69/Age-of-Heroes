# CI notes: the online browser test after the gaming table (November 2026)

A record of what failed while pull request #29 (the gaming table) was open, for whoever picks it up next. Delete this page once the open questions are settled.

## What is in `main`
The state of commit `57c6037` on the pull request: the table, square, with figures standing on their cards. CI passed on it. The original camera limits are in place.

## What failed
`e2e (online)` failed in CI three times in a row, on each commit after `57c6037`. Every other job passed. The test passed locally every time, where the reload step takes about 4 seconds.

All three failures are in the same step of `apps/client/e2e/online.mjs`: Bob's page is reloaded mid-game and must come back to his seat.

| Commit | Change | Failure |
|---|---|---|
| `37b1f03` | Wider zoom (`minDistance` 6 to 2.5, `maxDistance` 2 to 4 board widths, least 60 to 140) | The log line with "drafts" did not appear in 15 seconds |
| `cc1ddea` | Cards painted one at a time; that wait raised to 40 seconds; editor test waits for its canvas | "Playing as Bob" did not appear in 15 seconds |
| `f85528a` | Cheaper table materials; that wait raised to 40 seconds too | "Playing as Bob" appeared, but the "drafts" log line did not in 40 seconds |

The first two commits of the pull request (`4596bc2`, `57c6037`) passed CI, once each.

## What is known
- **The table halves the software frame rate.** On the deployment screen, 1400 by 860, SwiftShader: `main` before the table drew 8.4 frames a second, the table 4.2. The cost is fill: the table and floor cover the whole screen. With the table off it was 8.8; with the cards off as well, 9.2. Real graphics cards are not affected.
- **Cheaper drawing helped but did not fix CI.** Lambert materials, a floor shaded by vertex colours with no texture, no anisotropy, and `renderOrder` to draw table and floor last gave 5.4 to 6.8 frames a second (single 5 second samples, noisy).
- **It is not only slowness.** The last failure waited 40 seconds for the log with the page already showing Bob's seat. Either the page is stuck, or the log never gets its catch-up.
- **The failures start with the zoom commit.** No mechanism was found for the zoom limits to affect a reload, and two passes are a small sample, so this may be chance. It was not tested.

## Not done
- No screenshot or console output was taken from the failing page in CI. That is the first thing to add: on failure, save a screenshot of Bob's page and print its console and page errors.
- The zoom change was never run in CI on its own again, nor the table without it more than twice.
- The editor test's fixed 800 ms wait before its first click failed once locally under load (`window.__aoh` undefined). The fix, waiting for `window.__aoh`, was reverted with the rest.
- The CI run on `main` after the merge was not watched.

## Where the reverted work is
The commits are still on GitHub under `refs/pull/29/head` (fetch with `git fetch origin pull/29/head`). Worth bringing back once the online test is understood: the wider zoom (`37b1f03`, asked for by the owner), the cheaper table drawing and one-at-a-time card painting (`225a7ca`, `f85528a`), and the editor test wait (`cc1ddea`).
