/**
 * DCL Preview Extension
 *
 * Registers the /preview command that starts the Decentraland development server
 * using `npx @dcl/sdk-commands start`. Registers with the shared process registry
 * so it can be managed via /tasks.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { processes } from "./process-registry.js";
import { updateStatus } from "./dcl-tasks.js";

export function selectPreviewUrl(
  output: string,
  bevyUrlAlreadyFound: boolean
): { url: string; shouldNotify: boolean } | null {
  const urls = [...output.matchAll(/https?:\/\/[^\s]+/g)].map((m) => m[0]);
  if (urls.length === 0) return null;

  const bevyUrl = urls.find((u) => u.includes("decentraland.zone/bevy-web"));
  if (bevyUrl) return { url: bevyUrl, shouldNotify: true };

  if (!bevyUrlAlreadyFound) return { url: urls[0], shouldNotify: false };

  return null;
}

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
  let previewProcess: ChildProcess | null = null;

  function cleanupPreview(): void {
    if (previewProcess && !previewProcess.killed) {
      previewProcess.kill();
    }
    previewProcess = null;
    processes.delete("preview");
  }

  pi.registerCommand("preview", {
    description: "Start the Decentraland preview server",
    handler: async (_args, ctx) => {
      const sceneRoot = await findSceneRoot(ctx.cwd);

      if (!sceneRoot) {
        ctx.ui.notify("No scene.json found. Create a scene first with /init.", "error");
        return;
      }

      if (!(await fileExists(join(sceneRoot, "node_modules")))) {
        ctx.ui.notify("node_modules not found. Run 'npm install' first.", "error");
        return;
      }

      // Kill existing preview if running
      if (previewProcess && !previewProcess.killed) {
        previewProcess.kill();
        previewProcess = null;
        processes.delete("preview");
      }

      ctx.ui.notify("Starting Decentraland preview server...", "info");

      try {
        previewProcess = spawn("npx", ["@dcl/sdk-commands", "start", "--bevy-web"], {
          cwd: sceneRoot,
          stdio: "pipe",
          shell: true,
        });

        // Register in shared registry immediately
        processes.set("preview", {
          name: "Preview server",
          kill: () => cleanupPreview(),
        });
        updateStatus(ctx);

        let bevyUrlFound = false;

        previewProcess.stdout?.on("data", (data: Buffer) => {
          const output = data.toString().trim();
          const result = selectPreviewUrl(output, bevyUrlFound);
          if (result) {
            if (result.shouldNotify) bevyUrlFound = true;
            processes.set("preview", {
              name: "Preview server",
              info: result.url,
              kill: () => cleanupPreview(),
            });
            if (result.shouldNotify) {
              ctx.ui.notify(`Preview server running at ${result.url}`, "info");
            }
            updateStatus(ctx);
          }
        });

        previewProcess.stderr?.on("data", (data: Buffer) => {
          const output = data.toString().trim();
          if (output.includes("EADDRINUSE") || output.includes("address already in use")) {
            ctx.ui.notify("Port already in use. Try /tasks to stop existing servers.", "error");
          }
        });

        previewProcess.on("error", (err) => {
          ctx.ui.notify(`Failed to start preview: ${err.message}`, "error");
        });

        previewProcess.on("exit", (code) => {
          if (code !== 0 && code !== null) {
            ctx.ui.notify(`Preview server exited with code ${code}`, "warning");
          }
          previewProcess = null;
          processes.delete("preview");
          updateStatus(ctx);
        });
      } catch (err) {
        ctx.ui.notify(`Failed to start preview: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
};

export default extension;
