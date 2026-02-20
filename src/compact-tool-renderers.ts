/**
 * Compact tool output renderers for built-in tools (write, read).
 *
 * Pi-coding-agent's built-in renderer shows verbose output: write shows 10 lines
 * of file content, read shows 10 lines of preview. This module provides compact
 * alternatives that reduce terminal noise when the agent writes/reads many files.
 *
 * These are wired in via a monkey-patch on InteractiveMode.getRegisteredToolDefinition
 * in src/index.ts — they provide renderCall/renderResult without replacing execution logic.
 */

import { Text } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";

/** Shorten absolute paths to tilde notation (mirrors pi's internal shortenPath) */
function shortenPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

/** Replace tabs with spaces for consistent rendering */
function replaceTabs(text: string): string {
  return text.replace(/\t/g, "    ");
}

/** Partial tool definition — only the fields ToolExecutionComponent checks */
interface CompactToolDef {
  name: string;
  renderCall?: (args: Record<string, unknown>, theme: Theme) => Text;
  renderResult?: (
    result: { content: Array<{ type: string; text?: string }>; details?: unknown },
    options: { expanded: boolean; isPartial: boolean },
    theme: Theme,
  ) => Text;
}

const READ_PREVIEW_LINES = 5;

const writeRenderer: CompactToolDef = {
  name: "write",
  renderCall(args, theme) {
    const rawPath = typeof args.path === "string" ? args.path : null;
    const content = typeof args.content === "string" ? args.content : null;
    const path = rawPath !== null ? shortenPath(rawPath) : null;
    const invalidArg = theme.fg("error", "[invalid arg]");

    let text =
      theme.fg("toolTitle", theme.bold("write")) +
      " " +
      (path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "..."));

    if (content !== null) {
      const lines = content.split("\n").length;
      const chars = content.length;
      text += theme.fg("muted", ` (${chars} chars, ${lines} lines)`);
    }

    return new Text(text, 0, 0);
  },
};

const readRenderer: CompactToolDef = {
  name: "read",
  renderCall(args, theme) {
    const rawPath = typeof args.path === "string" ? args.path : null;
    const path = rawPath !== null ? shortenPath(rawPath) : null;
    const offset = args.offset as number | undefined;
    const limit = args.limit as number | undefined;
    const invalidArg = theme.fg("error", "[invalid arg]");

    let pathDisplay =
      path === null ? invalidArg : path ? theme.fg("accent", path) : theme.fg("toolOutput", "...");

    if (offset !== undefined || limit !== undefined) {
      const startLine = offset ?? 1;
      const endLine = limit !== undefined ? startLine + limit - 1 : "";
      pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`);
    }

    return new Text(theme.fg("toolTitle", theme.bold("read")) + " " + pathDisplay, 0, 0);
  },
  renderResult(result, { expanded }, theme) {
    const textBlocks = result.content?.filter((c) => c.type === "text") || [];
    const output = textBlocks.map((c) => c.text || "").join("\n");
    if (!output) return new Text("", 0, 0);

    const lines = output.split("\n");

    const maxLines = expanded ? lines.length : READ_PREVIEW_LINES;
    const displayLines = lines.slice(0, maxLines);
    const remaining = lines.length - maxLines;

    let text = displayLines.map((line) => theme.fg("toolOutput", replaceTabs(line))).join("\n");

    if (remaining > 0) {
      text += theme.fg("muted", `\n... (${remaining} more lines, ctrl+o to expand)`);
    }

    const details = result.details as Record<string, unknown> | undefined;
    const truncation = details?.truncation as Record<string, unknown> | undefined;
    if (truncation?.truncated) {
      if (truncation.firstLineExceedsLimit) {
        text += "\n" + theme.fg("warning", "[First line exceeds size limit]");
      } else if (truncation.truncatedBy === "lines") {
        text +=
          "\n" +
          theme.fg(
            "warning",
            `[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines]`,
          );
      } else {
        text += "\n" + theme.fg("warning", `[Truncated: ${truncation.outputLines} lines shown]`);
      }
    }

    return new Text(text, 0, 0);
  },
};

const renderers = new Map<string, CompactToolDef>([
  ["write", writeRenderer],
  ["read", readRenderer],
]);

/**
 * Returns a partial tool definition with compact renderCall/renderResult
 * for supported built-in tools, or undefined for tools we don't override.
 */
export function getCompactToolDefinition(toolName: string): CompactToolDef | undefined {
  return renderers.get(toolName);
}
