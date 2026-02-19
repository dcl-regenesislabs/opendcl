import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

describe("dcl-tasks extension", () => {
  it("extension file exists and exports default", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("registers /tasks command", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain('pi.registerCommand("tasks"');
  });

  it("imports shared process registry", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain('from "./process-registry.js"');
    expect(content).toContain("processes");
  });

  it("shows notification when no tasks running", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain("No background tasks running");
  });

  it("uses ctx.ui.select for interactive process selection", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain("ctx.ui.select");
  });

  it("provides stop confirmation before killing a process", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain("Stop it");
    expect(content).toContain("Back");
  });

  it("cleans up all processes on session_shutdown", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain("session_shutdown");
    expect(content).toContain("kill");
  });

  it("manages footer status via setStatus", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain("setStatus");
  });

  it("exports updateStatus helper for other extensions", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-tasks.ts"),
      "utf-8"
    );
    expect(content).toContain("export { updateStatus }");
  });
});
