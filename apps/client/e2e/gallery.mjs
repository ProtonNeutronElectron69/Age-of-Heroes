// Opens the unit gallery from the main menu: filters, sorts and resizes the cards, then views a figure model.
// Usage: node e2e/gallery.mjs   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const shots = process.env.E2E_SCREENSHOTS;

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4185, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));

const cards = page.locator("[data-unit]");
const ids = () => cards.evaluateAll((list) => list.map((c) => c.dataset.unit));
const across = () =>
  page.getByRole("list", { name: "Unit cards" }).evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);

/** Triangles in the last frame, once the scene has drawn at least `least`. */
async function drawn(least) {
  const handle = await page.waitForFunction((n) => {
    const t = window.__aoh?.stats().triangles ?? 0;
    return t >= n ? t : false;
  }, least);
  return handle.jsonValue();
}

try {
  await page.goto(url);
  await page.getByRole("button", { name: "Unit gallery" }).click();
  await page.getByRole("heading", { name: "Unit gallery" }).waitFor();
  await cards.first().waitFor();
  const total = await cards.count();
  if (total !== 48) fail(`Expected 48 cards, found ${total}`);

  // Sizes: 5, 3 and 1 across.
  for (const [name, want] of [["Small", 5], ["Medium", 3], ["Large", 1]]) {
    await page.getByRole("radio", { name }).click();
    const got = await across();
    if (got !== want) fail(`${name} cards should be ${want} across, got ${got}`);
    if (shots) await page.screenshot({ path: `${shots}/gallery-${name.toLowerCase()}.png`, timeout: 120000 });
  }
  await page.getByRole("radio", { name: "Small" }).click();

  // Filters narrow the grid and can be cleared.
  await page.getByRole("combobox", { name: "Type" }).selectOption("hero");
  const heroes = await cards.count();
  if (heroes === 0 || heroes >= total) fail(`The hero filter showed ${heroes} cards`);
  await page.getByRole("combobox", { name: "Attack" }).selectOption("ranged");
  const rangedHeroes = await cards.count();
  if (rangedHeroes === 0 || rangedHeroes >= heroes) fail(`The ranged filter showed ${rangedHeroes} of ${heroes} heroes`);
  await page.getByRole("button", { name: "Clear filters" }).click();
  if ((await cards.count()) !== total) fail("Clear filters did not bring every card back");

  const faction = await page.getByRole("combobox", { name: "Faction" }).locator("option").nth(1).getAttribute("value");
  await page.getByRole("combobox", { name: "Faction" }).selectOption(faction);
  const inFaction = await cards.count();
  if (inFaction === 0 || inFaction >= total) fail(`The faction filter showed ${inFaction} cards`);
  await page.getByRole("button", { name: "Clear filters" }).click();

  const first = (await ids())[0];
  await page.getByRole("searchbox", { name: "Search units" }).fill(first.replace(/-/g, " ").split(" ")[0]);
  if (!(await ids()).includes(first)) fail(`Searching for ${first} did not find it`);
  await page.getByRole("searchbox", { name: "Search units" }).fill("zzzz no such unit");
  await page.getByText("No units match these filters.").waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();

  // Sorting: by name reads A to Z, the button turns it round, and the order follows.
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("name");
  const names = await cards.evaluateAll((list) => list.map((c) => c.getAttribute("aria-label")));
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  if (names.join("|") !== sorted.join("|")) fail(`Cards are not sorted by name: ${names.join(", ")}`);
  await page.getByRole("button", { name: "Lowest first" }).click();
  const reversed = await cards.evaluateAll((list) => list.map((c) => c.getAttribute("aria-label")));
  if (reversed.join("|") !== [...sorted].reverse().join("|")) fail("Turning the sort round did not reverse the cards");
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("points");
  const byPoints = await ids();
  if (byPoints.join("|") === reversed.join("|")) fail("Sorting by points did not change the order");

  // Choosing a card shows its figure model; the arrows step to the next card.
  await cards.first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  if ((await page.locator("[data-viewing]").getAttribute("data-viewing")) !== byPoints[0]) fail("The viewer shows the wrong unit");
  await drawn(300);
  if (shots) await page.screenshot({ path: `${shots}/gallery-viewer.png`, timeout: 120000 });

  // Dragging turns the figure and the wheel zooms: the camera moves either way.
  const stage = page.locator(".unit-viewer-stage canvas");
  const box = await stage.boundingBox();
  const before = await page.evaluate(() => window.__aoh.project(0, 0, 0));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);
  await page.waitForFunction(
    (b) => {
      const p = window.__aoh.project(0, 0, 0);
      return Math.abs(p.x - b.x) + Math.abs(p.y - b.y) > 2;
    },
    before,
  );

  await page.getByRole("button", { name: "Next unit" }).click();
  if ((await page.locator("[data-viewing]").getAttribute("data-viewing")) !== byPoints[1]) fail("Next unit did not step to the next card");
  await drawn(300);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });

  // Back to the main menu.
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Unit gallery", exact: true }).waitFor();

  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Gallery test passed: ${total} cards filtered, sorted and resized, and figure models viewed.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
