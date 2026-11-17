# Age of Heroes: notes for contributors and agents

## Start here
- [docs/PLAN.md](docs/PLAN.md) has the current status, what is next and what is on hold. [docs/RULES.md](docs/RULES.md) has the rules the engine implements.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) maps the code.
- [docs/CONTENT.md](docs/CONTENT.md) explains how to add units, abilities and maps.
- [docs/TESTING.md](docs/TESTING.md) explains which checks each kind of change runs, what each browser test covers and how to write one.
- Keep the docs current: change RULES, PLAN and the other docs in the same pull request as the behaviour they describe.

## Engine rules
- `packages/rules` must stay pure and deterministic: no DOM, no Node APIs, no `Math.random`. All randomness goes through the seeded `Rng` stored in `GameState.rng`, so `replayGame(setup, commands)` reproduces any game. Saves, replays and online resume depend on it.
- The engine is a reducer: `applyCommand(state, command, ctx)` never mutates its input and returns events. New player actions are new `Command` variants. Validate them, fail with `RulesError`, and add them to `commandSchema` in `packages/protocol`.
- Anything secret must be removed in `viewFor`. The server only ever sends views.
- Rule numbers that may need tuning belong in data (`packages/content`), not in engine code.
- Abilities are implemented in `packages/rules/src/game/abilities.ts`.

## Content rules
- Unit content must be original: no names, characters, card text or stat lines copied from existing games.
- Every squad has 1 special ability and every hero 2; Flying does not count.
- Heroes have 2 to 8 Life. Most squads have 1; squads of 2 or 3 figures may have up to 3.
- Squads have at most 4 figures.
- Point costs come from the balance model (`BALANCE_REPORT=1 pnpm test balance`).
- The roster keeps heroes and squads, and ranged and melee, within about 60/40 of each other (a guideline, not a hard rule), and every faction has each kind.
- Tests in `packages/content/test` enforce all of this; update their expected counts when the roster grows.

## Client notes
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the client; these are the rules to keep when changing it.

### State and online
- **Stores:** `session.ts` holds the game in play, `online.ts` the connection and lobby, `saves.ts` named saves, `settings.ts` each player's display choices.
- **Online sends:** online commands set `session.pending` until the server answers; the UI blocks repeat actions meanwhile.
- **Online rules:** the server sets `draft: "open"` (everyone drafts at once, each card once) and `initiative: "players"` (a round waits for every player's `rollInitiative`) in each online `GameSetup` (`apps/server/src/rooms.ts`). Hot-seat games and older saves leave both out and keep the snake draft and the automatic roll.
- **Pings:** P points at a spot for everyone online, in play and on the draft map (`useOnlinePings` and `PingInput` in `scene/Pings.tsx`). A ping is a protocol message, not a game command: the server passes it on at most once a second per player (`PING_INTERVAL_MS`) and never logs, saves or replays it. The sender's arrow shows at once.

### Drawing the board
- **Drawing on demand:** the play and replay boards draw only when something changes (`frameloop="demand"`), so a resting board costs nothing. An animation starts with `useWake()` (`scene/wake.ts`, which also stops the first step covering the whole rest) and calls `invalidate()` each frame while it runs, plus one frame after it stops so the name tags catch up. Only decorative loops run forever (the selection arrow's bob, the rings' pulse, through `useLoop`), and they stand still under reduced motion. `full-game` fails if a resting board keeps drawing (`window.__aoh.stats().frames`).
- **Moving figures:** a figure's drawing hops, is dragged or jumps about its real place (`useFigureAnimation` in `scene/Figures.tsx`); the state is already final. A model's click target stays on its real hex, so tests can click it mid-hop. Dragging a figure holds the camera still by switching the orbit controls off in the same pointer event.
- **Figure labels:** one DOM layer positioned each frame that is drawn (`scene/Figures.tsx`). Do not go back to drei `Html` per figure; it threw on unmount.
- **Figure models:** built in code in `apps/client/src/models` (see [docs/CONTENT.md](docs/CONTENT.md)). A model matches its card: as tall as its Height with its base, on its footprint, within the overhang limits. Line of sight uses the token shape, never the model, and on the board a model takes clicks through an unseen token-shaped target. `colors.ts` has the three colour schemes; `?models` shows every model.
- **Gaming table:** `scene/Table.tsx` draws it and `scene/tableLayout.ts` places the cards and sizes it; keep the layout pure, it has unit tests. The table must not change the camera: its views and zoom limits (`CAMERA_NEAREST` and `CAMERA_FURTHEST_*` in `scene/BoardScene.tsx`) come from the board alone. The table top is at height 0 and takes no clicks; only the cards do.

### Play screen
- **Camera follow:** a glide to the acting unit (`CameraFocusRequest` in `scene/BoardScene.tsx`), time based, stopped when the player grabs the camera. It makes only the parts ticked under Display (Auto pan, Auto rotate, Auto zoom), except the glide to a fight, which makes all three, and it waits until no figure is hopping (`scene/activity.ts`).
- **Attack effects:** every attack plays a two-second intro on the board (`scene/FightFx.tsx`, read from the events by `fight.ts`), whatever **Dice rolls** says, then the dice show, then wound numbers float up and destroyed figures shake before leaving the board (drawn where they fell until then). Online, a click skips only once every player has clicked: the `watched` and `watching` messages, outside the game like pings. The player whose turn it is is held (`busy`) until everyone has finished watching, for at most `HOLD_LIMIT_MS` after their own show.
- **Dice show:** `ui/RollShow.tsx`, with 3D dice from `scene/dice3d.tsx`, shows attacks and initiative after the rules have rolled and never changes the game, with one exception: online, the initiative show's button sends the player's `rollInitiative` (with **Dice rolls** set to None, the play screen sends it at once). Attack dice land before the defense dice roll; the timings are constants at the top of `RollShow.tsx`. Replays do not play it.
- **Right panel:** the unit cards, then Display and Save/Quit. The cards are sized from the window's height (`--card-room` in `styles.css`) so the buttons always stay on screen; the Display panel opens over the cards. `full-game` checks it.
- **Hex tooltip:** a middle click on the play, replay or draft board (`ui/HexTip.tsx`, through `BoardScene`'s `onInspect`); a middle drag still zooms.
- **Draft map:** the draft opens on the battlefield (`screens/DraftMap.tsx`) until the first pick has been made; **Go to the draft** and **View map** switch views.

### Music
- **Moods:** `App.tsx` sets the scene (`useMusicScene` in `music.ts`): menu music outside a game, play music in the draft, the game and replays, victory music once the game is over. The play screen brings in battle music while an attack is shown (`useBattleMusic`) and for `BATTLE_LINGER_MS` after. A round ending has no music of its own.
- **Blending:** `jukebox.ts` fades the old mood out, then the new one in (`BLEND_MS`). A mood's tracks play in turn: a fade out over the last `TRACK_FADE_MS`, `TRACK_GAP_MS` of quiet, then the next fades in. A mood that is left keeps its place; the victory music always starts from its beginning. Keep the jukebox free of timers and the DOM (it is moved on by `tick(now)`); it has unit tests.
- **Tracks:** `musicTracks.ts` lists them, and the files are in `apps/client/public/music` (MP3, all set to the same loudness). Use only CC0 or CC-BY music, never share-alike or non-commercial. A new track goes in `musicTracks.ts`, [docs/CREDITS.md](docs/CREDITS.md) and the test that matches the list to the files; the menu's Credits button reads the list.
- **Settings:** Music on or off and its volume are in `settings.ts`, set from the main menu (`.menu-sound`, placed by each style, with the Sounds box and slider) and from Display. Browsers allow no sound before the first click or key, so the music starts then.

### Sound effects
- **Playing one:** `playSound(id)` in `sfx.ts`; the sounds and their files are in `soundEffects.ts` (files in `apps/client/public/sfx`). Where a sound has several files, one plays at random, never the same twice running. A sound has a `gain` (keep the frequent ones quiet) and a `gapMs`; `exclusive` stops the last play first (the long dice roll).
- **Where each plays:** hops and landings through `Figures`' `onLand` (water and swamp splash, lava flares, `landingSound`), a dragged figure's landing when its move is made; the attack sound with the intro, wounds when the numbers float, the clatter with the destroyed figure's shake (all in `PlayScreen.tsx`); dice in `RollShow.tsx` as they are thrown; rounds and drafted or deployed units in `useEventSounds` (`App.tsx`), never for the events a game was opened with; other players' pings in `useOnlinePings`; hover (menu buttons, draft and gallery cards) and click (any button) by listening on the page.
- **Rules:** open licences only, as for the music; a new sound goes in `soundEffects.ts`, [docs/CREDITS.md](docs/CREDITS.md) and the test that matches the list to the files. Sounds start with the first click or key, play through the Web Audio API, and stop while the tab is hidden. Sounds on or off and their volume are in `settings.ts`, beside the music's.

### Main menu
- Four styles (War Table, Atlas, Banner Hall, Hex Command) share one set of choices and panels; `SetupScreen.tsx` builds them and `screens/menu/MenuFrame.tsx` and `menu.css` dress them. A new menu choice or setting goes in every style, and must fit the 1280 by 720 stage without scrolling (`e2e/menu.mjs` checks).
- **Version:** the menu's corner shows "v1.0 · Last updated MM/DD/YYYY" (`version.ts`). The version is `version` in `apps/client/package.json` (1.0.0 shows as v1.0); change it only when the owner asks. The date is the latest commit's, read at build time, so it needs no editing.

### Browser tests
- **Hooks:** `apps/client/e2e` drives the canvas through `window.__aoh` (`scene/TestHook.tsx`, including `woundsShown()`), `window.__aohUi` (`PlayScreen.tsx`), `window.__aohPingsHeard` (`online.ts`), `window.__aohMusic` (`music.ts`) and `window.__aohSfx` (`sfx.ts`); keep them working when changing those screens. A hook only removes `window.__aoh` if it still owns it, since a closing canvas can unmount after the next one mounts; after changing screens, tests wait for `window.__aoh?.canvas.isConnected`. Before clicking the canvas, tests wait for the camera to settle (`steadyCamera`, which includes `window.__aoh.cameraBusy()`). Tests that draft click **Go to the draft** first. After an attack, tests wait for the "Attack begins" intro to end (or `[data-pending]` to clear), as a click during it only skips it.
- **Known pitfalls:** read "Known pitfalls" and "Writing a browser test" in [docs/TESTING.md](docs/TESTING.md) before changing a browser test. When one fails because of the test rather than the game, add a row there in the same pull request as the fix.
- **Test mode:** every browser test sets `window.__aohTest` before the page loads (`src/testMode.ts`, `TEST_MODE`): the gaming table is drawn more simply, and the camera keeps its older, narrower zoom limits. Players never have it. Keep test-only differences to these and say so here. Browser tests run with `reducedMotion: "reduce"`, and all but `full-game` set **Dice rolls** to None (an ordinary player setting) so the dice show does not cover the board.
- **Screenshots:** `E2E_SCREENSHOTS=<folder>` saves a run's screenshots, `E2E_FAILURE_SCREENSHOTS=<folder>` only a failure's (CI attaches them to a failed run).

## Checks and delivery
- **Before pushing:** run `pnpm check:affected`. It runs the typecheck, build, unit tests and browser tests that the branch's changes affect (`pnpm affected` shows the plan). Docs-only changes need nothing. Browser tests render WebGL in software, so wait for state, not for time, and avoid fixed sleeps.
- **Test routing:** `scripts/affected.mjs` decides what runs, in CI too. When you add a package, a browser test or a client file only one browser test uses, update its rules, `docs/TESTING.md` and `scripts/affected.test.mjs` in the same pull request.
- **Pull requests:** work goes to a branch and lands as one pull request per phase or content drop, with CI green. The owner decides when to merge. Pull requests are squash merged, so start the next piece of work from the latest `origin/main`, not from the old branch.
- **Writing style for docs and UI text:** plain, short sentences; no em dashes (use commas or semicolons).
