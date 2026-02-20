import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { selectPreviewUrl } from "../../../extensions/dcl-preview.js";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-preview extension", () => {
  let content: string;

  beforeAll(async () => {
    content = await readFile(join(EXTENSIONS_DIR, "dcl-preview.ts"), "utf-8");
  });

  it("extension file exists and exports default", () => {
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("registers /preview command", () => {
    expect(content).toContain('pi.registerCommand("preview"');
  });

  it("registers preview tool for LLM", () => {
    expect(content).toContain("pi.registerTool(");
    expect(content).toContain('name: "preview"');
  });

  it("starts sdk-commands with correct arguments", () => {
    expect(content).toContain("@dcl/sdk-commands");
    expect(content).toContain("start");
  });

  it("reports error when no scene.json found", () => {
    expect(content).toContain("No scene.json found");
  });

  it("reports error when node_modules missing", () => {
    expect(content).toContain("node_modules");
    expect(content).toContain("npm install");
  });

  it("handles port already in use", () => {
    expect(content).toContain("EADDRINUSE");
  });

  it("registers with shared process registry", () => {
    expect(content).toContain('from "./process-registry.js"');
    expect(content).toContain('processes.set("preview"');
    expect(content).toContain('processes.delete("preview"');
  });

  it("updates footer status via updateStatus", () => {
    expect(content).toContain('from "./dcl-tasks.js"');
    expect(content).toContain("updateStatus");
  });

  it("does not have its own session_shutdown handler", () => {
    expect(content).not.toContain("session_shutdown");
  });

  it("has bevy-web URL detection logic", () => {
    expect(content).toContain("decentraland.zone/bevy-web");
    expect(content).toContain("bevyUrlFound");
  });
});

describe("selectPreviewUrl", () => {
  it("returns bevy-web URL with shouldNotify when present", () => {
    const output =
      "https://decentraland.zone/bevy-web/?preview=true&realm=http://localhost:8000&position=0,0";
    const result = selectPreviewUrl(output, false);
    expect(result).toEqual({
      url: "https://decentraland.zone/bevy-web/?preview=true&realm=http://localhost:8000&position=0,0",
      shouldNotify: true,
    });
  });

  it("returns localhost URL without notify when no bevy-web seen yet", () => {
    const output = "Server running at http://localhost:8000?position=0,0";
    const result = selectPreviewUrl(output, false);
    expect(result).toEqual({
      url: "http://localhost:8000?position=0,0",
      shouldNotify: false,
    });
  });

  it("prefers bevy-web URL when both are in the same chunk", () => {
    const output = [
      "http://localhost:8000?position=0,0",
      "https://decentraland.zone/bevy-web/?preview=true&realm=http://localhost:8000&position=0,0",
    ].join("\n");
    const result = selectPreviewUrl(output, false);
    expect(result!.url).toContain("decentraland.zone/bevy-web");
    expect(result!.shouldNotify).toBe(true);
  });

  it("returns null when no URLs found", () => {
    const result = selectPreviewUrl("Starting server...", false);
    expect(result).toBeNull();
  });

  it("ignores localhost URLs after bevy-web has been found", () => {
    const output = "http://localhost:8000?position=0,0";
    const result = selectPreviewUrl(output, true);
    expect(result).toBeNull();
  });

  it("still returns bevy-web URL even after one was already found", () => {
    const output =
      "https://decentraland.zone/bevy-web/?preview=true&realm=http://localhost:9000";
    const result = selectPreviewUrl(output, true);
    expect(result).toEqual({
      url: "https://decentraland.zone/bevy-web/?preview=true&realm=http://localhost:9000",
      shouldNotify: true,
    });
  });
});
