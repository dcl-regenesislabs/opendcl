/**
 * DCL Init Extension
 *
 * Registers the `init` tool (LLM-callable) and `/init` command that scaffolds
 * a new Decentraland scene project using `npx @dcl/sdk-commands init`.
 * After scaffolding, triggers the editor-gizmo skill to set up the visual editor.
 * On session start, prompts the user to enable the editor if a scene exists but lacks it.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { join } from "node:path";
import { fileExists, findSceneRoot } from "./scene-utils.js";

function triggerEditorSkill(pi: { sendMessage(msg: unknown, opts?: unknown): void }) {
  pi.sendMessage(
    {
      customType: "editor-setup",
      content: "Scene initialized. Now set up the visual editor by following the editor-gizmo skill.",
      display: true,
    },
    { triggerTurn: true }
  );
}

async function initScene(
  cwd: string,
  pi: {
    exec(cmd: string, args: string[], opts?: unknown): Promise<{ code: number; stdout: string; stderr: string }>;
    sendMessage(msg: unknown, opts?: unknown): void;
  }
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
      triggerEditorSkill(pi);
      return { message: "Scene initialized! Setting up visual editor..." };
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
      "Initialize a new Decentraland SDK7 scene with visual editor. Scaffolds scene.json, package.json, tsconfig.json, src/index.ts, and the __editor/ directory. Use when user wants to create or start a new scene.",
    parameters: Type.Object({}),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const result = await initScene(ctx.cwd, pi);
      if (!result.isError && 'reload' in ctx) await (ctx as any).reload();
      return { content: [{ type: "text" as const, text: result.message }], details: undefined };
    },
  });

  pi.registerCommand("init", {
    description: "Initialize a new Decentraland scene project with visual editor",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Initializing new Decentraland scene...", "info");
      const result = await initScene(ctx.cwd, pi);
      ctx.ui.notify(result.message, result.isError ? "error" : "info");
      if (!result.isError) await ctx.reload();
    },
  });

  // Prompt on session start if scene exists but editor is not installed
  let editorPromptShown = false;
  pi.on("before_agent_start", async (_event, ctx) => {
    if (editorPromptShown) return;
    editorPromptShown = true;

    const sceneRoot = await findSceneRoot(ctx.cwd);
    if (!sceneRoot) return;

    if (await fileExists(join(sceneRoot, "src", "__editor", "state.ts"))) return;

    const enable = await ctx.ui.confirm(
      "Visual Editor",
      "Enable the visual editor for this scene?"
    );
    if (!enable) return;

    triggerEditorSkill(pi);
  });
};

export default extension;
