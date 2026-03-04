/**
 * DCL Editor Save Extension
 *
 * Provides `/save-editor` command to apply in-scene gizmo changes to source code.
 * Also prompts on session start and blocks deploy if pending changes exist.
 *
 * Flow:
 * 1. mv editor-scene.json → editor-scene.json.bkp (atomic, no data loss)
 * 2. Agent reads .bkp and patches Transform calls in source code
 * 3. On success → agent deletes .bkp
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, findSceneRoot } from "./scene-utils.js";

const EDITOR_FILE = "src/__editor/editor-scene.json";
const BACKUP_FILE = "src/__editor/editor-scene.json.bkp";
const RAD_TO_DEG = 180 / Math.PI;

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Quaternion extends Vec3 {
  w: number;
}

interface TransformData {
  position?: Vec3;
  rotation?: Quaternion;
  scale?: Vec3;
}

interface EntityChange {
  components: {
    Transform?: TransformData;
  };
}

/** Convert quaternion to euler angles (degrees) for human-readable code */
function quatToEuler(q: Quaternion): Vec3 {
  const sinRoll = 2 * (q.w * q.x + q.y * q.z);
  const cosRoll = 1 - 2 * (q.x * q.x + q.y * q.y);
  const x = Math.atan2(sinRoll, cosRoll) * RAD_TO_DEG;

  const sinPitch = 2 * (q.w * q.y - q.z * q.x);
  const y =
    Math.abs(sinPitch) >= 1
      ? Math.sign(sinPitch) * 90
      : Math.asin(sinPitch) * RAD_TO_DEG;

  const sinYaw = 2 * (q.w * q.z + q.x * q.y);
  const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
  const z = Math.atan2(sinYaw, cosYaw) * RAD_TO_DEG;

  return { x: round(x), y: round(y), z: round(z) };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatRotation(rotation: Quaternion): string | null {
  const euler = quatToEuler(rotation);
  if (euler.x === 0 && euler.y === 0 && euler.z === 0) return null;
  return `Quaternion.fromEulerDegrees(${euler.x}, ${euler.y}, ${euler.z})`;
}

function buildAgentMessage(
  entities: Record<string, EntityChange>
): string {
  const entries = Object.entries(entities);
  const lines = entries.map(([name, entry]) => {
    const t = entry.components?.Transform;
    if (!t) return `- Entity "${name}": no transform changes`;

    const pos = t.position
      ? `Vector3.create(${t.position.x}, ${t.position.y}, ${t.position.z})`
      : null;
    const rot = t.rotation ? formatRotation(t.rotation) : null;

    const parts = [];
    if (pos) parts.push(`position = ${pos}`);
    if (rot) parts.push(`rotation = ${rot}`);
    return `- Entity "${name}": ${parts.join(", ")}`;
  });

  return [
    `The user moved/rotated ${entries.length} object(s) in the scene editor.`,
    `Update the Transform components in the scene source code to match these new values.`,
    `Find each entity by its Name component value and update the position and rotation in the corresponding Transform.create() call.`,
    `If the rotation is all zeros, you can omit the rotation field.`,
    `After applying all changes, delete the backup file: src/__editor/editor-scene.json.bkp`,
    ``,
    `Changes:`,
    ...lines,
  ].join("\n");
}

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

/** Read and parse the changes file, return entity count and agent message */
async function readChanges(
  filePath: string
): Promise<{ count: number; message: string } | null> {
  try {
    const content = await readFile(filePath, "utf-8");
    const data = JSON.parse(content) as Record<string, EntityChange>;
    const count = Object.keys(data).length;
    if (count === 0) return null;
    return { count, message: buildAgentMessage(data) };
  } catch {
    return null;
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
  function sendEditorChanges(changes: { count: number; message: string }): void {
    pi.sendMessage(
      {
        customType: "editor-save",
        content: `Editor: ${changes.count} entity transform(s) to apply\n\n${changes.message}`,
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

      const changes = await readChanges(pending.path);
      if (!changes) {
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
        `Applying ${changes.count} editor change(s) to source code...`,
        "info"
      );
      sendEditorChanges(changes);
    },
  });

  // Use before_agent_start instead of session_start so the terminal's
  // input handling is fully initialized (arrow keys work in the prompt).
  let editorPromptShown = false;
  pi.on("before_agent_start", async (_event, ctx) => {
    if (editorPromptShown) return;
    editorPromptShown = true;

    const sceneRoot = await findSceneRoot(ctx.cwd);
    if (!sceneRoot) return;

    const pending = await findPendingChanges(sceneRoot);
    if (!pending) return;

    const changes = await readChanges(pending.path);
    if (!changes) return;

    const label = pending.isBackup
      ? `Found ${changes.count} interrupted editor change(s) from a previous session.`
      : `Found ${changes.count} pending editor change(s).`;

    const apply = await ctx.ui.confirm(
      "Editor Changes",
      `${label} Apply to source code?`
    );
    if (!apply) return;

    if (!pending.isBackup) {
      await createBackup(sceneRoot);
    }
    sendEditorChanges(changes);
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

  const changes = await readChanges(pending.path);
  return changes?.count ?? 0;
}
