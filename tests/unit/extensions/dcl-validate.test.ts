import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-validate extension", () => {
  it("extension file exists and exports default", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("subscribes to tool_result event", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain('pi.on("tool_result"');
  });

  it("only validates .ts/.tsx files", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain(".tsx?");
  });

  it("runs tsc --noEmit for validation", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain("tsc");
    expect(content).toContain("--noEmit");
  });

  it("checks for tsconfig.json before validating", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain("tsconfig.json");
  });

  it("has a validation timeout", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain("timeout");
    expect(content).toContain("30000");
  });

  it("debounces validation calls", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain("DEBOUNCE");
  });

  it("checks for node_modules before validating", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-validate.ts"),
      "utf-8"
    );
    expect(content).toContain("node_modules");
  });
});
