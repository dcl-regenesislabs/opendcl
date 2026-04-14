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

  it("calls sdk-commands init", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("@dcl/sdk-commands");
    expect(content).toContain("init");
  });

  it("reloads after successful init", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("reload");
  });

  it("stamps scene.json with opendcl: true after init", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("opendcl");
    expect(content).toContain("sceneJson.opendcl = true");
  });
});
