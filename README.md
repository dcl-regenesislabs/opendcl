# OpenDCL 🧪

[![CI](https://github.com/dcl-regenesislabs/opendcl/actions/workflows/ci.yaml/badge.svg)](https://github.com/dcl-regenesislabs/opendcl/actions/workflows/ci.yaml)

Build Decentraland scenes with AI. Describe what you want in plain language — OpenDCL handles the SDK7 code, ECS architecture, and deployment for you.

OpenDCL is a terminal-based AI agent that knows Decentraland inside out: every component, every pattern, every constraint. Whether you're a first-time creator or a seasoned developer, you go from idea to running scene in minutes instead of hours.

## Why OpenDCL?

Building a Decentraland scene today means learning SDK7, an entity-component-system architecture, TypeScript, 60+ ECS components, parcel size limits, a QuickJS sandbox with no Node.js APIs, and a deployment pipeline. That's a steep learning curve — and it slows down even experienced developers on repetitive tasks.

OpenDCL puts an AI assistant in your terminal that already knows all of this. You describe what you want, and it writes correct, deployable scene code. It validates TypeScript as it goes, knows which 3D assets are freely available, and handles multiplayer sync, UI, animations, and deployment config without you needing to look anything up.

The result: **more creators building more scenes, faster.**

## Use Cases

- **Beginners & non-developers** — "Build me a gallery with clickable paintings." Go from zero to a working scene without writing code manually.
- **Experienced developers** — Skip the boilerplate. Let the agent handle multiplayer sync, UI scaffolding, and deployment config while you focus on creative decisions.
- **Teams & studios** — Prototype scene concepts quickly and iterate before committing full dev resources.
- **Land owners & brands** — Build and update experiences on your LAND without hiring a dedicated development team.
- **Event organizers** — Spin up interactive stages, gathering areas, and event spaces fast.
- **Hackathons & game jams** — Go from concept to deployed scene in hours instead of days.

## Features

- **Branded header** — on startup, displays a block-character "Decentraland" ASCII art banner with version and working directory. Falls back to a compact text header on narrow terminals
- **Multi-provider LLM support** — works with Claude, OpenAI, Google, Ollama (free/local), OpenRouter, and more
- **Scene-aware** — automatically detects your project's `scene.json`, SDK version, and entry points
- **19 built-in skills** — scaffolding, 3D models, interactivity, UI, animations, multiplayer, authoritative server, audio/video, deployment (Genesis City & Worlds), optimization, camera control, lighting, player/avatar, NFT/blockchain, advanced rendering, advanced input, scene runtime, visual feedback
- **Integrated commands** — `/init` to scaffold, `/preview` to launch the dev server, `/tasks` to manage running processes, `/review` to audit code
- **TypeScript validation** — catches type errors immediately after writing code
- **Free asset catalogs** — 2,700+ Creator Hub 3D models, 900+ CC0-licensed models, and 50 audio files the agent proactively suggests when building scenes
- **Permission gate** — prompts for confirmation before destructive bash commands, writes to sensitive files, or any file access outside the working directory
- **Compact tool output** — write shows path + size instead of file content, read shows a 5-line preview instead of 10
- **Session persistence** — pick up where you left off across sessions

## Quick Start

```bash
# Install
npm install -g @dcl-regenesislabs/opendcl

# Run in any directory
opendcl
```

On first run, type `/setup` to configure a cloud API provider (Anthropic, OpenAI, Google, etc.) or `/setup-ollama` to install [Ollama](https://ollama.com/) and use a free local model.

### In an Empty Folder

```
$ opendcl
> Create a medieval tavern scene with a bar, tables, and a fireplace
```

OpenDCL will scaffold `scene.json`, `package.json`, `tsconfig.json`, and `src/index.ts` with your scene.

### In an Existing Scene

```
$ cd my-scene/
$ opendcl
> Add a click handler to the door that opens it with an animation
```

OpenDCL reads your scene context and modifies existing code without overwriting it.

## Use with Any AI Agent

Install just the skills into your preferred AI coding agent — no opendcl installation required:

```bash
# Install all Decentraland skills (Claude Code, Cursor, Codex, Windsurf, and 35+ more)
npx skills add dcl-regenesislabs/opendcl

# List available skills first
npx skills add dcl-regenesislabs/opendcl --list

# Install specific skills only
npx skills add dcl-regenesislabs/opendcl --skill create-scene --skill multiplayer-sync

# Install globally (available in all projects)
npx skills add dcl-regenesislabs/opendcl -g
```

This uses the open [skills](https://github.com/vercel-labs/skills) CLI to copy SKILL.md files into your agent's skills directory.

> **Note:** The full OpenDCL agent adds auto TypeScript validation, scene context detection, and slash commands (`/preview`, `/init`, `/deploy`) on top of these skills.

## Commands

| Command | Description |
|---------|-------------|
| `/setup` | Configure a cloud API provider (Anthropic, OpenAI, Google, etc.) |
| `/setup-ollama` | Install Ollama and configure a free local LLM model |
| `/init` | Scaffold a new Decentraland scene in the current directory |
| `/preview` | Start the Bevy-web preview server and open the scene in browser |
| `/deploy` | Deploy the scene to Genesis City or a World (auto-detects from scene.json) |
| `/tasks` | Interactively manage running background processes (preview server, etc.) |
| `/review` | Review scene code for quality, performance, and SDK7 best practices |
| `/explain <concept>` | Explain a Decentraland SDK7 concept (e.g., `/explain tweens`) |

The agent also has a `screenshot` tool it can call automatically to see the running preview. On first use it asks for your permission to open a headless browser. The browser stays open for the entire session — no repeated logins.

## Skills

OpenDCL loads domain-specific skills on demand based on what you're asking:

| Skill | Triggered when you want to... |
|-------|-------------------------------|
| `create-scene` | Start a new project, scaffold files |
| `add-3d-models` | Load .glb models, browse free asset catalog |
| `add-interactivity` | Add click handlers, hover effects, triggers |
| `build-ui` | Create HUDs, menus, buttons with React-ECS |
| `animations-tweens` | Animate objects, play GLTF animations |
| `multiplayer-sync` | Sync state between players |
| `authoritative-server` | Server-authoritative multiplayer with anti-cheat, storage, env vars |
| `audio-video` | Add sounds, music, video screens |
| `deploy-scene` | Publish to Genesis City (LAND-based) |
| `deploy-worlds` | Publish to a World (DCL NAME or ENS domain) |
| `optimize-scene` | Fix performance, stay within limits |
| `camera-control` | Switch camera modes, cinematic cameras, cutscenes |
| `lighting-environment` | Add lights, shadows, day/night cycle, glow effects |
| `player-avatar` | Player data, emotes, attachments, NPC avatars |
| `nft-blockchain` | Display NFTs, wallet checks, smart contracts |
| `advanced-rendering` | Billboards, 3D text, materials, transparency |
| `advanced-input` | Cursor state, movement restriction, WASD patterns |
| `scene-runtime` | Async tasks, fetch, timers, realm info, restricted actions, testing |
| `visual-feedback` | Use the screenshot tool to see your scene, verify changes, iterate visually |

## How It Works

OpenDCL is built on [pi-coding-agent](https://github.com/badlogic/pi-mono), the agent engine behind [OpenClaw](https://github.com/openclaw/openclaw). It adds Decentraland-specific:

- **System prompt** with SDK7 architecture knowledge (ECS, QuickJS sandbox, parcel constraints)
- **Extensions** that detect your project, inject context, validate TypeScript, and provide slash commands
- **Skills** with detailed guides for every common scene development task
- **Reference docs** (SDK cheat sheet, component tables, 3D asset and audio catalogs)

The agent has full access to standard coding tools (read, write, edit, bash, grep, find) and uses them to understand and modify your scene code.

## Project Structure

```
opendcl/
├── src/
│   ├── index.ts              # CLI entry point
│   └── scene-context.ts      # Scene detection & context formatting
├── extensions/
│   ├── dcl-context.ts        # Auto-detect scene, inject metadata
│   ├── dcl-init.ts           # /init command
│   ├── dcl-preview.ts        # /preview command
│   ├── dcl-deploy.ts         # /deploy command
│   ├── dcl-setup.ts          # /setup command (cloud API provider config)
│   ├── dcl-setup-ollama.ts   # /setup-ollama command (Ollama setup wizard)
│   ├── dcl-status.ts         # Thinking/streaming status (elapsed time + tokens)
│   ├── dcl-update-check.ts   # Checks npm for newer OpenDCL versions
│   ├── dcl-validate.ts       # Post-write TypeScript validation
│   ├── dcl-screenshot.ts      # screenshot tool (headless Chrome, persistent browser)
│   ├── dcl-tasks.ts          # /tasks command (process manager)
│   ├── process-registry.ts   # Shared background process registry
│   └── permissions/           # Permission gate for dangerous operations
├── skills/                   # 19 SKILL.md files (domain expertise)
├── prompts/                  # System prompt + command templates
├── context/                  # SDK7 reference docs + asset catalog
└── tests/                    # Vitest test suites
```

## Development

```bash
# Clone and install
git clone https://github.com/dcl-regenesislabs/opendcl.git
cd opendcl
npm install

# Build
npm run build

# Run locally
node dist/index.js

# Run tests
npm test

# Watch mode (rebuild on changes)
npm run dev
```

### Testing

Tests are organized into two tiers:

- **Unit tests** (`tests/unit/`) — static analysis of file contents, frontmatter, and patterns
- **Integration tests** (`tests/integration/`) — dynamic imports, mock registration, cross-extension wiring, and process lifecycle verification

Integration tests catch wiring bugs (e.g., referencing a nonexistent extension file in `index.ts`) that static analysis alone would miss.

### Adding a Skill

Skills are markdown files — no code changes needed:

1. Create `skills/my-skill/SKILL.md`
2. Add frontmatter with `name` and `description`
3. Write the instructions the agent should follow

```markdown
---
name: my-skill
description: Brief description of when this skill should be used
---

# My Skill

Instructions for the agent...
```

The `description` field determines when the agent loads the skill. Make it specific about the user intent it covers.

### Adding Context

Drop a `.md` file in `context/` and reference it from your skills. The agent reads context files on demand to avoid bloating the context window.

## LLM Providers

OpenDCL supports any provider compatible with pi-coding-agent:

| Provider | API Key Env Var | Notes |
|----------|----------------|-------|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | Best quality |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, o1, etc. |
| Google | `GOOGLE_API_KEY` | Gemini models |
| Ollama | — | Free, runs locally |
| OpenRouter | `OPENROUTER_API_KEY` | Access to many models |

Set the environment variable or enter the key on first run. Switch models anytime with `Ctrl+P`.

## Requirements

- Node.js >= 18
- npm

## Contributing

Contributions are welcome! The easiest way to contribute is by adding or improving skills:

1. Fork the repository
2. Create a new skill in `skills/<name>/SKILL.md`
3. Test that the skill loads: `npm test`
4. Submit a pull request

For bugs and feature requests, please [open an issue](https://github.com/dcl-regenesislabs/opendcl/issues).

## License

Apache-2.0
