import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  detectSceneContext,
  calculateSceneSize,
  formatSceneContext,
} from "../../src/scene-context.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

describe("calculateSceneSize", () => {
  it("returns 16x16 for single parcel", () => {
    expect(calculateSceneSize(["0,0"])).toEqual({ width: 16, depth: 16 });
  });

  it("calculates size for 2x2 parcels", () => {
    expect(calculateSceneSize(["0,0", "0,1", "1,0", "1,1"])).toEqual({
      width: 32,
      depth: 32,
    });
  });

  it("calculates size for L-shaped parcels", () => {
    expect(calculateSceneSize(["0,0", "1,0", "0,1"])).toEqual({
      width: 32,
      depth: 32,
    });
  });

  it("returns 16x16 for empty parcels", () => {
    expect(calculateSceneSize([])).toEqual({ width: 16, depth: 16 });
  });

  it("handles negative coordinates", () => {
    expect(calculateSceneSize(["-1,-1", "0,0"])).toEqual({
      width: 32,
      depth: 32,
    });
  });
});

describe("detectSceneContext", () => {
  it("detects valid scene.json and extracts metadata", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "valid-scene"));
    expect(ctx.hasScene).toBe(true);
    expect(ctx.title).toBe("Test Scene");
    expect(ctx.description).toBe("A test scene for opendcl");
    expect(ctx.parcels).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    expect(ctx.base).toBe("0,0");
    expect(ctx.parcelCount).toBe(4);
    expect(ctx.sizeMeters).toEqual({ width: 32, depth: 32 });
    expect(ctx.main).toBe("bin/index.js");
  });

  it("detects SDK version from package.json", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "valid-scene"));
    expect(ctx.sdkVersion).toBe("^7.5.0");
  });

  it("detects entry point file", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "valid-scene"));
    expect(ctx.entryPoint).toBe("src/index.ts");
  });

  it("returns null context for empty directory", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "opendcl-test-"));
    try {
      const ctx = await detectSceneContext(tmpDir);
      expect(ctx.hasScene).toBe(false);
      expect(ctx.sceneRoot).toBeUndefined();
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("handles scene.json with missing optional fields", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "minimal-scene"));
    expect(ctx.hasScene).toBe(true);
    expect(ctx.title).toBeUndefined();
    expect(ctx.description).toBeUndefined();
    expect(ctx.parcels).toEqual(["0,0"]);
    expect(ctx.parcelCount).toBe(1);
  });

  it("handles malformed scene.json", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "broken-scene"));
    expect(ctx.hasScene).toBe(false);
    expect(ctx.parseError).toBeDefined();
    expect(ctx.parseError).toContain("Failed to parse");
  });

  it("detects missing node_modules", async () => {
    const ctx = await detectSceneContext(
      join(FIXTURES, "no-node-modules")
    );
    expect(ctx.hasScene).toBe(true);
    expect(ctx.needsInstall).toBe(true);
  });

  it("handles scene.json with single parcel", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "minimal-scene"));
    expect(ctx.sizeMeters).toEqual({ width: 16, depth: 16 });
  });

  it("handles scene.json with multiple parcels", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "valid-scene"));
    expect(ctx.sizeMeters).toEqual({ width: 32, depth: 32 });
  });

  it("detects legacy SDK6 scene", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "sdk6-scene"));
    expect(ctx.hasScene).toBe(true);
    expect(ctx.isLegacySdk6).toBe(true);
  });

  it("handles nested directory structures", async () => {
    // Running from src/ subdirectory should find scene.json in parent
    const ctx = await detectSceneContext(
      join(FIXTURES, "valid-scene", "src")
    );
    expect(ctx.hasScene).toBe(true);
    expect(ctx.title).toBe("Test Scene");
  });

  it("handles scene.json with BOM", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "opendcl-bom-"));
    try {
      const bom = "\uFEFF";
      const sceneJson = JSON.stringify({
        ecs7: true,
        runtimeVersion: "7",
        display: { title: "BOM Scene" },
        scene: { parcels: ["0,0"], base: "0,0" },
        main: "bin/index.js",
      });
      await writeFile(join(tmpDir, "scene.json"), bom + sceneJson);
      const ctx = await detectSceneContext(tmpDir);
      expect(ctx.hasScene).toBe(true);
      expect(ctx.title).toBe("BOM Scene");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("handles unicode in scene metadata", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "opendcl-unicode-"));
    try {
      await writeFile(
        join(tmpDir, "scene.json"),
        JSON.stringify({
          ecs7: true,
          runtimeVersion: "7",
          display: { title: "My Scene \u2728\u{1F30D}" },
          scene: { parcels: ["0,0"], base: "0,0" },
          main: "bin/index.js",
        })
      );
      const ctx = await detectSceneContext(tmpDir);
      expect(ctx.hasScene).toBe(true);
      expect(ctx.title).toBe("My Scene \u2728\u{1F30D}");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("handles very large scene.json", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "opendcl-large-"));
    try {
      const parcels: string[] = [];
      for (let x = 0; x < 10; x++) {
        for (let z = 0; z < 10; z++) {
          parcels.push(`${x},${z}`);
        }
      }
      await writeFile(
        join(tmpDir, "scene.json"),
        JSON.stringify({
          ecs7: true,
          runtimeVersion: "7",
          display: {
            title: "Large Scene",
            description: "A".repeat(10000),
          },
          scene: { parcels, base: "0,0" },
          main: "bin/index.js",
        })
      );
      const ctx = await detectSceneContext(tmpDir);
      expect(ctx.hasScene).toBe(true);
      expect(ctx.parcelCount).toBe(100);
      expect(ctx.sizeMeters).toEqual({ width: 160, depth: 160 });
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("detects opendcl flag in scene.json", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "opendcl-flag-"));
    try {
      await writeFile(
        join(tmpDir, "scene.json"),
        JSON.stringify({
          ecs7: true,
          runtimeVersion: "7",
          scene: { parcels: ["0,0"], base: "0,0" },
          main: "bin/index.js",
          opendcl: true,
        })
      );
      const ctx = await detectSceneContext(tmpDir);
      expect(ctx.isOpenDcl).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });

  it("isOpenDcl is false when opendcl field is absent", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "valid-scene"));
    expect(ctx.isOpenDcl).toBe(false);
  });

  it("detects world configuration", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "opendcl-world-"));
    try {
      await writeFile(
        join(tmpDir, "scene.json"),
        JSON.stringify({
          ecs7: true,
          runtimeVersion: "7",
          scene: { parcels: ["0,0"], base: "0,0" },
          main: "bin/index.js",
          worldConfiguration: { name: "my-world.dcl.eth" },
        })
      );
      const ctx = await detectSceneContext(tmpDir);
      expect(ctx.isWorld).toBe(true);
      expect(ctx.worldName).toBe("my-world.dcl.eth");
    } finally {
      await rm(tmpDir, { recursive: true });
    }
  });
});

describe("formatSceneContext", () => {
  it("formats empty directory context", () => {
    const formatted = formatSceneContext({ hasScene: false });
    expect(formatted).toContain("No Decentraland scene detected");
    expect(formatted).toContain("/init");
  });

  it("formats parse error context", () => {
    const formatted = formatSceneContext({
      hasScene: false,
      parseError: "Unexpected token",
    });
    expect(formatted).toContain("Error");
    expect(formatted).toContain("Unexpected token");
  });

  it("formats legacy SDK6 context", () => {
    const formatted = formatSceneContext({
      hasScene: true,
      isLegacySdk6: true,
    });
    expect(formatted).toContain("Legacy SDK6");
    expect(formatted).toContain("migrate");
  });

  it("formats valid scene context with all fields", async () => {
    const ctx = await detectSceneContext(join(FIXTURES, "valid-scene"));
    const formatted = formatSceneContext(ctx);
    expect(formatted).toContain("Test Scene");
    expect(formatted).toContain("0,0, 0,1, 1,0, 1,1");
    expect(formatted).toContain("32m x 32m");
    expect(formatted).toContain("4 parcels");
    expect(formatted).toContain("@dcl/sdk@^7.5.0");
  });

  it("shows OpenDCL badge when isOpenDcl is true", () => {
    const formatted = formatSceneContext({
      hasScene: true,
      isOpenDcl: true,
      parcels: ["0,0"],
      parcelCount: 1,
    });
    expect(formatted).toContain("Created with");
    expect(formatted).toContain("OpenDCL");
  });

  it("shows install warning when node_modules missing", async () => {
    const ctx = await detectSceneContext(
      join(FIXTURES, "no-node-modules")
    );
    const formatted = formatSceneContext(ctx);
    expect(formatted).toContain("npm install");
  });
});
