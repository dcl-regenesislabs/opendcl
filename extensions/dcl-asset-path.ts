/**
 * Asset Path Guard Extension
 *
 * Blocks curl downloads that place asset files in the wrong directory.
 * Models (.glb/.gltf) must go into models/, audio (.mp3/.ogg/.wav) into sounds/.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

interface AssetViolation {
  file: string;
  expected: string;
}

const ASSET_RULES: { pattern: RegExp; dir: string }[] = [
  { pattern: /\.gl(?:b|tf)$/i, dir: "models/" },
  { pattern: /\.(?:mp3|ogg|wav)$/i, dir: "sounds/" },
];

/**
 * Check a curl command for asset files downloaded to the wrong directory.
 * Returns null if the command is fine, or a violation object if it should be blocked.
 */
export function checkCurlOutput(command: string): AssetViolation | null {
  const outputMatches = command.matchAll(/-o\s+["']?([^\s"']+)/g);
  for (const match of outputMatches) {
    const outputPath = match[1];
    for (const rule of ASSET_RULES) {
      if (rule.pattern.test(outputPath) && !outputPath.includes(rule.dir)) {
        const relativePath = outputPath.replace(/^\.\//, "");
        return {
          file: relativePath,
          expected: rule.dir + relativePath,
        };
      }
    }
  }
  return null;
}

const extension: ExtensionFactory = (pi) => {
  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;

    const command = (event.input as { command?: string }).command ?? "";
    const violation = checkCurlOutput(command);
    if (!violation) return;

    return {
      block: true,
      reason: [
        "Asset files must be downloaded into the correct directory.",
        `Use: curl -o ${violation.expected} instead of curl -o ${violation.file}`,
        "Models (.glb/.gltf) → models/    Audio (.mp3/.ogg/.wav) → sounds/",
      ].join("\n"),
    };
  });
};

export default extension;
