// Checks the main menu in each of its four styles: every choice is there, nothing scrolls on a
// landscape window, the War Table board is drawn, the chosen style is kept after a reload, and the
// menu music plays and can be turned off; the sound controls and credits are on every style, and the
// menu buttons make their hover and click sounds unless sounds are off.
// Usage: node e2e/menu.mjs   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const shots = process.env.E2E_SCREENSHOTS;
const failureShots = process.env.E2E_FAILURE_SCREENSHOTS ?? shots;
const STYLES = ["War Table", "Atlas", "Banner Hall", "Hex Command"];
const CHOICES = ["Play on this device", "Play online", "Continue", "Saved games", "Watch a replay", "Map editor", "Unit gallery", "Test game"];

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4186, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

/** The page opened last, for a screenshot if the test fails. */
let lastPage = null;

async function open(viewport) {
  const context = await browser.newContext({ viewport });
  // Test mode (src/testMode.ts): a simpler gaming table to draw, and the narrower zoom limits.
  await context.addInitScript(() => {
    window.__aohTest = true;
  });
  const page = await context.newPage();
  lastPage = page;
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.getByRole("button", { name: "Start draft" }).waitFor();
  return page;
}

/** Nothing on the page scrolls, and every part of the menu is inside the window. */
async function fits(page, what) {
  const r = await page.evaluate(() => {
    const doc = document.scrollingElement;
    const out = [...document.querySelectorAll(".menu-title, .menu-cmds .mc, .menu-panel, .menu-styles, .menu-sound, .menu-version")].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1;
    });
    const panel = document.querySelector(".menu-panel");
    // The music controls cover nothing else.
    const sound = document.querySelector(".menu-sound")?.getBoundingClientRect();
    const under = sound
      ? [...document.querySelectorAll(".menu-title h1, .menu-title p, .menu-cmds .mc, .menu-panel, .menu-styles, .menu-version")].filter((el) => {
          // The title's box can span the stage, so measure its words.
          const words = document.createRange();
          words.selectNodeContents(el);
          const b = el.closest(".menu-title") ? words.getBoundingClientRect() : el.getBoundingClientRect();
          return b.left < sound.right && sound.left < b.right && b.top < sound.bottom && sound.top < b.bottom;
        })
      : [];
    return { scroll: doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1, out: out.map((el) => el.className), under: under.map((el) => el.className || el.tagName), panel: panel.scrollHeight > panel.clientHeight + 1 };
  });
  if (r.scroll) fail(`${what}: the page scrolls`);
  if (r.out.length) fail(`${what}: parts of the menu are outside the window: ${r.out.join(", ")}`);
  if (r.under.length) fail(`${what}: the music controls cover part of the menu: ${r.under.join(", ")}`);
  if (r.panel) fail(`${what}: the settings panel overflows`);
}

try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
    const page = await open(viewport);
    const size = `${viewport.width}x${viewport.height}`;
    for (const style of STYLES) {
      await page.getByRole("radiogroup", { name: "Menu style" }).getByRole("radio", { name: style }).click();
      const id = style.toLowerCase().replace(/ /g, "-");
      await page.locator(`[data-menu-style="${id}"]`).waitFor();
      for (const name of CHOICES) {
        if ((await page.getByRole("navigation", { name: "Main menu" }).getByRole(name.startsWith("Play") ? "radio" : "button", { name, exact: true }).count()) !== 1) {
          fail(`${style}: no "${name}" choice`);
        }
      }
      await fits(page, `${style} at ${size}`);
      // Music on or off, its volume and the credits are on every style.
      const sound = page.locator(".menu-sound");
      for (const name of ["Music", "Sounds"]) {
        if ((await sound.getByRole("checkbox", { name }).count()) !== 1 || (await sound.getByRole("slider", { name: `${name} volume` }).count()) !== 1) {
          fail(`${style}: no ${name} controls`);
        }
      }
      await sound.getByRole("button", { name: "Credits" }).click();
      const credits = page.getByRole("dialog", { name: "Credits" });
      const listed = await credits.innerText();
      if (!listed.includes("The Fall of Arcana")) fail(`${style}: the credits do not list the music`);
      if (!/sound effects/i.test(listed) || !listed.includes("Kenney")) fail(`${style}: the credits do not list the sound effects`);
      await credits.getByRole("button", { name: "Close" }).click();
      await credits.waitFor({ state: "detached" });
      // The version and last update sit in a corner: "v1.0 · Last updated MM/DD/YYYY".
      const version = await page.locator(".menu-version").innerText();
      if (!/^v\d+\.\d+(\.\d+)? · Last updated \d{2}\/\d{2}\/\d{4}$/.test(version)) fail(`${style}: the version reads "${version}"`);
      await page.getByRole("radio", { name: "Online" }).click();
      await page.getByRole("button", { name: "Create room" }).waitFor();
      await fits(page, `${style} online at ${size}`);
      await page.getByRole("button", { name: "Saved games" }).click();
      await page.getByRole("button", { name: "Load a save file" }).waitFor();
      await fits(page, `${style} saved games at ${size}`);
      await page.getByRole("radio", { name: "Play on this device" }).click();
      await page.getByRole("radio", { name: "6", exact: true }).click();
      await fits(page, `${style} with six players at ${size}`);
      if (shots && size === "1280x720") await page.screenshot({ path: `${shots}/menu-${id}.png` });
      await page.getByRole("radio", { name: "2", exact: true }).click();
    }
    await page.context().close();
  }

  // The War Table draws the board and its figures behind the menu.
  const page = await open({ width: 1280, height: 720 });
  await page.getByRole("radio", { name: "War Table" }).click();
  await page.waitForFunction(() => (window.__aoh?.stats().triangles ?? 0) > 20000);

  // The chosen style is kept.
  await page.getByRole("radio", { name: "Atlas" }).click();
  await page.reload();
  await page.locator('[data-menu-style="atlas"]').waitFor();
  if ((await page.getByRole("radio", { name: "Atlas" }).getAttribute("aria-checked")) !== "true") fail("The Atlas style was not kept after a reload");

  // Menu buttons answer the pointer and a click with a sound, and the Sounds box silences them.
  const sfx = () => page.evaluate(() => window.__aohSfx?.() ?? {});
  const before = await sfx();
  await page.getByRole("button", { name: "Saved games" }).hover();
  await page.getByRole("button", { name: "Saved games" }).click();
  const after = await sfx();
  if (!((after.hover ?? 0) > (before.hover ?? 0))) fail("Mousing over a menu button made no sound");
  if (!((after.click ?? 0) > (before.click ?? 0))) fail("Clicking a menu button made no sound");
  await page.getByRole("checkbox", { name: "Sounds" }).uncheck();
  const quiet = await sfx();
  await page.getByRole("button", { name: "Watch a replay" }).hover();
  await page.getByRole("button", { name: "Map editor" }).hover();
  if (((await sfx()).hover ?? 0) !== (quiet.hover ?? 0)) fail("Sounds off still played the hover sound");
  await page.getByRole("checkbox", { name: "Sounds" }).check();
  await page.getByRole("radio", { name: "Play on this device" }).click();

  // The menu music plays once the player has clicked; the Music box stops it, and the choice is kept.
  await page.getByRole("radio", { name: "War Table" }).click();
  await page.waitForFunction(() => window.__aohMusic?.().mood === "menu" && window.__aohMusic().playing);
  await page.getByRole("checkbox", { name: "Music" }).uncheck();
  await page.waitForFunction(() => window.__aohMusic().mood === null && !window.__aohMusic().playing);
  await page.reload();
  await page.locator('[data-menu-style="war-table"]').waitFor();
  if (await page.getByRole("checkbox", { name: "Music" }).isChecked()) fail("Music off was not kept after a reload");

  // A phone held upright gets one scrolling column with every choice.
  const phone = await open({ width: 400, height: 860 });
  if (!(await phone.locator(".main-menu.compact").count())) fail("A narrow window should get the one-column menu");
  if ((await phone.evaluate(() => document.querySelector(".main-menu").scrollWidth > innerWidth + 1))) fail("The phone menu scrolls sideways");
  await phone.getByRole("button", { name: "Unit gallery" }).waitFor();

  // The test game starts at once: two armies already on Twin Fords, every glyph down, tokens to place.
  const test = await open({ width: 1280, height: 720 });
  await test.getByRole("button", { name: "Test game" }).click();
  await test.locator(".pass-card").waitFor();
  const glyphs = await test.getByRole("region", { name: "Glyphs" }).innerText();
  if (!/11 face down/.test(glyphs)) fail(`The test game should have all 11 glyphs on the board: ${glyphs}`);
  const armies = await test.evaluate(() => JSON.parse(localStorage.getItem("age-of-heroes:save:v2") ?? "null"));
  if (armies && armies.setup && (armies.setup.mapId !== "twin-fords" || Object.keys(armies.setup.armies ?? {}).length !== 2)) {
    fail(`The test game should be two armies on Twin Fords: ${JSON.stringify(armies.setup)}`);
  }

  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Menu test passed: all ${STYLES.length} styles fit at three window sizes, the chosen style is kept, the music plays and can be turned off, and the menu answers with sounds.`);
} catch (err) {
  if (failureShots && lastPage) await lastPage.screenshot({ path: `${failureShots}/menu-failure.png` }).catch(() => {});
  throw err;
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
