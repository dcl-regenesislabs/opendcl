/**
 * DCL Init Extension
 *
 * Registers the `init` tool (LLM-callable) and `/init` command that scaffolds
 * a new Decentraland scene project using `npx @dcl/sdk-commands init`.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { join } from "node:path";
import { fileExists } from "./scene-utils.js";

async function initScene(
  cwd: string,
  pi: { exec(cmd: string, args: string[], opts?: unknown): Promise<{ code: number; stdout: string; stderr: string }> }
): Promise<{ message: string; isError?: boolean }> {
  if (await fileExists(join(cwd, "scene.json"))) {
    return { message: "A scene.json already exists in this directory. Aborting to prevent overwriting.", isError: true };
  }

  try {
    const result = await pi.exec("npx", ["@dcl/sdk-commands", "init", "--yes"], {
      cwd,
      timeout: 180000,
    });

    if (result.code === 0) {
      return { message: "Scene initialized and dependencies installed! Use the preview tool to start." };
    } else {
      return { message: `Init failed (exit code ${result.code}): ${result.stderr || result.stdout}`, isError: true };
    }
  } catch (err) {
    return { message: `Failed to initialize scene: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

const extension: ExtensionFactory = (pi) => {
  pi.registerTool({
    name: "init",
    label: "Init Scene",
    description:
      "Initialize a new Decentraland SDK7 scene. Scaffolds scene.json, package.json, tsconfig.json, and src/index.ts. Use when user wants to create or start a new scene.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const result = await initScene(ctx.cwd, pi);
      if (!result.isError) await ctx.reload();
      return { content: [{ type: "text" as const, text: result.message }], details: undefined };
    },
  });

  pi.registerCommand("init", {
    description: "Initialize a new Decentraland scene project in the current directory",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Initializing new Decentraland scene...", "info");
      const result = await initScene(ctx.cwd, pi);
      ctx.ui.notify(result.message, result.isError ? "error" : "info");
      if (!result.isError) await ctx.reload();
    },
  });
};

export default extension;
