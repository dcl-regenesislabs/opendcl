#!/usr/bin/env node

/**
 * OpenDCL — AI coding assistant for Decentraland SDK7 scene development.
 *
 * Wraps pi-coding-agent with Decentraland-specific system prompt, skills, and extensions.
 */

import { main } from "@mariozechner/pi-coding-agent";
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

// Inject DCL system prompt (read from prompts/system.md, strip YAML frontmatter)
if (!args.includes("--system-prompt")) {
  const raw = readFileSync(join(packageDir, "prompts/system.md"), "utf-8");
  const systemPrompt = raw.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  args.push("--system-prompt", systemPrompt);
}

// Load our extensions
const extDir = join(packageDir, "extensions");
for (const ext of ["dcl-context.ts", "dcl-preview.ts", "dcl-init.ts", "dcl-deploy.ts", "dcl-validate.ts", "dcl-header.ts", "dcl-tasks.ts"]) {
  args.push("-e", join(extDir, ext));
}
args.push("-e", join(extDir, "plan-mode/index.ts"));

// Load all skill directories
args.push("--skill", join(packageDir, "skills"));

// Load prompt templates (review, explain — NOT system.md since that's the system prompt)
args.push("--prompt-template", join(packageDir, "prompts/review.md"));
args.push("--prompt-template", join(packageDir, "prompts/explain.md"));

main(args).catch((err) => {
  console.error("OpenDCL fatal error:", err);
  process.exit(1);
});
