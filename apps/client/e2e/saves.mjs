// Saves a hot-seat game mid-battle and brings it back three ways: from the
// saved games list, from the game kept after a reload, and from a save file.
// Usage: node e2e/saves.mjs   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const shotsDir = process.env.E2E_SCREENSHOTS;

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4182, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
page.on("dialog", (d) => d.accept());
const shot = async (name) => shotsDir && page.screenshot({ path: `${shotsDir}/saves-${name}.png` });

/** What identifies a moment in the game: the round bar and the whole log. */
async function snapshot() {
  const round = await page.locator(".round-label").innerText();
  const log = await page.locator(".log-lines").innerText();
  return { round, log };
}

async function expectSameGame(before, how) {
  await page.locator(".round-label").waitFor();
  // A pass screen may come up first if tokens were being placed; the board state is what matters.
  const after = await snapshot();
  if (after.round !== before.round) fail(`${how}: expected "${before.round}", got "${after.round}"`);
  if (after.log !== before.log) fail(`${how}: the game log differs after loading`);
}

try {
  await page.goto(url);
  await page.getByRole("radio", { name: "1 card" }).click();
  await page.getByRole("radio", { name: "5 rounds" }).click();
  await page.getByRole("button", { name: "Start draft" }).click();

  // Draft: saving is offered here too.
  await page.getByRole("heading", { name: "Draft" }).waitFor();
  if (!(await page.getByRole("button", { name: "Save game" }).count())) fail("No Save button during the draft");
  while (await page.getByRole("heading", { name: "Draft" }).count()) {
    await page.locator(".draft-card button.primary:not([disabled])").first().click();
  }
  await page.getByRole("region", { name: "Deployment" }).waitFor();
  while (await page.getByRole("region", { name: "Deployment" }).count()) {
    await page.getByRole("button", { name: "Auto place" }).click();
    await page.getByRole("button", { name: "Confirm" }).click();
  }

  // Place tokens for both players and play two turns (ending them is enough to move the game on).
  for (let turns = 0; turns < 2; ) {
    if (await page.locator(".pass-card").count()) {
      await page.locator(".pass-card button").click();
      const rows = page.locator(".token-table tbody tr");
      for (const token of ["1", "2", "3", "X"]) {
        await rows.first().getByRole("button", { name: new RegExp(`^Token ${token} on`) }).click();
      }
      await page.getByRole("button", { name: "Lock in tokens" }).click();
      continue;
    }
    const end = page.getByRole("button", { name: "End turn" });
    if (await end.count()) {
      await end.click();
      turns++;
      continue;
    }
    await page.waitForTimeout(50);
  }
  await page.getByRole("button", { name: "End turn" }).waitFor();
  const before = await snapshot();

  // ---- Save under a name, and download a file -----------------------------
  await page.getByRole("button", { name: "Save game" }).click();
  const dialog = page.getByRole("dialog", { name: "Save game" });
  await dialog.getByLabel("Save name").fill("Test battle");
  await shot("1-dialog");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("status").filter({ hasText: 'Saved as "Test battle"' }).waitFor();

  await page.getByRole("button", { name: "Save game" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("dialog", { name: "Save game" }).getByRole("button", { name: "Download file" }).click(),
  ]);
  const file = await download.path();
  if (!/age-of-heroes-.*\.json$/.test(download.suggestedFilename())) fail(`Odd file name ${download.suggestedFilename()}`);

  // ---- Quit, then load from the list ---------------------------------------
  await page.getByRole("button", { name: "Quit game" }).click();
  await page.getByRole("button", { name: "Saved games" }).click();
  const list = page.getByRole("list", { name: "Saved games" });
  await list.waitFor();
  if ((await list.getByRole("listitem").count()) !== 1) fail("Expected one saved game");
  if (!(await page.getByRole("button", { name: "Continue", exact: true }).isDisabled())) fail("A quit game should not be offered to continue");
  await shot("2-list");
  await page.getByRole("button", { name: "Load Test battle", exact: true }).click();
  await expectSameGame(before, "Loading from the list");

  // ---- Reload: the game is kept and offered to continue --------------------
  await page.reload();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expectSameGame(before, "Continuing after a reload");

  // ---- Quit, then open the downloaded file --------------------------------
  await page.getByRole("button", { name: "Quit game" }).click();
  await page.getByRole("button", { name: "Saved games" }).click();
  await page.getByRole("button", { name: "Load a save file" }).waitFor();
  await page.getByLabel("Save file").setInputFiles(file);
  await expectSameGame(before, "Loading the save file");

  // The same file also opens in the replay viewer.
  await page.getByRole("button", { name: "Quit game" }).click();
  await page.getByLabel("Replay file").setInputFiles(file);
  await page.getByRole("region", { name: "Replay controls" }).waitFor();
  await page.getByRole("button", { name: "Close replay" }).click();

  // ---- Delete --------------------------------------------------------------
  await page.getByRole("button", { name: "Saved games" }).click();
  await page.getByRole("button", { name: "Delete Test battle", exact: true }).click();
  if (await page.getByRole("list", { name: "Saved games" }).count()) fail("The save was not deleted");

  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Saves test passed: saved at ${before.round}, loaded from the list, after a reload and from a file.`);
} catch (err) {
  await shot("failure");
  if (errors.length > 0) console.error(`Console errors:\n${errors.join("\n")}`);
  throw err;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
