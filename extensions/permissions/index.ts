/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before dangerous bash commands or writes to
 * sensitive files. Blocks entirely in non-interactive mode.
 * Disable with --no-permissions flag (for CI/container environments).
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { classifyBashCommand, classifyFilePath } from "./utils.js";

function blockResult(reason: string, detail: string): { block: true; reason: string } {
  return {
    block: true,
    reason: `Blocked: ${reason}\n${detail}\nUse --no-permissions to allow in non-interactive mode.`,
  };
}

function denyResult(reason: string): { block: true; reason: string } {
  return { block: true, reason: `User denied: ${reason}` };
}

const ALLOW = "Allow";
const ALWAYS = "Always allow";
const DENY = "Deny";

const extension: ExtensionFactory = (pi) => {
  const sessionAllow = new Set<string>();

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

      if (!ctx.hasUI) return blockResult(reason, `Command: ${command}`);

      const choice = await ctx.ui.select(
        `${reason}\nCommand: ${command}`,
        [ALLOW, ALWAYS, DENY],
      );

      if (choice === ALWAYS) { sessionAllow.add(reason); return; }
      if (choice === ALLOW) return;
      return denyResult(reason);
    }

    if (toolName === "write" || toolName === "edit") {
      const filePath = (event.input as { path?: string }).path ?? "";
      const reason = filePath ? classifyFilePath(filePath, ctx.cwd) : null;
      if (!reason || sessionAllow.has(reason)) return;

      if (!ctx.hasUI) return blockResult(reason, `Path: ${filePath}`);

      const choice = await ctx.ui.select(
        `${reason}\nFile: ${filePath}`,
        [ALLOW, ALWAYS, DENY],
      );

      if (choice === ALWAYS) { sessionAllow.add(reason); return; }
      if (choice === ALLOW) return;
      return denyResult(reason);
    }
  });
};

export default extension;
