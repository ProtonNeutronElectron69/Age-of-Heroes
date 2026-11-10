// Plays a full online game between two browsers through the real game server,
// with a third browser watching. Checks reconnecting after a reload and the
// replay at the end.
// Usage: node e2e/online.mjs   (needs apps/client/dist and apps/server/dist built)
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const shotsDir = process.env.E2E_SCREENSHOTS;
const GAME_PORT = 8097;
const SERVER = `ws://localhost:${GAME_PORT}/ws`;

const started = Date.now();
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(1)}s`;
const phase = (name) => console.log(`[${elapsed()}] ${name}`);

function fail(message) {
  throw new Error(message);
}

// ---- Game server ------------------------------------------------------------
const gameServer = spawn(process.execPath, [resolve(here, "../../server/dist/index.js")], {
  env: { ...process.env, PORT: String(GAME_PORT) },
  stdio: ["ignore", "inherit", "inherit"],
});
for (let i = 0; ; i++) {
  try {
    const res = await fetch(`http://localhost:${GAME_PORT}/health`);
    if (res.ok) break;
  } catch {
    // not up yet
  }
  if (i > 50) fail("The game server did not start");
  await new Promise((r) => setTimeout(r, 100));
}

const web = await preview({ preview: { port: 4181, strictPort: true }, logLevel: "error" });
const url = web.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const errors = [];
const everyone = [];
async function newPlayer(label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on("console", (m) => {
    // A reload drops the socket on purpose; the browser logs that, which is fine.
    if (m.type() === "error" && !/WebSocket/.test(m.text())) errors.push(`${label}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${label} (${elapsed()}): ${e.stack ?? e.message}`));
  page.on("dialog", (d) => d.accept());
  const player = { label, page, handled: new Set(), turnKey: "" };
  everyone.push(player);
  return player;
}

const shot = async (p, name) => shotsDir && p.page.screenshot({ path: `${shotsDir}/online-${p.label}-${name}.png` });
const hexDistance = (a, b) => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

async function screenPoint(page, q, r, elevation) {
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

async function goOnline(p, name) {
  await p.page.goto(url);
  await p.page.getByRole("radio", { name: "Online" }).click();
  await p.page.getByLabel("Game server address").fill(SERVER);
  if (name) await p.page.getByLabel("Your name").fill(name);
}

let moves = 0;
let attacks = 0;

/** Take one action on this player's device if it is their turn to do something. */
async function act(p) {
  try {
    return await tryAct(p);
  } catch (err) {
    // The game moved on between looking and clicking (the server answered, the turn passed):
    // look again next time rather than wait on a button that is gone.
    if (err?.name === "TimeoutError") return "retry";
    throw err;
  }
}

/** Short waits: a button that is not there within a few seconds is not coming back. */
const QUICK = { timeout: 5000 };

async function tryAct(p) {
  const { page } = p;
  // Wait for the server to answer the last command before deciding anything.
  await page.waitForFunction(() => !document.querySelector("[data-pending]"), null, QUICK);
  // Secret tokens: online there is no pass screen, the panel just appears.
  const lock = page.getByRole("button", { name: /Lock in tokens|^Place / });
  if (await lock.count()) {
    const rows = page.locator(".token-table tbody tr");
    const n = await rows.count();
    for (const [row, token] of [[0, "1"], [n - 1, "2"], [0, "3"], [n - 1, "X"]]) {
      await rows.nth(row).getByRole("button", { name: new RegExp(`^Token ${token} on`) }).click(QUICK);
    }
    await page.getByRole("button", { name: "Lock in tokens" }).click(QUICK);
    return "tokens";
  }

  const endTurn = page.getByRole("button", { name: "End turn" });
  if (!(await endTurn.count())) return null;
  const turn = page.getByRole("region", { name: "Current turn" });
  const key = `${await page.locator(".round-label").innerText()}|${await turn.locator(".turn-banner").innerText()}`;
  if (key !== p.turnKey) {
    p.turnKey = key;
    p.handled.clear();
  }
  const ui = await page.evaluate(() => window.__aohUi);
  if (ui?.selected && ui.targets.length > 0 && !p.handled.has(`attack:${ui.selected}`)) {
    const t = ui.targets[0];
    const pt = await screenPoint(page, t.hex.q, t.hex.r, t.elevation + t.height / 2);
    p.handled.add(`attack:${ui.selected}`);
    if (pt) {
      await page.mouse.click(pt.x, pt.y);
      attacks++;
      await page.waitForTimeout(250);
      return "attack";
    }
  }
  if (ui?.selected && !p.handled.has(ui.selected) && ui.moves.length > 0) {
    p.handled.add(ui.selected);
    const score = (m) => Math.min(...ui.enemies.map((e) => hexDistance(m.hex, e.hex)));
    for (const m of [...ui.moves].sort((a, b) => score(a) - score(b)).slice(0, 8)) {
      const pt = await screenPoint(page, m.hex.q, m.hex.r, m.elevation);
      if (!pt) continue;
      await page.mouse.click(pt.x, pt.y);
      moves++;
      await page.waitForTimeout(250);
      return "move";
    }
  }
  if (ui?.selected) p.handled.add(ui.selected);
  const buttons = turn.locator(".figure-button:not([disabled])");
  for (let i = 0; i < (await buttons.count()); i++) {
    await buttons.nth(i).click(QUICK);
    const sel = await page.evaluate(() => window.__aohUi?.selected);
    if (sel && !p.handled.has(sel)) return "switch";
  }
  await endTurn.click(QUICK);
  await page.waitForTimeout(150);
  return "end";
}

try {
  const alice = await newPlayer("alice");
  const bob = await newPlayer("bob");
  const carol = await newPlayer("carol");

  // ---- Lobby --------------------------------------------------------------
  await goOnline(alice, "Alice");
  await alice.page.getByRole("radio", { name: "1 card" }).click();
  await alice.page.getByRole("radio", { name: "5 rounds" }).click();
  await alice.page.getByRole("button", { name: "Create room" }).click();
  const codeEl = alice.page.getByLabel("Room code");
  await codeEl.waitFor();
  const code = (await codeEl.innerText()).trim();
  if (!/^[A-Z]{5}$/.test(code)) fail(`Unexpected room code: ${code}`);
  if (!(await alice.page.getByRole("button", { name: /Waiting for players/ }).isDisabled())) {
    fail("The host could start alone");
  }

  await goOnline(bob, "Bob");
  await bob.page.getByLabel("Room code").fill(code.toLowerCase());
  await bob.page.getByRole("button", { name: "Join", exact: true }).click();
  await bob.page.getByText("Waiting for the host to start.").waitFor();

  await goOnline(carol);
  await carol.page.getByLabel("Room code").fill(code);
  await carol.page.getByRole("button", { name: "Watch", exact: true }).click();
  await carol.page.getByText("You are watching.").waitFor();

  await alice.page.getByText("Bob").waitFor();
  await alice.page.getByText("1 watching").waitFor();
  await shot(alice, "1-lobby");
  await alice.page.getByRole("button", { name: "Start game" }).click();

  // ---- Draft ----------------------------------------------------------------
  phase("draft");
  for (const p of [alice, bob, carol]) await p.page.getByRole("heading", { name: "Draft" }).waitFor();
  await shot(bob, "2-draft");
  const drafted = (p) => p.page.locator(".armies li").count();
  const inDraft = () => alice.page.getByRole("heading", { name: "Draft" }).count();
  for (let i = 0; i < 40 && (await inDraft()); i++) {
    // Wait until every device has seen the last pick before deciding whose turn it is.
    const counts = await Promise.all([alice, bob, carol].map(drafted));
    if (new Set(counts).size > 1) {
      await alice.page.waitForTimeout(50);
      continue;
    }
    const open = [];
    for (const p of [alice, bob]) {
      if (await p.page.locator(".draft-card button.primary:not([disabled])").count()) open.push(p);
    }
    if (open.length > 1) fail("Both players could draft at once");
    if (await carol.page.locator(".draft-card button.primary:not([disabled])").count()) fail("The spectator could draft");
    if (open.length === 0) {
      await alice.page.waitForTimeout(50);
      continue;
    }
    await open[0].page.locator(".draft-card button.primary:not([disabled])").first().click();
    for (let t = 0; t < 100 && (await drafted(open[0])) === counts[0] && (await inDraft()); t++) {
      await alice.page.waitForTimeout(30);
    }
  }
  if (await carol.page.locator(".draft-card button.primary:not([disabled])").count()) fail("The spectator could draft");

  // ---- Deployment -------------------------------------------------------
  phase("deployment");
  for (let i = 0; i < 40; i++) {
    let placed = false;
    for (const p of [alice, bob]) {
      const auto = p.page.getByRole("button", { name: "Auto place" });
      if (await auto.count()) {
        await auto.click();
        await p.page.getByRole("button", { name: "Confirm" }).click();
        await p.page.waitForTimeout(200);
        placed = true;
      }
    }
    if (await alice.page.locator(".round-label").count()) break;
    if (!placed) await alice.page.waitForTimeout(100);
  }

  // ---- Play ---------------------------------------------------------------
  phase("play");
  let reloaded = false;
  let saveFile = null;
  let savedAt = null;
  let idle = 0;
  let retries = 0;
  for (let step = 0; step < 3000; step++) {
    if (await alice.page.getByRole("dialog", { name: "Game over" }).count()) break;
    let did = false;
    for (const p of [alice, bob]) {
      const what = await act(p);
      if (what === "retry") {
        if (++retries > 10) fail(`${p.label}'s page kept missing its buttons`);
        continue;
      }
      if (what) {
        did = true;
        retries = 0;
      }
      if (what === "tokens" && p === bob && !reloaded) {
        // Drop Bob's connection mid-game: the page must come back to his seat.
        reloaded = true;
        await shot(carol, "3-watching");
        phase("reloading Bob's page");
        await bob.page.reload();
        await bob.page.getByText("Playing as Bob").waitFor({ timeout: 15000 });
        // The catch-up brings the whole log back, not just the board.
        await bob.page.locator(".log-lines li").filter({ hasText: "drafts" }).first().waitFor({ timeout: 5000 });

        // The host saves the game as a file; nobody else can.
        phase("saving");
        if (await bob.page.getByRole("button", { name: "Save game" }).count()) fail("A guest could save the game");
        await alice.page.getByRole("button", { name: "Save game" }).click();
        const dialog = alice.page.getByRole("dialog", { name: "Save game" });
        await dialog.getByLabel("Save name").fill("Online test save");
        const [saveDownload] = await Promise.all([
          alice.page.waitForEvent("download"),
          dialog.getByRole("button", { name: "Download file" }).click(),
        ]);
        saveFile = await saveDownload.path();
        savedAt = { round: await alice.page.locator(".round-label").innerText(), log: await alice.page.locator(".log-lines").innerText() };
      }
    }
    if (did) idle = 0;
    else if (++idle > 300) fail("The game stopped making progress");
    else await alice.page.waitForTimeout(50);
  }
  if (!reloaded) fail("Bob never placed tokens, so the reload was not tested");

  for (const p of [alice, bob, carol]) {
    await p.page.getByRole("dialog", { name: "Game over" }).waitFor({ timeout: 10000 });
  }
  await shot(alice, "4-game-over");
  const heading = await alice.page.getByRole("dialog", { name: "Game over" }).getByRole("heading").innerText();
  if (!/wins|share the win|Nobody/.test(heading)) fail(`Unexpected result: ${heading}`);
  if (moves === 0) fail("No figure moved during the game");

  // ---- Replay -------------------------------------------------------------
  phase("replay");
  const downloadButton = alice.page.getByRole("button", { name: "Download replay" });
  await downloadButton.waitFor();
  const [download] = await Promise.all([alice.page.waitForEvent("download"), downloadButton.click()]);
  const file = await download.path();
  const replay = JSON.parse(await readFile(file, "utf8"));
  if (replay.formatVersion !== 1 || replay.commands.length < 10) fail("The replay file looks wrong");
  if (!replay.setup.seed) fail("The replay is missing the game's seed");

  await alice.page.getByRole("button", { name: "New game" }).click();
  await alice.page.getByRole("button", { name: "Watch a replay" }).waitFor();
  await alice.page.getByLabel("Replay file").setInputFiles(file);
  await alice.page.getByRole("region", { name: "Replay controls" }).waitFor();
  await alice.page.getByRole("button", { name: "Last move" }).click();
  const status = await alice.page.getByRole("region", { name: "Replay controls" }).innerText();
  if (!/wins|share the win|nobody wins/.test(status)) fail(`The replay did not reach the end: ${status}`);
  await shot(alice, "5-replay");

  // ---- Resume the saved game in a new room --------------------------------
  phase("resuming");
  await alice.page.getByRole("button", { name: "Close replay" }).click();
  await alice.page.getByRole("radio", { name: "Online" }).click();
  await alice.page.getByLabel("Resume file").setInputFiles(saveFile);
  await alice.page.getByRole("group", { name: "Resume a saved game" }).getByRole("button", { name: /Alice/ }).click();
  const newCodeEl = alice.page.getByLabel("Room code");
  await newCodeEl.waitFor();
  const newCode = (await newCodeEl.innerText()).trim();
  if (newCode === code) fail("Resuming reused the old room code");
  if (!(await alice.page.getByRole("button", { name: /Waiting for Bob/ }).isDisabled())) fail("The host could continue without Bob");

  await bob.page.getByRole("button", { name: "New game" }).click();
  await bob.page.getByRole("radio", { name: "Online" }).click();
  await bob.page.getByLabel("Room code").fill(newCode);
  await bob.page.getByRole("button", { name: "Join", exact: true }).click();
  const armies = bob.page.getByRole("list", { name: "Armies" });
  await armies.waitFor();
  await armies.getByRole("listitem").filter({ hasText: "Bob" }).getByRole("button", { name: "This is me" }).click();
  await bob.page.getByText("Waiting for the host to continue.").waitFor();
  await shot(alice, "6-resume-lobby");
  await alice.page.getByRole("button", { name: "Continue game" }).click();
  for (const p of [alice, bob]) {
    await p.page.locator(".round-label").waitFor();
    const round = await p.page.locator(".round-label").innerText();
    if (round !== savedAt.round) fail(`${p.label} resumed at "${round}", saved at "${savedAt.round}"`);
  }
  if ((await alice.page.locator(".log-lines").innerText()) !== savedAt.log) fail("The resumed log differs from the saved one");
  await bob.page.getByText("Playing as Bob").waitFor();
  await shot(bob, "7-resumed");

  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(
    `Online game played in room ${code}: ${moves} moves, ${attacks} attacks, ${replay.commands.length} commands. Result: ${heading} Saved at ${savedAt.round} and resumed in room ${newCode}.`,
  );
} catch (err) {
  for (const p of everyone) await shot(p, "failure").catch(() => {});
  if (errors.length > 0) console.error(`Console errors:\n${errors.join("\n")}`);
  throw err;
} finally {
  await browser.close();
  await new Promise((r) => web.httpServer.close(r));
  gameServer.kill();
}
