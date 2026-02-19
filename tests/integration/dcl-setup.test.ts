/**
 * DCL Setup extension tests — verifies the exported helpers:
 * writeAuthKey, readAuthConfig, LOGIN_PROVIDERS, API_KEY_PROVIDERS
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  writeAuthKey,
  readAuthConfig,
  LOGIN_PROVIDERS,
  API_KEY_PROVIDERS,
} from "../../extensions/dcl-setup.js";

describe("dcl-setup helpers", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "dcl-setup-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("readAuthConfig", () => {
    it("returns empty object for missing file", async () => {
      const result = await readAuthConfig(join(tmpDir, "nonexistent.json"));
      expect(result).toEqual({});
    });

    it("reads existing auth file", async () => {
      const authPath = join(tmpDir, "auth.json");
      const data = { anthropic: { type: "api_key", key: "sk-test" } };
      await writeFile(authPath, JSON.stringify(data));

      const result = await readAuthConfig(authPath);
      expect(result).toEqual(data);
    });

    it("returns empty object for invalid JSON", async () => {
      const authPath = join(tmpDir, "auth.json");
      await writeFile(authPath, "not-json");

      const result = await readAuthConfig(authPath);
      expect(result).toEqual({});
    });
  });

  describe("writeAuthKey", () => {
    it("creates new file with provider entry", async () => {
      const authPath = join(tmpDir, "auth.json");
      await writeAuthKey(authPath, "anthropic", "sk-ant-123");

      const content = JSON.parse(await readFile(authPath, "utf-8"));
      expect(content).toEqual({
        anthropic: { type: "api_key", key: "sk-ant-123" },
      });
    });

    it("merges with existing entries", async () => {
      const authPath = join(tmpDir, "auth.json");
      await writeFile(authPath, JSON.stringify({
        anthropic: { type: "api_key", key: "sk-ant-123" },
      }));

      await writeAuthKey(authPath, "openai", "sk-openai-456");

      const content = JSON.parse(await readFile(authPath, "utf-8"));
      expect(content.anthropic).toEqual({ type: "api_key", key: "sk-ant-123" });
      expect(content.openai).toEqual({ type: "api_key", key: "sk-openai-456" });
    });

    it("overwrites existing provider key", async () => {
      const authPath = join(tmpDir, "auth.json");
      await writeFile(authPath, JSON.stringify({
        anthropic: { type: "api_key", key: "old-key" },
      }));

      await writeAuthKey(authPath, "anthropic", "new-key");

      const content = JSON.parse(await readFile(authPath, "utf-8"));
      expect(content.anthropic).toEqual({ type: "api_key", key: "new-key" });
    });

    it("creates parent directories if needed", async () => {
      const authPath = join(tmpDir, "deep", "nested", "auth.json");
      await writeAuthKey(authPath, "groq", "gsk-test");

      const content = JSON.parse(await readFile(authPath, "utf-8"));
      expect(content.groq).toEqual({ type: "api_key", key: "gsk-test" });
    });
  });

  describe("LOGIN_PROVIDERS", () => {
    it("has at least 4 providers", () => {
      expect(LOGIN_PROVIDERS.length).toBeGreaterThanOrEqual(4);
    });

    it("each provider has id and label", () => {
      for (const provider of LOGIN_PROVIDERS) {
        expect(provider.id).toBeTruthy();
        expect(provider.label).toBeTruthy();
      }
    });

    it("includes anthropic and openai-codex", () => {
      const ids = LOGIN_PROVIDERS.map((p) => p.id);
      expect(ids).toContain("anthropic");
      expect(ids).toContain("openai-codex");
    });

    it("has unique ids", () => {
      const ids = LOGIN_PROVIDERS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("API_KEY_PROVIDERS", () => {
    it("has at least 9 providers", () => {
      expect(API_KEY_PROVIDERS.length).toBeGreaterThanOrEqual(9);
    });

    it("each provider has id, label, and envVar", () => {
      for (const provider of API_KEY_PROVIDERS) {
        expect(provider.id).toBeTruthy();
        expect(provider.label).toBeTruthy();
        expect(provider.envVar).toBeTruthy();
      }
    });

    it("includes anthropic, openai, and google", () => {
      const ids = API_KEY_PROVIDERS.map((p) => p.id);
      expect(ids).toContain("anthropic");
      expect(ids).toContain("openai");
      expect(ids).toContain("google");
    });

    it("has unique ids", () => {
      const ids = API_KEY_PROVIDERS.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});
