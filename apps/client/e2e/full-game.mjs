// Plays a complete 2-player game through the real UI in headless Chromium.
// Usage: node e2e/full-game.mjs [basic|advanced]   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const MODE = process.argv[2] === "advanced" ? "advanced" : "basic";
const ROUNDS = MODE === "advanced" ? 8 : 5;
const shotsDir = process.env.E2E_SCREENSHOTS; // optional folder for screenshots
/** Draw calls allowed for the board during deployment. */
const MAX_DRAW_CALLS = 300;

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4180, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 860 } });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

const shot = async (name) => shotsDir && page.screenshot({ path: `${shotsDir}/${MODE}-${name}.png` });
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
 * Triangles drawn once 20 frames in a row have drawn the same. Counting frames, not
 * time, waits out a new shader: software WebGL can stall frames for a second compiling one.
 */
async function steadyTriangles() {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = -1;
        let same = 0;
        const tick = () => {
          const t = window.__aoh?.stats().triangles ?? 0;
          same = t === last ? same + 1 : 0;
          last = t;
          if (same >= 20) resolve(t);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

let moves = 0;
let attacks = 0;
let eyeChecked = false;
let squadMoves = 0;
let cycled = 0;

try {
  await page.goto(url);
  if (MODE === "advanced") {
    await page.getByRole("radio", { name: "Advanced" }).click();
    await page.getByRole("radio", { name: "300 points" }).click();
  } else {
    await page.getByRole("radio", { name: "2 cards" }).click();
  }
  await page.getByRole("radio", { name: `${ROUNDS} rounds` }).click();
  await shot("1-setup");
  await page.getByRole("button", { name: "Start draft" }).click();

  // Draft: take the first card that is still available each pick.
  await page.getByRole("heading", { name: "Draft" }).waitFor();
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
  while (await page.getByRole("heading", { name: "Draft" }).count()) {
    await page.locator(".draft-card button.primary:not([disabled])").first().click();
  }

  // Deployment: auto place each unit.
  await page.getByRole("region", { name: "Deployment" }).waitFor();
  await page.waitForTimeout(800);
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
      const models = await steadyTriangles();
      await page.keyboard.press("t");
      const tokens = await steadyTriangles();
      if (tokens === models) fail(`T did not swap the models for tokens (${models} triangles either way)`);
      await page.getByRole("button", { name: "Display" }).click();
      await page.getByRole("radio", { name: "Models" }).click();
      const back = await steadyTriangles();
      if (back !== models) fail(`The models did not come back: ${back} triangles, not ${models}`);
      await page.getByRole("button", { name: "Display" }).click();
    }
    await page.getByRole("button", { name: "Confirm" }).click();
  }

  const handled = new Set();
  let turnKey = "";
  for (let step = 0; step < 2000; step++) {
    if (await page.getByRole("dialog", { name: "Game over" }).count()) break;

    // Secret token placement behind the pass screen.
    if (await page.locator(".pass-card").count()) {
      await page.locator(".pass-card button").click();
      const rows = page.locator(".token-table tbody tr");
      const n = await rows.count();
      for (const [row, token] of [[0, "1"], [n - 1, "2"], [0, "3"], [n - 1, "X"]]) {
        await rows.nth(row).getByRole("button", { name: new RegExp(`^Token ${token} on`) }).click();
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
    if (`${round}|${key}` !== turnKey) {
      turnKey = `${round}|${key}`;
      handled.clear();
    }

    // The dice stay up until closed (or the next action): close them so they do not cover the board.
    const closeDice = page.getByRole("button", { name: "Close dice" });
    if (await closeDice.count()) await closeDice.click();

    const ui = await page.evaluate(() => window.__aohUi);
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
        if (attacks === 1) {
          await shot("6-attack");
          // The roll stays on screen: it no longer clears itself after a few seconds.
          await page.waitForTimeout(5500);
          if (!(await page.getByRole("status", { name: "Dice" }).count())) fail("The dice cleared themselves");
        }
        continue;
      }
    }
    // Move the selected figure toward the nearest enemy, once.
    if (ui?.selected && !handled.has(`m:${ui.selected}`) && ui.moves.length > 0) {
      handled.add(`m:${ui.selected}`);
      const score = (m) => Math.min(...ui.enemies.map((e) => hexDistance(m.hex, e.hex)));
      const ranked = [...ui.moves].sort((a, b) => score(a) - score(b));
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

  const over = page.getByRole("dialog", { name: "Game over" });
  if (!(await over.count())) fail("The game did not reach the game over screen");
  await shot("7-game-over");
  const heading = await over.getByRole("heading").innerText();
  if (!/wins|share the win|Nobody/.test(heading)) fail(`Unexpected result: ${heading}`);
  if (moves === 0) fail("No figure moved during the game");
  if (!eyeChecked) fail("Eye view was never tried");
  if (squadMoves > 0 && cycled === 0) fail("Squads never moved on to their next figure after a move");
  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Full ${MODE} game played: ${moves} moves, ${attacks} attacks. Result: ${heading}`);
} catch (err) {
  await shot("failure");
  if (errors.length > 0) console.error(`Console errors:\n${errors.join("\n")}`);
  throw err;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
