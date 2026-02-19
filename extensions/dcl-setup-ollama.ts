/**
 * DCL Setup Ollama Extension
 *
 * Registers the /setup-ollama command that walks users through
 * model selection and configuration for a free local LLM setup.
 * On session start, nudges users who have no provider configured.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

interface OllamaProvider {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  models?: { id: string }[];
}

const API_KEY_ENV_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GOOGLE_API_KEY",
  "OPENROUTER_API_KEY",
];

export const OLLAMA_MODELS = [
  { id: "qwen2.5-coder:7b", label: "qwen2.5-coder:7b (Recommended — best coding quality, ~4GB)" },
  { id: "llama3.1:8b", label: "llama3.1:8b (Good general purpose, ~4.7GB)" },
  { id: "deepseek-coder-v2:16b", label: "deepseek-coder-v2:16b (Strong at code, ~8.9GB)" },
];

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const content = await readFile(path, "utf-8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

export async function writeModelsConfig(modelsPath: string, modelId: string): Promise<void> {
  const config = await readJsonFile<{ providers?: Record<string, unknown> }>(modelsPath, {});
  config.providers ??= {};

  const ollama = config.providers.ollama as OllamaProvider | undefined;
  if (ollama) {
    ollama.models ??= [];
    if (!ollama.models.some((m) => m.id === modelId)) {
      ollama.models.push({ id: modelId });
    }
  } else {
    config.providers.ollama = {
      baseUrl: "http://localhost:11434/v1",
      api: "openai-completions",
      apiKey: "ollama",
      models: [{ id: modelId }],
    };
  }

  await writeJsonFile(modelsPath, config);
}

export async function setDefaultModel(settingsPath: string, provider: string, modelId: string): Promise<void> {
  const settings = await readJsonFile<Record<string, unknown>>(settingsPath, {});

  settings.defaultProvider = provider;
  settings.defaultModel = modelId;

  await writeJsonFile(settingsPath, settings);
}

export async function isProviderConfigured(): Promise<boolean> {
  if (API_KEY_ENV_VARS.some((v) => process.env[v])) {
    return true;
  }

  const modelsPath = join(homedir(), ".opendcl", "agent", "models.json");
  const config = await readJsonFile<{ providers?: Record<string, unknown> }>(modelsPath, {});
  return config.providers != null && Object.keys(config.providers).length > 0;
}

/**
 * Run ollama commands through the user's login shell so the full PATH is used.
 * (pi.exec without shell won't find binaries added by installers to profile files.)
 */
function ollamaExec(pi: Parameters<ExtensionFactory>[0], args: string, timeout = 10000) {
  const shell = process.env.SHELL || "/bin/sh";
  return pi.exec(shell, ["-lc", `ollama ${args}`], { timeout }).catch(() => null);
}

const extension: ExtensionFactory = (pi) => {
  pi.on("session_start", async (_event, ctx) => {
    if (!(await isProviderConfigured())) {
      ctx.ui.notify(
        "Get started by running /setup-ollama (free, runs locally) or /login (Claude, OpenAI, etc.)",
        "warning",
      );
    }
  });

  pi.registerCommand("setup-ollama", {
    description: "Configure Ollama as your free local LLM provider",
    handler: async (_args, ctx) => {
      const configDir = join(homedir(), ".opendcl", "agent");

      const versionResult = await ollamaExec(pi, "--version");
      if (!versionResult || versionResult.code !== 0) {
        ctx.ui.notify("Ollama is not installed. Download it from https://ollama.com then run /setup-ollama again.", "warning");
        return;
      }

      const listResult = await ollamaExec(pi, "list");
      if (!listResult || listResult.code !== 0) {
        ctx.ui.notify("Ollama is installed but not running. Start it with 'ollama serve', then run /setup-ollama again.", "warning");
        return;
      }

      const selected = await ctx.ui.select(
        "Which model do you want to use?",
        OLLAMA_MODELS.map((m) => m.label),
      );
      if (!selected) {
        ctx.ui.notify("Setup cancelled.", "info");
        return;
      }

      const model = OLLAMA_MODELS.find((m) => m.label === selected);
      if (!model) {
        ctx.ui.notify("Invalid selection.", "error");
        return;
      }

      ctx.ui.notify(`Pulling ${model.id}... (this may take a few minutes)`, "info");
      const pullResult = await ollamaExec(pi, `pull ${model.id}`, 600000);
      if (!pullResult || pullResult.code !== 0) {
        ctx.ui.notify(`Failed to pull model: ${pullResult?.stderr || pullResult?.stdout || "unknown error"}`, "error");
        return;
      }
      ctx.ui.notify("Model ready.", "info");

      const modelsPath = join(configDir, "models.json");
      await writeModelsConfig(modelsPath, model.id);

      const settingsPath = join(configDir, "settings.json");
      await setDefaultModel(settingsPath, "ollama", model.id);

      ctx.ui.notify(
        `Ollama configured as your default provider.\n  Model: ${model.id}\n  You can switch models anytime with Ctrl+P`,
        "info",
      );
    },
  });
};

export default extension;
