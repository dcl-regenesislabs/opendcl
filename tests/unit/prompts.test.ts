import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const PROMPTS_DIR = join(import.meta.dirname, "../../prompts");

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1].split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    result[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
  }
  return result;
}

describe("prompt templates", () => {
  it("all prompt files have valid frontmatter", async () => {
    const files = await readdir(PROMPTS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThanOrEqual(2);

    for (const file of mdFiles) {
      const content = await readFile(join(PROMPTS_DIR, file), "utf-8");
      const fm = parseFrontmatter(content);
      expect(fm.name, `${file} missing 'name' in frontmatter`).toBeDefined();
      expect(
        fm.description,
        `${file} missing 'description' in frontmatter`
      ).toBeDefined();
    }
  });

  it("system.md contains DCL-specific instructions", async () => {
    const content = await readFile(
      join(PROMPTS_DIR, "system.md"),
      "utf-8"
    );
    expect(content).toContain("OpenDCL");
    expect(content).toContain("Decentraland");
    expect(content).toContain("SDK7");
    expect(content).toContain("ECS");
    expect(content).toContain("scene.json");
  });

  it("system.md contains pacing instructions", async () => {
    const content = await readFile(
      join(PROMPTS_DIR, "system.md"),
      "utf-8"
    );
    expect(content).toContain("Pacing");
    expect(content).toContain("one step at a time");
    expect(content).toContain("Existing scenes");
  });

  it("system.md documents LLM-callable tools", async () => {
    const content = await readFile(
      join(PROMPTS_DIR, "system.md"),
      "utf-8"
    );
    expect(content).toContain("Tools & Commands");
    expect(content).toContain("use them directly");
    expect(content).toContain("`init`");
    expect(content).toContain("`preview`");
    expect(content).toContain("`deploy`");
    expect(content).toContain("`tasks`");
  });

  it("review.md has review criteria", async () => {
    const content = await readFile(
      join(PROMPTS_DIR, "review.md"),
      "utf-8"
    );
    expect(content).toContain("review");
    expect(content).toContain("performance");
  });

  it("explain.md has explanation format", async () => {
    const content = await readFile(
      join(PROMPTS_DIR, "explain.md"),
      "utf-8"
    );
    expect(content).toContain("explain");
    expect(content).toContain("example");
  });

  it("prompt names are unique", async () => {
    const files = await readdir(PROMPTS_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    const names: string[] = [];

    for (const file of mdFiles) {
      const content = await readFile(join(PROMPTS_DIR, file), "utf-8");
      const fm = parseFrontmatter(content);
      if (fm.name) names.push(fm.name);
    }

    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});
