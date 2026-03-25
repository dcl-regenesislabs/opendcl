/**
 * Tests for dcl-header extension — welcome guide, skill name extraction,
 * version reading, quietStartup settings management, and path shortening.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

// Import exported helpers from the built extension
import { getVersion, getSkillNames, ensureQuietStartup, shortenPath } from "../../extensions/dcl-header.js";

describe("dcl-header", () => {
  describe("getVersion", () => {
    it("returns a valid semver-like string", () => {
      const version = getVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("returns a non-zero version", () => {
      const version = getVersion();
      expect(version).not.toBe("0.0.0");
    });
  });

  describe("getSkillNames", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "dcl-header-skills-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("extracts name from YAML frontmatter", () => {
      mkdirSync(join(tmpDir, "my-skill"));
      writeFileSync(
        join(tmpDir, "my-skill", "SKILL.md"),
        "---\nname: my-skill\ndescription: A test skill\n---\n# My Skill\n",
      );

      const names = getSkillNames(tmpDir);
      expect(names).toEqual(["my-skill"]);
    });

    it("extracts multiple skill names sorted alphabetically", () => {
      mkdirSync(join(tmpDir, "zebra-skill"));
      writeFileSync(
        join(tmpDir, "zebra-skill", "SKILL.md"),
        "---\nname: zebra-skill\ndescription: Z skill\n---\n",
      );
      mkdirSync(join(tmpDir, "alpha-skill"));
      writeFileSync(
        join(tmpDir, "alpha-skill", "SKILL.md"),
        "---\nname: alpha-skill\ndescription: A skill\n---\n",
      );

      const names = getSkillNames(tmpDir);
      expect(names).toEqual(["alpha-skill", "zebra-skill"]);
    });

    it("falls back to directory name when frontmatter has no name", () => {
      mkdirSync(join(tmpDir, "fallback-skill"));
      writeFileSync(
        join(tmpDir, "fallback-skill", "SKILL.md"),
        "# No frontmatter here\n",
      );

      const names = getSkillNames(tmpDir);
      expect(names).toEqual(["fallback-skill"]);
    });

    it("skips non-directory entries", () => {
      writeFileSync(join(tmpDir, "not-a-dir.txt"), "hello");
      mkdirSync(join(tmpDir, "real-skill"));
      writeFileSync(
        join(tmpDir, "real-skill", "SKILL.md"),
        "---\nname: real-skill\ndescription: test\n---\n",
      );

      const names = getSkillNames(tmpDir);
      expect(names).toEqual(["real-skill"]);
    });

    it("returns empty array for nonexistent directory", () => {
      const names = getSkillNames(join(tmpDir, "nonexistent"));
      expect(names).toEqual([]);
    });

    it("reads real skills directory and finds all 21 skills", () => {
      const realSkillsDir = join(import.meta.dirname, "../../skills");
      const names = getSkillNames(realSkillsDir);
      expect(names.length).toBe(21);
      expect(names).toContain("create-scene");
      expect(names).toContain("add-3d-models");
      expect(names).toContain("deploy-worlds");
      expect(names).toContain("camera-control");
      expect(names).toContain("lighting-environment");
      expect(names).toContain("player-avatar");
      expect(names).toContain("nft-blockchain");
      expect(names).toContain("advanced-rendering");
      expect(names).toContain("advanced-input");
      expect(names).toContain("authoritative-server");
    });
  });

  describe("ensureQuietStartup", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "dcl-header-settings-"));
    });

    afterEach(() => {
      rmSync(tmpDir, { recursive: true, force: true });
    });

    it("creates settings.json with quietStartup: true when file does not exist", () => {
      const settingsPath = join(tmpDir, "agent", "settings.json");
      ensureQuietStartup(settingsPath);

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.quietStartup).toBe(true);
    });

    it("creates nested directories if they don't exist", () => {
      const settingsPath = join(tmpDir, "deep", "nested", "settings.json");
      ensureQuietStartup(settingsPath);

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.quietStartup).toBe(true);
    });

    it("does not overwrite quietStartup when already set to false", () => {
      const settingsPath = join(tmpDir, "settings.json");
      writeFileSync(settingsPath, JSON.stringify({ quietStartup: false }, null, 2) + "\n");

      ensureQuietStartup(settingsPath);

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.quietStartup).toBe(false);
    });

    it("does not overwrite quietStartup when already set to true", () => {
      const settingsPath = join(tmpDir, "settings.json");
      writeFileSync(settingsPath, JSON.stringify({ quietStartup: true }, null, 2) + "\n");

      ensureQuietStartup(settingsPath);

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.quietStartup).toBe(true);
    });

    it("adds quietStartup without losing other keys", () => {
      const settingsPath = join(tmpDir, "settings.json");
      writeFileSync(
        settingsPath,
        JSON.stringify({ theme: "dark", fontSize: 14 }, null, 2) + "\n",
      );

      ensureQuietStartup(settingsPath);

      const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
      expect(settings.quietStartup).toBe(true);
      expect(settings.theme).toBe("dark");
      expect(settings.fontSize).toBe(14);
    });

    it("does not throw on invalid JSON in existing file", () => {
      const settingsPath = join(tmpDir, "settings.json");
      writeFileSync(settingsPath, "not valid json {{{");

      expect(() => ensureQuietStartup(settingsPath)).not.toThrow();
    });
  });

  describe("shortenPath", () => {
    const home = homedir();

    it("replaces homedir prefix with ~", () => {
      expect(shortenPath(home + "/Documents/my-scene")).toBe("~/Documents/my-scene");
    });

    it("replaces exact homedir with ~", () => {
      expect(shortenPath(home)).toBe("~");
    });

    it("leaves non-home paths unchanged", () => {
      expect(shortenPath("/tmp/other")).toBe("/tmp/other");
    });

    it("does not replace partial homedir matches", () => {
      // e.g. /Users/boedo-extra should NOT become ~-extra
      expect(shortenPath(home + "-extra/foo")).toBe(home + "-extra/foo");
    });
  });
});
