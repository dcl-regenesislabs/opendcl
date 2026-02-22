import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-screenshot extension", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(join(EXTENSIONS_DIR, "dcl-screenshot.ts"), "utf-8");
  });

  it("extension file exists and exports default", () => {
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("registers screenshot tool for LLM", () => {
    expect(content).toContain("pi.registerTool(");
    expect(content).toContain('name: "screenshot"');
  });

  it("does not register any slash commands", () => {
    expect(content).not.toContain("pi.registerCommand(");
  });

  it("reads from shared process registry", () => {
    expect(content).toContain('from "./process-registry.js"');
    expect(content).toContain('processes.get("preview")');
  });

  it("returns error when no preview running", () => {
    expect(content).toContain("No preview server running");
  });

  it("returns error when preview URL not ready", () => {
    expect(content).toContain("URL not ready");
  });

  it("returns error when no compatible browser found", () => {
    expect(content).toContain("No compatible browser found");
    expect(content).toContain("npx playwright install chromium");
  });

  it("returns ImageContent with base64 PNG", () => {
    expect(content).toContain('type: "image"');
    expect(content).toContain("base64");
    expect(content).toContain('mimeType: "image/png"');
  });

  it("cleans up browser on session_shutdown", () => {
    expect(content).toContain("session_shutdown");
    expect(content).toContain("closeBrowser");
  });

  it("uses playwright-core for browser automation", () => {
    expect(content).toContain('import("playwright-core")');
    expect(content).toContain("chromium.launch");
  });

  it("has configurable wait parameter with default", () => {
    expect(content).toContain("wait");
    expect(content).toContain("default: 1000");
  });

  it("supports input actions before screenshot", () => {
    expect(content).toContain("actions");
    expect(content).toContain("executeActions");
  });

  it("handles auth screen automatically", () => {
    expect(content).toContain("Continue as guest");
    expect(content).toContain("guestBtn");
  });

  it("uses headless mode with swiftshader for WebGL", () => {
    expect(content).toContain("headless: true");
    expect(content).toContain("--use-gl=swiftshader");
  });

  it("uses 1280x720 viewport", () => {
    expect(content).toContain("1280");
    expect(content).toContain("720");
  });

  it("supports all action types", () => {
    expect(content).toContain('"click"');
    expect(content).toContain('"clickText"');
    expect(content).toContain('"key"');
    expect(content).toContain('"mouse"');
    expect(content).toContain('"wait"');
  });

  it("re-launches browser if disconnected", () => {
    expect(content).toContain("isConnected");
  });
});
