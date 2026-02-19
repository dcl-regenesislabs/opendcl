import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("process-registry", () => {
  it("file exists and exports processes Map", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "process-registry.ts"),
      "utf-8"
    );
    expect(content).toContain("export const processes");
    expect(content).toContain("Map<string, BackgroundProcess>");
  });

  it("exports BackgroundProcess interface with required fields", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "process-registry.ts"),
      "utf-8"
    );
    expect(content).toContain("export interface BackgroundProcess");
    expect(content).toContain("name: string");
    expect(content).toContain("kill: () => void");
  });

  it("includes optional info field", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "process-registry.ts"),
      "utf-8"
    );
    expect(content).toContain("info?: string");
  });

  it("uses globalThis singleton pattern to survive module cache bypass", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "process-registry.ts"),
      "utf-8"
    );
    expect(content).toContain('Symbol.for("opendcl.processes")');
    expect(content).toContain("globalThis");
  });

  it("can import and use the registry", async () => {
    const { processes } = await import("../../../extensions/process-registry.js");
    expect(processes).toBeInstanceOf(Map);
  });
});
