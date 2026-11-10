// Plays a complete 2-player game through the real UI in headless Chromium.
// Usage: node e2e/full-game.mjs [basic|advanced]   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const MODE = process.argv[2] === "advanced" ? "advanced" : "basic";
const ROUNDS = MODE === "advanced" ? 8 : 5;
const shotsDir = process.env.E2E_SCREENSHOTS; // optional folder for screenshots

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

let moves = 0;
let attacks = 0;
let eyeChecked = false;

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
  await shot("2-draft");
  while (await page.getByRole("heading", { name: "Draft" }).count()) {
    await page.locator(".draft-card button.primary:not([disabled])").first().click();
  }

  // Deployment: auto place each unit.
  await page.getByRole("region", { name: "Deployment" }).waitFor();
  await page.waitForTimeout(800);
  await shot("3-deploy");
  while (await page.getByRole("region", { name: "Deployment" }).count()) {
    await page.getByRole("button", { name: "Auto place" }).click();
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

    const ui = await page.evaluate(() => window.__aohUi);
    // Attack whenever the selected figure has a target.
    if (ui?.selected && ui.targets.length > 0) {
      const t = ui.targets[0];
      const p = await screenPoint(t.hex.q, t.hex.r, t.elevation + t.height / 2);
      if (p) {
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(150);
        const after = await page.evaluate(() => window.__aohUi);
        if (after.selected !== ui.selected || after.targets.length === 0) attacks++;
        if (attacks === 1) await shot("6-attack");
        handled.add(ui.selected);
        continue;
      }
    }
    // Move the selected figure toward the nearest enemy, once.
    if (ui?.selected && !handled.has(ui.selected) && ui.moves.length > 0) {
      handled.add(ui.selected);
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
          break;
        }
      }
      continue;
    }
    if (ui?.selected) handled.add(ui.selected);
    // Switch to a squad figure that has not acted yet, or end the turn.
    const buttons = turn.locator(".figure-button:not([disabled])");
    let switched = false;
    for (let i = 0; i < (await buttons.count()); i++) {
      const b = buttons.nth(i);
      await b.click();
      const sel = await page.evaluate(() => window.__aohUi?.selected);
      if (sel && !handled.has(sel)) {
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
        await page.getByRole("button", { name: "Exit eye view" }).click();
        await page.getByRole("button", { name: "Eye view" }).waitFor();
      }
      await endTurn.click();
    }
  }

  const over = page.getByRole("dialog", { name: "Game over" });
  if (!(await over.count())) fail("The game did not reach the game over screen");
  await shot("7-game-over");
  const heading = await over.getByRole("heading").innerText();
  if (!/wins|share the win|Nobody/.test(heading)) fail(`Unexpected result: ${heading}`);
  if (moves === 0) fail("No figure moved during the game");
  if (!eyeChecked) fail("Eye view was never tried");
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
