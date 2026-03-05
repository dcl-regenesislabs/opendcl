/**
 * DCL Editor Save Extension
 *
 * Provides `/save-editor` command and startup prompt for pending editor changes.
 * The actual patching logic is in the editor-gizmo skill — this extension just
 * detects changes, creates the backup, and tells the agent to apply them.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, findSceneRoot } from "./scene-utils.js";

const EDITOR_FILE = "src/__editor/editor-scene.json";
const BACKUP_FILE = "src/__editor/editor-scene.json.bkp";

/** Check if there are pending editor changes (either main file or interrupted backup) */
async function findPendingChanges(
  sceneRoot: string
): Promise<{ path: string; isBackup: boolean } | null> {
  // Check for interrupted backup first (previous apply was interrupted)
  const bkpPath = join(sceneRoot, BACKUP_FILE);
  if (await fileExists(bkpPath)) {
    return { path: bkpPath, isBackup: true };
  }

  // Check for main file with actual content
  const mainPath = join(sceneRoot, EDITOR_FILE);
  if (await fileExists(mainPath)) {
    try {
      const content = await readFile(mainPath, "utf-8");
      const data = JSON.parse(content);
      if (Object.keys(data).length > 0) {
        return { path: mainPath, isBackup: false };
      }
    } catch {
      // Invalid JSON or empty — no changes
    }
  }

  return null;
}

/** Count entities in a changes file */
async function countChanges(filePath: string): Promise<number> {
  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content);
    return Object.keys(data).length;
  } catch {
    return 0;
  }
}

/** Move main file to backup (atomic) before agent applies changes */
async function createBackup(sceneRoot: string): Promise<boolean> {
  try {
    await rename(
      join(sceneRoot, EDITOR_FILE),
      join(sceneRoot, BACKUP_FILE)
    );
    return true;
  } catch {
    return false;
  }
}

const extension: ExtensionFactory = (pi) => {
  function sendApplyRequest(count: number): void {
    pi.sendMessage(
      {
        customType: "editor-save",
        content: [
          `The user has ${count} pending editor change(s) to apply.`,
          `Read the editor-gizmo skill for the full apply process.`,
          `The changes are in: src/__editor/editor-scene.json.bkp`,
          `Read that file, then follow the "Applying Editor Changes to Source Code" section of the skill.`,
        ].join("\n"),
        display: true,
      },
      { triggerTurn: true, deliverAs: "nextTurn" }
    );
  }

  pi.registerCommand("save-editor", {
    description:
      "Apply pending editor gizmo changes to the scene source code",
    handler: async (_args, ctx) => {
      const sceneRoot = await findSceneRoot(ctx.cwd);
      if (!sceneRoot) {
        ctx.ui.notify("No scene.json found.", "error");
        return;
      }

      const pending = await findPendingChanges(sceneRoot);
      if (!pending) {
        ctx.ui.notify("No pending editor changes.", "info");
        return;
      }

      const count = await countChanges(pending.path);
      if (count === 0) {
        ctx.ui.notify("Editor changes file is empty or invalid.", "warning");
        return;
      }

      if (!pending.isBackup) {
        const backupCreated = await createBackup(sceneRoot);
        if (!backupCreated) {
          ctx.ui.notify("Failed to create backup of editor changes.", "error");
          return;
        }
      }

      ctx.ui.notify(
        `Applying ${count} editor change(s) to source code...`,
        "info"
      );
      sendApplyRequest(count);
    },
  });

  // Prompt on session start if pending changes exist
  let editorPromptShown = false;
  pi.on("before_agent_start", async (_event, ctx) => {
    if (editorPromptShown) return;
    editorPromptShown = true;

    const sceneRoot = await findSceneRoot(ctx.cwd);
    if (!sceneRoot) return;

    const pending = await findPendingChanges(sceneRoot);
    if (!pending) return;

    const count = await countChanges(pending.path);
    if (count === 0) return;

    const label = pending.isBackup
      ? `Found ${count} interrupted editor change(s) from a previous session.`
      : `Found ${count} pending editor change(s).`;

    const apply = await ctx.ui.confirm(
      "Editor Changes",
      `${label} Apply to source code?`
    );
    if (!apply) return;

    if (!pending.isBackup) {
      await createBackup(sceneRoot);
    }
    sendApplyRequest(count);
  });
};

export default extension;

/**
 * Check for pending editor changes — used by deploy/preview extensions.
 * Returns the count or 0 if none.
 */
export async function getPendingEditorChanges(
  cwd: string
): Promise<number> {
  const sceneRoot = await findSceneRoot(cwd);
  if (!sceneRoot) return 0;

  const pending = await findPendingChanges(sceneRoot);
  if (!pending) return 0;

  return await countChanges(pending.path);
}
