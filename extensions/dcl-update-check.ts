/**
 * Update check extension for OpenDCL.
 * On session start, checks npm registry for a newer version and notifies the user.
 * Fails silently on network errors or if the package isn't published yet.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const NPM_REGISTRY_URL = "https://registry.npmjs.org/@dcl-regenesislabs/opendcl/latest";
const FETCH_TIMEOUT_MS = 5000;

/** Read the installed version from package.json. */
export function getInstalledVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/** Fetch the latest published version from npm registry. */
export async function fetchLatestVersion(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(NPM_REGISTRY_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    return data.version || null;
  } catch {
    return null;
  }
}

/** Compare two semver strings. Returns true if latest is newer than current. */
export function isNewerVersion(current: string, latest: string): boolean {
  const cur = current.split(".").map((n) => parseInt(n, 10) || 0);
  const lat = latest.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(cur.length, lat.length);
  for (let i = 0; i < len; i++) {
    const c = cur[i] || 0;
    const l = lat[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

const extension: ExtensionFactory = (pi) => {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    // Fire-and-forget: don't block session startup
    fetchLatestVersion().then((latest) => {
      if (latest && isNewerVersion(getInstalledVersion(), latest)) {
        ctx.ui.notify(`OpenDCL v${latest} is available. Run: npm install -g @dcl-regenesislabs/opendcl`, "info");
      }
    });
  });
};

export default extension;
