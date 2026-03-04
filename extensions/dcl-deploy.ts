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
const BEVY_BASE = "https://decentraland.zone/bevy-web";

interface SceneDeployInfo {
  /** World name (e.g. "boedo.dcl.eth") — presence means it's a World deploy */
  worldName?: string;
  /** Base parcel (e.g. "30,30") for Genesis City */
  baseParcel?: string;
}

async function getSceneDeployInfo(sceneRoot: string): Promise<SceneDeployInfo> {
  try {
    let content = await readFile(join(sceneRoot, "scene.json"), "utf-8");
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    const sceneJson = JSON.parse(content);
    const worldName = sceneJson.worldConfiguration?.name;
    if (worldName) {
      return { worldName };
    }
    const baseParcel = sceneJson.scene?.base;
    return { baseParcel };
  } catch {
    return {};
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

  const deployInfo = await getSceneDeployInfo(sceneRoot);
  const isWorld = Boolean(deployInfo.worldName);
  const deployArgs = ["@dcl/sdk-commands", "deploy"];
  if (isWorld) {
    deployArgs.push("--target-content", WORLDS_CONTENT_SERVER);
  }

  const targetLabel = isWorld ? "World" : "Genesis City";

  try {
    const result = await pi.exec("npx", deployArgs, {
      cwd: sceneRoot,
      timeout: 120000,
    });

    if (result.code === 0) {
      let visitUrl: string | undefined;
      if (deployInfo.worldName) {
        visitUrl = `${BEVY_BASE}?realm=${deployInfo.worldName}`;
      } else if (deployInfo.baseParcel) {
        visitUrl = `${BEVY_BASE}?position=${deployInfo.baseParcel}`;
      }
      const urlLine = visitUrl ? `\nVisit: ${visitUrl}` : "";
      return { message: `Scene deployed to ${targetLabel} successfully!${urlLine}` };
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
