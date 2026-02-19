/**
 * DCL Init Extension
 *
 * Registers the /init command that scaffolds a new Decentraland scene project
 * using `npx @dcl/sdk-commands init`.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { access } from "node:fs/promises";
import { join } from "node:path";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("init", {
    description: "Initialize a new Decentraland scene project in the current directory",
    handler: async (_args, ctx) => {
      const cwd = ctx.cwd;

      // Check if scene.json already exists
      if (await fileExists(join(cwd, "scene.json"))) {
        ctx.ui.notify("A scene.json already exists in this directory. Aborting to prevent overwriting.", "warning");
        return;
      }

      ctx.ui.notify("Initializing new Decentraland scene...", "info");

      try {
        const result = await pi.exec("npx", ["@dcl/sdk-commands", "init", "--skip-install"], {
          cwd,
          timeout: 60000,
        });

        if (result.exitCode === 0) {
          ctx.ui.notify("Scene initialized! Run 'npm install' to install dependencies, then '/preview' to start.", "info");
          // Reload to pick up the new scene context
          await ctx.reload();
        } else {
          ctx.ui.notify(`Init failed (exit code ${result.exitCode}): ${result.stderr || result.stdout}`, "error");
        }
      } catch (err) {
        ctx.ui.notify(`Failed to initialize scene: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
};

export default extension;
