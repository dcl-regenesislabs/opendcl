import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");

describe("CLI configuration", () => {
  it("package.json has correct bin entry", async () => {
    const pkg = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf-8")
    );
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.opendcl).toBe("./dist/index.js");
  });

  it("package.json has piConfig with correct name", async () => {
    const pkg = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf-8")
    );
    expect(pkg.piConfig).toBeDefined();
    expect(pkg.piConfig.name).toBe("opendcl");
    expect(pkg.piConfig.configDir).toBe(".opendcl");
  });

  it("package.json has pi manifest for skills/extensions/prompts", async () => {
    const pkg = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf-8")
    );
    expect(pkg.pi).toBeDefined();
    expect(pkg.pi.extensions).toContain("./extensions");
    expect(pkg.pi.skills).toContain("./skills");
    expect(pkg.pi.prompts).toContain("./prompts");
  });

  it("package.json files field includes all distribution dirs", async () => {
    const pkg = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf-8")
    );
    expect(pkg.files).toContain("dist/");
    expect(pkg.files).toContain("extensions/");
    expect(pkg.files).toContain("skills/");
    expect(pkg.files).toContain("prompts/");
    expect(pkg.files).toContain("context/");
  });

  it("entry point file exists and has shebang", async () => {
    const content = await readFile(join(ROOT, "src/index.ts"), "utf-8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("package.json has sdk7 keyword for discovery", async () => {
    const pkg = JSON.parse(
      await readFile(join(ROOT, "package.json"), "utf-8")
    );
    expect(pkg.keywords).toContain("sdk7");
  });
});
