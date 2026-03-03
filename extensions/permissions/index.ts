/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before dangerous bash commands or writes to
 * sensitive files. Blocks entirely in non-interactive mode.
 * Disable with --no-permissions flag (for CI/container environments).
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { classifyBashCommand, classifyFilePath, isOutsideCwd, OUTSIDE_CWD_REASON } from "./utils.js";
import { resolve } from "node:path";

type BlockResult = { block: true; reason: string };

function blockResult(reason: string, detail: string): BlockResult {
  return {
    block: true,
    reason: `Blocked: ${reason}\n${detail}\nUse --no-permissions to allow in non-interactive mode.`,
  };
}

function denyResult(reason: string): BlockResult {
  return { block: true, reason: `User denied: ${reason}` };
}

const CHOICES = ["Allow", "Always allow", "Deny"] as const;

const extension: ExtensionFactory = (pi) => {
  const sessionAllow = new Set<string>();
  const allowedPaths = new Set<string>();

  function isPathAllowed(resolvedPath: string): boolean {
    for (const allowed of allowedPaths) {
      if (resolvedPath === allowed || resolvedPath.startsWith(allowed + "/")) return true;
    }
    return false;
  }

  /**
   * Prompts the user for confirmation and handles their choice.
   * Returns a BlockResult to deny, or undefined to allow.
   */
  async function promptOrBlock(
    ctx: { hasUI: boolean; ui: { select: (title: string, options: string[]) => Promise<string | null> } },
    reason: string,
    detail: string,
    onAlways: () => void,
  ): Promise<BlockResult | undefined> {
    if (!ctx.hasUI) return blockResult(reason, detail);

    const choice = await ctx.ui.select(`${reason}\n${detail}`, [...CHOICES]);

    if (choice === "Always allow") { onAlways(); return; }
    if (choice === "Allow") return;
    return denyResult(reason);
  }

  pi.registerFlag("no-permissions", {
    description: "Disable permission gate (skip confirmation prompts for dangerous operations)",
    type: "boolean",
    default: false,
  });

  pi.on("tool_call", async (event, ctx) => {
    if (pi.getFlag("no-permissions") === true) return;

    const toolName = event.toolName as string;

    if (toolName === "bash") {
      const command = (event.input as { command?: string }).command ?? "";
      const reason = classifyBashCommand(command);
      if (!reason || sessionAllow.has(reason)) return;

      return promptOrBlock(ctx, reason, `Command: ${command}`, () => sessionAllow.add(reason));
    }

    if (toolName === "write" || toolName === "edit") {
      const filePath = (event.input as { path?: string }).path ?? "";
      const reason = filePath ? classifyFilePath(filePath, ctx.cwd) : null;
      if (!reason) return;

      if (reason === OUTSIDE_CWD_REASON) {
        const resolved = resolve(ctx.cwd, filePath);
        if (isPathAllowed(resolved)) return;

        return promptOrBlock(ctx, reason, `File: ${filePath}`, () => allowedPaths.add(resolved));
      }

      if (sessionAllow.has(reason)) return;

      return promptOrBlock(ctx, reason, `Path: ${filePath}`, () => sessionAllow.add(reason));
    }

    if (toolName === "read" || toolName === "grep" || toolName === "find" || toolName === "ls") {
      const filePath = (event.input as { path?: string }).path ?? "";
      if (!filePath) return;

      const resolved = resolve(ctx.cwd, filePath);
      const reason = isOutsideCwd(filePath, ctx.cwd);
      if (!reason) return;
      if (isPathAllowed(resolved)) return;

      return promptOrBlock(ctx, reason, `Path: ${filePath}`, () => allowedPaths.add(resolved));
    }
  });
};

export default extension;
