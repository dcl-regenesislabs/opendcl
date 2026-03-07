/**
 * DCL Editor Save Extension
 *
 * Provides `/save-editor` command and startup prompt for pending editor changes.
 * Composite entities (main.composite) are patched deterministically here.
 * Code entities (TypeScript) are handed to the AI agent via the editor-gizmo skill.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { fileExists, findSceneRoot } from "./scene-utils.js";

const EDITOR_FILE = "src/__editor/editor-scene.json";
const BACKUP_FILE = "src/__editor/editor-scene.json.bkp";
const COMPOSITE_FILE = "assets/scene/main.composite";

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

// ── Composite patching ──────────────────────────────────

interface EditorTransform {
  components: {
    Transform: {
      position: { x: number; y: number; z: number };
      rotation: { x: number; y: number; z: number; w: number };
      scale: { x: number; y: number; z: number };
    };
  };
}

type EditorChanges = Record<string, EditorTransform>;

interface CompositeComponent {
  name: string;
  jsonSchema: unknown;
  data: Record<string, { json: Record<string, unknown> }>;
}

interface CompositeFile {
  version: number;
  components: CompositeComponent[];
}

/**
 * Apply editor changes to main.composite. Returns the set of entity names
 * that were found and patched in the composite (so they can be excluded
 * from the AI-driven TypeScript patching).
 */
async function applyCompositeChanges(
  sceneRoot: string,
  changes: EditorChanges
): Promise<{ patched: Set<string>; errors: string[] }> {
  const patched = new Set<string>();
  const errors: string[] = [];

  const compositePath = join(sceneRoot, COMPOSITE_FILE);
  if (!(await fileExists(compositePath))) {
    return { patched, errors };
  }

  let composite: CompositeFile;
  try {
    const raw = await readFile(compositePath, "utf-8");
    composite = JSON.parse(raw);
  } catch (e) {
    errors.push(`Failed to parse ${COMPOSITE_FILE}: ${e}`);
    return { patched, errors };
  }

  // Build name → entity ID map from core-schema::Name
  const nameComp = composite.components.find(
    (c) => c.name === "core-schema::Name"
  );
  if (!nameComp) {
    return { patched, errors }; // No names in composite — nothing to match
  }

  const nameToId = new Map<string, string>();
  for (const [entityId, entry] of Object.entries(nameComp.data)) {
    const name = entry?.json?.value as string | undefined;
    if (name) nameToId.set(name, entityId);
  }

  // Find core::Transform component
  const transformComp = composite.components.find(
    (c) => c.name === "core::Transform"
  );
  if (!transformComp) {
    errors.push("No core::Transform component found in composite");
    return { patched, errors };
  }

  // Patch matching entities
  for (const [entityName, change] of Object.entries(changes)) {
    const entityId = nameToId.get(entityName);
    if (!entityId) continue; // Not a composite entity

    const existing = transformComp.data[entityId];
    if (!existing) {
      errors.push(`Entity "${entityName}" (id ${entityId}) has no transform in composite`);
      continue;
    }

    const t = change.components.Transform;
    existing.json.position = { x: t.position.x, y: t.position.y, z: t.position.z };
    existing.json.rotation = { x: t.rotation.x, y: t.rotation.y, z: t.rotation.z, w: t.rotation.w };
    existing.json.scale = { x: t.scale.x, y: t.scale.y, z: t.scale.z };
    // parent is preserved — we only touch position/rotation/scale

    patched.add(entityName);
  }

  if (patched.size > 0) {
    try {
      await writeFile(compositePath, JSON.stringify(composite, null, 2) + "\n", "utf-8");
    } catch (e) {
      errors.push(`Failed to write ${COMPOSITE_FILE}: ${e}`);
      return { patched: new Set(), errors };
    }
  }

  return { patched, errors };
}

// ── Extension ───────────────────────────────────────────

const extension: ExtensionFactory = (pi) => {
  function sendCodeApplyRequest(codeEntityNames: string[]): void {
    pi.sendMessage(
      {
        customType: "editor-save",
        content: [
          `There are ${codeEntityNames.length} code entity change(s) to apply to TypeScript source files.`,
          `Read the editor-gizmo skill for the apply process.`,
          `The changes are in: src/__editor/editor-scene.json.bkp`,
          `Read that file, then follow the "Applying Editor Changes to Source Code" section of the skill.`,
          `Only apply these entities (the rest were already patched in main.composite):`,
          codeEntityNames.map(n => `  - "${n}"`).join("\n"),
          `After applying all changes, delete src/__editor/editor-scene.json.bkp`,
        ].join("\n"),
        display: true,
      },
      { triggerTurn: true, deliverAs: "nextTurn" }
    );
  }

  /**
   * Apply all pending changes:
   * 1. Composite entities → patched deterministically here
   * 2. Code entities → handed to the AI agent (reads from same .bkp)
   * Both can effectively happen in parallel — composite is instant,
   * AI reads the .bkp file which stays untouched.
   */
  async function applyAllChanges(
    sceneRoot: string,
    changesPath: string,
    ctx: { ui: { notify: (msg: string, type?: string) => void } }
  ): Promise<void> {
    let changes: EditorChanges;
    try {
      const raw = await readFile(changesPath, "utf-8");
      changes = JSON.parse(raw);
    } catch {
      ctx.ui.notify("Failed to read editor changes file.", "error");
      return;
    }

    const totalCount = Object.keys(changes).length;
    if (totalCount === 0) {
      ctx.ui.notify("Editor changes file is empty.", "warning");
      return;
    }

    // Apply composite changes (deterministic, instant)
    const { patched, errors } = await applyCompositeChanges(sceneRoot, changes);
    for (const err of errors) {
      ctx.ui.notify(err, "warning");
    }
    if (patched.size > 0) {
      ctx.ui.notify(
        `Patched ${patched.size} composite ${patched.size === 1 ? 'entity' : 'entities'} in main.composite.`,
        "info"
      );
    }

    // Remaining code entities → AI agent
    const codeEntityNames = Object.keys(changes).filter(n => !patched.has(n));
    if (codeEntityNames.length > 0) {
      sendCodeApplyRequest(codeEntityNames);
    } else {
      // All composite — clean up
      try { await unlink(changesPath); } catch { /* already gone */ }
      ctx.ui.notify("All editor changes applied!", "info");
    }
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

      const bkpPath = join(sceneRoot, BACKUP_FILE);
      await applyAllChanges(sceneRoot, bkpPath, ctx);
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

    const bkpPath = join(sceneRoot, BACKUP_FILE);
    await applyAllChanges(sceneRoot, bkpPath, ctx);
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

  return countChanges(pending.path);
}
