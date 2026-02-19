/**
 * Custom header extension for OpenDCL.
 * Replaces pi's default banner with OpenDCL branding.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8"));
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const extension: ExtensionFactory = (pi) => {
  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    const version = getVersion();

    ctx.ui.setHeader((_tui, theme) => ({
      render(_width: number): string[] {
        return [
          theme.bold(theme.fg("accent", "OpenDCL")) + theme.fg("dim", ` v${version}`) +
            theme.fg("dim", " — AI assistant for Decentraland SDK7"),
          theme.fg("dim", "/init to scaffold · /preview to start server · /tasks to manage · /plan for plan mode"),
        ];
      },
      invalidate() {},
    }));
  });
};

export default extension;
