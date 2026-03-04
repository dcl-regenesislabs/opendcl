/**
 * DCL Deploy Extension
 *
 * Registers the `deploy` tool (LLM-callable) and `/deploy` command that deploys
 * a Decentraland scene using `npx @dcl/sdk-commands deploy`. Supports both
 * Genesis City and Worlds deployment.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, findSceneRoot } from "./scene-utils.js";
import { getPendingEditorChanges } from "./dcl-editor-save.js";

const WORLDS_CONTENT_SERVER = "https://worlds-content-server.decentraland.org";

async function hasWorldConfiguration(sceneRoot: string): Promise<boolean> {
  try {
    let content = await readFile(join(sceneRoot, "scene.json"), "utf-8");
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    const sceneJson = JSON.parse(content);
    return Boolean(sceneJson.worldConfiguration?.name);
  } catch {
    return false;
  }
}

async function deployScene(
  cwd: string,
  pi: { exec(cmd: string, args: string[], opts?: unknown): Promise<{ code: number; stdout: string; stderr: string }> }
): Promise<{ message: string; isError?: boolean }> {
  const sceneRoot = await findSceneRoot(cwd);

  if (!sceneRoot) {
    return { message: "No scene.json found. Create a scene first with /init.", isError: true };
  }

  if (!(await fileExists(join(sceneRoot, "node_modules")))) {
    return { message: "node_modules not found. Run 'npm install' first.", isError: true };
  }

  const isWorldDeploy = await hasWorldConfiguration(sceneRoot);
  const deployArgs = ["@dcl/sdk-commands", "deploy"];
  if (isWorldDeploy) {
    deployArgs.push("--target-content", WORLDS_CONTENT_SERVER);
  }

  const targetLabel = isWorldDeploy ? "World" : "Genesis City";

  try {
    const result = await pi.exec("npx", deployArgs, {
      cwd: sceneRoot,
      timeout: 120000,
    });

    if (result.code === 0) {
      return { message: `Scene deployed to ${targetLabel} successfully!` };
    } else {
      return { message: `Deploy failed (exit code ${result.code}): ${result.stderr || result.stdout}`, isError: true };
    }
  } catch (err) {
    return { message: `Failed to deploy scene: ${err instanceof Error ? err.message : String(err)}`, isError: true };
  }
}

const extension: ExtensionFactory = (pi) => {
  pi.registerTool({
    name: "deploy",
    label: "Deploy Scene",
    description:
      "Deploy the Decentraland scene. Auto-detects Genesis City vs World from scene.json worldConfiguration. Use when user wants to deploy, publish, or go live.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const result = await deployScene(ctx.cwd, pi);
      return { content: [{ type: "text" as const, text: result.message }], details: undefined };
    },
  });

  pi.registerCommand("deploy", {
    description: "Deploy the scene to Genesis City or a World",
    handler: async (_args, ctx) => {
      // Check for pending editor changes before deploying
      const pendingCount = await getPendingEditorChanges(ctx.cwd);
      if (pendingCount > 0) {
        const proceed = await ctx.ui.confirm(
          "Pending Editor Changes",
          `There are ${pendingCount} unapplied editor change(s). The deployed scene won't include them. Run /save-editor first, or deploy anyway?`
        );
        if (!proceed) {
          ctx.ui.notify("Deploy cancelled. Run /save-editor to apply changes first.", "info");
          return;
        }
      }

      ctx.ui.notify("Deploying scene...", "info");
      const result = await deployScene(ctx.cwd, pi);
      ctx.ui.notify(result.message, result.isError ? "error" : "info");
    },
  });
};

export default extension;
