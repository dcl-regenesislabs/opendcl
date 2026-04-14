import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-context extension", () => {
  it("extension file exists and exports default", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("subscribes to before_agent_start event", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain('pi.on("before_agent_start"');
  });

  it("detects scene.json and injects metadata", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    // Should read scene.json
    expect(content).toContain("scene.json");
    // Should inject into system prompt
    expect(content).toContain("systemPrompt");
    // Should handle missing scene
    expect(content).toContain("No Decentraland scene detected");
  });

  it("handles legacy SDK6 detection", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain("Legacy SDK6");
    expect(content).toContain("ecs7");
  });

  it("reads SDK version from package.json", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain("package.json");
    expect(content).toContain("@dcl/sdk");
  });

  it("checks for node_modules", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain("node_modules");
    expect(content).toContain("npm install");
  });

  it("handles BOM in scene.json", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain("0xfeff");
  });

  it("directs users to run /init when no scene is detected", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain("/init");
    expect(content).toContain("must run");
  });

  it("stamps scene.json with opendcl: true for SDK7 scenes", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-context.ts"),
      "utf-8"
    );
    expect(content).toContain("sceneJson.opendcl");
    expect(content).toContain("writeFile");
  });
});
