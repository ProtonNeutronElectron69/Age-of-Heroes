// Checks the board at high graphics quality, the one browser test that turns every effect on (the
// others draw at low in test mode): the key light casts shadows and the figures and scenery throw
// them, figures have an edge light, draw calls stay within a budget, a resting board still stops
// drawing, and the Graphics choice under Display switches the shadows and edge lights off and on
// again. Water and lava keep still under reduced motion. Then, with motion allowed, a figure's
// move kicks up a particle burst where it lands, the water on Twin Fords moves, and **Moving water
// and lava** under Display stops it. It runs only when graphics code changes (scripts/affected.mjs).
// With E2E_SCREENSHOTS it saves the board at high and at low.
// Usage: node e2e/graphics.mjs   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const shots = process.env.E2E_SCREENSHOTS;
const failureShots = process.env.E2E_FAILURE_SCREENSHOTS ?? shots;
/** Draw calls a frame may take at high quality, the shadow pass included (low holds the board to 300). */
const HIGH_CALL_BUDGET = 600;

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4187, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
// Test mode (src/testMode.ts), but at high graphics quality, with the dice show off so it cannot cover the board.
const highTestMode = () => {
  window.__aohTest = true;
  window.__aohHighGraphics = true;
  try {
    localStorage.setItem("aoh.display", JSON.stringify({ ...JSON.parse(localStorage.getItem("aoh.display") ?? "{}"), dice: "none" }));
  } catch {
    // The test still runs without storage.
  }
};
await context.addInitScript(highTestMode);
let page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.stack ?? e.message));

/** Wait until the camera has stopped moving. */
async function steadyCamera(frames = 5) {
  await page.evaluate(
    (frames) =>
      new Promise((resolve) => {
        let last = "";
        let same = 0;
        const tick = () => {
          const p = JSON.stringify(window.__aoh?.project(0, 0, 0));
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

/** True once the board has drawn no frame for 1.5 s (a resting board costs nothing). */
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

/** Place each player's tokens behind the pass screen, one on each unit, until a turn begins. */
async function playToFirstTurn() {
  for (let i = 0; i < 400; i++) {
    if (await page.locator(".pass-card").count()) {
      await page.locator(".pass-card button").click();
      const rows = page.locator(".token-table tbody tr");
      const n = await rows.count();
      const ids = (await page.locator(".token-table thead th").allInnerTexts()).slice(1);
      for (const [row, token] of ids.slice(0, Math.min(ids.length, n)).entries()) {
        await rows.nth(row).getByRole("button", { name: new RegExp(`^Token ${token} on`) }).click();
      }
      await page.getByRole("button", { name: "Lock in tokens" }).click();
      continue;
    }
    const moves = await page.evaluate(() => (window.__aohUi?.selected ? window.__aohUi.moves.length : 0));
    if ((await page.getByRole("region", { name: "Current turn" }).count()) && moves > 0) return;
    await page.waitForTimeout(50);
  }
  fail("No turn with a figure to move began");
}

/** Choose a graphics quality under Display, and wait for the board to show it. */
async function chooseGraphics(name, shadows) {
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByRole("radiogroup", { name: "Graphics" }).getByRole("radio", { name }).click();
  await page.getByRole("button", { name: "Display" }).click();
  await page.waitForFunction((on) => window.__aoh.graphics().shadows === on, shadows, { timeout: 15000 });
}

try {
  await page.goto(url);
  // The test game: two armies already on Twin Fords, tokens to place behind the pass screen.
  await page.getByRole("button", { name: "Test game" }).click();
  await page.locator(".pass-card").waitFor();
  await page.locator(".pass-card button").click();
  await page.waitForFunction(() => window.__aoh?.canvas.isConnected, null, { timeout: 60000 });
  await steadyCamera();

  // High, the default: the key light casts shadows, and the figures, scenery and tiles throw them.
  await page.waitForFunction(() => window.__aoh.graphics().shadows && window.__aoh.graphics().casters > 0, null, { timeout: 15000 });
  const high = await page.evaluate(() => window.__aoh.graphics());
  if (high.casters < 20) fail(`Too few meshes cast shadows at high quality: ${high.casters}`);
  if (high.edgeLit < 8) fail(`Too few figures have an edge light at high quality: ${high.edgeLit}`);
  const { calls } = await page.evaluate(() => window.__aoh.stats());
  if (calls > HIGH_CALL_BUDGET) fail(`High quality drew ${calls} draw calls in a frame (budget ${HIGH_CALL_BUDGET})`);
  if (await page.evaluate(() => window.__aoh.graphics().flowing)) fail("Water and lava moved under reduced motion");
  if (!(await boardRests())) fail("The board kept drawing at high quality while nothing moved");
  if (shots) await page.screenshot({ path: `${shots}/graphics-high.png` });

  // Low: no shadows at all; and back to high.
  await chooseGraphics("Low", false);
  if ((await page.evaluate(() => window.__aoh.graphics().casters)) !== 0) fail("Meshes still cast shadows at low quality");
  if ((await page.evaluate(() => window.__aoh.graphics().edgeLit)) !== 0) fail("Figures kept their edge light at low quality");
  if (shots) await page.screenshot({ path: `${shots}/graphics-low.png` });
  await chooseGraphics("High", true);

  // With motion allowed: a figure's move kicks up dust (or a splash, or embers) where it lands.
  await context.close();
  const moving = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "no-preference" });
  await moving.addInitScript(highTestMode);
  page = await moving.newPage();
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "Test game" }).click();
  await page.waitForFunction(() => window.__aoh?.canvas.isConnected, null, { timeout: 60000 });
  await playToFirstTurn();
  await steadyCamera();
  const before = await page.evaluate(() => window.__aoh.graphics().bursts);
  // The new round's dice panel can cover the board: close it.
  const closeDice = page.getByRole("button", { name: "Close dice" });
  if (await closeDice.count()) await closeDice.click({ timeout: 3000 }).catch(() => {});
  // The furthest move to a hex in plain sight on the board, so the figure hops a few times.
  const at = await page.evaluate(() =>
    window.__aohUi.moves
      .map((m) => window.__aoh.project(m.hex.q, m.hex.r, m.elevation))
      .filter((p) => document.elementFromPoint(p.x, p.y)?.tagName === "CANVAS")
      .pop(),
  );
  if (!at) fail("No move to a hex in sight");
  await page.mouse.click(at.x, at.y);
  await page.waitForFunction((n) => window.__aoh.graphics().bursts > n, before, { timeout: 15000 });
  const { calls: burstCalls } = await page.evaluate(() => window.__aoh.stats());
  if (burstCalls > HIGH_CALL_BUDGET) fail(`A burst took the board to ${burstCalls} draw calls (budget ${HIGH_CALL_BUDGET})`);
  if (shots) await page.screenshot({ path: `${shots}/graphics-burst.png` });

  // Twin Fords has water, so it moves (and the board keeps drawing) until the setting is switched off.
  if (!(await page.evaluate(() => window.__aoh.graphics().flowing))) fail("The water on Twin Fords did not move at high quality");
  const before2 = await page.evaluate(() => window.__aoh.stats().frames);
  await page.waitForFunction((n) => window.__aoh.stats().frames > n + 2, before2, { timeout: 15000 });
  await page.getByRole("button", { name: "Display" }).click();
  await page.getByLabel("Moving water and lava").uncheck();
  await page.getByRole("button", { name: "Display" }).click();
  await page.waitForFunction(() => !window.__aoh.graphics().flowing, null, { timeout: 15000 });

  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Graphics test passed: shadows from ${high.casters} meshes at high quality in ${calls} draw calls, none at low, the board rests, a move kicks up a burst, and the water moves until switched off.`);
} catch (err) {
  if (failureShots) await page.screenshot({ path: `${failureShots}/graphics-failure.png` }).catch(() => {});
  throw err;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
