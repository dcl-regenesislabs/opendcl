/**
 * Update check extension for OpenDCL.
 * On session start, checks npm registry for a newer version and notifies the user.
 * Fails silently on network errors or if the package isn't published yet.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FETCH_TIMEOUT_MS = 5000;
const PACKAGE_JSON_PATH = join(__dirname, "..", "package.json");

/** Read and parse the project's package.json. */
function readPackageJson(): { name?: string; version?: string } {
  try {
    return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
  } catch {
    return {};
  }
}

/** Read the package name from package.json. */
export function getPackageName(): string {
  return readPackageJson().name || "@dcl-regenesislabs/opendcl";
}

/** Read the installed version from package.json. */
export function getInstalledVersion(): string {
  return readPackageJson().version || "0.0.0";
}

/** Fetch the latest published version from npm registry. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const registryUrl = `https://registry.npmjs.org/${getPackageName()}/latest`;
    const res = await fetch(registryUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version || null;
  } catch {
    return null;
  }
}

/** Strip pre-release and build metadata from a version string (e.g. "1.0.0-beta" -> "1.0.0"). */
function stripPreRelease(version: string): string {
  return version.replace(/[-+].*$/, "");
}

/** Compare two semver strings. Returns true if latest is newer than current. */
export function isNewerVersion(current: string, latest: string): boolean {
  const currentBase = stripPreRelease(current);
  const latestBase = stripPreRelease(latest);

  const currentParts = currentBase.split(".").map((n) => parseInt(n, 10) || 0);
  const latestParts = latestBase.split(".").map((n) => parseInt(n, 10) || 0);
  const length = Math.max(currentParts.length, latestParts.length);

  for (let i = 0; i < length; i++) {
    const currentPart = currentParts[i] || 0;
    const latestPart = latestParts[i] || 0;
    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  // Base versions equal: pre-release < stable (e.g., 0.1.0-snapshot < 0.1.0)
  const currentHasPreRelease = current !== currentBase;
  const latestHasPreRelease = latest !== latestBase;
  return currentHasPreRelease && !latestHasPreRelease;
}

const extension: ExtensionFactory = (pi) => {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Fire-and-forget: don't block session startup
    fetchLatestVersion().then((latest) => {
      if (latest && isNewerVersion(getInstalledVersion(), latest)) {
        ctx.ui.notify(`OpenDCL v${latest} is available. Run: npm install -g ${getPackageName()}`, "warning");
      }
    });
  });
};

export default extension;
