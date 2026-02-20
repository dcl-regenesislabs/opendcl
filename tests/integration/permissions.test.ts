/**
 * Integration tests for the permissions extension.
 * Uses mock pi and mock context to simulate tool_call events.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockPi, createMockContext, type MockPi, type MockRecords } from "../helpers/mock-pi.js";

const EXTENSIONS_DIR = "../../extensions";

type ToolCallHandler = (event: unknown, ctx: unknown) => Promise<unknown>;

function selectingContext(choice: string | null, overrides: Record<string, unknown> = {}) {
  return createMockContext({ ui: { select: async () => choice } as any, ...overrides });
}

function spyingContext(overrides: Record<string, unknown> = {}) {
  let selectCalled = false;
  const ctx = createMockContext({
    ui: {
      select: async () => {
        selectCalled = true;
        return null;
      },
    } as any,
    ...overrides,
  });
  return { ctx, wasSelectCalled: () => selectCalled };
}

describe("permissions extension", () => {
  let pi: MockPi;
  let records: MockRecords;
  let toolCallHandler: ToolCallHandler;

  beforeEach(async () => {
    ({ pi, records } = createMockPi());
    const mod = await import(`${EXTENSIONS_DIR}/permissions/index.js`);
    mod.default(pi);
    toolCallHandler = records.events.find((e) => e.event === "tool_call")!.handler as ToolCallHandler;
  });

  describe("dangerous bash commands", () => {
    const dangerousEvent = { toolName: "bash", input: { command: "rm -rf /tmp/test" } };

    it("blocks when user denies", async () => {
      const result = await toolCallHandler(dangerousEvent, selectingContext("Deny"));

      expect(result).toEqual(expect.objectContaining({ block: true }));
      expect((result as any).reason).toContain("denied");
    });

    it("blocks when user dismisses (null)", async () => {
      const result = await toolCallHandler(dangerousEvent, selectingContext(null));

      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("allows when user selects Allow once", async () => {
      const result = await toolCallHandler(dangerousEvent, selectingContext("Allow once"));

      expect(result).toBeUndefined();
    });

    it("blocks in non-interactive mode without prompting", async () => {
      const result = await toolCallHandler(dangerousEvent, createMockContext({ hasUI: false }));

      expect(result).toEqual(expect.objectContaining({ block: true }));
      expect((result as any).reason).toContain("--no-permissions");
    });
  });

  describe("safe bash commands", () => {
    it("allows without prompting", async () => {
      const { ctx, wasSelectCalled } = spyingContext();
      const result = await toolCallHandler({ toolName: "bash", input: { command: "git status" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });
  });

  describe("--no-permissions flag", () => {
    it("skips all gating when enabled", async () => {
      pi.getFlag = (name: string) => (name === "no-permissions" ? true : undefined);

      const result = await toolCallHandler(
        { toolName: "bash", input: { command: "rm -rf /" } },
        createMockContext(),
      );

      expect(result).toBeUndefined();
    });
  });

  describe("session permissions", () => {
    it("skips bash prompts after 'always allow' for the session", async () => {
      // First call: user selects "always allow"
      const ctx1 = selectingContext("Always allow dangerous commands this session");
      await toolCallHandler({ toolName: "bash", input: { command: "rm -rf /tmp/a" } }, ctx1);

      // Second call: should not prompt
      const { ctx: ctx2, wasSelectCalled } = spyingContext();
      const result = await toolCallHandler({ toolName: "bash", input: { command: "sudo reboot" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("skips write prompts after 'always allow' for the session", async () => {
      const PROJECT_ROOT = "/home/user/project";

      // First call: user selects "always allow"
      const ctx1 = selectingContext("Always allow sensitive file writes this session", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "write", input: { path: ".env" } }, ctx1);

      // Second call: should not prompt
      const { ctx: ctx2, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "write", input: { path: "package.json" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("session bash permission does not affect write gating", async () => {
      const PROJECT_ROOT = "/home/user/project";

      // Allow bash for session
      const ctx1 = selectingContext("Always allow dangerous commands this session");
      await toolCallHandler({ toolName: "bash", input: { command: "rm -rf /tmp" } }, ctx1);

      // Write should still be gated
      const result = await toolCallHandler(
        { toolName: "write", input: { path: ".env" } },
        selectingContext("Deny", { cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("session write permission covers edit too", async () => {
      const PROJECT_ROOT = "/home/user/project";

      // Allow writes for session
      const ctx1 = selectingContext("Always allow sensitive file writes this session", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "write", input: { path: ".env" } }, ctx1);

      // Edit should also be allowed
      const { ctx: ctx2, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "edit", input: { path: ".env" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });
  });

  describe("sensitive file writes", () => {
    const PROJECT_ROOT = "/home/user/project";

    it("blocks writes to .env when user denies", async () => {
      const result = await toolCallHandler(
        { toolName: "write", input: { path: ".env" } },
        selectingContext("Deny", { cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("blocks writes to package.json when user denies", async () => {
      const result = await toolCallHandler(
        { toolName: "write", input: { path: "package.json" } },
        selectingContext("Deny", { cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("blocks writes outside project root", async () => {
      const result = await toolCallHandler(
        { toolName: "write", input: { path: "../../etc/passwd" } },
        selectingContext("Deny", { cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("allows writes to safe project files without prompting", async () => {
      const { ctx, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "write", input: { path: "src/index.ts" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });
  });

  describe("edit tool", () => {
    it("gates edit same as write for sensitive files", async () => {
      const result = await toolCallHandler(
        { toolName: "edit", input: { path: ".env" } },
        selectingContext("Deny", { cwd: "/home/user/project" }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });
  });

  describe("read tool", () => {
    it("does not gate read operations", async () => {
      const { ctx, wasSelectCalled } = spyingContext({ cwd: "/home/user/project" });
      const result = await toolCallHandler({ toolName: "read", input: { path: ".env" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });
  });
});
