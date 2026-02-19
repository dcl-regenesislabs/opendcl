/**
 * DCL Deploy Extension
 *
 * Registers the /deploy command that deploys a Decentraland scene
 * using `npx @dcl/sdk-commands deploy`. Supports both Genesis City
 * and Worlds deployment.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";

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

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("deploy", {
    description: "Deploy the scene to Genesis City or a World",
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

      const isWorldDeploy = await hasWorldConfiguration(sceneRoot);
      const deployArgs = ["@dcl/sdk-commands", "deploy"];
      if (isWorldDeploy) {
        deployArgs.push("--target-content", WORLDS_CONTENT_SERVER);
      }

      const targetLabel = isWorldDeploy ? "World" : "Genesis City";
      ctx.ui.notify(`Deploying scene to ${targetLabel}...`, "info");

      try {
        const result = await pi.exec("npx", deployArgs, {
          cwd: sceneRoot,
          timeout: 120000,
        });

        if (result.code === 0) {
          ctx.ui.notify(`Scene deployed to ${targetLabel} successfully!`, "info");
        } else {
          ctx.ui.notify(`Deploy failed (exit code ${result.code}): ${result.stderr || result.stdout}`, "error");
        }
      } catch (err) {
        ctx.ui.notify(`Failed to deploy scene: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    },
  });
};

export default extension;
