// The client side of online play, through the real game server: the lobby, a
// spectator, coming back to your seat after a reload, a few turns on the board,
// host-only saving, leaving (which concedes), the replay, and resuming a saved
// game in a new room. Each player has their own browser, as on three devices.
// Whole games are played over the protocol by the server's unit tests
// (apps/server/test), so this test stops after a few turns.
// Usage: node e2e/online.mjs   (needs apps/client/dist and apps/server/dist built)
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const here = dirname(fileURLToPath(import.meta.url));
const shotsDir = process.env.E2E_SCREENSHOTS;
const failureShots = process.env.E2E_FAILURE_SCREENSHOTS ?? shotsDir;
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

const web = await preview({ preview: { port: 4183, strictPort: true }, logLevel: "error" });
const url = web.resolvedUrls.local[0];
/** One browser per player: in one shared browser their boards queue behind each other to be drawn. */
const browsers = [];

const errors = [];
const everyone = [];
async function newPlayer(label) {
  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  browsers.push(browser);
  // Reduced motion stills the board's endless decorations (the arrow's bob, the rings' pulse),
  // so the board rests between actions instead of drawing every frame in software.
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, acceptDownloads: true, reducedMotion: "reduce" });
  // Test mode (src/testMode.ts): a simpler gaming table to draw, and the narrower zoom limits.
  await context.addInitScript(() => {
    window.__aohTest = true;
    // No dice show: this test does not look at it, and it would cover the board (full-game checks it).
    try {
      localStorage.setItem("aoh.display", JSON.stringify({ ...JSON.parse(localStorage.getItem("aoh.display") ?? "{}"), dice: "none" }));
    } catch {
      // No storage: nothing to set.
    }
  });
  const page = await context.newPage();
  page.on("console", (m) => {
    // A reload drops the socket on purpose; the browser logs that, which is fine.
    if (m.type() === "error" && !/WebSocket/.test(m.text())) errors.push(`${label}: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`${label} (${elapsed()}): ${e.stack ?? e.message}`));
  page.on("dialog", (d) => d.accept());
  const player = { label, browser, page, handled: new Set(), turnKey: "" };
  everyone.push(player);
  return player;
}

const shot = async (p, name) => shotsDir && p.page.screenshot({ path: `${shotsDir}/online-${p.label}-${name}.png` });
const hexDistance = (a, b) => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** Waits until the camera has stopped moving: two frames in a row project the same point (a glide changes every frame). */
async function steadyCamera(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = "";
        let same = 0;
        const tick = () => {
          const p = JSON.stringify(window.__aoh?.project(0, 0, 0));
          same = p === last ? same + 1 : 0;
          last = p;
          if (same >= 1) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
}

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

/** How many pings from other players this page has heard. */
const pingsHeard = (p) => p.page.evaluate(() => window.__aohPingsHeard ?? 0);

/** Press P with the pointer over an open spot on this page's board (not under a panel). */
async function pingBoard(p) {
  await p.page.waitForFunction(() => window.__aoh?.canvas.isConnected && window.__aoh.stats().frames > 0);
  const spot = await p.page.evaluate(() => {
    const canvas = window.__aoh.canvas;
    const r = canvas.getBoundingClientRect();
    for (const [fx, fy] of [[0.5, 0.55], [0.6, 0.6], [0.45, 0.7], [0.55, 0.4]]) {
      const x = r.left + r.width * fx;
      const y = r.top + r.height * fy;
      if (document.elementFromPoint(x, y) === canvas) return { x, y };
    }
    return null;
  });
  if (!spot) fail(`No open spot on ${p.label}'s board to ping`);
  await p.page.mouse.move(spot.x, spot.y);
  await p.page.keyboard.press("p");
}

/** Short waits: a button that is not there within a few seconds is not coming back. */
const QUICK = { timeout: 5000 };

/**
 * Clicks a button that opens or closes a 3D view: a new screen, the draft map, the dice.
 * Without a graphics card, setting up or tearing down a canvas can keep the page busy for
 * several seconds, and Playwright counts the click as done only once the page answers, so
 * these clicks get a long timeout. QUICK is for ordinary buttons. See "Known pitfalls" in
 * docs/TESTING.md: a 5 s timeout here once failed a click that had worked.
 */
const SCENE_CHANGE = { timeout: 30000 };
async function clickSceneChange(button) {
  await button.click(SCENE_CHANGE);
}

/** Set once Bob has rolled for initiative with the dice show on, and seen the result. */
let initiativeChecked = false;

async function tryAct(p) {
  const { page } = p;
  // Wait for the server to answer the last command before deciding anything. After an attack this
  // also waits for both players' attack intros to end (each page holds the next move until then).
  await page.waitForFunction(() => !document.querySelector("[data-pending]"), null, { timeout: 30000 });
  // Initiative with the dice show on (Bob, in round 1). Alice's page rolls for her at once, as her dice show is off;
  // Bob must see her ready but no result at all until he has rolled too.
  const initiative = page.getByRole("dialog", { name: "Initiative" });
  if (await initiative.count()) {
    const roll = initiative.getByRole("button", { name: /^Roll for / });
    if (await roll.count()) {
      await initiative.locator(".initiative-value[data-ready]").first().waitFor(QUICK);
      if (await initiative.locator(".initiative-value[data-value]").count()) fail(`${p.label} saw an initiative result before rolling`);
      await shot(p, "4-initiative-waiting");
      await roll.click(QUICK);
      return "initiative";
    }
    const done = initiative.getByRole("button", { name: "Continue" });
    if (await done.count()) {
      if ((await initiative.locator(".initiative-value[data-value]").count()) < 2) fail("The initiative show ended without both rolls");
      // Closing the dice also closes their 3D canvas as the first turn starts.
      await clickSceneChange(done);
      initiativeChecked = true;
      return "initiative";
    }
    return null;
  }
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
  // The dice stay up until closed (or the next action): close them so they do not cover the board.
  const closeDice = page.getByRole("button", { name: "Close dice" });
  if (await closeDice.count()) await closeDice.click(QUICK);
  // Screen points are only good once the camera has stopped gliding to the acting figure.
  await steadyCamera(page);
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
  if (ui?.selected && !p.handled.has(`move:${ui.selected}`) && ui.moves.length > 0) {
    p.handled.add(`move:${ui.selected}`);
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
  if (ui?.selected) {
    p.handled.add(`attack:${ui.selected}`);
    p.handled.add(`move:${ui.selected}`);
  }
  const buttons = turn.locator(".figure-button:not([disabled])");
  for (let i = 0; i < (await buttons.count()); i++) {
    await buttons.nth(i).click(QUICK);
    const now = await page.evaluate(() => window.__aohUi);
    const sel = now?.selected;
    if (sel && ((now.targets.length > 0 && !p.handled.has(`attack:${sel}`)) || (now.moves.length > 0 && !p.handled.has(`move:${sel}`)))) {
      return "switch";
    }
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
  // 150 points: one or two units each, for a short game.
  await alice.page.getByLabel("Points per player").fill("150");
  await alice.page.getByLabel("Points per player").blur();
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
  await clickSceneChange(alice.page.getByRole("button", { name: "Start game" }));

  // ---- Draft ----------------------------------------------------------------
  phase("draft");
  for (const p of [alice, bob, carol]) await p.page.getByRole("heading", { name: "Draft" }).waitFor();
  // Every device opens the draft on the battlefield, the spectator's too; each goes on to the cards on its own.
  for (const p of [alice, bob, carol]) await p.page.getByRole("region", { name: "Battlefield" }).waitFor();
  // Alice pings the map, and Bob and the spectator both see it.
  await pingBoard(alice);
  for (const p of [bob, carol]) await p.page.waitForFunction(() => (window.__aohPingsHeard ?? 0) >= 1, null, { timeout: 15000 });
  for (const p of [alice, bob, carol]) await clickSceneChange(p.page.getByRole("button", { name: "Go to the draft" }));
  await shot(bob, "2-draft");
  const drafted = (p) => p.page.locator(".armies li").count();
  const inDraft = () => alice.page.getByRole("heading", { name: "Draft" }).count();
  const canDraft = (p) => p.page.locator(".draft-card button.primary:not([disabled])").count();
  if (await canDraft(carol)) fail("The spectator could draft");
  // Everyone drafts at once: Alice and Bob pick at the same moment, Alice the first unit and Bob the cheapest,
  // so Bob has points left and is still drafting when his page is reloaded below.
  const aliceCard = await alice.page.locator(".draft-card:has(button.primary:not([disabled])) .hex-card").first().getAttribute("data-card");
  const cheapest = await bob.page.evaluate((taken) => {
    const open = [...document.querySelectorAll(".draft-card:has(button.primary:not([disabled]))")].filter((el) => el.querySelector(".hex-card")?.dataset.card !== taken);
    open.sort((a, b) => Number(a.dataset.points) - Number(b.dataset.points));
    return open[0]?.querySelector(".hex-card")?.dataset.card;
  }, aliceCard);
  await Promise.all([
    alice.page.locator(".draft-card button.primary:not([disabled])").first().click(),
    bob.page.locator(`.draft-card:has(.hex-card[data-card="${cheapest}"]) button.primary`).click(),
  ]);
  for (let t = 0; t < 200 && (await inDraft()) && (await drafted(alice)) < 2; t++) await alice.page.waitForTimeout(30);
  // The unit Alice took is greyed out on Bob's screen: each unit can be drafted by one player only.
  if (await inDraft()) {
    await bob.page.locator(`.draft-card:has(.hex-card[data-card="${aliceCard}"]) button`).filter({ hasText: "Drafted by Alice" }).waitFor({ timeout: 10000 });
    await shot(bob, "2b-draft-taken");
  }
  let reloaded = false;
  for (let i = 0; i < 60 && (await inDraft()); i++) {
    if (!reloaded) {
      // Drop Bob's connection mid-draft: the page must come back to his seat, with every pick so far.
      // Once a unit has been drafted the draft opens on the cards, with no 3D board, so this is quick even without a graphics card.
      reloaded = true;
      phase("reloading Bob's page");
      const before = await drafted(alice);
      await bob.page.reload();
      await bob.page.getByText("Playing as Bob").waitFor();
      await bob.page.getByRole("heading", { name: "Draft" }).waitFor();
      if ((await drafted(bob)) !== before) fail(`After the reload Bob sees ${await drafted(bob)} drafted units, not ${before}`);
      continue;
    }
    if (await canDraft(carol)) fail("The spectator could draft");
    // Each player drafts what they can afford, then says they are done.
    let did = false;
    for (const p of [alice, bob]) {
      if (await p.page.locator("[data-pending]").count()) continue;
      const pick = p.page.locator(".draft-card button.primary:not([disabled])").first();
      const done = p.page.getByRole("button", { name: "Done drafting" });
      if (await pick.count()) await pick.click().then(() => (did = true), () => {});
      else if (await done.count()) await done.click().then(() => (did = true), () => {});
    }
    if (!did) await alice.page.waitForTimeout(50);
  }
  if (!reloaded) fail("Bob was never reloaded during the draft");
  if (await canDraft(carol)) fail("The spectator could draft");

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

  // The spectator sees the board but no controls. Her browser is closed after that,
  // so that two boards, not three, share the machine.
  await carol.page.locator(".round-label").waitFor();
  await shot(carol, "3-watching");
  if (await carol.page.getByRole("button", { name: /Lock in tokens|End turn/ }).count()) fail("The spectator has game controls");
  await carol.browser.close();
  everyone.splice(everyone.indexOf(carol), 1);

  // Pings in play: Alice points at the board with P, and Bob's page gets her ping.
  // (His count started again at his reload during the draft.)
  phase("ping");
  const bobHeard = await pingsHeard(bob);
  await pingBoard(alice);
  await bob.page.waitForFunction((before) => (window.__aohPingsHeard ?? 0) > before, bobHeard, { timeout: 15000 });

  // Bob watches the initiative dice; Alice keeps them off, so her page rolls for her as soon as the tokens are down.
  await bob.page.getByRole("button", { name: "Display" }).click();
  await bob.page.getByLabel("Dice rolls").selectOption("dice");
  await bob.page.getByRole("button", { name: "Display" }).click();

  // ---- Play a few turns ---------------------------------------------------
  phase("play");
  let ended = 0;
  let idle = 0;
  let retries = 0;
  let diceOff = false;
  for (let step = 0; step < 400 && !(moves > 0 && ended >= 2); step++) {
    let did = false;
    // Once checked, Bob turns the dice show off again: this test plays turns, and full-game checks the attack scene.
    if (initiativeChecked && !diceOff) {
      diceOff = true;
      await bob.page.getByRole("button", { name: "Display" }).click();
      await bob.page.getByLabel("Dice rolls").selectOption("none");
      await bob.page.getByRole("button", { name: "Display" }).click();
    }
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
      if (what === "end") ended++;
    }
    if (did) idle = 0;
    else if (++idle > 300) fail("The game stopped making progress");
    else await alice.page.waitForTimeout(50);
  }
  if (moves === 0) fail("No figure moved");
  if (ended < 2) fail(`Only ${ended} turns were ended`);
  if (!initiativeChecked) fail("Bob never rolled for initiative with the dice show on");
  // The catch-up after the reload brought the whole log back, not just the state:
  // the first pick happened before his reload, so his page only has it from the catch-up.
  await bob.page.locator(".log-lines li").filter({ hasText: "drafts" }).first().waitFor();

  // ---- Save, then leave ---------------------------------------------------
  // The host saves the game as a file; nobody else can.
  phase("saving");
  if (await bob.page.getByRole("button", { name: "Save game" }).count()) fail("A guest could save the game");
  await alice.page.waitForFunction(() => !document.querySelector("[data-pending]"));
  await alice.page.getByRole("button", { name: "Save game" }).click();
  const dialog = alice.page.getByRole("dialog", { name: "Save game" });
  await dialog.getByLabel("Save name").fill("Online test save");
  const [saveDownload] = await Promise.all([alice.page.waitForEvent("download"), dialog.getByRole("button", { name: "Download file" }).click()]);
  const saveFile = await saveDownload.path();
  const savedAt = { round: await alice.page.locator(".round-label").innerText(), log: await alice.page.locator(".log-lines").innerText() };

  // Leaving concedes: with one player left, the game is over.
  phase("leaving");
  await clickSceneChange(bob.page.getByRole("button", { name: "Leave game" }));
  await bob.page.getByRole("radio", { name: "Online" }).waitFor();
  const over = alice.page.getByRole("dialog", { name: "Game over" });
  await over.waitFor();
  await shot(alice, "4-game-over");
  const heading = await over.getByRole("heading").innerText();
  if (!/Alice wins/.test(heading)) fail(`Unexpected result after Bob left: ${heading}`);

  // ---- Replay -------------------------------------------------------------
  phase("replay");
  const downloadButton = alice.page.getByRole("button", { name: "Download replay" });
  await downloadButton.waitFor();
  const [download] = await Promise.all([alice.page.waitForEvent("download"), downloadButton.click()]);
  const file = await download.path();
  const replay = JSON.parse(await readFile(file, "utf8"));
  if (replay.formatVersion !== 1) fail("The replay file looks wrong");
  if (replay.commands.at(-1)?.type !== "concede") fail("The replay does not end with Bob leaving");
  if (!replay.setup.seed) fail("The replay is missing the game's seed");

  await clickSceneChange(alice.page.getByRole("button", { name: "New game" }));
  await alice.page.getByRole("button", { name: "Watch a replay" }).waitFor();
  await alice.page.getByLabel("Replay file").setInputFiles(file);
  await alice.page.getByRole("region", { name: "Replay controls" }).waitFor();
  await alice.page.getByRole("button", { name: "Last move" }).click();
  const status = await alice.page.getByRole("region", { name: "Replay controls" }).innerText();
  if (!/wins|share the win|nobody wins/.test(status)) fail(`The replay did not reach the end: ${status}`);
  await shot(alice, "5-replay");

  // ---- Resume the saved game in a new room --------------------------------
  phase("resuming");
  await clickSceneChange(alice.page.getByRole("button", { name: "Close replay" }));
  await alice.page.getByRole("radio", { name: "Online" }).click();
  await alice.page.getByLabel("Resume file").setInputFiles(saveFile);
  await alice.page.getByRole("group", { name: "Resume a saved game" }).getByRole("button", { name: /Alice/ }).click();
  const newCodeEl = alice.page.getByLabel("Room code");
  await newCodeEl.waitFor();
  const newCode = (await newCodeEl.innerText()).trim();
  if (newCode === code) fail("Resuming reused the old room code");
  if (!(await alice.page.getByRole("button", { name: /Waiting for Bob/ }).isDisabled())) fail("The host could continue without Bob");

  // Bob left the first game, so his page is already back at the menu.
  await bob.page.getByRole("radio", { name: "Online" }).click();
  await bob.page.getByLabel("Room code").fill(newCode);
  await bob.page.getByRole("button", { name: "Join", exact: true }).click();
  const armies = bob.page.getByRole("list", { name: "Armies" });
  await armies.waitFor();
  await armies.getByRole("listitem").filter({ hasText: "Bob" }).getByRole("button", { name: "This is me" }).click();
  await bob.page.getByText("Waiting for the host to continue.").waitFor();
  await shot(alice, "6-resume-lobby");
  await clickSceneChange(alice.page.getByRole("button", { name: "Continue game" }));
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
    `Online game in room ${code}: ${moves} moves, ${attacks} attacks, ${replay.commands.length} commands. Result: ${heading} Saved at ${savedAt.round} and resumed in room ${newCode}.`,
  );
} catch (err) {
  if (failureShots) {
    for (const p of everyone) await p.page.screenshot({ path: `${failureShots}/online-${p.label}-failure.png` }).catch(() => {});
  }
  if (errors.length > 0) console.error(`Console errors:\n${errors.join("\n")}`);
  throw err;
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  await new Promise((r) => web.httpServer.close(r));
  gameServer.kill();
}
