import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXTENSIONS_DIR = join(import.meta.dirname, "../../../extensions");

// Import the pure function directly for logic tests
import { checkCurlOutput } from "../../../extensions/dcl-asset-path.js";

describe("dcl-asset-path extension", () => {
  it("extension file exists and exports default", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-asset-path.ts"),
      "utf-8"
    );
    expect(content).toContain("export default");
    expect(content).toContain("ExtensionFactory");
  });

  it("subscribes to tool_call event", async () => {
    const content = await readFile(
      join(EXTENSIONS_DIR, "dcl-asset-path.ts"),
      "utf-8"
    );
    expect(content).toContain('pi.on("tool_call"');
  });
});

describe("checkCurlOutput", () => {
  describe("models — should block", () => {
    it("blocks .glb in scene root", () => {
      const result = checkCurlOutput('curl -o Sofa.glb "https://example.com/Sofa.glb"');
      expect(result).toEqual({ file: "Sofa.glb", expected: "models/Sofa.glb" });
    });

    it("blocks .glb with ./ prefix", () => {
      const result = checkCurlOutput('curl -o ./Sofa.glb "https://example.com/Sofa.glb"');
      expect(result).toEqual({ file: "Sofa.glb", expected: "models/Sofa.glb" });
    });

    it("blocks .gltf with extra flags", () => {
      const result = checkCurlOutput('curl -L -o tree.gltf "https://example.com/tree.gltf"');
      expect(result).toEqual({ file: "tree.gltf", expected: "models/tree.gltf" });
    });
  });

  describe("models — should allow", () => {
    it("allows .glb in models/", () => {
      const result = checkCurlOutput('curl -o models/Sofa.glb "https://example.com/Sofa.glb"');
      expect(result).toBeNull();
    });

    it("allows .glb in ./models/", () => {
      const result = checkCurlOutput('curl -o ./models/tree.glb "https://example.com/tree.glb"');
      expect(result).toBeNull();
    });
  });

  describe("audio — should block", () => {
    it("blocks .mp3 in scene root", () => {
      const result = checkCurlOutput('curl -o click.mp3 "https://example.com/click.mp3"');
      expect(result).toEqual({ file: "click.mp3", expected: "sounds/click.mp3" });
    });

    it("blocks .ogg with ./ prefix", () => {
      const result = checkCurlOutput('curl -o ./music.ogg "https://example.com/music.ogg"');
      expect(result).toEqual({ file: "music.ogg", expected: "sounds/music.ogg" });
    });

    it("blocks .wav in scene root", () => {
      const result = checkCurlOutput('curl -o explosion.wav "https://example.com/explosion.wav"');
      expect(result).toEqual({ file: "explosion.wav", expected: "sounds/explosion.wav" });
    });
  });

  describe("audio — should allow", () => {
    it("allows .mp3 in sounds/", () => {
      const result = checkCurlOutput('curl -o sounds/click.mp3 "https://example.com/click.mp3"');
      expect(result).toBeNull();
    });

    it("allows .ogg in ./sounds/", () => {
      const result = checkCurlOutput('curl -o ./sounds/music.ogg "https://example.com/music.ogg"');
      expect(result).toBeNull();
    });
  });

  describe("non-asset commands — should allow", () => {
    it("allows curl without -o", () => {
      const result = checkCurlOutput('curl "https://example.com/api"');
      expect(result).toBeNull();
    });

    it("allows non-asset file downloads", () => {
      const result = checkCurlOutput('curl -o data.json "https://example.com/data.json"');
      expect(result).toBeNull();
    });

    it("allows non-curl commands", () => {
      const result = checkCurlOutput("npm install");
      expect(result).toBeNull();
    });
  });
});
