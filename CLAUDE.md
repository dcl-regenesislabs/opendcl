# OpenDCL — Project Guide for AI Assistants

## What This Is

OpenDCL is a standalone AI coding agent CLI for Decentraland SDK7 scene development. It wraps `@mariozechner/pi-coding-agent` (the engine behind OpenClaw) with Decentraland-specific extensions, skills, prompts, and reference documentation.

## Architecture

```
src/index.ts          → Calls pi-coding-agent main(), delegates everything
extensions/*.ts       → Auto-loaded by pi via "pi.extensions" in package.json
skills/*/SKILL.md     → Auto-loaded by pi via "pi.skills" in package.json
prompts/*.md          → Auto-loaded by pi via "pi.prompts" in package.json
context/*.md          → SDK reference docs, read on-demand by the agent (not auto-loaded)
```

The `piConfig` field in `package.json` sets the branding:
- `name: "opendcl"` → CLI name, displayed in TUI
- `configDir: ".opendcl"` → user config directory (~/.opendcl/)

## Pi-Coding-Agent API

Extensions export an `ExtensionFactory` as default export:

```typescript
import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

const extension: ExtensionFactory = (pi) => {
  // pi.on(event, handler)        — subscribe to lifecycle events
  // pi.registerCommand(name, {}) — register /slash commands
  // pi.registerTool(definition)  — register LLM-callable tools
  // pi.exec(cmd, args, opts)     — run shell commands
  // pi.sendMessage(msg, opts)    — send messages to agent context
};

export default extension;
```

Key events used by our extensions:
- `before_agent_start` — modify system prompt (dcl-context uses this)
- `tool_result` — react after tool execution (dcl-validate uses this)
- `session_shutdown` — cleanup on exit (dcl-tasks uses this)

Skills use YAML frontmatter:
```markdown
---
name: skill-name
description: When to load this skill (drives LLM selection)
---
# Instructions for the agent...
```

`{baseDir}` in skill content is replaced with the skill's directory path at runtime.

Prompt templates use the same frontmatter format. `$@` = all user args, `$1` = first arg.

## Extensions

| File | Purpose | Trigger |
|------|---------|---------|
| `dcl-context.ts` | Injects scene metadata into system prompt | `before_agent_start` |
| `dcl-preview.ts` | `/preview` → starts dev server | `registerCommand` |
| `dcl-init.ts` | `/init` → scaffolds new scene | `registerCommand` |
| `dcl-validate.ts` | Runs `tsc --noEmit` after .ts writes | `tool_result` |
| `dcl-deploy.ts` | `/deploy` → deploys to Genesis City or World | `registerCommand` |
| `dcl-tasks.ts` | `/tasks` → interactive process manager | `registerCommand` |
| `process-registry.ts` | Shared background process registry | Module export |

## Skills (11)

create-scene, add-3d-models, add-interactivity, build-ui, animations-tweens,
multiplayer-sync, audio-video, deploy-scene, deploy-worlds, optimize-scene, smart-items

Adding a skill = creating `skills/<name>/SKILL.md`. No code changes needed.

## Context Files

Files in `context/` are SDK reference documentation the agent reads on demand:
- `sdk7-complete-reference.md` — comprehensive SDK7 docs (87KB)
- `sdk7-examples.md` — code examples and patterns
- `components-reference.md` — all 60+ ECS components with fields
- `open-source-3d-assets.md` — free CC0 3D model catalog

These are NOT auto-loaded into the prompt. Skills reference them so the agent reads them when relevant.

## Testing

```bash
npm test          # run all tests
npm run test:watch # watch mode
```

- **Framework**: Vitest, 12 test files
- **Fixtures**: `tests/fixtures/` — valid-scene, minimal-scene, broken-scene, no-node-modules, sdk6-scene
- **Scene context**: tested with real fixture directories + tmpdir for edge cases (BOM, unicode, large scenes)
- **Skills/extensions**: validated for correct file structure, frontmatter, and content patterns

## Build & Run

```bash
npm run build     # tsc → dist/
npm run dev       # tsc --watch
npm run lint      # tsc --noEmit
node dist/index.js # run locally
```

## Conventions

- Extensions are plain TypeScript files in `extensions/`, NOT compiled through tsconfig (pi loads them directly)
- Skills are pure markdown — no code, just instructions for the agent
- Context files are reference material, not injected into prompts automatically
- The preview command uses `--bevy-web` flag for the dev server
- Scene context detection walks up directories to find `scene.json` (supports running from subdirectories)
- Validation is debounced (2s) and has a 30s timeout to avoid blocking

## Decentraland SDK Reference

- Scene templates: `https://github.com/decentraland/sdk7-scene-template`
- AI context source: GitHub API `decentraland/documentation/contents/ai-sdk-context`
- SDK commands: `npx @dcl/sdk-commands [init|start|build|deploy]`
- ECS components: defined in `@dcl/ecs/src/components/generated/global.gen.ts`
- Runtime: sandboxed QuickJS — no Node.js APIs (fs, http, etc.)
- Each parcel: 16m x 16m x 20m height
