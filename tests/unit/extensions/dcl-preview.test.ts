import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-preview extension", () => {
  it("extension file exists and exports default", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("registers /preview command", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain('pi.registerCommand("preview"');
  });

  it("starts sdk-commands with correct arguments", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain("@dcl/sdk-commands");
    expect(content).toContain("start");
  });

  it("reports error when no scene.json found", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain("No scene.json found");
  });

  it("reports error when node_modules missing", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain("node_modules");
    expect(content).toContain("npm install");
  });

  it("handles port already in use", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain("EADDRINUSE");
  });

  it("registers with shared process registry", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain('from "./process-registry.js"');
    expect(content).toContain('processes.set("preview"');
    expect(content).toContain('processes.delete("preview"');
  });

  it("updates footer status via updateStatus", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).toContain('from "./dcl-tasks.js"');
    expect(content).toContain("updateStatus");
  });

  it("does not have its own session_shutdown handler", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-preview.ts"),
      "utf-8"
    );
    expect(content).not.toContain("session_shutdown");
  });
});
