# Age of Heroes: notes for contributors and agents

## Start here
- [docs/PLAN.md](docs/PLAN.md) has the current status, what is next and what is on hold. [docs/RULES.md](docs/RULES.md) has the rules the engine implements.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the code; its "Client feature notes" say what each client feature does and where.
- [docs/CONTENT.md](docs/CONTENT.md) explains how to add units, abilities and maps.
- [docs/TESTING.md](docs/TESTING.md) explains which checks each kind of change runs, what each browser test covers and how to write one.
- Keep the docs current: change RULES, PLAN and the other docs in the same pull request as the behaviour they describe.

## Engine rules
- `packages/rules` must stay pure and deterministic: no DOM, no Node APIs, no `Math.random`. All randomness goes through the seeded `Rng` stored in `GameState.rng`, so `replayGame(setup, commands)` reproduces any game. Saves and online resume depend on it.
- The engine is a reducer: `applyCommand(state, command, ctx)` never mutates its input and returns events. New player actions are new `Command` variants. Validate them, fail with `RulesError`, and add them to `commandSchema` in `packages/protocol`.
- Anything secret must be removed in `viewFor`. The server only ever sends views.
- Rule numbers that may need tuning belong in data (`packages/content`), not in engine code.
- **New rule options** are optional fields of `GameSetup` and `GameConfig` (as `tokenRule`, `glyphs`, `facing`, `swampRoll`, `zoneOfControl`, `glyphPickup`, `strikeFromBehind`, `engagedSpecials`, `hitZones`, `draft` and `initiative` are): new games set them, and a save without them keeps the old behaviour, so it still replays exactly. A new option goes in `NEW_GAME_RULES` (`game/engine.ts`), which hot-seat setup, the test game and the server all spread into each new game, and in the protocol's `setupSchema`; tests check both keep every option. A change to how an existing option plays breaks the replays of games that used it; say so in the pull request.
- Abilities are implemented in `packages/rules/src/game/abilities.ts`; one attack's dice and wounds in `strike.ts` (shared by attacks and moves); powers (the `power` command: Hurl, Quake Stomp, Fire Breath, Bonecall, Call to Arms), extra attacks and Lurk in `combat.ts`. Lasting effects are state fields (`pinned`, `poisoned`, `spent`, `called`; on the turn `extraAttacks`, `once`, `callUnit`), so they replay and save.
- Line of sight goes through `game/sight.ts` (`figureInSight`, `spotInSight`, `sightBlockers`). New games set `hitZones: "models"`: figures are boxes from `ctx.hitShapes` (body to hit, gear only blocks) and an attack needs `sightShare` (20%) of the target's body in sight; older saves leave it out and keep tokens and the hit band.

## Content rules
- Unit content must be original: no names, characters, card text or stat lines copied from existing games.
- Every squad has 1 special ability and every hero 2; Flying does not count.
- No ability is on more than two units (Flying aside), and few are on two. Prefer abilities that change how a unit plays over plain extra dice.
- Heroes have 2 to 8 Life. Most squads have 1; squads of 2 or 3 figures may have up to 3.
- Squads have at most 4 figures.
- Point costs come from the balance model (`BALANCE_REPORT=1 pnpm test balance`).
- The roster keeps heroes and squads, and ranged and melee, within about 60/40 of each other (a guideline, not a hard rule), and every faction has each kind.
- Tests in `packages/content/test` enforce all of this; update their expected counts when the roster grows, and the card counts in `apps/client/e2e/models.mjs` and `gallery.mjs`.

## Client rules
What each client feature does, and the code that holds it, is in "Client feature notes" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); read the part you are changing first. These are the rules to keep.

### Games and online
- **Stores:** `session.ts` holds the game in play, `online.ts` the connection and lobby, `saves.ts` named saves, `settings.ts` each player's display choices. Online commands set `session.pending` until the server answers; the UI blocks repeat actions meanwhile.
- **New games** (hot-seat `SetupScreen.tsx`, online `apps/server/src/rooms.ts`, the test game `testGame.ts`) all spread `NEW_GAME_RULES`; online games add `draft: "open"` and `initiative: "players"`. **Older saves** leave options out and must keep playing and replaying exactly as before (the old token rules, no facing, no glyphs, tokens for line of sight and so on): keep every old path working.
- **Not game commands:** pings (P) and the `watched`/`watching` messages are protocol messages; the server rate-limits pings and never logs, saves or replays any of them.

### Drawing
- **Graphics quality:** every new effect reads `useGraphics()` and is off at Low; Low must stay as quick as it is. The classic look (B) keeps its plain figures and flat colours at any quality. A new display choice goes in `settings.ts` and the Display panel.
- **Draw on demand:** the board uses `frameloop="demand"`. Start an animation with `useWake()` and call `invalidate()` each frame while it runs, plus one frame after. A resting board draws nothing (`full-game` checks); only decorative loops (`useLoop`) and moving water and lava keep drawing, and they stop under reduced motion.
- **Budgets:** the board stays within 300 draw calls at Low (`full-game`) and 600 at High with shadows (`graphics`).
- **Figure models** (`apps/client/src/models`, see [docs/CONTENT.md](docs/CONTENT.md)): as tall as the card's Height with the base, on its footprint, within the overhang limits and 3,000 triangles (`TRIANGLE_BUDGET`, High's parts and ground included). A new unit needs a classic and a detailed model. Anything a figure holds is `gear`. When a model's parts change, write the hit shapes again (`hitShapes.json`), which changes that unit's line of sight: say so in the pull request.
- **Line of sight never reads a drawing:** it uses the rules' shapes (hit shapes, tokens, scenery rules). Figures take clicks through unseen token-shaped targets that stay on their real hex while the drawing hops.
- **Figure labels** are one DOM layer positioned each drawn frame; never go back to drei `Html` per figure (it threw on unmount).
- **The table** must not change the camera (views and zoom limits come from the board alone), and `scene/tableLayout.ts` stays pure, with its unit tests.

### Play screen
- **The dice show** only shows rolls the rules have made and never changes the game, except that online the initiative show's button sends the player's `rollInitiative`. Keep the dice simulation (`scene/diceRoll.ts`) pure; `test/dice.test.ts` checks every throw lands on the rolled faces.
- **The help line** (`turnHint` in `PlayScreen.tsx`) stays one short line; key lists go in the Keys tab.
- **The right panel** keeps its Save, Quit and Display buttons on screen at any window height (`full-game` checks).

### Menu, music and sounds
- **Main menu:** a new choice or setting goes in all four styles and fits the 1280 by 720 stage without scrolling (`e2e/menu.mjs` checks).
- **Music and sound effects:** CC0 or CC-BY only, never share-alike or non-commercial. A new track or sound goes in `musicTracks.ts` or `soundEffects.ts`, [docs/CREDITS.md](docs/CREDITS.md) and the test that matches the list to the files. Keep `jukebox.ts` free of timers and the DOM.
- **Version:** change `version` in `apps/client/package.json` only when the owner asks.

### Browser tests
- **Hooks:** tests drive the game through `window.__aoh` (`scene/TestHook.tsx`), `window.__aohUi` (`PlayScreen.tsx`), `window.__aohPingsHeard`, `window.__aohMusic` and `window.__aohSfx`; keep them working when changing those screens.
- **Read "Known pitfalls" and "Writing a browser test" in [docs/TESTING.md](docs/TESTING.md)** before changing a browser test. When one fails because of the test rather than the game, add a row there in the same pull request as the fix.
- **Test mode** (`window.__aohTest`, `src/testMode.ts`) only draws the table more simply, keeps the narrower zoom limits and draws at Low unless `window.__aohHighGraphics` is set (only `graphics.mjs`). Keep test-only differences to these and list any new one here.

## Checks and delivery
- **Before pushing:** run `pnpm check:affected`. It runs the typecheck, build, unit tests and browser tests that the branch's changes affect (`pnpm affected` shows the plan). Docs-only changes need nothing. Browser tests render WebGL in software, so wait for state, not for time, and avoid fixed sleeps. With every browser test in the plan it takes about 20 minutes; run it in the background and wait on its log.
- **Trying a change in the browser:** a throwaway script in `apps/client/e2e` (it needs Playwright from there) can serve the build with Vite's `preview`, load a save file made by a script against the engine, and take screenshots. Delete it before committing.
- **Test routing:** `scripts/affected.mjs` decides what runs, in CI too. When you add a package, a browser test or a client file only one browser test uses, update its rules, `docs/TESTING.md` and `scripts/affected.test.mjs` in the same pull request.
- **Pull requests:** work goes to a branch and lands as one pull request per phase or content drop, with CI green. The owner decides when to merge. Pull requests are squash merged, so start the next piece of work from the latest `origin/main`, not from the old branch.
- **Unused code:** the typecheck fails on unused locals and parameters (`tsconfig.base.json`); delete what a change leaves unused.
- **Writing style for docs and UI text:** plain, short sentences; no em dashes (use commas or semicolons).
