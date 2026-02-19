/**
 * Extension loading tests — verifies every extension can be dynamically
 * imported and exports the expected shape (default ExtensionFactory function,
 * named exports where applicable).
 */

import { describe, it, expect } from "vitest";

const EXTENSIONS_DIR = "../../extensions";

const EXTENSION_FILES = [
  "dcl-context",
  "dcl-preview",
  "dcl-init",
  "dcl-deploy",
  "dcl-validate",
  "dcl-header",
  "dcl-tasks",
  "process-registry",
  "plan-mode/index",
];

describe("extension loading", () => {
  describe("dynamic import succeeds for each extension", () => {
    for (const ext of EXTENSION_FILES) {
      it(`import("${ext}.js") succeeds`, async () => {
        const mod = await import(`${EXTENSIONS_DIR}/${ext}.js`);
        expect(mod).toBeDefined();
      });
    }
  });

  describe("default export is an ExtensionFactory function", () => {
    // All extensions except process-registry export a default function
    const factoryExtensions = EXTENSION_FILES.filter((e) => e !== "process-registry");

    for (const ext of factoryExtensions) {
      it(`${ext} default export is a function`, async () => {
        const mod = await import(`${EXTENSIONS_DIR}/${ext}.js`);
        expect(typeof mod.default).toBe("function");
      });
    }
  });

  describe("named exports", () => {
    it("process-registry exports a Map instance as 'processes'", async () => {
      const mod = await import(`${EXTENSIONS_DIR}/process-registry.js`);
      expect(mod.processes).toBeInstanceOf(Map);
    });

    it("process-registry does not export a default function", async () => {
      const mod = await import(`${EXTENSIONS_DIR}/process-registry.js`);
      expect(typeof mod.default).not.toBe("function");
    });

    it("dcl-tasks exports updateStatus function", async () => {
      const mod = await import(`${EXTENSIONS_DIR}/dcl-tasks.js`);
      expect(typeof mod.updateStatus).toBe("function");
    });

    it("plan-mode/utils exports isSafeCommand", async () => {
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/utils.js`);
      expect(typeof mod.isSafeCommand).toBe("function");
    });

    it("plan-mode/utils exports extractTodoItems", async () => {
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/utils.js`);
      expect(typeof mod.extractTodoItems).toBe("function");
    });

    it("plan-mode/utils exports markCompletedSteps", async () => {
      const mod = await import(`${EXTENSIONS_DIR}/plan-mode/utils.js`);
      expect(typeof mod.markCompletedSteps).toBe("function");
    });
  });
});
