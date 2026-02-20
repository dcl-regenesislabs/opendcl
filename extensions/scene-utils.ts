/**
 * Shared filesystem utilities for Decentraland scene extensions.
 *
 * Provides fileExists() and findSceneRoot() used by multiple extensions
 * to locate and validate scene projects.
 */

import { access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function findSceneRoot(startDir: string): Promise<string | null> {
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
