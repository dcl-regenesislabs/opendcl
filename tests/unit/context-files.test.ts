import { describe, it, expect } from "vitest";
import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";

const CONTEXT_DIR = join(import.meta.dirname, "../../context");

describe("context files", () => {
  it("all required context files exist", async () => {
    const required = [
      "sdk7-complete-reference.md",
      "sdk7-examples.md",
      "components-reference.md",
      "open-source-3d-assets.md",
    ];

    for (const file of required) {
      let exists = true;
      try {
        await access(join(CONTEXT_DIR, file));
      } catch {
        exists = false;
      }
      expect(exists, `Missing context file: ${file}`).toBe(true);
    }
  });

  it("context files are valid markdown with content", async () => {
    const files = await readdir(CONTEXT_DIR);
    const mdFiles = files.filter((f) => f.endsWith(".md"));
    expect(mdFiles.length).toBeGreaterThanOrEqual(4);

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

  it("sdk7-complete-reference.md has expected sections", async () => {
    const content = await readFile(
      join(CONTEXT_DIR, "sdk7-complete-reference.md"),
      "utf-8"
    );
    expect(content).toContain("Installation");
    expect(content).toContain("Getting Started");
    expect(content).toContain("ECS");
  });

  it("sdk7-examples.md has code examples", async () => {
    const content = await readFile(
      join(CONTEXT_DIR, "sdk7-examples.md"),
      "utf-8"
    );
    expect(content).toContain("```typescript");
    expect(content).toContain("engine");
    expect(content).toContain("Transform");
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

  it("open-source-3d-assets.md contains model entries", async () => {
    const content = await readFile(
      join(CONTEXT_DIR, "open-source-3d-assets.md"),
      "utf-8"
    );
    // Should have substantial content with model entries
    expect(content.length).toBeGreaterThan(500);
    // Should mention 3D models or GLB
    expect(
      content.toLowerCase().includes("3d") ||
        content.toLowerCase().includes("glb") ||
        content.toLowerCase().includes("model")
    ).toBe(true);
  });
});
