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

  describe("dcl-tasks", () => {
    it("registers /tasks command", async () => {
      const { pi, records } = createMockPi();
      const mod = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      mod.default(pi);
      const cmd = records.commands.find((c) => c.name === "tasks");
      expect(cmd).toBeDefined();
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

  describe("all extensions combined", () => {
    it("register exactly the expected set of commands", async () => {
      const extensions = [
        "dcl-context",
        "dcl-preview",
        "dcl-init",
        "dcl-deploy",
        "dcl-validate",
        "dcl-header",
        "dcl-tasks",
        "plan-mode/index",
      ];

      const allCommands: string[] = [];

      for (const ext of extensions) {
        const { pi, records } = createMockPi();
        const mod = await import(`${EXTENSIONS_DIR}/${ext}.js`);
        mod.default(pi);
        allCommands.push(...records.commands.map((c) => c.name));
      }

      allCommands.sort();
      expect(allCommands).toEqual(["deploy", "init", "plan", "preview", "tasks", "todos"]);
    });
  });
});
