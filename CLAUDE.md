# Age of Heroes: notes for contributors and agents

## Start here
- [docs/PLAN.md](docs/PLAN.md) has the current status, what is next and what is on hold. [docs/RULES.md](docs/RULES.md) has the rules the engine implements.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the code.
- [docs/CONTENT.md](docs/CONTENT.md) explains how to add units, abilities and maps.
- [docs/TESTING.md](docs/TESTING.md) explains which checks each kind of change runs.
- Keep the docs current: change RULES, PLAN and the other docs in the same pull request as the behaviour they describe.

## Engine rules
- `packages/rules` must stay pure and deterministic: no DOM, no Node APIs, no `Math.random`. All randomness goes through the seeded `Rng` stored in `GameState.rng`, so `replayGame(setup, commands)` reproduces any game. Saves, replays and online resume depend on it.
- The engine is a reducer: `applyCommand(state, command, ctx)` never mutates its input and returns events. New player actions are new `Command` variants. Validate them, fail with `RulesError`, and add them to `commandSchema` in `packages/protocol`.
- Anything secret must be removed in `viewFor`. The server only ever sends views.
- Rule numbers that may need tuning belong in data (`packages/content`), not in engine code.
- Abilities exist only in the Advanced game and are implemented in `packages/rules/src/game/abilities.ts`.

## Content rules
- Unit content must be original: no names, characters, card text or stat lines copied from existing games.
- Every squad has 1 special ability and every hero 2; Flying does not count.
- Heroes have 2 to 8 Life. Most squads have 1; squads of 2 or 3 figures may have up to 3.
- Squads have at most 4 figures.
- Point costs come from the balance model (`BALANCE_REPORT=1 pnpm test balance`).
- The roster keeps heroes and squads, and ranged and melee, within about 60/40 of each other (a guideline, not a hard rule), and every faction has each kind.
- Tests in `packages/content/test` enforce all of this; update their expected counts when the roster grows.

## Client notes
- **Stores:** `session.ts` holds the game in play, `online.ts` the connection and lobby, `saves.ts` named saves.
- **Online sends:** online commands set `session.pending` until the server answers; the UI blocks repeat actions meanwhile.
- **Figure labels:** these are one DOM layer positioned each frame (`scene/Figures.tsx`). Do not go back to drei `Html` per figure; it threw on unmount.
- **Figure models:** `apps/client/src/models` builds each unit's 3D model in code (see [docs/CONTENT.md](docs/CONTENT.md)). A model matches its card: as tall as its Height with its base, on its footprint, within the overhang limits. Model and base take the faction's and the player's colours, one each (`colors.ts`). Line of sight uses the token shape, never the model. `?models` shows them; the play screen still draws tokens.
- **Browser tests:** `apps/client/e2e` drives the canvas through `window.__aoh` and `window.__aohUi` (`scene/TestHook.tsx`, `PlayScreen.tsx`). Keep those hooks working when changing the play screen.

## Checks and delivery
- **Before pushing:** run `pnpm check:affected`. It runs the typecheck, build, unit tests and browser tests that the branch's changes affect (`pnpm affected` shows the plan). Docs-only changes need nothing. Browser tests render WebGL in software, so wait for state, not for time, and avoid fixed sleeps.
- **Test routing:** `scripts/affected.mjs` decides what runs, in CI too. When you add a package, a browser test or a client file only one browser test uses, update its rules, `docs/TESTING.md` and `scripts/affected.test.mjs` in the same pull request.
- **Pull requests:** work goes to a branch and lands as one pull request per phase or content drop, with CI green. The owner decides when to merge.
- **Writing style for docs and UI text:** plain, short sentences; no em dashes (use commas or semicolons).
