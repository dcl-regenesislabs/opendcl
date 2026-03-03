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

    it("allows when user selects Allow", async () => {
      const result = await toolCallHandler(dangerousEvent, selectingContext("Allow"));

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
    it("auto-allows same pattern after 'Always allow'", async () => {
      // Allow rm once with "Always allow"
      const ctx1 = selectingContext("Always allow");
      await toolCallHandler({ toolName: "bash", input: { command: "rm -rf /tmp/a" } }, ctx1);

      // Another rm command: same pattern → auto-allowed
      const { ctx: ctx2, wasSelectCalled } = spyingContext();
      const result = await toolCallHandler({ toolName: "bash", input: { command: "rm /tmp/b" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("still prompts for a different dangerous pattern", async () => {
      // Allow rm
      const ctx1 = selectingContext("Always allow");
      await toolCallHandler({ toolName: "bash", input: { command: "rm -rf /tmp/a" } }, ctx1);

      // git push is a different pattern → should still prompt
      const result = await toolCallHandler(
        { toolName: "bash", input: { command: "git push origin main" } },
        selectingContext("Deny"),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("auto-allows same file pattern after 'Always allow'", async () => {
      const PROJECT_ROOT = "/home/user/project";

      // Allow .env writes
      const ctx1 = selectingContext("Always allow", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "write", input: { path: ".env" } }, ctx1);

      // Another .env write → auto-allowed
      const { ctx: ctx2, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "write", input: { path: ".env.local" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("still prompts for a different sensitive file pattern", async () => {
      const PROJECT_ROOT = "/home/user/project";

      // Allow .env writes
      const ctx1 = selectingContext("Always allow", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "write", input: { path: ".env" } }, ctx1);

      // package.json is a different pattern → should still prompt
      const result = await toolCallHandler(
        { toolName: "write", input: { path: "package.json" } },
        selectingContext("Deny", { cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("write pattern permission covers edit too", async () => {
      const PROJECT_ROOT = "/home/user/project";

      // Allow .env via write
      const ctx1 = selectingContext("Always allow", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "write", input: { path: ".env" } }, ctx1);

      // Edit .env → same pattern → auto-allowed
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
    const PROJECT_ROOT = "/home/user/project";

    it("allows reads within cwd without prompting", async () => {
      const { ctx, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "read", input: { path: "src/index.ts" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("allows reads of sensitive files within cwd without prompting", async () => {
      const { ctx, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "read", input: { path: ".env" } }, ctx);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("blocks reads outside cwd when user denies", async () => {
      const result = await toolCallHandler(
        { toolName: "read", input: { path: "/etc/passwd" } },
        selectingContext("Deny", { cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("allows reads outside cwd when user accepts", async () => {
      const result = await toolCallHandler(
        { toolName: "read", input: { path: "/etc/passwd" } },
        selectingContext("Allow", { cwd: PROJECT_ROOT }),
      );
      expect(result).toBeUndefined();
    });

    it("blocks reads outside cwd in non-interactive mode", async () => {
      const result = await toolCallHandler(
        { toolName: "read", input: { path: "/etc/passwd" } },
        createMockContext({ hasUI: false, cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("allows reads with no path (defaults to cwd)", async () => {
      const { ctx, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "read", input: {} }, ctx);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });
  });

  describe("grep/find/ls tools", () => {
    const PROJECT_ROOT = "/home/user/project";

    for (const toolName of ["grep", "find", "ls"]) {
      it(`${toolName}: allows within cwd without prompting`, async () => {
        const { ctx, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
        const result = await toolCallHandler({ toolName, input: { path: "src/" } }, ctx);

        expect(result).toBeUndefined();
        expect(wasSelectCalled()).toBe(false);
      });

      it(`${toolName}: prompts for paths outside cwd`, async () => {
        const result = await toolCallHandler(
          { toolName, input: { path: "/tmp/other" } },
          selectingContext("Deny", { cwd: PROJECT_ROOT }),
        );
        expect(result).toEqual(expect.objectContaining({ block: true }));
      });
    }
  });

  describe("path-scoped session permissions", () => {
    const PROJECT_ROOT = "/home/user/project";

    it("'Always allow' auto-allows re-read of same path", async () => {
      // Allow /etc/passwd with "Always allow"
      const ctx1 = selectingContext("Always allow", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "read", input: { path: "/etc/passwd" } }, ctx1);

      // Re-read /etc/passwd → auto-allowed
      const { ctx: ctx2, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "read", input: { path: "/etc/passwd" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("'Always allow' for one path does NOT auto-allow a different path", async () => {
      // Allow /etc/passwd
      const ctx1 = selectingContext("Always allow", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "read", input: { path: "/etc/passwd" } }, ctx1);

      // /tmp/file.txt is different → still prompts
      const result = await toolCallHandler(
        { toolName: "read", input: { path: "/tmp/file.txt" } },
        selectingContext("Deny", { cwd: PROJECT_ROOT }),
      );
      expect(result).toEqual(expect.objectContaining({ block: true }));
    });

    it("'Always allow' for directory auto-allows files under it (prefix match)", async () => {
      // Allow /etc
      const ctx1 = selectingContext("Always allow", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "read", input: { path: "/etc" } }, ctx1);

      // /etc/passwd is under /etc → auto-allowed
      const { ctx: ctx2, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "read", input: { path: "/etc/passwd" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });

    it("'Always allow' on read covers write/edit to same outside-cwd path", async () => {
      // Allow /tmp/shared.ts via read
      const ctx1 = selectingContext("Always allow", { cwd: PROJECT_ROOT });
      await toolCallHandler({ toolName: "read", input: { path: "/tmp/shared.ts" } }, ctx1);

      // Write to /tmp/shared.ts → same allowedPaths → auto-allowed
      const { ctx: ctx2, wasSelectCalled } = spyingContext({ cwd: PROJECT_ROOT });
      const result = await toolCallHandler({ toolName: "write", input: { path: "/tmp/shared.ts" } }, ctx2);

      expect(result).toBeUndefined();
      expect(wasSelectCalled()).toBe(false);
    });
  });
});
