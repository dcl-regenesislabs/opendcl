import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-deploy extension", () => {
  it("extension file exists and exports default", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-deploy.ts"),
      "utf-8"
    );
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("registers /deploy command", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-deploy.ts"),
      "utf-8"
    );
    expect(content).toContain('pi.registerCommand("deploy"');
  });

  it("calls sdk-commands deploy", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-deploy.ts"),
      "utf-8"
    );
    expect(content).toContain("@dcl/sdk-commands");
    expect(content).toContain("deploy");
  });

  it("reports error when no scene.json found", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-deploy.ts"),
      "utf-8"
    );
    expect(content).toContain("No scene.json found");
  });

  it("reports error when node_modules missing", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-deploy.ts"),
      "utf-8"
    );
    expect(content).toContain("node_modules");
    expect(content).toContain("npm install");
  });

  it("auto-detects World deployment from worldConfiguration", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-deploy.ts"),
      "utf-8"
    );
    expect(content).toContain("worldConfiguration");
    expect(content).toContain("worlds-content-server");
  });

  it("supports both Genesis City and World targets", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-deploy.ts"),
      "utf-8"
    );
    expect(content).toContain("Genesis City");
    expect(content).toContain("World");
  });
});
