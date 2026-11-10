// Works out which checks a change needs, from the files it touches.
//
//   node scripts/affected.mjs            print the plan for this branch (against origin/main, plus local edits)
//   node scripts/affected.mjs --run      run the planned checks
//   node scripts/affected.mjs --all      plan (or --run) every check
//   node scripts/affected.mjs --base <ref> --github
//                                        CI: compare with <ref> and write the plan to the job outputs
//
// The routing table is RULES below; docs/TESTING.md explains it. Files that match no rule run everything.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** Unit test folders (vitest path filters), by package. */
const UNIT = {
  rules: "packages/rules",
  content: "packages/content",
  protocol: "packages/protocol",
  server: "apps/server",
};

/** Browser tests. Each runs from apps/client against the build. */
export const E2E = {
  "full-basic": "node e2e/full-game.mjs basic",
  "full-advanced": "node e2e/full-game.mjs advanced",
  editor: "node e2e/editor.mjs",
  saves: "node e2e/saves.mjs",
  online: "node e2e/online.mjs",
};

const ALL = "all";
/** Unit tests for a package and every package that depends on it. */
const WITH_DEPENDENTS = {
  rules: ALL,
  content: [UNIT.content, UNIT.protocol, UNIT.server],
  protocol: [UNIT.protocol, UNIT.server],
  server: [UNIT.server],
};

/**
 * First match wins. `check` runs typecheck, build and the listed unit tests;
 * `unit` and `e2e` are lists, ALL, or empty.
 */
export const RULES = [
  // Words only: nothing to test.
  { area: "docs", match: /^(docs\/|LICENSE$)|\.md$/, check: false, unit: [], e2e: [] },
  // Deployment files that CI does not exercise.
  { area: "deploy config", match: /^(\.dockerignore|\.gitignore|render\.yaml|apps\/server\/Dockerfile|\.github\/workflows\/deploy\.yml)$/, check: false, unit: [], e2e: [] },

  // Unit card data and the balance model: the content tests check them in full (roster rules, costs, simulated games).
  { area: "unit cards", match: /^packages\/content\/src\/(cards\/.*\.json|balance\.ts)$/, check: true, unit: WITH_DEPENDENTS.content, e2e: [] },
  { area: "content tests", match: /^packages\/content\/test\//, check: true, unit: [UNIT.content], e2e: [] },
  // Maps, terrain, scenery, tuning: they change how the board plays.
  { area: "content", match: /^packages\/content\//, check: true, unit: WITH_DEPENDENTS.content, e2e: ALL },

  { area: "rules tests", match: /^packages\/rules\/test\//, check: true, unit: [UNIT.rules], e2e: [] },
  { area: "rules", match: /^packages\/rules\//, check: true, unit: ALL, e2e: ALL },

  // The protocol is only used online and for save and replay files.
  { area: "protocol tests", match: /^packages\/protocol\/test\//, check: true, unit: [UNIT.protocol], e2e: [] },
  { area: "protocol", match: /^packages\/protocol\//, check: true, unit: WITH_DEPENDENTS.protocol, e2e: ["saves", "online"] },

  { area: "server tests", match: /^apps\/server\/test\//, check: true, unit: [UNIT.server], e2e: [] },
  { area: "server", match: /^apps\/server\//, check: true, unit: [UNIT.server], e2e: ["online"] },

  // A browser test script runs itself.
  { area: "browser test", match: /^apps\/client\/e2e\/full-game\.mjs$/, check: false, unit: [], e2e: ["full-basic", "full-advanced"] },
  { area: "browser test", match: /^apps\/client\/e2e\/editor\.mjs$/, check: false, unit: [], e2e: ["editor"] },
  { area: "browser test", match: /^apps\/client\/e2e\/saves\.mjs$/, check: false, unit: [], e2e: ["saves"] },
  { area: "browser test", match: /^apps\/client\/e2e\/online\.mjs$/, check: false, unit: [], e2e: ["online"] },

  // Client files that only one part of the game uses.
  { area: "map editor", match: /^apps\/client\/src\/screens\/EditorScreen\.tsx$/, check: true, unit: [], e2e: ["editor"] },
  { area: "online play", match: /^apps\/client\/src\/(online\.ts|screens\/LobbyScreen\.tsx|ui\/OnlineBar\.tsx)$/, check: true, unit: [], e2e: ["online"] },
  { area: "saves and replays", match: /^apps\/client\/src\/(saves\.ts|ui\/SaveDialog\.tsx|screens\/ReplayScreen\.tsx)$/, check: true, unit: [], e2e: ["saves", "online"] },
  // Styles and the rest of the client: every browser test goes through them.
  { area: "client", match: /^apps\/client\//, check: true, unit: [], e2e: ALL },

  // Shared build setup, dependencies, CI and this script: everything.
  { area: "build setup", match: /^(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.base\.json|vitest\.config\.ts|\.github\/workflows\/ci\.yml|scripts\/)/, check: true, unit: ALL, e2e: ALL },
];

const FALLBACK = { area: "unknown", check: true, unit: ALL, e2e: ALL };

function merge(into, list, every) {
  if (into === ALL || list === ALL) return ALL;
  for (const x of list) if (!into.includes(x)) into.push(x);
  return into.length === every.length ? ALL : into;
}

/**
 * The checks a set of changed files needs.
 * `unit` and `e2e` come back as ALL or as a list in a stable order.
 */
export function plan(files) {
  let check = false;
  let unit = [];
  let e2e = [];
  const reasons = [];
  for (const file of files) {
    const rule = RULES.find((r) => r.match.test(file)) ?? FALLBACK;
    reasons.push({ file, area: rule.area });
    check ||= rule.check;
    unit = merge(unit, rule.unit, Object.values(UNIT));
    e2e = merge(e2e, rule.e2e, Object.keys(E2E));
  }
  // The browser tests need a build, and the build needs to typecheck.
  if (e2e === ALL || e2e.length > 0) check = true;
  const order = (list, every) => (list === ALL ? ALL : every.filter((x) => list.includes(x)));
  return { check, unit: order(unit, Object.values(UNIT)), e2e: order(e2e, Object.keys(E2E)), reasons };
}

/** Everything, for pushes to main and manual runs. */
export function planAll(reason = "full run") {
  return { check: true, unit: ALL, e2e: ALL, reasons: [{ file: "*", area: reason }] };
}

// ---- Command line -----------------------------------------------------------

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

function changedFiles(base, local) {
  const from = git("merge-base", base, "HEAD")[0];
  // --no-renames lists both sides of a move, so a removed file still counts.
  const files = new Set(git("diff", "--name-only", "--no-renames", local ? from : `${from}...HEAD`));
  if (local) for (const f of git("ls-files", "--others", "--exclude-standard")) files.add(f);
  return [...files].sort();
}

function describe(p) {
  const list = (x) => (x === ALL ? "all" : x.length ? x.join(", ") : "none");
  const lines = [
    `Typecheck and build: ${p.check ? "yes" : "no"}`,
    `Unit tests: ${p.check ? list(p.unit) : "none"}`,
    `Browser tests: ${list(p.e2e)}`,
    "",
    "Changed files:",
    ...p.reasons.map((r) => `  ${r.file}  (${r.area})`),
  ];
  if (p.reasons.length === 0) lines.push("  none");
  return lines.join("\n");
}

function run(cmd, args, cwd) {
  console.log(`\n$ ${[cmd, ...args].join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd, shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const base = arg("--base");
  const p = argv.includes("--all") ? planAll() : plan(changedFiles(base ?? "origin/main", !base));
  const e2eIds = p.e2e === ALL ? Object.keys(E2E) : p.e2e;

  if (argv.includes("--github")) {
    const out = process.env.GITHUB_OUTPUT;
    const lines = [
      `check=${p.check}`,
      `unit=${p.unit === ALL ? ALL : p.unit.join(" ")}`,
      `e2e=${JSON.stringify(e2eIds.map((id) => ({ id, cmd: E2E[id] })))}`,
      `e2e_any=${e2eIds.length > 0}`,
    ];
    if (out) appendFileSync(out, lines.join("\n") + "\n");
    else console.log(lines.join("\n"));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Checks for this change\n\n\`\`\`\n${describe(p)}\n\`\`\`\n`);
    }
  }
  console.log(describe(p));

  if (!argv.includes("--run")) return;
  if (!p.check && e2eIds.length === 0) {
    console.log("\nNothing to run.");
    return;
  }
  run("pnpm", ["typecheck"]);
  if (p.unit === ALL) run("pnpm", ["test"]);
  else if (p.unit.length > 0) run("pnpm", ["exec", "vitest", "run", ...p.unit]);
  run("pnpm", ["build"]);
  const clientDir = fileURLToPath(new URL("../apps/client/", import.meta.url));
  for (const id of e2eIds) {
    const [cmd, ...args] = E2E[id].split(" ");
    run(cmd, args, clientDir);
  }
  console.log("\nAll planned checks passed.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
