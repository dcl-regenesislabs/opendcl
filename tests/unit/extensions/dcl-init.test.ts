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

  it("triggers editor-gizmo skill after init", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("editor-gizmo");
    expect(content).toContain("sendMessage");
  });

  it("prompts for editor on session start", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-init.ts"),
      "utf-8"
    );
    expect(content).toContain("before_agent_start");
    expect(content).toContain("__editor");
  });
});
