/**
 * Wiring tests — verifies that src/index.ts references match real files on disk.
 *
 * This is the test that would have caught the "dcl-background.ts" → "dcl-tasks.ts" bug.
 * It parses index.ts source to extract referenced paths, then checks each exists.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const INDEX_SRC = readFileSync(join(ROOT, "src/index.ts"), "utf-8");

describe("index.ts wiring", () => {
  // Extract extension filenames from all array literals in the extensions assignment.
  // Handles both simple arrays and ternary expressions with multiple arrays.
  const allArrays = [...INDEX_SRC.matchAll(/\[\s*((?:"[^"]+"\s*,?\s*)+)\s*\]/g)];
  const loopExtensions = [
    ...new Set(
      allArrays.flatMap((m) => [...m[1].matchAll(/"([^"]+\.ts)"/g)].map((m) => m[1])),
    ),
  ];

  // Extract standalone -e pushes (like plan-mode/index.ts)
  const standalonePushes = [...INDEX_SRC.matchAll(/args\.push\("-e",\s*join\(extDir,\s*"([^"]+)"\)/g)].map(
    (m) => m[1],
  );

  // Extract --prompt-template paths
  const promptTemplates = [
    ...INDEX_SRC.matchAll(/args\.push\("--prompt-template",\s*join\(packageDir,\s*"([^"]+)"\)/g),
  ].map((m) => m[1]);

  // Extract --skill path
  const skillMatch = INDEX_SRC.match(/args\.push\("--skill",\s*join\(packageDir,\s*"([^"]+)"\)/);
  const skillDir = skillMatch ? skillMatch[1] : null;

  it("parses extension list from index.ts source", () => {
    expect(loopExtensions.length).toBeGreaterThanOrEqual(5);
  });

  it("every extension in the for-of loop maps to a real file", () => {
    for (const ext of loopExtensions) {
      const fullPath = join(ROOT, "extensions", ext);
      expect(existsSync(fullPath), `missing extension: extensions/${ext}`).toBe(true);
    }
  });

  it("every standalone -e push maps to a real file", () => {
    for (const ext of standalonePushes) {
      const fullPath = join(ROOT, "extensions", ext);
      expect(existsSync(fullPath), `missing extension: extensions/${ext}`).toBe(true);
    }
  });

  it("every --prompt-template path exists", () => {
    expect(promptTemplates.length).toBeGreaterThanOrEqual(1);
    for (const tmpl of promptTemplates) {
      const fullPath = join(ROOT, tmpl);
      expect(existsSync(fullPath), `missing prompt template: ${tmpl}`).toBe(true);
    }
  });

  it("--skill directory exists and contains SKILL.md files", () => {
    expect(skillDir).not.toBeNull();
    const skillPath = join(ROOT, skillDir!);
    expect(existsSync(skillPath), `missing skill directory: ${skillDir}`).toBe(true);

    // At least one subdirectory with SKILL.md
    const subdirs = readdirSync(skillPath, { withFileTypes: true }).filter((d) => d.isDirectory());
    expect(subdirs.length).toBeGreaterThanOrEqual(1);

    const hasSkills = subdirs.some((d) => existsSync(join(skillPath, d.name, "SKILL.md")));
    expect(hasSkills, "no SKILL.md files found in skill subdirectories").toBe(true);
  });

  it("every .ts extension file (except process-registry.ts) is referenced in index.ts", () => {
    // All referenced extensions (from loop + standalone)
    const allReferenced = new Set([...loopExtensions, ...standalonePushes]);

    // All .ts files in extensions/ (top-level only, excluding process-registry, scene-utils, and feature-flagged extensions)
    const extensionFiles = readdirSync(join(ROOT, "extensions"), { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(".ts") && d.name !== "process-registry.ts" && d.name !== "scene-utils.ts" && d.name !== "dcl-setup-ollama.ts")
      .map((d) => d.name);

    for (const file of extensionFiles) {
      expect(allReferenced.has(file), `extensions/${file} exists but is not referenced in index.ts`).toBe(true);
    }
  });

  it("system prompt resolves context/ paths to absolute paths", () => {
    // The system prompt is built by stripping frontmatter then replacing context/foo.md
    // with absolute paths. Verify the replacement logic produces absolute paths.
    const raw = readFileSync(join(ROOT, "prompts/system.md"), "utf-8");
    const contextDir = join(ROOT, "context");
    const systemPrompt = raw
      .replace(/^---\n[\s\S]*?\n---\n/, "")
      .replace(/context\/([\w-]+\.md)/g, (_: string, filename: string) => join(contextDir, filename))
      .trim();

    // After replacement, every context/foo.md should be an absolute path (preceded by /)
    expect(systemPrompt).not.toMatch(/(?<!\/)context\/[\w-]+\.md/);

    // Should contain absolute paths to the context directory
    expect(systemPrompt).toContain(join(contextDir, "sdk7-cheat-sheet.md"));
    expect(systemPrompt).toContain(join(contextDir, "open-source-3d-assets.md"));
    expect(systemPrompt).toContain(join(contextDir, "asset-packs-catalog.md"));
  });

  it("compact tool renderers are wired via getRegisteredToolDefinition patch", () => {
    expect(INDEX_SRC).toContain("getRegisteredToolDefinition");
    expect(INDEX_SRC).toContain("getCompactToolDefinition");
  });

  it("pi changelog patches are wired (getChangelogForDisplay + handleChangelogCommand)", () => {
    expect(INDEX_SRC).toContain("getChangelogForDisplay");
    expect(INDEX_SRC).toContain("handleChangelogCommand");
  });

  it("every .ts extension directory (plan-mode) is referenced in index.ts", () => {
    const allReferenced = new Set([...loopExtensions, ...standalonePushes]);

    // Directories in extensions/ that have an index.ts
    const extensionDirs = readdirSync(join(ROOT, "extensions"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, "extensions", d.name, "index.ts")))
      .map((d) => `${d.name}/index.ts`);

    for (const dirEntry of extensionDirs) {
      expect(allReferenced.has(dirEntry), `extensions/${dirEntry} exists but is not referenced in index.ts`).toBe(
        true,
      );
    }
  });
});
