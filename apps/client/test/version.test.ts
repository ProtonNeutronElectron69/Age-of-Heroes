import { describe, expect, it } from "vitest";
import { dateLabel, versionLabel } from "../src/version";

describe("the version in the menu's corner", () => {
  it("shows major and minor, and the patch only when there is one", () => {
    expect(versionLabel("1.0.0")).toBe("v1.0");
    expect(versionLabel("1.2.0")).toBe("v1.2");
    expect(versionLabel("1.2.3")).toBe("v1.2.3");
  });

  it("writes the last update as MM/DD/YYYY", () => {
    expect(dateLabel("2026-11-16")).toBe("11/16/2026");
    expect(dateLabel("2027-01-05")).toBe("01/05/2027");
  });
});
