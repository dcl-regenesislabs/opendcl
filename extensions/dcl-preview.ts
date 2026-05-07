/**
 * DCL Preview Extension
 *
 * Registers the `preview` tool (LLM-callable) and `/preview` command that starts
 * the Decentraland development server using `npx @dcl/sdk-commands start --bevy-web`.
 * Registers with the shared process registry so it can be managed via /tasks.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { processes } from "./process-registry.js";
import { fileExists, findSceneRoot } from "./scene-utils.js";
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

interface PreviewContext {
  ui: {
    notify(message: string, type?: string): void;
    setStatus(key: string, text: string | undefined): void;
  };
}

const extension: ExtensionFactory = (pi) => {
  let previewProcess: ChildProcess | null = null;

  function cleanupPreview(): void {
    if (previewProcess && !previewProcess.killed) {
      const pid = previewProcess.pid;
      if (pid) {
        try {
          process.kill(-pid, "SIGTERM");
        } catch {
          // Process group already exited
        }
      } else {
        previewProcess.kill();
      }
    }
    previewProcess = null;
    processes.delete("preview");
  }

  async function startPreviewServer(
    cwd: string,
    ctx: PreviewContext
  ): Promise<{ message: string; isError?: boolean }> {
    const sceneRoot = await findSceneRoot(cwd);

    if (!sceneRoot) {
      return { message: "No scene.json found. Create a scene first with /init.", isError: true };
    }

    if (!(await fileExists(join(sceneRoot, "node_modules")))) {
      return { message: "node_modules not found. Run 'npm install' first.", isError: true };
    }

    cleanupPreview();

    try {
      previewProcess = spawn("npx", ["@dcl/sdk-commands", "start", "--bevy-web"], {
        cwd: sceneRoot,
        stdio: "pipe",
        shell: true,
        detached: true,
      });

      processes.set("preview", {
        name: "Preview server",
        kill: cleanupPreview,
      });
      updateStatus(ctx);

      let bevyUrlFound = false;

      function handleOutput(data: Buffer): void {
        const output = data.toString().trim();
        if (output.includes("EADDRINUSE") || output.includes("address already in use")) {
          ctx.ui.notify("Port already in use. Try /tasks to stop existing servers.", "error");
          return;
        }
        const result = selectPreviewUrl(output, bevyUrlFound);
        if (result) {
          if (result.shouldNotify) bevyUrlFound = true;
          processes.set("preview", {
            name: "Preview server",
            info: result.url,
            kill: cleanupPreview,
          });
          if (result.shouldNotify) {
            ctx.ui.notify(`Preview server running at ${result.url}`, "info");
          }
          updateStatus(ctx);
        }
      }

      previewProcess.stdout?.on("data", handleOutput);
      previewProcess.stderr?.on("data", handleOutput);

      previewProcess.on("error", (err) => {
        ctx.ui.notify(`Failed to start preview: ${err.message}`, "error");
      });

      previewProcess.on("exit", (code) => {
        if (code !== 0 && code !== null) {
          ctx.ui.notify(`Preview server exited with code ${code}`, "warning");
        }
        cleanupPreview();
        updateStatus(ctx);
      });

      return { message: `Preview server starting in ${sceneRoot}` };
    } catch (err) {
      return { message: `Failed to start preview: ${err instanceof Error ? err.message : String(err)}`, isError: true };
    }
  }

  pi.registerTool({
    name: "preview",
    label: "Preview",
    description:
      "Start the Decentraland preview server. Use when the user wants to preview, run, test, or see their scene.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const result = await startPreviewServer(ctx.cwd, ctx);
      return { content: [{ type: "text" as const, text: result.message }], details: undefined };
    },
  });

  pi.registerCommand("preview", {
    description: "Start the Decentraland preview server",
    handler: async (_args, ctx) => {
      const result = await startPreviewServer(ctx.cwd, ctx);
      ctx.ui.notify(result.message, result.isError ? "error" : "info");
    },
  });
};

export default extension;
