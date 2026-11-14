# Testing

Checks run only for the parts of the game a change can affect. The browser tests take about 10 minutes, so a change to docs or unit stats should not wait for them. `scripts/affected.mjs` reads the changed files and picks the checks; CI and local runs use the same rules.

## The checks

| Check | What it covers | Time |
|---|---|---|
| Typecheck and build | Every package compiles, and the client and server build | under a minute |
| Unit tests | Vitest, by package: `packages/rules`, `packages/content`, `packages/protocol`, `apps/server`, `apps/client` (the figure models) | seconds |
| Browser tests | Seven Playwright scripts in `apps/client/e2e`: `full-basic`, `full-advanced`, `editor`, `saves`, `online`, `models`, `gallery` | 1 to 3 minutes each; `models` takes seconds |

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

Unit tests follow the package graph: `rules` is used by everything, `content` by the protocol, the server and the client, and the protocol by the server. The client's own tests (`apps/client/test`) cover the figure models: each one must be as tall as its card's Height, fit its base and stay low polygon.

Figure models (`apps/client/src/models`) are drawn on the game board too, so a model change runs every browser test, like the rest of the client.

## Safety nets

- Every push to `main` runs every check, so anything a narrow pull request run missed shows up at once.
- **Run workflow** on the CI workflow in GitHub's Actions tab runs everything for any branch.
- Files no rule knows run everything.

## In CI

`.github/workflows/ci.yml` has four jobs:
1. **plan** runs `scripts/affected.mjs` against the pull request's base and lists its choices in the run summary.
2. **check** runs typecheck, the chosen unit tests and the build, or is skipped.
3. **e2e** runs each chosen browser test as its own parallel job, named `e2e (online)` and so on.
4. **CI result** passes when every other job passed or was skipped. Make this the one required check in branch protection, since skipped and parallel jobs change name from run to run.

## Locally

```sh
pnpm affected          # show what this branch needs, against origin/main plus uncommitted edits
pnpm check:affected    # run it
node scripts/affected.mjs --all --run   # run everything
```

## Keeping it current

The rules live in `RULES` in `scripts/affected.mjs`. When you add a package, a browser test or a client file that only one browser test uses, update the rules, this page and `scripts/affected.test.mjs`. A test fails if the browser tests in `apps/client/package.json` and the script's list differ.
