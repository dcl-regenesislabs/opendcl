/**
 * Generate a markdown catalog of Decentraland Creator Hub asset packs.
 *
 * Usage:
 *   npx tsx scripts/generate-asset-catalog.ts <catalog.json path> <output.md path>
 *
 * Example:
 *   npx tsx scripts/generate-asset-catalog.ts \
 *     /path/to/creator-hub/packages/asset-packs/catalog.json \
 *     context/asset-packs-catalog.md
 */

import * as fs from "fs";
import * as path from "path";

const CDN_BASE = "https://builder-items.decentraland.org/contents";

interface Asset {
  id: string;
  name: string;
  category: string;
  tags: string[];
  contents: Record<string, string>;
}

interface AssetPack {
  id: string;
  name: string;
  assets: Asset[];
}

interface Catalog {
  assetPacks: AssetPack[];
}

interface GlbRow {
  assetName: string;
  filename: string;
  category: string;
  tags: string[];
  hash: string;
}

function escapeMarkdownPipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}

function main() {
  const catalogPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!catalogPath || !outputPath) {
    console.error(
      "Usage: npx tsx scripts/generate-asset-catalog.ts <catalog.json> <output.md>"
    );
    process.exit(1);
  }

  const resolvedCatalog = path.resolve(catalogPath);
  const resolvedOutput = path.resolve(outputPath);

  if (!fs.existsSync(resolvedCatalog)) {
    console.error(`catalog.json not found at: ${resolvedCatalog}`);
    process.exit(1);
  }

  console.log(`Reading catalog from: ${resolvedCatalog}`);
  const raw = fs.readFileSync(resolvedCatalog, "utf-8");
  const catalog: Catalog = JSON.parse(raw);

  // Sort packs alphabetically
  const packs = [...catalog.assetPacks].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  let totalModels = 0;
  let totalPacks = 0;

  // Pre-process packs to get rows and stats
  const packData: {
    pack: AssetPack;
    rows: GlbRow[];
    categories: string[];
  }[] = [];

  for (const pack of packs) {
    const rows: GlbRow[] = [];

    // Sort assets alphabetically within each pack
    const sortedAssets = [...pack.assets].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const asset of sortedAssets) {
      // Skip deprecated assets
      if (asset.category === "deprecated") {
        continue;
      }

      // Find all .glb files in contents
      const glbEntries = Object.entries(asset.contents).filter(([filename]) =>
        filename.toLowerCase().endsWith(".glb")
      );

      // Skip assets with no .glb files
      if (glbEntries.length === 0) {
        continue;
      }

      for (const [filename, hash] of glbEntries) {
        rows.push({
          assetName: asset.name,
          filename,
          category: asset.category,
          tags: asset.tags,
          hash,
        });
      }
    }

    if (rows.length === 0) {
      continue;
    }

    // Collect unique categories sorted alphabetically
    const categories = [...new Set(rows.map((r) => r.category))].sort();

    packData.push({ pack, rows, categories });
    totalModels += rows.length;
    totalPacks++;
  }

  // Build markdown
  const lines: string[] = [];

  lines.push("# Decentraland Creator Hub Asset Packs");
  lines.push("");
  lines.push(
    "Premium 3D models from the official Decentraland Creator Hub. All models are free to use in Decentraland scenes."
  );
  lines.push("");
  lines.push(`**Total**: ${totalModels} models across ${totalPacks} packs`);
  lines.push("");
  lines.push("**How to use**:");
  lines.push(
    '1. Find a model below that matches your scene'
  );
  lines.push(
    '2. Download it: `curl -o models/filename.glb "URL"`'
  );
  lines.push(
    "3. Reference it: `GltfContainer.create(entity, { src: 'models/filename.glb' })`"
  );
  lines.push("");
  lines.push(
    "> **Important**: `GltfContainer` only works with local files. Always download models into the scene's `models/` directory first."
  );

  for (const { pack, rows, categories } of packData) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## ${pack.name} (${rows.length} assets)`);
    lines.push(`Categories: ${categories.join(", ")}`);
    lines.push("");
    lines.push("| Name | Filename | Category | Tags | Download |");
    lines.push("|------|----------|----------|------|----------|");

    for (const row of rows) {
      const name = escapeMarkdownPipe(row.assetName);
      const filename = escapeMarkdownPipe(row.filename);
      const category = escapeMarkdownPipe(row.category);
      const tags = escapeMarkdownPipe(row.tags.join(", "));
      const downloadCmd = `\`curl -o models/${row.filename} "${CDN_BASE}/${row.hash}"\``;

      lines.push(
        `| ${name} | ${filename} | ${category} | ${tags} | ${downloadCmd} |`
      );
    }
  }

  lines.push("");

  const markdown = lines.join("\n");

  // Ensure output directory exists
  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(resolvedOutput, markdown, "utf-8");

  console.log(`Generated: ${resolvedOutput}`);
  console.log(`  ${totalModels} models across ${totalPacks} packs`);
}

main();
