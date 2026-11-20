// Plays a complete 2-player game through the real UI in headless Chromium.
// The one-off checks (dragging, H, the hover card, eye view, the camera
// following, the dice) are made in the first round or two; after that the test
// ends each turn at once until the round limit ends the game. The rules tests
// cover playing many turns.
// Usage: node e2e/full-game.mjs   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

/** A short game: small armies and the lowest round limit. */
const POINTS = 300;
const ROUNDS = 5;
/** Attacks to make before the rest of the turns are ended at once. */
const ATTACKS_WANTED = 3;
const shotsDir = process.env.E2E_SCREENSHOTS; // optional folder for screenshots
const failureShots = process.env.E2E_FAILURE_SCREENSHOTS ?? shotsDir; // or just for a failure
/** Draw calls allowed for the board during deployment. */
const MAX_DRAW_CALLS = 300;

function fail(message) {
  throw new Error(message);
}

const started = Date.now();
const phase = (name) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s] ${name}`);

const server = await preview({ preview: { port: 4180, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
// Reduced motion stills the board's endless decorations (the arrow's bob, the rings' pulse),
// so the board rests between actions instead of drawing every frame in software.
const page = await browser.newPage({ viewport: { width: 1400, height: 860 }, reducedMotion: "reduce" });
// Test mode (src/testMode.ts): a simpler gaming table to draw, and the narrower zoom limits.
await page.addInitScript(() => {
  window.__aohTest = true;
});
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

const shot = async (name) => shotsDir && page.screenshot({ path: `${shotsDir}/full-game-${name}.png` });
const hexDistance = (a, b) => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** Screen point for a spot, if it is drawn on the canvas and not hidden behind a panel. */
async function screenPoint(q, r, elevation) {
  return page.evaluate(
    ({ q, r, elevation }) => {
      const p = window.__aoh?.project(q, r, elevation);
      if (!p) return null;
      const el = document.elementFromPoint(p.x, p.y);
      return el && el.tagName === "CANVAS" ? p : null;
    },
    { q, r, elevation },
  );
}

/**
 * Triangles drawn once a change has shown: the count first differs from `before`
 * (or equals `expect`), then holds for 3 frames. Waiting for the change, rather
 * than for many steady frames, is quick even at a few frames a second. With
 * `steady` it only waits for that many frames in a row to draw the same.
 * Gives up after 20 seconds.
 */
async function trianglesAfter({ before, expect, steady }) {
  const t = await page.evaluate(
    ({ before, expect, steady }) =>
      new Promise((resolve) => {
        const end = performance.now() + 20000;
        let last = -1;
        let same = 0;
        const tick = () => {
          const t = window.__aoh?.stats().triangles ?? 0;
          const changed = steady ? true : expect !== undefined ? t === expect : t !== before;
          same = changed && t === last ? same + 1 : 0;
          last = t;
          if (same >= (steady ?? 3) || performance.now() > end) resolve(t);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { before: before ?? -1, expect, steady },
  );
  return t;
}

/** Screen point of a figure's name tag, which floats just above the figure. */
async function tagOf(id) {
  return page.evaluate((id) => {
    const el = document.querySelector(`.label-anchor[data-id="${id}"]`);
    if (!el || el.style.visibility === "hidden") return null;
    const b = el.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  }, id);
}

/**
 * Waits until the camera has stopped moving: `frames` frames in a row project the same point.
 * The camera glides to the acting figure after a turn starts or a squad figure acts, so clicks wait for it.
 */
/** Once: after a move, R turns the figure that moved an eighth (new games have facing). */
let turnChecked = false;
async function checkTurning() {
  if (turnChecked) return;
  const ui = await page.evaluate(() => window.__aohUi);
  if (!ui?.turning) return;
  const { id, facing } = ui.turning;
  await page.keyboard.press("r");
  const want = (facing + 45) % 360;
  const turned = await page
    .waitForFunction(({ id, want }) => window.__aohUi?.turning?.id === id && window.__aohUi.turning.facing === want, { id, want }, { timeout: 5000 })
    .then(() => true, () => false);
  if (!turned) fail(`R did not turn ${id} from ${facing} to ${want} degrees: ${JSON.stringify(await page.evaluate(() => window.__aohUi?.turning))}`);
  turnChecked = true;
}

async function steadyCamera(frames = 5) {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        let last = "";
        let same = 0;
        const tick = () => {
          const p = JSON.stringify(window.__aoh?.project(0, 0, 0));
          // A glide waiting for a hop to land has not started yet: the camera is not settled.
          same = p === last && !window.__aoh?.cameraBusy() ? same + 1 : 0;
          last = p;
          if (same >= frames) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    frames,
  );
}

/** True once the board draws no frame for 1.5 seconds; false if it is still drawing after 15. */
async function boardRests() {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const end = performance.now() + 15000;
        let last = window.__aoh.stats().frames;
        let since = performance.now();
        const check = () => {
          const now = window.__aoh.stats().frames;
          if (now !== last) {
            last = now;
            since = performance.now();
          }
          if (performance.now() - since > 1500) resolve(true);
          else if (performance.now() > end) resolve(false);
          else setTimeout(check, 100);
        };
        check();
      }),
  );
}

/** The Display button and the Save game and Quit buttons stay inside the window, whatever the cards above them. */
async function buttonsOnScreen(when) {
  const off = await page.evaluate(() =>
    [".display-toggle", ".hud-right .menu", ".display-panel"].filter((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.top < 0 || b.bottom > innerHeight + 1;
    }),
  );
  if (off.length) fail(`${when}, these are pushed off screen: ${off.join(", ")}`);
}

let moves = 0;
let motionChecked = false;
let initiativeChecked = false;
let sceneChecked = false;
let diceOnlyChecked = false;

/** Chooses how dice rolls are shown, under Display. */
async function setDiceRolls(value) {
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByLabel("Dice rolls").selectOption(value);
  await page.getByRole("button", { name: "Display" }).click();
}

/** The initiative d20s. The first time, each player rolls their own and the values must match the log. */
async function handleInitiative() {
  const dialog = page.getByRole("dialog", { name: "Initiative" });
  if (!(await dialog.count())) return false;
  if (!initiativeChecked) {
    const buttons = dialog.getByRole("button", { name: /^Roll for / });
    const n = await buttons.count();
    if (n < 2) fail(`Each hot-seat player should roll their own d20, but only ${n} could`);
    while (await buttons.count()) await buttons.first().click();
    await page.locator('.initiative-show[data-done="true"]').waitFor({ timeout: 15000 });
    const values = await dialog.locator(".initiative-value").allInnerTexts();
    const log = (await page.locator(".log-lines li").filter({ hasText: "Initiative:" }).last().innerText()).trim();
    for (const v of values) if (!log.includes(v.trim())) fail(`The d20 showed ${v}, but the log says "${log}"`);
    await shot("4b-initiative");
    initiativeChecked = true;
  } else if (await dialog.getByRole("button", { name: "Skip" }).count()) {
    await dialog.getByRole("button", { name: "Skip" }).click();
  }
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.waitFor({ state: "detached" });
  return true;
}

/** Set once the intro has been seen to name the fight and the board has floated a wound number. */
let introChecked = false;
/** The token panel was checked to keep one token on each unit. */
let tokensChecked = false;
let introSkipped = false;
let woundsChecked = false;
let woundsBefore = null;

/**
 * The attack intro: the board shows who attacks whom for two seconds before any dice. The first one
 * is checked and left to play out; once dice rolls are off, one is skipped with a click. Then the
 * test waits for it to go, as a click on the board meanwhile would only skip it.
 */
async function handleAttackIntro() {
  const intro = page.getByRole("dialog", { name: "Attack begins" });
  if (!(await intro.waitFor({ timeout: 5000 }).then(() => true, () => false))) {
    if (!introChecked) fail("An attack did not open with its intro");
    return;
  }
  if (!introChecked) {
    introChecked = true;
    // The battle music comes in with the attack.
    await page.waitForFunction(() => window.__aohMusic?.().mood === "battle", null, { timeout: 3000 }).catch(() => fail("An attack did not bring in the battle music"));
    woundsBefore = await page.evaluate(() => window.__aoh.woundsShown());
    const kind = await intro.getAttribute("data-kind");
    if (kind !== "melee" && kind !== "ranged") fail(`The intro shows no melee or ranged icon: ${kind}`);
    if (!/attacks|strikes|:/.test(await intro.locator(".fight-title").innerText())) fail("The intro does not say who attacks whom");
    await shot("6a-attack-intro");
  } else if (diceOnlyChecked && !introSkipped) {
    // A click skips it. Judged by the play screen's count of skips, not by the clock: drawn in
    // software, a slow frame can hold the click until the two-second intro has nearly ended.
    const before = await page.evaluate(() => window.__aohUi.introsSkipped());
    const clicked = await intro.click({ timeout: 2000 }).then(() => true, () => false);
    const skipped = clicked && (await page.waitForFunction((n) => window.__aohUi.introsSkipped() > n, before, { timeout: 5000 }).then(() => true, () => false));
    if (skipped) introSkipped = true;
    // The intro ended by itself before the click landed: try again with the next attack.
    else if (await intro.count()) fail("A click did not skip the attack intro");
  }
  await intro.waitFor({ state: "detached", timeout: 15000 });
}

/**
 * The attack show. The first is the full scene: both units' cards over a dimmed board and dice
 * that land on the rolled faces, with the same result the dice panel keeps afterwards. The next
 * is dice only. After that, dice rolls are switched off. A click closes it (it also closes itself).
 */
async function handleAttackShow() {
  const dialog = page.getByRole("dialog", { name: "Attack" });
  if (!(await dialog.count())) return false;
  const close = async () => {
    await dialog.click({ timeout: 2000 }).catch(() => {});
    await dialog.waitFor({ state: "detached" });
  };
  if (!sceneChecked) {
    if ((await dialog.locator(".scene-card").count()) !== 2) fail("The attack scene should show both units' cards");
    await page.locator('.attack-show[data-done="true"]').waitFor({ timeout: 15000 });
    const result = (await dialog.locator(".scene-result").innerText()).trim();
    await shot("6-attack-scene");
    await close();
    const panel = (await page.getByRole("status", { name: "Dice" }).innerText()).replace(/\s+/g, " ");
    if (!panel.includes(result)) fail(`The scene showed "${result}", but the dice panel says "${panel}"`);
    sceneChecked = true;
    await setDiceRolls("dice");
  } else if (!diceOnlyChecked) {
    if (!(await page.locator(".attack-show.dice-only").count())) fail("Dice only should roll the dice without the scene");
    if (await dialog.locator(".scene-card").count()) fail("Dice only should not show the units' cards");
    await page.locator('.attack-show[data-done="true"]').waitFor({ timeout: 15000 });
    await shot("6b-dice-only");
    await close();
    diceOnlyChecked = true;
    await setDiceRolls("none");
  } else {
    await close();
  }
  return true;
}
let hoverChecked = false;
let followChecked = false;
let attacks = 0;
let eyeChecked = false;
let squadMoves = 0;
let cycled = 0;
let dragged = false;
let jumpChecked = false;
let tipChecked = false;

/** Middle-clicks a point on the board and returns the hex tooltip's text, then closes it with Escape. */
async function hexTipAt(x, y) {
  await page.mouse.click(x, y, { button: "middle" });
  const tip = page.getByRole("tooltip", { name: "Hex information" });
  await tip.waitFor({ timeout: 5000 });
  const text = await tip.innerText();
  await page.keyboard.press("Escape");
  await tip.waitFor({ state: "hidden" });
  return text;
}

try {
  phase("setup");
  await page.goto(url);
  // A small army keeps the game short; the buttons start at 500.
  await page.getByLabel("Points per player").fill(String(POINTS));
  await page.getByLabel("Points per player").blur();
  await page.getByRole("radio", { name: `${ROUNDS} rounds` }).click();
  await shot("1-setup");
  // Glyphs: four at first; the stepper goes up to all eleven and back.
  const glyphCount = page.getByLabel("Glyphs on the battlefield");
  if ((await glyphCount.innerText()) !== "4") fail(`Glyphs start at "${await glyphCount.innerText()}", not 4`);
  await page.getByRole("button", { name: "More glyphs" }).click();
  if ((await glyphCount.innerText()) !== "5") fail("More glyphs did not add one");
  await page.getByRole("button", { name: "Fewer glyphs" }).click();
  await page.getByRole("button", { name: "Start draft" }).click();

  // Draft: it opens on the battlefield, with every player's start zone marked, before anyone picks.
  await page.getByRole("heading", { name: "Draft" }).waitFor();
  const battlefield = page.getByRole("region", { name: "Battlefield" });
  await battlefield.waitFor();
  await page.waitForFunction(() => window.__aoh?.canvas.isConnected && window.__aoh.stats().frames > 0);
  await shot("2a-draft-map");
  // A middle click on a hex shows its terrain.
  const field = await battlefield.boundingBox();
  const draftTip = await hexTipAt(field.x + field.width / 2, field.y + field.height / 2);
  if (!/Elevation \d/.test(draftTip)) fail(`The hex tooltip in the draft shows no elevation: ${draftTip}`);
  await page.getByRole("button", { name: "Go to the draft" }).click();

  // Then take the first card that is still available each pick.
  // Every unit shows its hex card, with the name and rules text fitted inside it.
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll(".draft-card .hex-card");
    const fitted = [...document.querySelectorAll(".draft-card .hc-name, .draft-card .hc-rules")];
    return cards.length > 0 && fitted.every((el) => el.style.getPropertyValue("--fs"));
  });
  const cardFit = await page.evaluate(() => ({
    cards: document.querySelectorAll(".draft-card .hex-card").length,
    slots: document.querySelectorAll(".draft-card").length,
    spilled: [...document.querySelectorAll(".draft-card .hc-rules")].filter((el) => el.scrollHeight > el.clientHeight + 1).length,
    undrawn: [...document.querySelectorAll(".draft-card .hex-card")].filter((el) => !el.querySelector(".hc-art path")).map((el) => el.dataset.card),
  }));
  if (cardFit.cards !== cardFit.slots) fail(`${cardFit.slots} units in the draft but ${cardFit.cards} hex cards`);
  if (cardFit.spilled) fail(`${cardFit.spilled} cards have rules text that does not fit`);
  // Every unit in the roster has its drawing.
  if (cardFit.undrawn.length) fail(`Cards without unit art: ${cardFit.undrawn.join(", ")}`);
  await shot("2-draft");
  let mapReopened = false;
  while (await page.getByRole("heading", { name: "Draft" }).count()) {
    await page.locator(".draft-card button.primary:not([disabled])").first().click();
    // The battlefield can be looked at again at any time during the draft.
    if (!mapReopened && (await page.getByRole("button", { name: "View map" }).count())) {
      mapReopened = true;
      await page.getByRole("button", { name: "View map" }).click();
      await battlefield.waitFor();
      await page.getByRole("button", { name: "Go to the draft" }).click();
    }
  }
  if (!mapReopened) fail("The draft ended before the map could be opened again");

  phase("deployment");
  // Deployment: auto place each unit.
  await page.getByRole("region", { name: "Deployment" }).waitFor();
  // The board's own canvas hook, once it has drawn a frame.
  await page.waitForFunction(() => window.__aoh?.canvas.isConnected && window.__aoh.stats().frames > 0);
  await shot("3-deploy");
  // The board draws each terrain as one instanced mesh; one mesh per hex took over 1000 draw calls.
  const { calls } = await page.evaluate(() => window.__aoh.stats());
  if (calls > MAX_DRAW_CALLS) fail(`The board took ${calls} draw calls (limit ${MAX_DRAW_CALLS})`);
  let checkedFigures = false;
  while (await page.getByRole("region", { name: "Deployment" }).count()) {
    await page.getByRole("button", { name: "Auto place" }).click();
    if (!checkedFigures) {
      checkedFigures = true;
      // Placed figures are drawn as models; T swaps them for tokens, and the Display menu brings the models back.
      const models = await trianglesAfter({ steady: 2 });
      await page.keyboard.press("t");
      const tokens = await trianglesAfter({ before: models });
      if (tokens === models) fail(`T did not swap the models for tokens (${models} triangles either way)`);
      await page.getByRole("button", { name: "Display" }).click();
      await page.getByRole("radio", { name: "Models" }).click();
      // A game has its own music, and the Display panel has its controls.
      if ((await page.evaluate(() => window.__aohMusic?.().mood)) !== "play") fail("The game is not playing its own music");
      if ((await page.getByRole("region", { name: "Display" }).getByRole("checkbox", { name: "Music" }).count()) !== 1) fail("The Display panel has no Music box");
      await buttonsOnScreen("With the Display panel open");
      // The camera follows the acting unit by panning, turning and zooming, each a box of its own and all ticked at first.
      for (const name of ["Auto pan", "Auto rotate", "Auto zoom"]) {
        if (!(await page.getByRole("checkbox", { name }).isChecked())) fail(`${name} is not ticked at first`);
      }
      const back = await trianglesAfter({ expect: models });
      if (back !== models) fail(`The models did not come back: ${back} triangles, not ${models}`);
      // The tiles are detailed at first, with bold outlines drawn as wide lines (triangles); the classic
      // look has thin ones (lines). The choice switches them on the spot, and B does too.
      if (!(await page.getByRole("radio", { name: "Detailed" }).isChecked())) fail("The tiles are not detailed at first");
      if ((await page.evaluate(() => window.__aoh.stats().lines)) !== 0) fail("The detailed tiles drew thin outlines");
      await page.getByRole("radio", { name: "Classic" }).click();
      await page.waitForFunction(() => window.__aoh.stats().lines > 0);
      await page.keyboard.press("b");
      await page.waitForFunction(() => window.__aoh.stats().lines === 0);
      if (!(await page.getByRole("radio", { name: "Detailed" }).isChecked())) fail("B did not bring the detailed tiles back");
      // The board stands on a gaming table, in one of three styles.
      const tables = new Set([back]);
      let last = back;
      for (const table of ["felt", "mat"]) {
        await page.getByLabel("Table").selectOption(table);
        last = await trianglesAfter({ before: last });
        tables.add(last);
      }
      if (tables.size !== 3) fail(`The three tables should differ, but drew ${[...tables].join(", ")} triangles`);
      await page.getByLabel("Table").selectOption("tavern");
      if ((await trianglesAfter({ expect: back })) !== back) fail("The first table did not come back");
      await page.getByRole("button", { name: "Display" }).click();
      // The board is drawn only when something changes: with reduced motion, once its short animations end, it rests.
      if (!(await boardRests())) fail("The board kept drawing while nothing moved");
    }
    await page.getByRole("button", { name: "Confirm" }).click();
  }

  phase("play");
  // The glyphs are scattered face down once every unit is placed, and listed beside the board.
  await page.getByRole("region", { name: "Glyphs" }).getByText("4 face down on the battlefield").waitFor();
  const handled = new Set();
  let turnKey = "";
  let roundSeen = "";
  /** Every one-off check is done: from here on, turns are ended at once. */
  const checksDone = () =>
    dragged && jumpChecked && tipChecked && followChecked && hoverChecked && eyeChecked && sceneChecked && diceOnlyChecked && attacks >= ATTACKS_WANTED && (squadMoves === 0 || cycled > 0);
  for (let step = 0; step < 2000; step++) {
    if (await page.getByRole("dialog", { name: "Game over" }).count()) break;
    // The dice show covers the board: deal with it before anything else.
    if ((await handleInitiative()) || (await handleAttackShow())) continue;

    // Secret token placement behind the pass screen.
    if (await page.locator(".pass-card").count()) {
      await page.locator(".pass-card button").click();
      const rows = page.locator(".token-table tbody tr");
      const n = await rows.count();
      // One token on each unit (the rule now), as many as there are units, up to the player's tokens.
      const ids = (await page.locator(".token-table thead th").allInnerTexts()).slice(1);
      const tokens = ids.slice(0, Math.min(ids.length, n));
      for (const [row, token] of tokens.entries()) {
        await rows.nth(row).getByRole("button", { name: new RegExp(`^Token ${token} on`) }).click();
      }
      // A second token on a unit takes the first one's place.
      if (!tokensChecked && n >= 2 && tokens.length >= 2) {
        tokensChecked = true;
        const [first, second] = tokens;
        await rows.nth(0).getByRole("button", { name: new RegExp(`^Token ${second} on`) }).click();
        if ((await rows.nth(0).getByRole("button", { name: new RegExp(`^Token ${first} on`) }).getAttribute("aria-pressed")) !== "false") fail("A unit kept two tokens");
        if (await page.getByRole("button", { name: "Lock in tokens" }).count()) fail("Tokens could be locked in with one left off");
        await rows.nth(0).getByRole("button", { name: new RegExp(`^Token ${first} on`) }).click();
        await rows.nth(1).getByRole("button", { name: new RegExp(`^Token ${second} on`) }).click();
      }
      if (step === 0 || attacks === 0) await shot("4-tokens");
      await page.getByRole("button", { name: "Lock in tokens" }).click();
      continue;
    }

    const turn = page.getByRole("region", { name: "Current turn" });
    if (!(await turn.count())) {
      await page.waitForTimeout(50);
      continue;
    }
    const key = await turn.locator(".turn-banner").innerText();
    const round = await page.locator(".round-label").innerText();
    if (round.split(",")[0] !== roundSeen) {
      roundSeen = round.split(",")[0];
      phase(`${roundSeen}: ${moves} moves, ${attacks} attacks so far`);
    }
    if (`${round}|${key}` !== turnKey) {
      turnKey = `${round}|${key}`;
      handled.clear();
      // A new turn brings the camera to the acting figure and shows its unit's card.
      await page.locator(".hud-right .unit-card-main").waitFor();
      const acting = await page.evaluate(() => window.__aohUi?.selected);
      if (acting && !followChecked) {
        await steadyCamera();
        // Judge only a turn that is still the same turn, with the figure it now has chosen.
        const still = (await turn.locator(".turn-banner").innerText()) === key && (await page.locator(".round-label").innerText()) === round;
        const now = await page.evaluate(() => window.__aohUi?.selected);
        if (still && now) {
          const tag = await tagOf(now);
          const view = page.viewportSize();
          if (!tag || Math.abs(tag.x - view.width / 2) > view.width * 0.2 || Math.abs(tag.y - view.height / 2) > view.height * 0.3) {
            fail(`The camera did not come to the acting figure ${now} at the start of a turn: its tag is at ${JSON.stringify(tag)}`);
          }
          followChecked = true;
        }
      }
      // Resting the pointer on another unit's figure shows its card below the acting unit's, until the pointer leaves.
      if (acting && !hoverChecked) {
        const unit = acting.split("#")[0];
        const others = await page.evaluate((unit) => [...document.querySelectorAll(".label-anchor")].map((a) => a.dataset.id).filter((id) => id.split("#")[0] !== unit), unit);
        for (const id of others) {
          const tag = await tagOf(id);
          if (!tag) continue;
          const at = { x: tag.x, y: tag.y + 30 };
          if (!(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS", at))) continue;
          await page.mouse.move(at.x, at.y);
          const shown = await page.locator(".hud-right .unit-card-other").waitFor({ timeout: 3000 }).then(() => true, () => false);
          if (shown) await buttonsOnScreen("With two unit cards showing");
          // Over the turn panel, off the board.
          await page.mouse.move(120, 140);
          if (!shown) continue;
          await page.locator(".hud-right .unit-card-other").waitFor({ state: "detached" });
          hoverChecked = true;
          break;
        }
      }
    }

    // A move can draw a passing strike, which plays the attack intro (and the dice show while it is on).
    // The dice panel is hidden while it plays, so let it finish before closing the panel.
    if (await page.getByRole("dialog", { name: "Attack begins" }).count()) await handleAttackIntro();
    if (await page.getByRole("dialog", { name: "Attack" }).count()) await handleAttackShow();
    // The dice stay up until closed (or the next action): close them so they do not cover the board.
    const closeDice = page.getByRole("button", { name: "Close dice" });
    // A new round's dice panel shows for a moment before the initiative show covers it. If the panel
    // goes before the click lands, start the step again: its top lets the show play.
    if ((await closeDice.count()) && !(await closeDice.click({ timeout: 3000 }).then(() => true, () => false))) continue;
    if (checksDone()) {
      await page.getByRole("button", { name: "End turn" }).click();
      continue;
    }

    // Screen points are only good once the camera has stopped gliding.
    await steadyCamera(1);
    const ui = await page.evaluate(() => window.__aohUi);
    // A middle click on a hex the figure could move to shows that hex's terrain and elevation.
    if (!tipChecked && ui?.moves.length) {
      const m = ui.moves[0];
      const p = await screenPoint(m.hex.q, m.hex.r, m.elevation);
      if (p) {
        tipChecked = true;
        const text = await hexTipAt(p.x, p.y);
        if (!/Elevation \d/.test(text)) fail(`The hex tooltip shows no elevation: ${text}`);
      }
    }
    const squad = (await turn.locator(".figure-button").count()) > 1;
    // Attack whenever the selected figure has a target.
    if (ui?.selected && ui.targets.length > 0 && !handled.has(`a:${ui.selected}`)) {
      handled.add(`a:${ui.selected}`);
      const t = ui.targets[0];
      const p = await screenPoint(t.hex.q, t.hex.r, t.elevation + t.height / 2);
      if (p) {
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(150);
        const after = await page.evaluate(() => window.__aohUi);
        if (after.selected !== ui.selected || after.targets.length === 0) attacks++;
        // Every attack opens with its intro on the board, whatever Dice rolls says.
        await handleAttackIntro();
        // The attack show comes up next, until dice rolls are switched off.
        if (!diceOnlyChecked && (await page.getByRole("dialog", { name: "Attack" }).waitFor({ timeout: 5000 }).then(() => true, () => false))) {
          await handleAttackShow();
        }
        // Once the show is over, the wounds float up from the figures hit (0 for a miss).
        if (!woundsChecked && woundsBefore !== null) {
          await page.waitForFunction((n) => window.__aoh.woundsShown() > n, woundsBefore, { timeout: 15000 });
          woundsChecked = true;
        }
        if (attacks === 1) {
          await shot("6-attack");
          // The roll stays on screen: it no longer clears itself after a few seconds.
          await page.waitForTimeout(5500);
          if (!(await page.getByRole("status", { name: "Dice" }).count())) fail("The dice cleared themselves");
        }
        continue;
      }
    }
    // Without reduced motion the arrow bobs and the rings pulse for good, so the board keeps drawing;
    // with it they stand still and the board rests.
    if (ui?.selected && !motionChecked) {
      motionChecked = true;
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const drew = await page.evaluate(
        () =>
          new Promise((resolve) => {
            const start = window.__aoh.stats().frames;
            const end = performance.now() + 15000;
            const check = () => {
              if (window.__aoh.stats().frames - start >= 5) resolve(true);
              else if (performance.now() > end) resolve(false);
              else setTimeout(check, 100);
            };
            check();
          }),
      );
      if (!drew) fail("The arrow and rings did not move without reduced motion");
      await page.emulateMedia({ reducedMotion: "reduce" });
      if (!(await boardRests())) fail("The board kept drawing with reduced motion");
    }
    // H makes the chosen figure jump, so it can be found: its name tag rises and comes back down.
    // In a squad only that figure jumps; the rest of the squad stays where it is.
    if (ui?.selected && !jumpChecked) {
      await steadyCamera();
      const tagTop = (id) => document.querySelector(`.label-anchor[data-id="${id}"]`)?.getBoundingClientRect().y;
      const rest = await page.evaluate(tagTop, ui.selected);
      const unit = ui.selected.split("#")[0];
      const squadmates = await page.evaluate(
        ({ unit, selected }) =>
          [...document.querySelectorAll(".label-anchor")]
            .filter((a) => a.dataset.id.split("#")[0] === unit && a.dataset.id !== selected && a.style.visibility !== "hidden")
            .map((a) => [a.dataset.id, a.getBoundingClientRect().y]),
        { unit, selected: ui.selected },
      );
      if (rest !== undefined && (await tagOf(ui.selected))) {
        await page.keyboard.press("h");
        const rose = await page
          .waitForFunction(({ id, rest }) => document.querySelector(`.label-anchor[data-id="${id}"]`)?.getBoundingClientRect().y < rest - 25, { id: ui.selected, rest }, { timeout: 5000 })
          .then(() => true, () => false);
        if (!rose) fail("H did not make the acting figure jump");
        for (const [id, y] of squadmates) {
          const now = await page.evaluate(tagTop, id);
          if (now !== undefined && Math.abs(now - y) > 2) fail(`H made ${id} jump too, not just the chosen figure`);
        }
        jumpChecked = true;
        // Back on its hex before anything is clicked.
        await page.waitForFunction(({ id, rest }) => Math.abs(document.querySelector(`.label-anchor[data-id="${id}"]`)?.getBoundingClientRect().y - rest) < 2, { id: ui.selected, rest });
      }
    }
    // Move the selected figure toward the nearest enemy, once.
    if (ui?.selected && !handled.has(`m:${ui.selected}`) && ui.moves.length > 0) {
      handled.add(`m:${ui.selected}`);
      const score = (m) => Math.min(...ui.enemies.map((e) => hexDistance(m.hex, e.hex)));
      const ranked = [...ui.moves].sort((a, b) => score(a) - score(b));
      // Until it has worked once, move by dragging the figure onto the hex. The camera must stay still meanwhile.
      if (!dragged) {
        const tag = await tagOf(ui.selected);
        const grip = tag && { x: tag.x, y: tag.y + 30 };
        const onCanvas = grip && (await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName === "CANVAS", grip));
        let drop = null;
        for (const m of ranked.slice(0, 8)) {
          drop = await screenPoint(m.hex.q, m.hex.r, m.elevation);
          if (drop) break;
        }
        if (onCanvas && drop) {
          const camera = await page.evaluate(() => JSON.stringify(window.__aoh.project(0, 0, 0)));
          await page.mouse.move(grip.x, grip.y);
          await page.mouse.down();
          await page.mouse.move(grip.x + 8, grip.y + 8, { steps: 2 });
          const held = await page.waitForFunction(() => window.__aohUi?.dragging, null, { timeout: 3000 }).then(() => true, () => false);
          if (held) {
            await page.mouse.move(drop.x, drop.y, { steps: 6 });
            const over = await page.waitForFunction(() => window.__aohUi?.dragging?.over, null, { timeout: 3000 }).then(() => true, () => false);
            if (over && moves === 0) await shot("5-dragging");
            // Checked while the figure is still held: once it lands, the camera may follow the squad's next figure.
            if ((await page.evaluate(() => JSON.stringify(window.__aoh.project(0, 0, 0)))) !== camera) fail("Dragging a figure turned the camera");
            await page.mouse.up();
            if (over) {
              await page.waitForFunction((was) => JSON.stringify(window.__aohUi.moves) !== was, JSON.stringify(ui.moves));
              const after = await page.evaluate(() => window.__aohUi);
              dragged = true;
              moves++;
              if (squad) squadMoves++;
              if (squad && after.selected && after.selected !== ui.selected) cycled++;
              await checkTurning();
              continue;
            }
          } else {
            await page.mouse.up();
          }
        }
      }
      for (const m of ranked.slice(0, 8)) {
        const p = await screenPoint(m.hex.q, m.hex.r, m.elevation);
        if (!p) continue;
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(120);
        const after = await page.evaluate(() => window.__aohUi);
        if (after.moves.length === 0 || JSON.stringify(after.moves) !== JSON.stringify(ui.moves)) {
          moves++;
          if (moves === 1) await shot("5-moved");
          // Squads hand the selection to the next figure after a move.
          if (squad) squadMoves++;
          if (squad && after.selected && after.selected !== ui.selected) cycled++;
          await checkTurning();
          break;
        }
      }
      continue;
    }
    if (ui?.selected) {
      handled.add(`a:${ui.selected}`);
      handled.add(`m:${ui.selected}`);
    }
    // Switch to a squad figure that can still do something, or end the turn.
    const buttons = turn.locator(".figure-button:not([disabled])");
    let switched = false;
    for (let i = 0; i < (await buttons.count()); i++) {
      await buttons.nth(i).click();
      const now = await page.evaluate(() => window.__aohUi);
      const sel = now?.selected;
      if (sel && ((now.targets.length > 0 && !handled.has(`a:${sel}`)) || (now.moves.length > 0 && !handled.has(`m:${sel}`)))) {
        switched = true;
        break;
      }
    }
    if (!switched) {
      const endTurn = page.getByRole("button", { name: "End turn" });
      const eye = page.getByRole("button", { name: "Eye view" });
      // Once a game: eye view must be closed before the turn can end.
      if (!eyeChecked && (await eye.isEnabled())) {
        eyeChecked = true;
        await eye.click();
        await page.getByRole("button", { name: "Exit eye view" }).waitFor();
        if (await endTurn.isEnabled()) fail("End turn is allowed while in eye view");
        // Eye view turns all the way around: a drag and the arrow keys both move where a hex is drawn.
        const probe = () => page.evaluate(() => JSON.stringify(window.__aoh?.project(0, 0, 0)));
        const turned = (before) =>
          page.waitForFunction((b) => JSON.stringify(window.__aoh?.project(0, 0, 0)) !== b, before, { timeout: 5000 });
        let before = await probe();
        await page.mouse.move(800, 500);
        await page.mouse.down();
        await page.mouse.move(1000, 520, { steps: 8 });
        await page.mouse.up();
        await turned(before).catch(() => fail("Dragging in eye view did not turn the camera"));
        before = await probe();
        await page.keyboard.down("ArrowLeft");
        await turned(before).catch(() => fail("The arrow keys did not turn the eye view camera"));
        await page.keyboard.up("ArrowLeft");
        await page.getByRole("button", { name: "Exit eye view" }).click();
        await page.getByRole("button", { name: "Eye view" }).waitFor();
      }
      // Space ends the turn (the button does the same).
      if (step % 2 === 0) await page.keyboard.press(" ");
      else await endTurn.click();
    }
  }

  phase("game over");
  const over = page.getByRole("dialog", { name: "Game over" });
  if (!(await over.count())) fail("The game did not reach the game over screen");
  await shot("7-game-over");
  await page.waitForFunction(() => window.__aohMusic?.().mood === "victory", null, { timeout: 3000 }).catch(() => fail("The game over screen did not bring in the victory music"));
  // The game's sound effects were asked for: drafting and placing, hops, the attack, its dice and wounds, and each new round.
  const sfx = await page.evaluate(() => window.__aohSfx?.() ?? {});
  const unheard = ["placed", "hop", "dice", "round"].filter((id) => !(sfx[id] > 0));
  if (!(sfx.melee > 0 || sfx.ranged > 0)) unheard.push("melee or ranged");
  if (unheard.length) fail(`No sound for: ${unheard.join(", ")} (${JSON.stringify(sfx)})`);
  const heading = await over.getByRole("heading").innerText();
  if (!/wins|share the win|Nobody/.test(heading)) fail(`Unexpected result: ${heading}`);
  if (moves === 0) fail("No figure moved during the game");
  if (!turnChecked) fail("No figure that had moved was turned with R");
  if (!dragged) fail("No figure was ever moved by dragging it");
  if (!jumpChecked) fail("The H key was never tried");
  if (!followChecked) fail("The camera was never checked following the acting figure");
  if (!hoverChecked) fail("Resting the pointer on another unit never showed its card");
  if (!eyeChecked) fail("Eye view was never tried");
  if (!motionChecked) fail("The arrow and rings were never checked with and without reduced motion");
  if (!initiativeChecked) fail("The initiative d20s were never rolled");
  if (!sceneChecked || !diceOnlyChecked) fail("The attack scene and dice only were not both seen");
  if (!introChecked || !woundsChecked) fail("No attack intro or wound number was seen");
  if (squadMoves > 0 && cycled === 0) fail("Squads never moved on to their next figure after a move");
  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Full game played: ${moves} moves, ${attacks} attacks. Result: ${heading}`);
} catch (err) {
  if (failureShots) await page.screenshot({ path: `${failureShots}/full-game-failure.png` }).catch(() => {});
  if (errors.length > 0) console.error(`Console errors:\n${errors.join("\n")}`);
  throw err;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
