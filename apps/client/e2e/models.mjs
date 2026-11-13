// Opens the figure model page (?models) and checks that every model is drawn.
// Usage: pnpm --filter @aoh/client e2e   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const shots = process.env.E2E_SCREENSHOTS;

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4184, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1400, height: 860 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

/** Triangles in the last frame, once the scene has drawn at least `least`. */
async function drawn(least) {
  const handle = await page.waitForFunction((n) => {
    const t = window.__aoh?.stats().triangles ?? 0;
    return t >= n ? t : false;
  }, least);
  return handle.jsonValue();
}

try {
  await page.goto(`${url}?models`);
  await page.getByRole("heading", { name: "Figure models" }).waitFor();
  const units = page.locator("[data-unit]");
  await units.first().waitFor();
  const count = await units.count();
  if (count < 12) fail(`Expected at least 12 units with a model, found ${count}`);

  // Every unit says how it fits its base, and none needs a larger one.
  const list = await page.getByRole("list", { name: "Units" }).innerText();
  if (list.includes("Needs a larger base")) fail(`A model does not fit its base:\n${list}`);
  if ((list.match(/Fits its base/g) ?? []).length !== count) fail(`Not every unit reports its fit:\n${list}`);

  // The whole line-up is drawn: more triangles than the board alone.
  const all = await drawn(2000);
  if (shots) await page.screenshot({ path: `${shots}/models-all.png` });

  // Looking closer at each unit still draws it, and the token outlines add to the scene.
  for (let i = 0; i < count; i++) {
    const unit = units.nth(i);
    await unit.click();
    if ((await unit.getAttribute("aria-pressed")) !== "true") fail(`Unit ${i} was not chosen`);
    await drawn(2000);
    if (shots) await page.screenshot({ path: `${shots}/models-${await unit.getAttribute("data-unit")}.png` });
  }
  await page.getByRole("button", { name: "All units" }).click();
  await page.getByRole("checkbox", { name: "Show tokens" }).check();
  await drawn(all + 40);

  // The two colour schemes swap the model's colour with the colour of the ring on its base.
  const colours = () => units.evaluateAll((list) => list.map((u) => [u.dataset.modelColor, u.dataset.ringColor]));
  const byFaction = await colours();
  if (byFaction.some(([model, ring]) => !model || !ring || model === ring)) fail(`Models and rings need two colours: ${JSON.stringify(byFaction)}`);
  await page.getByRole("radio", { name: "Player models, faction rings" }).check();
  const byPlayer = await colours();
  if (byPlayer.some(([model, ring], i) => model !== byFaction[i][1] || ring !== byFaction[i][0])) fail("The colour schemes did not swap model and ring colours");
  // One player for every unit: every model takes that player's colour.
  await page.getByRole("combobox", { name: "Player" }).selectOption({ label: "Blue" });
  const blue = await colours();
  if (new Set(blue.map(([model]) => model)).size !== 1) fail(`Every model should be the Blue player's colour: ${JSON.stringify(blue)}`);
  await page.getByRole("radio", { name: "Faction models, player rings" }).check();
  if (new Set((await colours()).map(([, ring]) => ring)).size !== 1) fail("Every ring should be the Blue player's colour");
  await drawn(all + 40);

  // One unit on its own.
  await page.goto(`${url}?models=old-rootback`);
  await page.locator("[data-unit]").first().waitFor();
  if ((await page.locator("[data-unit]").count()) !== 1) fail("The ?models= filter did not narrow the list to one unit");
  await drawn(500);

  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Models test passed: ${count} units drawn on their bases, in both colour schemes.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
