import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("process-registry", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(join(EXTENSIONS_DIR, "process-registry.ts"), "utf-8");
  });

  it("file exists and exports processes Map", () => {
    expect(content).toContain("export const processes");
    expect(content).toContain("Map<string, BackgroundProcess>");
  });

  it("exports BackgroundProcess interface with required fields", () => {
    expect(content).toContain("export interface BackgroundProcess");
    expect(content).toContain("name: string");
    expect(content).toContain("kill: () => void");
  });

  it("includes optional info field", () => {
    expect(content).toContain("info?: string");
  });

  it("uses globalThis singleton pattern to survive module cache bypass", () => {
    expect(content).toContain('Symbol.for("opendcl.processes")');
    expect(content).toContain("globalThis");
  });

  it("can import and use the registry", async () => {
    const { processes } = await import("../../../extensions/process-registry.js");
    expect(processes).toBeInstanceOf(Map);
  });

  it("registers a process.on('exit') safety net handler", () => {
    expect(content).toContain('process.on("exit"');
  });

  it("uses Symbol guard to prevent duplicate exit handler registration", () => {
    expect(content).toContain('Symbol.for("opendcl.exitHandler")');
    expect(content).toContain("EXIT_HANDLER_KEY");
  });
});
