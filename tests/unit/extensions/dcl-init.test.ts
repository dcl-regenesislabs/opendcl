import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-init extension", () => {
  it("extension file exists and exports default", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("registers /init command", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain('pi.registerCommand("init"');
  });

  it("refuses to init when scene.json exists", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("scene.json");
    expect(content).toContain("already exists");
  });

  it("calls sdk-commands init with --yes flag", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("@dcl/sdk-commands");
    expect(content).toContain("init");
    expect(content).toContain("--yes");
  });

  it("reloads after successful init", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("reload");
  });
});
