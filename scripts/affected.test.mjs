import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { E2E, plan } from "./affected.mjs";

const pick = (files) => {
  const { check, unit, e2e } = plan(files);
  return { check, unit, e2e };
};

describe("affected checks", () => {
  it("runs nothing for docs", () => {
    expect(pick(["docs/RULES.md", "README.md", "CLAUDE.md"])).toEqual({ check: false, unit: [], e2e: [] });
  });

  it("runs nothing for an empty change", () => {
    expect(pick([])).toEqual({ check: false, unit: [], e2e: [] });
  });

  it("runs the content tests and its dependents, but no browser tests, for unit stats", () => {
    expect(pick(["packages/content/src/cards/legends.json"])).toEqual({
      check: true,
      unit: ["packages/content", "packages/protocol", "apps/server", "apps/client"],
      e2e: [],
    });
  });

  it("treats the card loader as code the browser runs", () => {
    expect(pick(["packages/content/src/cards.ts"]).e2e).toBe("all");
  });

  it("runs every browser test for a map change", () => {
    expect(pick(["packages/content/src/maps/the-mesa.json"]).e2e).toBe("all");
  });

  it("runs everything for an engine change", () => {
    expect(pick(["packages/rules/src/game/engine.ts"])).toEqual({ check: true, unit: "all", e2e: "all" });
  });

  it("runs only the changed package's tests for a test-only change", () => {
    expect(pick(["packages/rules/test/hex.test.ts"])).toEqual({ check: true, unit: ["packages/rules"], e2e: [] });
  });

  it("runs the server tests and the online browser test for a server change", () => {
    expect(pick(["apps/server/src/server.ts"])).toEqual({ check: true, unit: ["apps/server"], e2e: ["online"] });
  });

  it("runs the protocol, server, saves and online tests for a protocol change", () => {
    expect(pick(["packages/protocol/src/index.ts"])).toEqual({
      check: true,
      unit: ["packages/protocol", "apps/server"],
      e2e: ["saves", "online"],
    });
  });

  it("runs one browser test for a client file only it covers", () => {
    expect(pick(["apps/client/src/screens/EditorScreen.tsx"])).toEqual({ check: true, unit: [], e2e: ["editor"] });
  });

  it("runs every browser test for the rest of the client", () => {
    expect(pick(["apps/client/src/screens/PlayScreen.tsx"])).toEqual({ check: true, unit: ["apps/client"], e2e: "all" });
  });

  it("runs the client tests, the model page test and the gallery test for a figure model", () => {
    for (const f of ["apps/client/src/models/units/concord.ts", "apps/client/src/scene/standing.tsx"]) {
      expect(pick([f])).toEqual({ check: true, unit: ["apps/client"], e2e: ["models", "gallery"] });
    }
  });

  it("runs only the model page test for the model page", () => {
    for (const f of ["apps/client/src/screens/ModelGalleryScreen.tsx", "apps/client/src/screens/model-gallery.css"]) {
      expect(pick([f])).toEqual({ check: true, unit: [], e2e: ["models"] });
    }
  });

  it("runs only the gallery test for the unit gallery", () => {
    for (const f of ["apps/client/src/screens/UnitGalleryScreen.tsx", "apps/client/src/screens/unit-gallery.css", "apps/client/e2e/gallery.mjs"]) {
      expect(pick([f]).e2e).toEqual(["gallery"]);
    }
  });

  it("runs only the client tests for a change to them", () => {
    expect(pick(["apps/client/test/models.test.ts"])).toEqual({ check: true, unit: ["apps/client"], e2e: [] });
  });

  it("runs a changed browser test script, with a build", () => {
    expect(pick(["apps/client/e2e/full-game.mjs"])).toEqual({
      check: true,
      unit: [],
      e2e: ["full-basic", "full-advanced"],
    });
  });

  it("combines areas and keeps a stable order", () => {
    expect(pick(["apps/client/src/online.ts", "apps/client/src/screens/EditorScreen.tsx", "docs/PLAN.md"])).toEqual({
      check: true,
      unit: [],
      e2e: ["editor", "online"],
    });
  });

  it("collapses to all when every browser test is picked", () => {
    expect(
      pick([
        "apps/client/e2e/full-game.mjs",
        "apps/client/e2e/editor.mjs",
        "apps/client/e2e/saves.mjs",
        "apps/client/e2e/online.mjs",
        "apps/client/e2e/models.mjs",
        "apps/client/e2e/gallery.mjs",
      ]).e2e,
    ).toBe("all");
  });

  it("runs everything for build setup and unknown files", () => {
    for (const f of ["pnpm-lock.yaml", ".github/workflows/ci.yml", "scripts/affected.mjs", "somewhere/new.txt"]) {
      expect(pick([f])).toEqual({ check: true, unit: "all", e2e: "all" });
    }
  });

  it("knows every browser test the client package runs", () => {
    // A new browser test must be added to E2E and RULES too.
    const client = JSON.parse(readFileSync(new URL("../apps/client/package.json", import.meta.url), "utf8"));
    expect(Object.values(E2E).join(" && ")).toBe(client.scripts.e2e);
  });
});
