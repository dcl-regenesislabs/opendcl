import { describe, it, expect } from "vitest";
import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

const CONTEXT_DIR = join(import.meta.dirname, "../../context");

describe("context files", () => {
  it("all required context files exist", async () => {
    const required = [
      "sdk7-cheat-sheet.md",
      "components-reference.md",
      "audio-catalog.md",
    ];

    for (const file of required) {
      await expect(
        access(join(CONTEXT_DIR, file)),
        `Missing context file: ${file}`
      ).resolves.toBeUndefined();
    }
  });

  it("context files are valid markdown with content", async () => {
    const files = await readdir(CONTEXT_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThanOrEqual(3);

    for (const file of mdFiles) {
      const content = await readFile(join(CONTEXT_DIR, file), "utf-8");
      expect(
        content.length,
        `${file} is empty`
      ).toBeGreaterThan(100);
      // Should have at least one heading
      expect(content, `${file} has no headings`).toMatch(/^#/m);
    }
  });

  it("sdk7-cheat-sheet.md has expected sections", async () => {
    const content = await readFile(
      join(CONTEXT_DIR, "sdk7-cheat-sheet.md"),
      "utf-8"
    );
    expect(content).toContain("ECS Core");
    expect(content).toContain("Imports");
    expect(content).toContain("scene.json");
    expect(content).toContain("Custom Components");
  });

  it("components-reference.md covers key ECS components", async () => {
    const content = await readFile(
      join(CONTEXT_DIR, "components-reference.md"),
      "utf-8"
    );
    const requiredComponents = [
      "Transform",
      "GltfContainer",
      "MeshRenderer",
      "Material",
      "AudioSource",
      "VideoPlayer",
      "PointerEvents",
      "Animator",
      "Tween",
      "TextShape",
      "Billboard",
    ];
    for (const comp of requiredComponents) {
      expect(
        content,
        `Missing component: ${comp}`
      ).toContain(comp);
    }
  });

  it("audio-catalog.md contains audio entries with correct structure", async () => {
    const content = await readFile(
      join(CONTEXT_DIR, "audio-catalog.md"),
      "utf-8"
    );
    expect(content).toContain("AudioSource");
    expect(content).toContain("sounds/");
    // Should have category headings
    expect(content).toContain("## Music");
    expect(content).toContain("## Sound Effects");
    // Should have CDN download URLs
    expect(content).toContain("builder-items.decentraland.org/contents");
  });

  it("model-catalog.md exists in add-3d-models skill references", async () => {
    const catalogPath = join(import.meta.dirname, "../../skills/add-3d-models/references/model-catalog.md");
    const content = await readFile(catalogPath, "utf-8");
    expect(content.length).toBeGreaterThan(1000);
    expect(content).toMatch(/glb|model/i);
    expect(content).toContain("## character");
    expect(content).toContain("models.dclregenesislabs.xyz");
  });
});
