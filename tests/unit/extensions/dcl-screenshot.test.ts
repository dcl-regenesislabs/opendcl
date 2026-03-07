import { describe, it, expect } from "vitest";
import { createMockPi } from "../../helpers/mock-pi.js";

const EXTENSIONS_DIR = "../../../extensions";

describe("dcl-screenshot extension", () => {
  it("registers the screenshot tool", async () => {
    const { pi, records } = createMockPi();
    const mod = await import(`${EXTENSIONS_DIR}/dcl-screenshot.js`);
    await mod.default(pi);

    const tool = records.tools.find((t: any) => t.name === "screenshot");
    expect(tool).toBeDefined();
    expect(tool.label).toBe("Screenshot");
  });

  it("registers session_shutdown handler for cleanup", async () => {
    const { pi, records } = createMockPi();
    const mod = await import(`${EXTENSIONS_DIR}/dcl-screenshot.js`);
    await mod.default(pi);

    expect(records.events.some((e) => e.event === "session_shutdown")).toBe(true);
  });

  it("tool description mentions actions and persistent browser", async () => {
    const { pi, records } = createMockPi();
    const mod = await import(`${EXTENSIONS_DIR}/dcl-screenshot.js`);
    await mod.default(pi);

    const tool = records.tools.find((t: any) => t.name === "screenshot");
    expect(tool.description).toContain("browser stays open");
    expect(tool.description).toContain("moveForward");
  });

  it("does not register any commands (tool-only)", async () => {
    const { pi, records } = createMockPi();
    const mod = await import(`${EXTENSIONS_DIR}/dcl-screenshot.js`);
    await mod.default(pi);

    expect(records.commands).toHaveLength(0);
  });
});
