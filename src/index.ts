#!/usr/bin/env node

/**
 * OpenDCL — AI coding assistant for Decentraland SDK7 scene development.
 *
 * Wraps pi-coding-agent with Decentraland-specific system prompt, skills, and extensions.
 */

import { main, InteractiveMode } from "@mariozechner/pi-coding-agent";
import { isDev } from "./utils.js";
import { getCompactToolDefinition } from "./compact-tool-renderers.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageDir = join(__dirname, "..");

// Use ~/.opendcl/agent/ for settings, sessions, etc. (separate from pi's ~/.pi/agent/)
const agentDir = join(homedir(), ".opendcl", "agent");
if (!process.env.PI_CODING_AGENT_DIR) {
  process.env.PI_CODING_AGENT_DIR = agentDir;
}

// Ensure default settings exist (hide thinking blocks for a cleaner UI)
const settingsPath = join(agentDir, "settings.json");
if (!existsSync(settingsPath)) {
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(settingsPath, JSON.stringify({ hideThinkingBlock: true }, null, 2) + "\n");
}

// Build args: start with user's CLI args
const args = process.argv.slice(2);

// Inject DCL system prompt (strip YAML frontmatter, resolve context/ paths to absolute)
if (!args.includes("--system-prompt")) {
  const raw = readFileSync(join(packageDir, "prompts/system.md"), "utf-8");
  const contextDir = join(packageDir, "context");
  const systemPrompt = raw
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/context\/([\w-]+\.md)/g, (_, filename) => join(contextDir, filename))
    .trim();
  args.push("--system-prompt", systemPrompt);
}

// Load our extensions
const extDir = join(packageDir, "extensions");
const extensions = [
  "dcl-context.ts",
  "dcl-preview.ts",
  "dcl-init.ts",
  "dcl-deploy.ts",
  "dcl-setup.ts",
  "dcl-validate.ts",
  "dcl-header.ts",
  "dcl-update-check.ts",
  "dcl-status.ts",
  "dcl-tasks.ts",
  "dcl-asset-path.ts",
  "dcl-screenshot.ts",
  "dcl-editor-save.ts",
];

for (const ext of extensions) {
  args.push("-e", join(extDir, ext));
}
args.push("-e", join(extDir, "plan-mode/index.ts"));
args.push("-e", join(extDir, "permissions/index.ts"));

// Load all skill directories
args.push("--skill", join(packageDir, "skills"));

// Load prompt templates (review, explain — NOT system.md since that's the system prompt)
args.push("--prompt-template", join(packageDir, "prompts/review.md"));
args.push("--prompt-template", join(packageDir, "prompts/explain.md"));

// Suppress pi's built-in update notification in npm installs (it tells users to
// install pi directly). In local dev (ENV=dev) we keep it visible.
if (!isDev()) {
  process.env.PI_SKIP_VERSION_CHECK = "1";
}

// Suppress pi's "What's New" changelog notification on startup — it shows pi's
// own version/changes, which confuses OpenDCL users.
(InteractiveMode.prototype as any).getChangelogForDisplay = function () {
  return undefined;
};

// Override pi's built-in /changelog command — it shows pi's CHANGELOG.md,
// not OpenDCL's. The command is hardcoded in handleEditorSubmit before extension
// commands, so monkey-patching is the only way to intercept it.
const opendclVersion = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8")).version;
(InteractiveMode.prototype as any).handleChangelogCommand = function () {
  (this as any).showStatus(
    `OpenDCL v${opendclVersion} — https://github.com/dcl-regenesislabs/opendcl/releases/tag/${opendclVersion}`,
  );
};

// Compact tool output — override built-in write/read renderers to reduce terminal noise.
// When a built-in tool has no custom renderCall/renderResult, pi shows verbose output.
// By returning compact renderers from getRegisteredToolDefinition, the ToolExecutionComponent
// uses them instead (see shouldUseBuiltInRenderer() in tool-execution.js).
const _getToolDef = (InteractiveMode.prototype as any).getRegisteredToolDefinition;
(InteractiveMode.prototype as any).getRegisteredToolDefinition = function (toolName: string) {
  const original = _getToolDef.call(this, toolName);
  if (original) return original;
  return getCompactToolDefinition(toolName);
};

main(args).catch((err) => {
  console.error("OpenDCL fatal error:", err);
  process.exit(1);
});
