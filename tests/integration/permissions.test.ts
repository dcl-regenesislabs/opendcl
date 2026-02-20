/**
 * Integration tests for the permissions extension.
 * Uses mock pi and mock context to simulate tool_call events.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockPi, createMockContext, type MockPi, type MockRecords } from "../helpers/mock-pi.js";

const EXTENSIONS_DIR = "../../extensions";

type ToolCallHandler = (event: unknown, ctx: unknown) => Promise<unknown>;

function denyingContext(overrides: Record<string, unknown> = {}) {
  return createMockContext({ ui: { confirm: async () => false } as any, ...overrides });
}

function allowingContext(overrides: Record<string, unknown> = {}) {
  return createMockContext({ ui: { confirm: async () => true } as any, ...overrides });
}

function spyingContext(overrides: Record<string, unknown> = {}) {
  let confirmCalled = false;
  const ctx = createMockContext({
    ui: {
      confirm: async () => {
        confirmCalled = true;
        return false;
      },
    } as any,
    ...overrides,
  });
  return { ctx, wasConfirmCalled: () => confirmCalled };
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

    it("blocks when user denies confirmation", async () => {
      const result = await toolCallHandler(dangerousEvent, denyingContext());

      expect(result).toEqual(expect.objectContaining({ block: true }));
      expect((result as any).reason).toContain("denied");
    });

    it("allows when user confirms", async () => {
      const result = await toolCallHandler(dangerousEvent, allowingContext());

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
      const { ctx, wasConfirmCalled } = spyingContext();
      const result = await toolCallHandler({ toolName: "bash", input: { command: "git status" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasConfirmCalled()).toBe(false);
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

  describe("sensitive file writes", () => {
    const PROJECT_ROOT = "/home/user/project";

    it("blocks writes to .env when user denies", async () => {
      const result = await toolCallHandler(
        { toolName: "write", input: { path: ".env" } },
        denyingContext({ cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("blocks writes to package.json when user denies", async () => {
      const result = await toolCallHandler(
        { toolName: "write", input: { path: "package.json" } },
        denyingContext({ cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("blocks writes outside project root", async () => {
      const result = await toolCallHandler(
        { toolName: "write", input: { path: "../../etc/passwd" } },
        denyingContext({ cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("allows writes to safe project files without prompting", async () => {
      const { ctx, wasConfirmCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "write", input: { path: "src/index.ts" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasConfirmCalled()).toBe(false);
    });
  });

  describe("edit tool", () => {
    it("gates edit same as write for sensitive files", async () => {
      const result = await toolCallHandler(
        { toolName: "edit", input: { path: ".env" } },
        denyingContext({ cwd: "/home/user/project" }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });
  });

  describe("read tool", () => {
    it("does not gate read operations", async () => {
      const { ctx, wasConfirmCalled } = spyingContext({ cwd: "/home/user/project" });
      const result = await toolCallHandler({ toolName: "read", input: { path: ".env" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasConfirmCalled()).toBe(false);
    });
  });
});
