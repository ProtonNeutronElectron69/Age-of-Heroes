// Checks the main menu in each of its four styles: every choice is there, nothing scrolls on a
// landscape window, the War Table board is drawn, and the chosen style is kept after a reload.
// Usage: node e2e/menu.mjs   (serves the build in apps/client/dist)
import { chromium } from "playwright";
import { preview } from "vite";

const shots = process.env.E2E_SCREENSHOTS;
const STYLES = ["War Table", "Atlas", "Banner Hall", "Hex Command"];
const CHOICES = ["Play on this device", "Play online", "Continue", "Saved games", "Watch a replay", "Map editor", "Unit gallery"];

function fail(message) {
  throw new Error(message);
}

const server = await preview({ preview: { port: 4186, strictPort: true }, logLevel: "error" });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const errors = [];

async function open(viewport) {
  const page = await (await browser.newContext({ viewport })).newPage();
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
    const out = [...document.querySelectorAll(".menu-title, .menu-cmds .mc, .menu-panel, .menu-styles")].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1;
    });
    const panel = document.querySelector(".menu-panel");
    return { scroll: doc.scrollHeight > innerHeight + 1 || doc.scrollWidth > innerWidth + 1, out: out.map((el) => el.className), panel: panel.scrollHeight > panel.clientHeight + 1 };
  });
  if (r.scroll) fail(`${what}: the page scrolls`);
  if (r.out.length) fail(`${what}: parts of the menu are outside the window: ${r.out.join(", ")}`);
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
      await page.getByRole("radio", { name: "Online" }).click();
      await page.getByRole("button", { name: "Create room" }).waitFor();
      await fits(page, `${style} online at ${size}`);
      await page.getByRole("button", { name: "Saved games" }).click();
      await page.getByRole("button", { name: "Load a save file" }).waitFor();
      await fits(page, `${style} saved games at ${size}`);
      await page.getByRole("radio", { name: "Play on this device" }).click();
      await page.getByRole("radio", { name: "Advanced" }).click();
      await page.getByRole("radio", { name: "6", exact: true }).click();
      await fits(page, `${style} with six players at ${size}`);
      if (shots && size === "1280x720") await page.screenshot({ path: `${shots}/menu-${id}.png` });
      await page.getByRole("radio", { name: "Basic" }).click();
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

  // A phone held upright gets one scrolling column with every choice.
  const phone = await open({ width: 400, height: 860 });
  if (!(await phone.locator(".menu.compact").count())) fail("A narrow window should get the one-column menu");
  if ((await phone.evaluate(() => document.querySelector(".menu").scrollWidth > innerWidth + 1))) fail("The phone menu scrolls sideways");
  await phone.getByRole("button", { name: "Unit gallery" }).waitFor();

  if (errors.length > 0) fail(`Console errors:\n${errors.join("\n")}`);
  console.log(`Menu test passed: all ${STYLES.length} styles fit at three window sizes, and the chosen style is kept.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
