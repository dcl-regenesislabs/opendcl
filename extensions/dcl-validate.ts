/**
 * DCL Validate Extension
 *
 * Hooks into write tool calls — after writing .ts/.tsx files, runs
 * `npx tsc --noEmit` to catch type errors immediately.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findSceneRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);
  for (let i = 0; i < 10; i++) {
    if (await fileExists(join(current, "scene.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

const extension: ExtensionFactory = (pi) => {
  let validationTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastValidationTime = 0;
  const DEBOUNCE_MS = 2000; // Don't validate more than once every 2 seconds

  pi.on("tool_result", async (event, ctx) => {
    // Only react to write tool results for .ts/.tsx files
    if (event.toolName !== "write" || event.isError) return;

    const filePath = (event.input as { path?: string }).path ?? "";
    if (!filePath.match(/\.tsx?$/)) return;

    // Find scene root from the written file's directory
    const fileDir = dirname(filePath);
    const sceneRoot = await findSceneRoot(fileDir);
    if (!sceneRoot) return;

    // Check for tsconfig.json
    if (!(await fileExists(join(sceneRoot, "tsconfig.json")))) return;

    // Check for node_modules (tsc needs @dcl/sdk types)
    if (!(await fileExists(join(sceneRoot, "node_modules")))) return;

    // Debounce validation
    const now = Date.now();
    if (now - lastValidationTime < DEBOUNCE_MS) return;
    lastValidationTime = now;

    // Clear any pending validation
    if (validationTimeout) {
      clearTimeout(validationTimeout);
    }

    // Run validation after a short delay (allows multiple writes to batch)
    validationTimeout = setTimeout(async () => {
      try {
        const result = await pi.exec("npx", ["tsc", "--noEmit", "--pretty"], {
          cwd: sceneRoot,
          timeout: 30000,
        });

        if (result.code !== 0 && result.stdout) {
          // Extract error summary
          const errors = result.stdout
            .split("\n")
            .filter((line) => line.includes("error TS"))
            .slice(0, 5) // Show max 5 errors
            .join("\n");

          if (errors) {
            // Send validation errors as a message to the agent
            pi.sendMessage(
              {
                customType: "dcl-validation",
                content: `TypeScript validation errors detected:\n\`\`\`\n${errors}\n\`\`\`\nPlease fix these type errors.`,
                display: `TypeScript errors found in ${filePath}`,
              },
              { triggerTurn: false, deliverAs: "nextTurn" }
            );
          }
        }
      } catch {
        // Validation timed out or failed — don't block the user
      }
    }, 500);
  });
};

export default extension;
