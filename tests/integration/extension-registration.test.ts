/**
 * Extension registration tests — calls each ExtensionFactory with a mock pi
 * and verifies the correct events, commands, shortcuts, and flags are registered.
 */

import { describe, it, expect } from "vitest";
import { createMockPi } from "../helpers/mock-pi.js";

const EXTENSIONS_DIR = "../../extensions";

describe("extension registration", () => {
  describe("dcl-context", () => {
    it("subscribes to before_agent_start", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-context.js`);
      mod.default(pi);
      expect(records.events.some((e) => e.event === "before_agent_start")).toBe(true);
    });

    it("registers no commands", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-context.js`);
      mod.default(pi);
      expect(records.commands).toHaveLength(0);
    });
  });

  describe("dcl-preview", () => {
    it("registers /preview command with description", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-preview.js`);
      mod.default(pi);
      const cmd = records.commands.find((c) => c.name === "preview");
      expect(cmd).toBeDefined();
      expect(cmd!.description.length).toBeGreaterThan(0);
    });

    it("registers preview tool", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-preview.js`);
      mod.default(pi);
      expect(records.tools.some((t: any) => t.name === "preview")).toBe(true);
    });
  });

  describe("dcl-init", () => {
    it("registers /init command with description", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-init.js`);
      mod.default(pi);
      const cmd = records.commands.find((c) => c.name === "init");
      expect(cmd).toBeDefined();
      expect(cmd!.description.length).toBeGreaterThan(0);
    });

    it("registers init tool", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-init.js`);
      mod.default(pi);
      expect(records.tools.some((t: any) => t.name === "init")).toBe(true);
    });

    it("subscribes to before_agent_start for editor prompt", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-init.js`);
      mod.default(pi);
      expect(records.events.some((e) => e.event === "before_agent_start")).toBe(true);
    });
  });

  describe("dcl-deploy", () => {
    it("registers /deploy command with description", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-deploy.js`);
      mod.default(pi);
      const cmd = records.commands.find((c) => c.name === "deploy");
      expect(cmd).toBeDefined();
      expect(cmd!.description.length).toBeGreaterThan(0);
    });

    it("registers deploy tool", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-deploy.js`);
      mod.default(pi);
      expect(records.tools.some((t: any) => t.name === "deploy")).toBe(true);
    });
  });

  describe("dcl-validate", () => {
    it("subscribes to tool_result", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-validate.js`);
      mod.default(pi);
      expect(records.events.some((e) => e.event === "tool_result")).toBe(true);
    });

    it("registers no commands", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-validate.js`);
      mod.default(pi);
      expect(records.commands).toHaveLength(0);
    });
  });

  describe("dcl-header", () => {
    it("subscribes to session_start", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-header.js`);
      mod.default(pi);
      expect(records.events.some((e) => e.event === "session_start")).toBe(true);
    });

    it("registers no commands", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-header.js`);
      mod.default(pi);
      expect(records.commands).toHaveLength(0);
    });
  });

  describe("dcl-update-check", () => {
    it("subscribes to session_start", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-update-check.js`);
      mod.default(pi);
      expect(records.events.some((e) => e.event === "session_start")).toBe(true);
    });

    it("registers no commands", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-update-check.js`);
      mod.default(pi);
      expect(records.commands).toHaveLength(0);
    });
  });

  describe("dcl-setup", () => {
    it("registers /setup command with description", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-setup.js`);
      mod.default(pi);
      const cmd = records.commands.find((c) => c.name === "setup");
      expect(cmd).toBeDefined();
      expect(cmd!.description.length).toBeGreaterThan(0);
    });

    it("registers no event subscriptions", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-setup.js`);
      mod.default(pi);
      expect(records.events).toHaveLength(0);
    });
  });

  describe("dcl-status", () => {
    it("subscribes to turn_start, message_update, turn_end, agent_end", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-status.js`);
      mod.default(pi);
      const eventNames = records.events.map((e) => e.event);
      expect(eventNames).toContain("turn_start");
      expect(eventNames).toContain("message_update");
      expect(eventNames).toContain("turn_end");
      expect(eventNames).toContain("agent_end");
    });

    it("registers no commands", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-status.js`);
      mod.default(pi);
      expect(records.commands).toHaveLength(0);
    });
  });

  describe("dcl-tasks", () => {
    it("registers /tasks command", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      mod.default(pi);
      const cmd = records.commands.find((c) => c.name === "tasks");
      expect(cmd).toBeDefined();
    });

    it("registers tasks tool", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      mod.default(pi);
      expect(records.tools.some((t: any) => t.name === "tasks")).toBe(true);
    });

    it("subscribes to session_shutdown", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      mod.default(pi);
      expect(records.events.some((e) => e.event === "session_shutdown")).toBe(true);
    });
  });

  describe("plan-mode", () => {
    it("registers /plan command", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/index.js`);
      mod.default(pi);
      expect(records.commands.find((c) => c.name === "plan")).toBeDefined();
    });

    it("registers /todos command", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/index.js`);
      mod.default(pi);
      expect(records.commands.find((c) => c.name === "todos")).toBeDefined();
    });

    it("registers 'plan' flag", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/index.js`);
      mod.default(pi);
      expect(records.flags.find((f) => f.name === "plan")).toBeDefined();
    });

    it("registers a keyboard shortcut", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/index.js`);
      mod.default(pi);
      expect(records.shortcuts.length).toBeGreaterThanOrEqual(1);
    });

    it("subscribes to at least 4 events", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/index.js`);
      mod.default(pi);
      // tool_call, context, before_agent_start, turn_end, agent_end, session_start
      expect(records.events.length).toBeGreaterThanOrEqual(4);
    });

    it("subscribes to expected event types", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/index.js`);
      mod.default(pi);
      const eventNames = records.events.map((e) => e.event);
      expect(eventNames).toContain("tool_call");
      expect(eventNames).toContain("context");
      expect(eventNames).toContain("before_agent_start");
      expect(eventNames).toContain("turn_end");
      expect(eventNames).toContain("agent_end");
      expect(eventNames).toContain("session_start");
    });
  });

  describe("permissions", () => {
    it("registers no-permissions flag", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/permissions/index.js`);
      mod.default(pi);
      expect(records.flags.find((f) => f.name === "no-permissions")).toBeDefined();
    });

    it("subscribes to tool_call", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/permissions/index.js`);
      mod.default(pi);
      expect(records.events.some((e) => e.event === "tool_call")).toBe(true);
    });

    it("registers no commands", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/permissions/index.js`);
      mod.default(pi);
      expect(records.commands).toHaveLength(0);
    });
  });

  describe("all extensions combined", () => {
    const ALL_EXTENSIONS = [
      "dcl-context",
      "dcl-preview",
      "dcl-init",
      "dcl-deploy",
      "dcl-setup",
      "dcl-validate",
      "dcl-header",
      "dcl-update-check",
      "dcl-status",
      "dcl-tasks",
      "plan-mode/index",
      "permissions/index",
    ];

    async function collectFromAllExtensions<T>(extract: (records: ReturnType<typeof createMockPi>["records"]) => T[]): Promise<T[]> {
      const collected: T[] = [];
      for (const ext of ALL_EXTENSIONS) {
        const { pi, records } = createMockPi();
        const mod = await import(`${EXTENSIONS_DIR}/${ext}.js`);
        mod.default(pi);
        collected.push(...extract(records));
      }
      return collected;
    }

    it("register exactly the expected set of commands", async () => {
      const allCommands = await collectFromAllExtensions((r) => r.commands.map((c) => c.name));
      allCommands.sort();
      expect(allCommands).toEqual(["deploy", "init", "plan", "preview", "setup", "tasks", "todos"]);
    });

    it("register exactly the expected set of tools", async () => {
      const allTools = await collectFromAllExtensions((r) => r.tools.map((t: any) => t.name));
      allTools.sort();
      expect(allTools).toEqual(["deploy", "init", "preview", "tasks"]);
    });
  });
});
