/**
 * DCL Setup Ollama Extension
 *
 * Registers the /setup-ollama command that walks users through
 * model selection and configuration for a free local LLM setup.
 * On session start, nudges users who have no provider configured.
 *
 * FEATURE FLAG: Set OPENDCL_ENABLE_OLLAMA_SETUP=1 to enable this command.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";

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
  { id: "qwen2.5-coder:32b", label: "qwen2.5-coder:32b (Recommended — best coding benchmarks, ~18GB)" },
  { id: "qwen3-coder:30b", label: "qwen3-coder:30b (Latest Alibaba coder, 256K context, ~19GB)" },
  { id: "devstral:24b", label: "devstral:24b (Mistral coding agent model, ~14GB)" },
  { id: "glm-4.7-flash", label: "glm-4.7-flash (Reasoning + code generation, ~25GB)" },
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

  const configDir = join(homedir(), ".opendcl", "agent");

  const modelsConfig = await readJsonFile<{ providers?: Record<string, unknown> }>(join(configDir, "models.json"), {});
  if (modelsConfig.providers != null && Object.keys(modelsConfig.providers).length > 0) {
    return true;
  }

  const authConfig = await readJsonFile<Record<string, unknown>>(join(configDir, "auth.json"), {});
  return Object.keys(authConfig).length > 0;
}

export function parseOllamaList(output: string): string[] {
  const lines = output.split(/\r?\n/).filter((l) => l.trim());
  // Skip header line (starts with "NAME")
  const dataLines = lines.filter((l) => !l.startsWith("NAME"));
  return dataLines
    .map((l) => l.split(/\s+/)[0])
    .filter(Boolean)
    .map((name) => name.replace(/:latest$/, ""));
}

export async function removeOllamaModel(
  modelsPath: string,
  settingsPath: string,
  modelId: string,
): Promise<void> {
  const config = await readJsonFile<{ providers?: Record<string, unknown> }>(modelsPath, {});
  const ollama = config.providers?.ollama as OllamaProvider | undefined;
  if (ollama?.models) {
    ollama.models = ollama.models.filter((m) => m.id !== modelId);
    if (ollama.models.length === 0) {
      delete config.providers!.ollama;
    }
    await writeJsonFile(modelsPath, config);
  }

  const settings = await readJsonFile<Record<string, unknown>>(settingsPath, {});
  if (settings.defaultProvider === "ollama" && settings.defaultModel === modelId) {
    delete settings.defaultProvider;
    delete settings.defaultModel;
    await writeJsonFile(settingsPath, settings);
  }
}

/**
 * Run ollama commands through the user's login shell so the full PATH is used.
 * (pi.exec without shell won't find binaries added by installers to profile files.)
 */
function ollamaExec(pi: Parameters<ExtensionFactory>[0], args: string, timeout = 10000) {
  const shell = process.env.SHELL || "/bin/sh";
  return pi.exec(shell, ["-lc", `ollama ${args}`], { timeout }).catch(() => null);
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, "");
}

/**
 * Extract a clean, human-readable progress line from raw ollama pull output.
 * Ollama outputs ANSI-heavy terminal UI — this strips escape codes and
 * picks the most informative line (percentage progress > phase labels).
 */
export function extractPullProgress(raw: string): string | null {
  const clean = stripAnsi(raw);
  const lines = clean.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  // Prefer the line with download percentage (e.g. "pulling abc123:  45%  8 GB/18 GB  12 MB/s")
  const progress = lines.findLast((l) => /\d+%/.test(l));
  if (progress) return progress;
  // Fall back to phase lines like "pulling manifest", "verifying sha256 digest"
  const phase = lines.findLast((l) => /^(pulling|verifying|writing|success)/.test(l));
  return phase ?? null;
}

/**
 * Pull a model with streaming progress via spawn.
 * Throttles notifications to avoid UI spam (one update every 2 seconds max).
 */
export function ollamaPull(
  modelId: string,
  onProgress: (line: string) => void,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const shell = process.env.SHELL || "/bin/sh";
    const child = spawn(shell, ["-lc", `ollama pull ${modelId}`], {
      stdio: "pipe",
    });

    let lastNotify = 0;
    let lastLine = "";
    let errorOutput = "";

    function handleData(data: Buffer): void {
      const text = data.toString();
      errorOutput += text;
      const line = extractPullProgress(text);
      if (!line) return;
      lastLine = line;
      const now = Date.now();
      if (now - lastNotify >= 2000) {
        lastNotify = now;
        onProgress(line);
      }
    }

    child.stdout?.on("data", handleData);
    child.stderr?.on("data", handleData);

    child.on("error", (err) => {
      resolve({ success: false, error: err.message });
    });

    child.on("exit", (code) => {
      if (lastLine) onProgress(lastLine);
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stripAnsi(errorOutput).slice(-500) });
      }
    });
  });
}

const extension: ExtensionFactory = (pi) => {
  // Feature flag: only register if explicitly enabled
  const isEnabled = process.env.OPENDCL_ENABLE_OLLAMA_SETUP === "1";
  
  if (!isEnabled) {
    // Extension loaded but not active — no commands registered
    return;
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!(await isProviderConfigured())) {
      ctx.ui.notify(
        "Get started by running /setup (cloud providers) or /setup-ollama (free local models)",
        "warning",
      );
      return;
    }

    const configDir = join(homedir(), ".opendcl", "agent");
    const settingsPath = join(configDir, "settings.json");
    const settings = await readJsonFile<Record<string, unknown>>(settingsPath, {});
    if (settings.defaultProvider !== "ollama") return;

    const defaultModel = settings.defaultModel as string | undefined;
    if (!defaultModel) return;

    const listResult = await ollamaExec(pi, "list");
    if (!listResult || listResult.code !== 0) return;

    const installed = parseOllamaList(listResult.stdout || "");
    if (installed.includes(defaultModel)) return;

    const modelsPath = join(configDir, "models.json");
    await removeOllamaModel(modelsPath, settingsPath, defaultModel);
    ctx.ui.notify(
      `Model '${defaultModel}' is no longer installed in Ollama. Run /setup-ollama to configure a new model.`,
      "warning",
    );
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

      const installed = parseOllamaList(listResult.stdout || "");
      const theme = ctx.ui.theme;
      const sorted = [...OLLAMA_MODELS].sort((a, b) => {
        const aInstalled = installed.includes(a.id) ? 0 : 1;
        const bInstalled = installed.includes(b.id) ? 0 : 1;
        return aInstalled - bInstalled;
      });
      const labels = sorted.map((m) =>
        installed.includes(m.id)
          ? `${m.label} ${theme.fg("success", "● ready")}`
          : `${m.label} ${theme.fg("dim", "○ needs download")}`,
      );

      const selected = await ctx.ui.select("Which model do you want to use?", labels);
      if (!selected) {
        ctx.ui.notify("Setup cancelled.", "info");
        return;
      }

      const model = sorted.find((m) => selected.startsWith(m.label));
      if (!model) {
        ctx.ui.notify("Invalid selection.", "error");
        return;
      }

      const alreadyInstalled = installed.includes(model.id);
      if (!alreadyInstalled) {
        ctx.ui.setStatus("pull", `Pulling ${model.id}...`);
        const pullResult = await ollamaPull(model.id, (line) => {
          ctx.ui.setStatus("pull", line);
        });
        ctx.ui.setStatus("pull", undefined);
        if (!pullResult.success) {
          ctx.ui.notify(`Failed to pull model: ${pullResult.error || "unknown error"}`, "error");
          return;
        }
      }
      ctx.ui.notify("Model ready.", "info");

      const modelsPath = join(configDir, "models.json");
      await writeModelsConfig(modelsPath, model.id);

      const settingsPath = join(configDir, "settings.json");
      await setDefaultModel(settingsPath, "ollama", model.id);

      ctx.ui.notify(
        `Ollama configured: ${model.id}. Reloading...`,
        "info",
      );
      await ctx.reload();
      return;
    },
  });
};

export default extension;
