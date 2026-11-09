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

const stats = () => page.getByRole("region", { name: "Map details" }).locator("p").innerText();
const problems = () => page.getByRole("region", { name: "Problems" }).locator("h2").innerText();

try {
  await page.goto(url);
  await page.getByRole("button", { name: "New map" }).click();
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

  // Undo and redo the last piece.
  await page.getByRole("button", { name: "Undo" }).click();
  if (!(await stats()).startsWith("11 pieces")) fail(`Undo failed: ${await stats()}`);
  await page.getByRole("button", { name: "Redo" }).click();
  if (!(await stats()).startsWith("12 pieces")) fail(`Redo failed: ${await stats()}`);

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
  await page.mouse.move(700, 820);
  if ((await problems()) !== "NO PROBLEMS") fail(`Problems: ${await problems()}`);
  if (!(await stats()).includes("Playable by 2 to 2 players")) fail(`Not playable: ${await stats()}`);
  if (shots) await page.screenshot({ path: `${shots}/editor-built.png` });

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

  // Save and play: back on the setup screen with the new map chosen, then start a game on it.
  await page.getByRole("button", { name: "Save and play" }).click();
  await page.getByRole("button", { name: "Start draft" }).waitFor();
  const chosen = await page.getByRole("combobox", { name: "Map" }).evaluate((s) => s.selectedOptions[0].textContent);
  if (chosen !== "Test Bridge") fail(`Setup did not select the new map: ${chosen}`);
  await page.getByRole("button", { name: "Start draft" }).click();
  await page.getByRole("heading", { name: "Draft" }).waitFor();
  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log("Editor test passed: built, validated, exported, imported and played a custom map.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
