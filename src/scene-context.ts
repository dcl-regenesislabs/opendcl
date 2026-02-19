/**
 * Scene context detection for Decentraland projects.
 *
 * Detects scene.json, package.json, and entry point files to provide
 * contextual information to the AI agent about the current project.
 */

import { readFile, access } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";

export interface SceneJson {
  ecs7?: boolean;
  runtimeVersion?: string;
  display?: {
    title?: string;
    description?: string;
    navmapThumbnail?: string;
    favicon?: string;
  };
  scene?: {
    parcels?: string[];
    base?: string;
  };
  main?: string;
  spawnPoints?: Array<{
    name?: string;
    default?: boolean;
    position?: { x: number | number[]; y: number | number[]; z: number | number[] };
    cameraTarget?: { x: number; y: number; z: number };
  }>;
  requiredPermissions?: string[];
  worldConfiguration?: {
    name?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface SceneContext {
  /** Whether a valid scene.json was found */
  hasScene: boolean;
  /** Absolute path to the scene root directory */
  sceneRoot?: string;
  /** Parsed scene.json content */
  sceneJson?: SceneJson;
  /** Scene display title */
  title?: string;
  /** Scene description */
  description?: string;
  /** Scene parcels list */
  parcels?: string[];
  /** Base parcel */
  base?: string;
  /** Scene size in meters (width x depth) */
  sizeMeters?: { width: number; depth: number };
  /** Number of parcels */
  parcelCount?: number;
  /** Main entry point from scene.json */
  main?: string;
  /** Detected source entry point file (e.g., src/index.ts) */
  entryPoint?: string;
  /** @dcl/sdk version from package.json */
  sdkVersion?: string;
  /** Whether node_modules exists */
  needsInstall?: boolean;
  /** Whether this is a World (vs Genesis City) deployment */
  isWorld?: boolean;
  /** World name if applicable */
  worldName?: string;
  /** Parse error if scene.json was malformed */
  parseError?: string;
  /** Whether this appears to be an SDK6 (legacy) scene */
  isLegacySdk6?: boolean;
}

/**
 * Calculate scene dimensions from parcels.
 * Each parcel is 16x16 meters.
 */
export function calculateSceneSize(parcels: string[]): { width: number; depth: number } {
  if (parcels.length === 0) return { width: 16, depth: 16 };

  const coords = parcels.map((p) => {
    const [x, z] = p.split(",").map(Number);
    return { x, z };
  });

  const xs = coords.map((c) => c.x);
  const zs = coords.map((c) => c.z);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    width: (maxX - minX + 1) * 16,
    depth: (maxZ - minZ + 1) * 16,
  };
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    let content = await readFile(path, "utf-8");
    // Handle UTF-8 BOM
    if (content.charCodeAt(0) === 0xfeff) {
      content = content.slice(1);
    }
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Walk up from the given directory to find scene.json.
 */
async function findSceneRoot(startDir: string): Promise<string | null> {
  let current = resolve(startDir);

  // Walk up at most 10 levels
  for (let i = 0; i < 10; i++) {
    if (await fileExists(join(current, "scene.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break; // filesystem root
    current = parent;
  }
  return null;
}

/**
 * Find the entry point TypeScript file for the scene.
 */
async function findEntryPoint(sceneRoot: string, main?: string): Promise<string | undefined> {
  // Common entry point locations
  const candidates = [
    "src/index.ts",
    "src/game.ts",
    "src/index.tsx",
    "src/game.tsx",
  ];

  // If main is specified, try to derive the TS source from it
  if (main) {
    const tsPath = main.replace(/^bin\//, "src/").replace(/\.js$/, ".ts");
    if (!candidates.includes(tsPath)) {
      candidates.unshift(tsPath);
    }
  }

  for (const candidate of candidates) {
    if (await fileExists(join(sceneRoot, candidate))) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * Detect and return the scene context for the given directory.
 */
export async function detectSceneContext(cwd: string): Promise<SceneContext> {
  const sceneRoot = await findSceneRoot(cwd);

  if (!sceneRoot) {
    return { hasScene: false };
  }

  // Parse scene.json
  let sceneJson: SceneJson | null;
  try {
    const content = await readFile(join(sceneRoot, "scene.json"), "utf-8");
    const cleaned = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
    sceneJson = JSON.parse(cleaned) as SceneJson;
  } catch (e) {
    return {
      hasScene: false,
      sceneRoot,
      parseError: `Failed to parse scene.json: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Check for legacy SDK6
  const isLegacySdk6 = sceneJson.ecs7 !== true && sceneJson.runtimeVersion !== "7";

  // Parse package.json for SDK version
  const pkgJson = await readJsonFile<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(join(sceneRoot, "package.json"));

  const sdkVersion =
    pkgJson?.dependencies?.["@dcl/sdk"] ??
    pkgJson?.devDependencies?.["@dcl/sdk"] ??
    undefined;

  // Check node_modules
  const hasNodeModules = await fileExists(join(sceneRoot, "node_modules"));

  // Find entry point
  const entryPoint = await findEntryPoint(sceneRoot, sceneJson.main);

  // Calculate scene size
  const parcels = sceneJson.scene?.parcels ?? [];
  const sizeMeters = calculateSceneSize(parcels);

  // Check for World configuration
  const isWorld = !!sceneJson.worldConfiguration;
  const worldName = sceneJson.worldConfiguration?.name as string | undefined;

  return {
    hasScene: true,
    sceneRoot,
    sceneJson,
    title: sceneJson.display?.title,
    description: sceneJson.display?.description,
    parcels,
    base: sceneJson.scene?.base,
    sizeMeters,
    parcelCount: parcels.length,
    main: sceneJson.main,
    entryPoint,
    sdkVersion,
    needsInstall: !hasNodeModules,
    isWorld,
    worldName,
    isLegacySdk6,
  };
}

/**
 * Format the scene context as a string for injection into the system prompt.
 */
export function formatSceneContext(ctx: SceneContext): string {
  if (!ctx.hasScene) {
    if (ctx.parseError) {
      return `## Current Project Status
**Error**: ${ctx.parseError}
The scene.json file exists but could not be parsed. Help the user fix it.`;
    }
    return `## Current Project Status
**No Decentraland scene detected** in the current directory.
You are in an empty folder. **You must run \`/init\` first** to scaffold the project with the official SDK template before writing any scene code. Never manually create scene.json, package.json, or tsconfig.json — \`/init\` generates the correct versions.
After \`/init\`, customize scene.json and src/index.ts based on what the user wants to build.`;
  }

  if (ctx.isLegacySdk6) {
    return `## Current Project Status
**Legacy SDK6 scene detected.** This scene uses the older SDK6 format.
OpenDCL supports SDK7 only. Suggest the user migrate to SDK7 or create a new SDK7 scene.
Migration guide: https://docs.decentraland.org/creator/sdk7/sdk7-migration-guide/`;
  }

  const lines: string[] = ["## Current Project"];

  if (ctx.title) lines.push(`- **Title**: ${ctx.title}`);
  if (ctx.description) lines.push(`- **Description**: ${ctx.description}`);
  if (ctx.sceneRoot) lines.push(`- **Root**: ${ctx.sceneRoot}`);
  if (ctx.sdkVersion) lines.push(`- **SDK Version**: @dcl/sdk@${ctx.sdkVersion}`);
  if (ctx.entryPoint) lines.push(`- **Entry Point**: ${ctx.entryPoint}`);
  if (ctx.main) lines.push(`- **Main (compiled)**: ${ctx.main}`);

  if (ctx.parcels && ctx.parcels.length > 0) {
    lines.push(`- **Parcels**: ${ctx.parcels.join(", ")} (${ctx.parcelCount} parcel${ctx.parcelCount !== 1 ? "s" : ""})`);
    if (ctx.base) lines.push(`- **Base Parcel**: ${ctx.base}`);
    if (ctx.sizeMeters) lines.push(`- **Scene Size**: ${ctx.sizeMeters.width}m x ${ctx.sizeMeters.depth}m`);
  }

  if (ctx.isWorld) {
    lines.push(`- **Deployment**: Decentraland World${ctx.worldName ? ` (${ctx.worldName})` : ""}`);
  }

  if (ctx.needsInstall) {
    lines.push("");
    lines.push("**Warning**: `node_modules/` not found. The user needs to run `npm install` before building.");
  }

  return lines.join("\n");
}
