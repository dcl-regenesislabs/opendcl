/**
 * DCL Setup Extension
 *
 * Registers the /setup command that walks users through
 * configuring an LLM provider — either via subscription login
 * (easiest) or by pasting an API key.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export const LOGIN_PROVIDERS = [
  { id: "anthropic",       label: "Anthropic (Claude Pro/Max)" },
  { id: "openai-codex",    label: "OpenAI (ChatGPT Plus/Pro)" },
  { id: "github-copilot",  label: "GitHub Copilot" },
  { id: "google-gemini-cli", label: "Google (Gemini)" },
];

export const API_KEY_PROVIDERS = [
  { id: "anthropic",   label: "Anthropic (Claude)",    envVar: "ANTHROPIC_API_KEY" },
  { id: "openai",      label: "OpenAI (GPT)",          envVar: "OPENAI_API_KEY" },
  { id: "google",      label: "Google (Gemini)",        envVar: "GEMINI_API_KEY" },
  { id: "groq",        label: "Groq",                  envVar: "GROQ_API_KEY" },
  { id: "mistral",     label: "Mistral",               envVar: "MISTRAL_API_KEY" },
  { id: "xai",         label: "xAI (Grok)",            envVar: "XAI_API_KEY" },
  { id: "openrouter",  label: "OpenRouter",             envVar: "OPENROUTER_API_KEY" },
  { id: "cerebras",    label: "Cerebras",               envVar: "CEREBRAS_API_KEY" },
  { id: "huggingface", label: "Hugging Face",           envVar: "HF_TOKEN" },
];

export async function readAuthConfig(authPath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(authPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function writeAuthKey(authPath: string, providerId: string, apiKey: string): Promise<void> {
  const existing = await readAuthConfig(authPath);
  existing[providerId] = { type: "api_key", key: apiKey };
  await mkdir(dirname(authPath), { recursive: true });
  await writeFile(authPath, JSON.stringify(existing, null, 2) + "\n", "utf-8");
}

const LOGIN_SUFFIX = " (Login with subscription)";
const API_KEY_SUFFIX = " (API key)";

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("setup", {
    description: "Configure an LLM provider (login or API key)",
    handler: async (_args, ctx) => {
      const loginLabels = LOGIN_PROVIDERS.map((p) => p.label + LOGIN_SUFFIX);
      const apiKeyLabels = API_KEY_PROVIDERS.map((p) => p.label + API_KEY_SUFFIX);
      const allLabels = [...loginLabels, ...apiKeyLabels];

      const selected = await ctx.ui.select("Choose a provider", allLabels);
      if (!selected) {
        ctx.ui.notify("Setup cancelled.", "info");
        return;
      }

      if (selected.endsWith(LOGIN_SUFFIX)) {
        ctx.ui.notify("Type /login and select your provider to authenticate.", "info");
        return;
      }

      const provider = API_KEY_PROVIDERS.find((p) => p.label + API_KEY_SUFFIX === selected);
      if (!provider) {
        ctx.ui.notify("Invalid selection.", "error");
        return;
      }

      const apiKey = await ctx.ui.input(`Paste your ${provider.label} API key`);
      if (!apiKey) {
        ctx.ui.notify("Setup cancelled.", "info");
        return;
      }

      // Persist to auth.json for future sessions
      const authPath = join(homedir(), ".opendcl", "agent", "auth.json");
      await writeAuthKey(authPath, provider.id, apiKey);

      // Register in-memory so models are available immediately
      // (session.reload() does not re-read auth.json)
      pi.registerProvider(provider.id, { apiKey });

      ctx.ui.notify(`${provider.label} configured! Press Ctrl+P to select a model.`, "info");
    },
  });
};

export default extension;
