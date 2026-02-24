import { describe, it, expect } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const SKILLS_DIR = join(import.meta.dirname, "../../../skills");

interface SkillFile {
  dir: string;
  path: string;
  content: string;
}

async function getAllSkillFiles(): Promise<SkillFile[]> {
  const dirs = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skills: SkillFile[] = [];

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const skillPath = join(SKILLS_DIR, dir.name, "SKILL.md");
    try {
      const content = await readFile(skillPath, "utf-8");
      skills.push({ dir: dir.name, path: skillPath, content });
    } catch {
      // Skip dirs without SKILL.md
    }
  }

  return skills;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const lines = match[1].split("\n");
  const result: Record<string, string> = {};
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

describe("skill loading", () => {
  it("all bundled SKILL.md files parse without errors", async () => {
    const skills = await getAllSkillFiles();
    expect(skills.length).toBeGreaterThan(0);

    for (const skill of skills) {
      const frontmatter = parseFrontmatter(skill.content);
      expect(frontmatter.name, `${skill.dir}/SKILL.md missing 'name'`).toBeDefined();
      expect(
        frontmatter.description,
        `${skill.dir}/SKILL.md missing 'description'`
      ).toBeDefined();
    }
  });

  it("skill names are unique", async () => {
    const skills = await getAllSkillFiles();
    const names = skills.map((s) => parseFrontmatter(s.content).name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("skill descriptions are non-empty", async () => {
    const skills = await getAllSkillFiles();
    for (const skill of skills) {
      const frontmatter = parseFrontmatter(skill.content);
      expect(
        frontmatter.description?.length,
        `${skill.dir}/SKILL.md has empty description`
      ).toBeGreaterThan(0);
    }
  });

  it("skill markdown body is non-empty", async () => {
    const skills = await getAllSkillFiles();
    for (const skill of skills) {
      // Remove frontmatter
      const body = skill.content.replace(/^---[\s\S]*?---\n/, "").trim();
      expect(
        body.length,
        `${skill.dir}/SKILL.md has empty body`
      ).toBeGreaterThan(0);
    }
  });

  it("has all expected skills", async () => {
    const skills = await getAllSkillFiles();
    const names = skills.map((s) => parseFrontmatter(s.content).name);
    const expected = [
      "create-scene",
      "add-3d-models",
      "add-interactivity",
      "build-ui",
      "animations-tweens",
      "multiplayer-sync",
      "audio-video",
      "deploy-scene",
      "deploy-worlds",
      "optimize-scene",
      "smart-items",
      "camera-control",
      "lighting-environment",
      "player-avatar",
      "nft-blockchain",
      "advanced-rendering",
      "advanced-input",
      "authoritative-server",
      "scene-runtime",
    ];
    for (const name of expected) {
      expect(names, `Missing skill: ${name}`).toContain(name);
    }
  });

  it("skills reference only existing context files", async () => {
    const skills = await getAllSkillFiles();
    const contextDir = join(import.meta.dirname, "../../../context");
    const contextFiles = await readdir(contextDir);

    for (const skill of skills) {
      // Check for context file references like context/foo.md or {baseDir}/../../context/foo.md
      const refs = skill.content.match(
        /context\/[\w-]+\.md/g
      );
      if (!refs) continue;
      for (const ref of refs) {
        const filename = ref.replace("context/", "");
        expect(
          contextFiles,
          `${skill.dir}/SKILL.md references non-existent context/${filename}`
        ).toContain(filename);
      }
    }
  });
});
