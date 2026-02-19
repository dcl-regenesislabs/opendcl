/**
 * Custom header extension for OpenDCL.
 * Shows a block-character "Decentraland" ASCII art header with version
 * and working directory. Falls back to a compact text header on narrow terminals.
 * Also auto-sets quietStartup in user settings to suppress raw file path listing.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Block-character "Decentraland" art — Small Mono 12 figlet style, 7 lines. */
const HEADER_ART: string[] = [
  "▗▄▄                                     ▗▄▖               ▗▖",
  "▐▛▀█                      ▐▌            ▝▜▌               ▐▌",
  "▐▌ ▐▌ ▟█▙  ▟██▖ ▟█▙ ▐▙██▖▐███  █▟█▌ ▟██▖ ▐▌   ▟██▖▐▙██▖ ▟█▟▌",
  "▐▌ ▐▌▐▙▄▟▌▐▛  ▘▐▙▄▟▌▐▛ ▐▌ ▐▌   █▘   ▘▄▟▌ ▐▌   ▘▄▟▌▐▛ ▐▌▐▛ ▜▌",
  "▐▌ ▐▌▐▛▀▀▘▐▌   ▐▛▀▀▘▐▌ ▐▌ ▐▌   █   ▗█▀▜▌ ▐▌  ▗█▀▜▌▐▌ ▐▌▐▌ ▐▌",
  "▐▙▄█ ▝█▄▄▌▝█▄▄▌▝█▄▄▌▐▌ ▐▌ ▐▙▄  █   ▐▙▄█▌ ▐▙▄ ▐▙▄█▌▐▌ ▐▌▝█▄█▌",
  "▝▀▀   ▝▀▀  ▝▀▀  ▝▀▀ ▝▘ ▝▘  ▀▀  ▀    ▀▀▝▘  ▀▀  ▀▀▝▘▝▘ ▝▘ ▝▀▝▘",
];

/** Minimum terminal width to show the full block-character art. */
const MIN_ART_WIDTH = 65;

export function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Reads skill directories and extracts the `name` field
 * from each SKILL.md YAML frontmatter.
 */
export function getSkillNames(skillsDir: string): string[] {
  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const names: string[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = join(skillsDir, entry.name, "SKILL.md");
      try {
        const content = readFileSync(skillPath, "utf-8");
        const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
        if (match) {
          const nameMatch = match[1].match(/^name:\s*(.+)$/m);
          if (nameMatch) {
            names.push(nameMatch[1].trim());
            continue;
          }
        }
        // Fallback to directory name if frontmatter parsing fails
        names.push(entry.name);
      } catch {
        // Skip skills that can't be read
      }
    }

    return names.sort();
  } catch {
    return [];
  }
}

/**
 * Ensures quietStartup is set in the user's settings file.
 * Creates the settings file if it doesn't exist.
 * If quietStartup is already set (to any value), leaves it alone.
 */
export function ensureQuietStartup(settingsPath: string): void {
  try {
    const dir = dirname(settingsPath);
    mkdirSync(dir, { recursive: true });

    if (existsSync(settingsPath)) {
      const raw = readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw);
      if (!("quietStartup" in settings)) {
        settings.quietStartup = true;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
      }
    } else {
      writeFileSync(settingsPath, JSON.stringify({ quietStartup: true }, null, 2) + "\n", "utf-8");
    }
  } catch {
    // Settings write failure should not break startup
  }
}

/** Shorten an absolute path by replacing the user's home directory with `~`. */
export function shortenPath(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(home + "/")) return "~" + path.slice(home.length);
  return path;
}

const extension: ExtensionFactory = (pi) => {
  pi.on("session_start", async (_event, ctx) => {
    // Auto-set quietStartup in user settings
    const settingsPath = join(homedir(), ".opendcl", "agent", "settings.json");
    ensureQuietStartup(settingsPath);

    if (!ctx.hasUI) return;

    const version = getVersion();
    const cwd = ctx.cwd;

    ctx.ui.setHeader((_tui, theme) => ({
      render(width: number): string[] {
        if (width >= MIN_ART_WIDTH) {
          const lines: string[] = [];

          // Block-character art in accent color
          for (const line of HEADER_ART) {
            lines.push(theme.fg("accent", line));
          }

          // "by RegenesisLabs" right-aligned under the art
          const tag = "by RegenesisLabs";
          const artWidth = HEADER_ART[2].length; // widest line
          const pad = Math.max(0, artWidth - tag.length);
          lines.push(" ".repeat(pad) + theme.fg("dim", tag));

          // Blank line
          lines.push("");

          // Version line
          lines.push(
            theme.bold(theme.fg("accent", "OpenDCL")) +
              theme.fg("dim", ` v${version} — AI assistant for Decentraland SDK7`),
          );

          // Working directory
          lines.push(theme.fg("dim", shortenPath(cwd)));

          return lines;
        }

        // Narrow terminal fallback — compact 2-line header
        return [
          theme.bold(theme.fg("accent", "OpenDCL")) +
            theme.fg("dim", ` v${version} — AI assistant for Decentraland SDK7`),
          theme.fg("dim", shortenPath(cwd)),
        ];
      },
      invalidate() {},
    }));
  });
};

export default extension;
