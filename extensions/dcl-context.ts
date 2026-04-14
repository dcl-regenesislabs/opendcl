/**
 * DCL Context Extension
 *
 * Auto-detects Decentraland scene projects and injects project metadata
 * into the system prompt so the agent has context about the current scene.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, findSceneRoot } from "./scene-utils.js";

interface SceneJson {
  ecs7?: boolean;
  runtimeVersion?: string;
  display?: { title?: string; description?: string };
  scene?: { parcels?: string[]; base?: string };
  main?: string;
  worldConfiguration?: { name?: string; [key: string]: unknown };
  opendcl?: boolean;
  [key: string]: unknown;
}

function calculateSceneSize(parcels: string[]): { width: number; depth: number } {
  if (parcels.length === 0) return { width: 16, depth: 16 };
  const coords = parcels.map((p) => {
    const [x, z] = p.split(",").map(Number);
    return { x, z };
  });
  const xs = coords.map((c) => c.x);
  const zs = coords.map((c) => c.z);
  return {
    width: (Math.max(...xs) - Math.min(...xs) + 1) * 16,
    depth: (Math.max(...zs) - Math.min(...zs) + 1) * 16,
  };
}

const extension: ExtensionFactory = (pi) => {
  pi.on("before_agent_start", async (event, ctx) => {
    const cwd = ctx.cwd;
    const sceneRoot = await findSceneRoot(cwd);

    let sceneContext = "";

    if (!sceneRoot) {
      sceneContext = `\n## Current Project Status
**No Decentraland scene detected** in the current directory.
You are in an empty folder. **You must run \`/init\` first** to scaffold the project with the official SDK template before writing any scene code. Never manually create scene.json, package.json, or tsconfig.json — \`/init\` generates the correct versions.
After \`/init\`, customize scene.json and src/index.ts based on what the user wants to build.\n`;
    } else {
      try {
        let content = await readFile(join(sceneRoot, "scene.json"), "utf-8");
        if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
        const sceneJson: SceneJson = JSON.parse(content);

        // Check for legacy SDK6
        if (sceneJson.ecs7 !== true && sceneJson.runtimeVersion !== "7") {
          sceneContext = `\n## Current Project Status
**Legacy SDK6 scene detected.** This scene uses the older SDK6 format.
OpenDCL supports SDK7 only. Suggest the user migrate to SDK7.
Migration guide: https://docs.decentraland.org/creator/sdk7/sdk7-migration-guide/\n`;
        } else {
          // Stamp scene.json with opendcl: true if not already present
          if (!sceneJson.opendcl) {
            try {
              sceneJson.opendcl = true;
              await writeFile(
                join(sceneRoot, "scene.json"),
                JSON.stringify(sceneJson, null, 2) + "\n"
              );
            } catch {
              // Non-fatal: don't block context injection if write fails
            }
          }

          const lines: string[] = ["\n## Current Project"];

          if (sceneJson.display?.title) lines.push(`- **Title**: ${sceneJson.display.title}`);
          if (sceneJson.display?.description) lines.push(`- **Description**: ${sceneJson.display.description}`);
          lines.push(`- **Root**: ${sceneRoot}`);

          // SDK version from package.json
          try {
            const pkgContent = await readFile(join(sceneRoot, "package.json"), "utf-8");
            const pkg = JSON.parse(pkgContent);
            const sdkVersion = pkg.dependencies?.["@dcl/sdk"] ?? pkg.devDependencies?.["@dcl/sdk"];
            if (sdkVersion) lines.push(`- **SDK Version**: @dcl/sdk@${sdkVersion}`);
          } catch {
            // No package.json
          }

          // Entry point
          for (const candidate of ["src/index.ts", "src/game.ts", "src/index.tsx"]) {
            if (await fileExists(join(sceneRoot, candidate))) {
              lines.push(`- **Entry Point**: ${candidate}`);
              break;
            }
          }

          if (sceneJson.main) lines.push(`- **Main (compiled)**: ${sceneJson.main}`);

          const parcels = sceneJson.scene?.parcels ?? [];
          if (parcels.length > 0) {
            lines.push(`- **Parcels**: ${parcels.join(", ")} (${parcels.length} parcel${parcels.length !== 1 ? "s" : ""})`);
            if (sceneJson.scene?.base) lines.push(`- **Base Parcel**: ${sceneJson.scene.base}`);
            const size = calculateSceneSize(parcels);
            lines.push(`- **Scene Size**: ${size.width}m x ${size.depth}m`);
          }

          if (sceneJson.worldConfiguration) {
            const worldName = sceneJson.worldConfiguration.name;
            lines.push(`- **Deployment**: Decentraland World${worldName ? ` (${worldName})` : ""}`);
          }

          if (sceneJson.opendcl) {
            lines.push(`- **Created with**: OpenDCL`);
          }

          // Check node_modules
          if (!(await fileExists(join(sceneRoot, "node_modules")))) {
            lines.push("");
            lines.push("**Warning**: `node_modules/` not found. The user needs to run `npm install` before building.");
          }

          sceneContext = lines.join("\n") + "\n";
        }
      } catch (e) {
        sceneContext = `\n## Current Project Status
**Error**: Failed to parse scene.json: ${e instanceof Error ? e.message : String(e)}
The scene.json file exists but could not be parsed. Help the user fix it.\n`;
      }
    }

    // Inject scene context into the system prompt
    return {
      systemPrompt: event.systemPrompt + sceneContext,
    };
  });
};

export default extension;
