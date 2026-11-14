// Builds a map in the editor through the real UI, round-trips it through a
// file export and import, then starts a game on it.
// Usage: pnpm --filter @aoh/client e2e   (serves the build in apps/client/dist)
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { preview } from "vite";

const shots = process.env.E2E_SCREENSHOTS;

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4181, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1400, height: 860 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());

/** Click the table or terrain at a hex, at a given height in levels. */
async function clickHex(q, r, elevation) {
  const p = await page.evaluate(([q, r, e]) => window.__aoh.project(q, r, e), [q, r, elevation]);
  await page.mouse.move(p.x, p.y, { steps: 3 });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(60);
}

/** Point at a spot `share` of the way from a hex's centre toward a neighbour, at a height in levels. */
async function towards([q, r], [nq, nr], elevation, share) {
  const a = await page.evaluate(([q, r, e]) => window.__aoh.project(q, r, e), [q, r, elevation]);
  const b = await page.evaluate(([q, r, e]) => window.__aoh.project(q, r, e), [nq, nr, elevation]);
  return { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share };
}

const status = () => page.getByRole("region", { name: "Files" }).getByRole("status").innerText();
const stats = () => page.getByRole("region", { name: "Map details" }).locator("p").innerText();
const problems = () => page.getByRole("region", { name: "Problems" }).locator("h2").innerText();

try {
  await page.goto(url);
  await page.getByRole("button", { name: "Map editor" }).click();
  await page.getByRole("region", { name: "Tools" }).waitFor();
  await page.waitForTimeout(800);

  // Four 24-hex grass slabs.
  await page.getByRole("button", { name: "24-hex piece" }).click();
  for (const [q, r] of [[-6, -4], [0, -4], [-4, 0], [2, 0]]) await clickHex(q, r, 0);
  if (!(await stats()).startsWith("4 pieces, 96 hexes")) fail(`Unexpected stats after slabs: ${await stats()}`);

  // Two 3-level rock pillars with a road deck across them: a bridge.
  await page.getByRole("button", { name: "Rock", exact: true }).click();
  await page.getByRole("button", { name: "1-hex piece" }).click();
  for (let level = 1; level <= 3; level++) {
    await clickHex(-1, -2, level);
    await clickHex(2, -2, level);
  }
  await page.getByRole("button", { name: "Road", exact: true }).click();
  await page.getByRole("button", { name: "3-hex line piece" }).click();
  await clickHex(0, -2, 4);
  await page.getByRole("button", { name: "1-hex piece" }).click();
  await clickHex(-1, -2, 4);
  if (!(await stats()).includes("highest level 5")) fail(`The bridge did not stack: ${await stats()}`);


  // A pond, then trees.
  await page.getByRole("button", { name: "Water", exact: true }).click();
  await page.getByRole("button", { name: "7-hex piece" }).click();
  await clickHex(0, 1, 1);
  await page.getByRole("tab", { name: "Scenery" }).click();
  await clickHex(-5, -3, 1);
  await clickHex(-4, -3, 1);
  if (!(await stats()).includes("2 scenery")) fail(`Trees were not placed: ${await stats()}`);

  // Without start zones the map cannot be played yet.
  if (!(await page.getByRole("button", { name: "Save and play" }).isDisabled())) fail("Play should need start zones");

  // Two start zones.
  await page.getByRole("tab", { name: "Start zones" }).click();
  for (const [q, r] of [[-6, -4], [-5, -4], [-6, -3], [-3, -3]]) await clickHex(q, r, 1);
  await page.getByRole("button", { name: /^Zone 2/ }).click();
  for (const [q, r] of [[5, 2], [6, 2], [5, 3], [6, 3]]) await clickHex(q, r, 1);
  // Start zones stay off scenery: the hex with a tree is refused.
  await clickHex(-5, -3, 1);
  if (!(await status()).startsWith("A start zone cannot go on hex -5,-3: it has scenery")) {
    fail(`Zone on a tree: ${await status()}`);
  }
  await page.mouse.move(700, 820);
  if ((await problems()) !== "NO PROBLEMS") fail(`Problems: ${await problems()}`);
  if (!(await stats()).includes("Playable by 2 to 2 players")) fail(`Not playable: ${await stats()}`);
  if (shots) await page.screenshot({ path: `${shots}/editor-built.png` });

  // Shift places a piece beside another at the same level. One hanging off the deck's end touches
  // only one side, so it is a problem; find it, then remove it.
  await page.getByRole("tab", { name: "Terrain" }).click();
  await page.getByRole("button", { name: "1-hex piece" }).click();
  await page.getByRole("button", { name: "Rock", exact: true }).click();
  const side = await towards([2, -2], [3, -2], 4, 0.35);
  await page.mouse.move(side.x, side.y, { steps: 4 });
  await page.keyboard.down("Shift");
  await page.mouse.move(side.x + 1, side.y, { steps: 2 });
  await page.getByText("Beside it on level 4").waitFor();
  await page.mouse.click(side.x + 1, side.y);
  await page.keyboard.up("Shift");
  if (!(await stats()).startsWith("14 pieces")) fail(`Shift did not place a piece: ${await stats()}`);
  if ((await problems()) !== "1 PROBLEM") fail(`The hanging piece should be a problem: ${await problems()}`);
  await page.getByRole("button", { name: "Show next problem" }).click();
  if (!(await status()).startsWith("Problem 1 of 1")) fail(`Show next problem: ${await status()}`);
  await page.getByRole("button", { name: "Fix problems" }).click();
  if (!(await status()).startsWith("Fixed: removed 1 piece")) fail(`Fix problems: ${await status()}`);
  if (!(await stats()).startsWith("13 pieces")) fail(`Fix problems: ${await stats()}`);
  if ((await problems()) !== "NO PROBLEMS") fail(`Problems left: ${await problems()}`);

  // Three singles on the table away from the rest, erased with one dragged box.
  for (const q of [4, 5, 6]) await clickHex(q, -6, 0);
  if (!(await stats()).startsWith("16 pieces")) fail(`Singles were not placed: ${await stats()}`);
  await page.getByRole("tab", { name: "Erase" }).click();
  const from = await page.evaluate(() => window.__aoh.project(2.5, -7.2, 1));
  const to = await page.evaluate(() => window.__aoh.project(6.8, -5.4, 1));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  if (!(await stats()).startsWith("13 pieces")) fail(`Box erase: ${await stats()}, ${await status()}`);
  await page.getByRole("tab", { name: "Terrain" }).click();

  // Special terrain explains itself after a second's rest.
  await page.getByRole("button", { name: "Lava", exact: true }).hover();
  await page.getByRole("tooltip").getByText(/roll a d20/).waitFor({ timeout: 3000 });
  await page.mouse.move(700, 820);

  // Undo and redo the box erase.
  await page.getByRole("button", { name: "Undo" }).click();
  if (!(await stats()).startsWith("16 pieces")) fail(`Undo failed: ${await stats()}`);
  await page.getByRole("button", { name: "Redo" }).click();
  if (!(await stats()).startsWith("13 pieces")) fail(`Redo failed: ${await stats()}`);

  // Name it, export it, and import it back.
  const name = page.getByRole("textbox", { name: "Name" });
  await name.fill("Test Bridge");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export file" }).click(),
  ]);
  const file = join(tmpdir(), `aoh-e2e-${Date.now()}.json`);
  await download.saveAs(file);
  const exported = JSON.parse(await readFile(file, "utf8"));
  if (exported.name !== "Test Bridge" || exported.pieces.length !== 13 || exported.scenery.length !== 2) {
    fail(`Exported file looks wrong: ${exported.name}, ${exported.pieces.length} pieces`);
  }
  await page.getByRole("button", { name: "New", exact: true }).click();
  if (!(await stats()).startsWith("0 pieces")) fail("New did not clear the map");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Import file" }).click(),
  ]);
  await chooser.setFiles(file);
  await page.getByText('Imported "Test Bridge"').waitFor();
  if (!(await stats()).startsWith("13 pieces")) fail(`Import lost pieces: ${await stats()}`);

  // Random fills: terrain on level 2, then scenery on level 1. Both keep the map free of problems.
  await page.getByRole("tab", { name: "Terrain" }).click();
  await page.getByRole("button", { name: "Add terrain to level 2" }).click();
  if (!/^Added \d+ pieces? on level 2/.test(await status())) fail(`Terrain fill: ${await status()}`);
  if ((await stats()).startsWith("13 pieces")) fail("The terrain fill added nothing");
  await page.getByRole("tab", { name: "Scenery" }).click();
  await page.getByRole("button", { name: "Fill level down" }).click();
  await page.getByRole("button", { name: "Add scenery on level 1" }).click();
  if (!/^Added \d+ scenery on level 1/.test(await status())) fail(`Scenery fill: ${await status()}`);
  if ((await problems()) !== "NO PROBLEMS") fail(`Fills made problems: ${await problems()}`);

  // Reset start zones, then undo it.
  await page.getByRole("tab", { name: "Start zones" }).click();
  await page.getByRole("button", { name: "Reset start zones" }).click();
  if (!(await stats()).includes("Needs start zones")) fail(`Reset start zones: ${await stats()}`);
  await page.getByRole("button", { name: "Undo" }).click();
  if (!(await stats()).includes("Playable by 2 to 2 players")) fail(`Undo of the reset: ${await stats()}`);

  // Save and play: back on the setup screen with the new map chosen, then start a game on it.
  await page.getByRole("button", { name: "Save and play" }).click();
  await page.getByRole("button", { name: "Start draft" }).waitFor();
  const chosen = await page.getByRole("combobox", { name: "Map" }).evaluate((s) => s.selectedOptions[0].textContent);
  if (chosen !== "Test Bridge") fail(`Setup did not select the new map: ${chosen}`);
  // An Advanced game with no points limit.
  await page.getByRole("radio", { name: "Advanced" }).click();
  await page.getByRole("checkbox", { name: "No limit" }).check();
  await page.getByRole("button", { name: "Start draft" }).click();
  await page.getByRole("heading", { name: "Draft" }).waitFor();
  await page.getByText("There is no points limit").waitFor();
  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log("Editor test passed: built, validated, exported, imported and played a custom map.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
