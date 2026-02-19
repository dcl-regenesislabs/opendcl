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
  parseOllamaList,
  removeOllamaModel,
  extractPullProgress,
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
      await writeModelsConfig(modelsPath, "qwen2.5-coder:32b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama).toEqual({
        baseUrl: "http://localhost:11434/v1",
        api: "openai-completions",
        apiKey: "ollama",
        models: [{ id: "qwen2.5-coder:32b" }],
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
            models: [{ id: "qwen2.5-coder:32b" }],
          },
        },
      }));

      await writeModelsConfig(modelsPath, "llama3.1:8b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama.models).toEqual([
        { id: "qwen2.5-coder:32b" },
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
            models: [{ id: "qwen2.5-coder:32b" }],
          },
        },
      }));

      await writeModelsConfig(modelsPath, "qwen2.5-coder:32b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama.models).toEqual([{ id: "qwen2.5-coder:32b" }]);
    });

    it("creates parent directories if needed", async () => {
      const modelsPath = join(tmpDir, "deep", "nested", "models.json");
      await writeModelsConfig(modelsPath, "qwen2.5-coder:32b");

      const content = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(content.providers.ollama.models[0].id).toBe("qwen2.5-coder:32b");
    });
  });

  describe("setDefaultModel", () => {
    it("creates new settings file with defaults", async () => {
      const settingsPath = join(tmpDir, "agent", "settings.json");
      await setDefaultModel(settingsPath, "ollama", "qwen2.5-coder:32b");

      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(content.defaultProvider).toBe("ollama");
      expect(content.defaultModel).toBe("qwen2.5-coder:32b");
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

      await setDefaultModel(settingsPath, "ollama", "qwen2.5-coder:32b");

      const content = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(content.defaultProvider).toBe("ollama");
      expect(content.defaultModel).toBe("qwen2.5-coder:32b");
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

  describe("parseOllamaList", () => {
    it("parses model names from ollama list output", () => {
      const output = [
        "NAME                    ID              SIZE      MODIFIED",
        "qwen2.5-coder:32b       4bada2326a38    18 GB     2 hours ago",
        "llama3.1:8b             42182419e950    4.7 GB    3 days ago",
      ].join("\n");
      expect(parseOllamaList(output)).toEqual(["qwen2.5-coder:32b", "llama3.1:8b"]);
    });

    it("returns empty array for empty output", () => {
      expect(parseOllamaList("")).toEqual([]);
    });

    it("returns empty array for header-only output", () => {
      expect(parseOllamaList("NAME    ID    SIZE    MODIFIED\n")).toEqual([]);
    });

    it("strips :latest suffix from model names", () => {
      const output = [
        "NAME                    ID              SIZE      MODIFIED",
        "glm-4.7-flash:latest    abc123def456    25 GB     1 hour ago",
        "qwen2.5-coder:32b       4bada2326a38    18 GB     2 hours ago",
      ].join("\n");
      expect(parseOllamaList(output)).toEqual(["glm-4.7-flash", "qwen2.5-coder:32b"]);
    });
  });

  describe("removeOllamaModel", () => {
    it("removes model from models.json and clears default", async () => {
      const modelsPath = join(tmpDir, "models.json");
      const settingsPath = join(tmpDir, "settings.json");

      await writeFile(modelsPath, JSON.stringify({
        providers: {
          ollama: {
            baseUrl: "http://localhost:11434/v1",
            api: "openai-completions",
            apiKey: "ollama",
            models: [{ id: "qwen2.5-coder:32b" }, { id: "llama3.1:8b" }],
          },
        },
      }));
      await writeFile(settingsPath, JSON.stringify({
        defaultProvider: "ollama",
        defaultModel: "qwen2.5-coder:32b",
      }));

      await removeOllamaModel(modelsPath, settingsPath, "qwen2.5-coder:32b");

      const models = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(models.providers.ollama.models).toEqual([{ id: "llama3.1:8b" }]);

      const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(settings.defaultProvider).toBeUndefined();
      expect(settings.defaultModel).toBeUndefined();
    });

    it("removes ollama provider when last model is removed", async () => {
      const modelsPath = join(tmpDir, "models.json");
      const settingsPath = join(tmpDir, "settings.json");

      await writeFile(modelsPath, JSON.stringify({
        providers: {
          ollama: {
            baseUrl: "http://localhost:11434/v1",
            api: "openai-completions",
            apiKey: "ollama",
            models: [{ id: "qwen2.5-coder:32b" }],
          },
        },
      }));
      await writeFile(settingsPath, JSON.stringify({
        defaultProvider: "ollama",
        defaultModel: "qwen2.5-coder:32b",
      }));

      await removeOllamaModel(modelsPath, settingsPath, "qwen2.5-coder:32b");

      const models = JSON.parse(await readFile(modelsPath, "utf-8"));
      expect(models.providers.ollama).toBeUndefined();
    });

    it("does not clear default if model does not match", async () => {
      const modelsPath = join(tmpDir, "models.json");
      const settingsPath = join(tmpDir, "settings.json");

      await writeFile(modelsPath, JSON.stringify({
        providers: {
          ollama: {
            baseUrl: "http://localhost:11434/v1",
            api: "openai-completions",
            apiKey: "ollama",
            models: [{ id: "qwen2.5-coder:32b" }, { id: "llama3.1:8b" }],
          },
        },
      }));
      await writeFile(settingsPath, JSON.stringify({
        defaultProvider: "ollama",
        defaultModel: "llama3.1:8b",
      }));

      await removeOllamaModel(modelsPath, settingsPath, "qwen2.5-coder:32b");

      const settings = JSON.parse(await readFile(settingsPath, "utf-8"));
      expect(settings.defaultProvider).toBe("ollama");
      expect(settings.defaultModel).toBe("llama3.1:8b");
    });
  });

  describe("extractPullProgress", () => {
    it("extracts percentage progress from ANSI output", () => {
      const ansi = "\x1b[?2026h\x1b[?25l\x1b[A\x1b[1Gpulling manifest \x1b[K\npulling 20693aeb02c6:   3%  13 MB/397 MB  7.7 MB/s     50s\x1b[K\x1b[?25h\x1b[?2026l";
      const result = extractPullProgress(ansi);
      expect(result).toMatch(/3%/);
      expect(result).toMatch(/13 MB\/397 MB/);
    });

    it("extracts phase line when no percentage", () => {
      const ansi = "\x1b[?2026h\x1b[?25l\x1b[1Gpulling manifest \x1b[K\x1b[?25h\x1b[?2026l";
      expect(extractPullProgress(ansi)).toBe("pulling manifest");
    });

    it("extracts verifying phase", () => {
      expect(extractPullProgress("verifying sha256 digest")).toBe("verifying sha256 digest");
    });

    it("extracts success phase", () => {
      expect(extractPullProgress("success")).toBe("success");
    });

    it("returns null for empty or whitespace", () => {
      expect(extractPullProgress("")).toBeNull();
      expect(extractPullProgress("   \n  ")).toBeNull();
    });

    it("prefers percentage line over phase line", () => {
      const mixed = "pulling manifest\npulling abc:  45%  8 GB/18 GB";
      const result = extractPullProgress(mixed);
      expect(result).toMatch(/45%/);
    });
  });

  describe("OLLAMA_MODELS", () => {
    it("has at least 4 model options", () => {
      expect(OLLAMA_MODELS.length).toBeGreaterThanOrEqual(4);
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
