/**
 * DCL Setup Ollama extension tests — verifies the exported helpers:
 * writeModelsConfig, setDefaultModel, isProviderConfigured, OLLAMA_MODELS
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeModelsConfig,
  setDefaultModel,
  isProviderConfigured,
  OLLAMA_MODELS,
} from "../../extensions/dcl-setup-ollama.js";

describe("dcl-setup-ollama helpers", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "dcl-setup-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("writeModelsConfig", () => {
    it("creates new file with Ollama provider", async () => {
      const modelsPath = join(tmpDir, "agent", "models.json");
      await writeModelsConfig(modelsPath, "qwen2.5-coder:7b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama).toEqual({
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        apiKey: "ollama",
        models: [{ id: "qwen2.5-coder:7b" }],
      });
    });

    it("preserves other providers when adding Ollama", async () => {
      const modelsPath = join(tmpDir, "models.json");
      await writeFile(modelsPath, JSON.stringify({
        providers: {
          anthropic: { apiKey: "sk-test", models: [{ id: "claude-3" }] },
        },
      }));

      await writeModelsConfig(modelsPath, "llama3.1:8b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.anthropic.apiKey).toBe("sk-test");
      expect(content.providers.ollama.models).toEqual([{ id: "llama3.1:8b" }]);
    });

    it("appends model to existing Ollama entry", async () => {
      const modelsPath = join(tmpDir, "models.json");
      await writeFile(modelsPath, JSON.stringify({
        providers: {
          ollama: {
            baseUrl: "http://localhost:11434/v1",
            api: "openai-completions",
            apiKey: "ollama",
            models: [{ id: "qwen2.5-coder:7b" }],
          },
        },
      }));

      await writeModelsConfig(modelsPath, "llama3.1:8b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama.models).toEqual([
        { id: "qwen2.5-coder:7b" },
        { id: "llama3.1:8b" },
      ]);
    });

    it("does not duplicate an existing model", async () => {
      const modelsPath = join(tmpDir, "models.json");
      await writeFile(modelsPath, JSON.stringify({
        providers: {
          ollama: {
            baseUrl: "http://localhost:11434/v1",
            api: "openai-completions",
            apiKey: "ollama",
            models: [{ id: "qwen2.5-coder:7b" }],
          },
        },
      }));

      await writeModelsConfig(modelsPath, "qwen2.5-coder:7b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama.models).toEqual([{ id: "qwen2.5-coder:7b" }]);
    });

    it("creates parent directories if needed", async () => {
      const modelsPath = join(tmpDir, "deep", "nested", "models.json");
      await writeModelsConfig(modelsPath, "qwen2.5-coder:7b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama.models[0].id).toBe("qwen2.5-coder:7b");
    });
  });

  describe("setDefaultModel", () => {
    it("creates new settings file with defaults", async () => {
      const settingsPath = join(tmpDir, "agent", "settings.json");
      await setDefaultModel(settingsPath, "ollama", "qwen2.5-coder:7b");

      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(content.defaultProvider).toBe("ollama");
      expect(content.defaultModel).toBe("qwen2.5-coder:7b");
    });

    it("merges with existing settings", async () => {
      const settingsPath = join(tmpDir, "settings.json");
      await writeFile(settingsPath, JSON.stringify({
        quietStartup: true,
        theme: "dark",
      }));

      await setDefaultModel(settingsPath, "ollama", "llama3.1:8b");

      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(content.quietStartup).toBe(true);
      expect(content.theme).toBe("dark");
      expect(content.defaultProvider).toBe("ollama");
      expect(content.defaultModel).toBe("llama3.1:8b");
    });

    it("overwrites existing defaults", async () => {
      const settingsPath = join(tmpDir, "settings.json");
      await writeFile(settingsPath, JSON.stringify({
        defaultProvider: "anthropic",
        defaultModel: "claude-3",
      }));

      await setDefaultModel(settingsPath, "ollama", "qwen2.5-coder:7b");

      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(content.defaultProvider).toBe("ollama");
      expect(content.defaultModel).toBe("qwen2.5-coder:7b");
    });
  });

  describe("isProviderConfigured", () => {
    it("returns true when ANTHROPIC_API_KEY is set", async () => {
      const original = process.env.ANTHROPIC_API_KEY;
      process.env.ANTHROPIC_API_KEY = "sk-test";
      try {
        expect(await isProviderConfigured()).toBe(true);
      } finally {
        if (original === undefined) delete process.env.ANTHROPIC_API_KEY;
        else process.env.ANTHROPIC_API_KEY = original;
      }
    });

    it("returns true when OPENAI_API_KEY is set", async () => {
      const original = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = "sk-test";
      try {
        expect(await isProviderConfigured()).toBe(true);
      } finally {
        if (original === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = original;
      }
    });
  });

  describe("OLLAMA_MODELS", () => {
    it("has at least 3 model options", () => {
      expect(OLLAMA_MODELS.length).toBeGreaterThanOrEqual(3);
    });

    it("each model has id and label", () => {
      for (const model of OLLAMA_MODELS) {
        expect(model.id).toBeTruthy();
        expect(model.label).toBeTruthy();
        expect(model.label).toContain(model.id);
      }
    });
  });
});
