/**
 * Cross-extension integration tests — verifies runtime interactions between
 * extensions: shared singleton registry, cross-imports, process lifecycle,
 * and status updates.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockPi, createMockContext } from "../helpers/mock-pi.js";

const EXTENSIONS_DIR = "../../extensions";

describe("cross-extension integration", () => {
  describe("process-registry singleton", () => {
    it("returns the same Map instance across multiple imports", async () => {
      const mod1 = await import(`${EXTENSIONS_DIR}/process-registry.js`);
      const mod2 = await import(`${EXTENSIONS_DIR}/process-registry.js`);
      expect(mod1.processes).toBe(mod2.processes);
    });

    it("uses Symbol.for for globalThis key", async () => {
      const key = Symbol.for("opendcl.processes");
      const _global = globalThis as Record<symbol, unknown>;
      expect(_global[key]).toBeInstanceOf(Map);
    });
  });

  describe("cross-import resolution", () => {
    it("dcl-preview imports from process-registry successfully", async () => {
      const { pi } = createMockPi();
      // If cross-imports fail, this import will throw
      const mod = await import(`${EXTENSIONS_DIR}/dcl-preview.js`);
      expect(() => mod.default(pi)).not.toThrow();
    });

    it("dcl-preview imports from dcl-tasks successfully", async () => {
      const { pi } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-preview.js`);
      // dcl-preview imports updateStatus from dcl-tasks — if this fails, the import throws
      expect(() => mod.default(pi)).not.toThrow();
    });
  });

  describe("process lifecycle", () => {
    let processes: Map<string, { name: string; info?: string; kill: () => void }>;

    beforeEach(async () => {
      const mod = await import(`${EXTENSIONS_DIR}/process-registry.js`);
      processes = mod.processes;
      processes.clear();
    });

    it("shutdown handler kills all processes in registry", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      mod.default(pi);

      // Add mock processes to the shared registry
      let killed1 = false;
      let killed2 = false;
      processes.set("test-1", { name: "Test 1", kill: () => { killed1 = true; } });
      processes.set("test-2", { name: "Test 2", kill: () => { killed2 = true; } });

      // Find and invoke the session_shutdown handler
      const shutdownHandler = records.events.find((e) => e.event === "session_shutdown");
      expect(shutdownHandler).toBeDefined();
      await shutdownHandler!.handler();

      expect(killed1).toBe(true);
      expect(killed2).toBe(true);
      expect(processes.size).toBe(0);
    });

    it("/tasks shows 'No background tasks' when registry is empty", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      mod.default(pi);

      const tasksCmd = records.commands.find((c) => c.name === "tasks");
      expect(tasksCmd).toBeDefined();

      const ctx = createMockContext();
      await tasksCmd!.handler([], ctx);

      expect(ctx.notifications.some((n) => n.message.includes("No background tasks"))).toBe(true);
    });
  });

  describe("updateStatus", () => {
    let processes: Map<string, { name: string; info?: string; kill: () => void }>;

    beforeEach(async () => {
      const mod = await import(`${EXTENSIONS_DIR}/process-registry.js`);
      processes = mod.processes;
      processes.clear();
    });

    it("sets footer status when processes are running", async () => {
      const { updateStatus } = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      const ctx = createMockContext();

      processes.set("preview", { name: "Preview server", kill: () => {} });
      updateStatus(ctx);

      const lastStatus = ctx.statusUpdates[ctx.statusUpdates.length - 1];
      expect(lastStatus.key).toBe("tasks");
      expect(lastStatus.text).toContain("preview server");
    });

    it("clears footer status when registry is empty", async () => {
      const { updateStatus } = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      const ctx = createMockContext();

      updateStatus(ctx);

      const lastStatus = ctx.statusUpdates[ctx.statusUpdates.length - 1];
      expect(lastStatus.key).toBe("tasks");
      expect(lastStatus.text).toBeUndefined();
    });
  });
});
