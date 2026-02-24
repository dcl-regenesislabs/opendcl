/**
 * Generate a markdown catalog of audio files from Decentraland Creator Hub asset packs.
 *
 * Mirrors generate-asset-catalog.ts but for audio (.mp3/.ogg/.wav) instead of 3D models (.glb).
 * Deduplicates by content hash since many smart items share the same audio files.
 *
 * Usage:
 *   npx tsx scripts/generate-audio-catalog.ts <catalog.json path> <output.md path>
 *
 * Example:
 *   npx tsx scripts/generate-audio-catalog.ts \
 *     /path/to/creator-hub/packages/asset-packs/catalog.json \
 *     context/audio-catalog.md
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

interface AudioEntry {
  assetName: string;
  filename: string;
  sourceCategory: string;
  tags: string[];
  hash: string;
}

interface UniqueSound {
  hash: string;
  name: string;
  downloadAs: string;
  tags: string[];
  category: string;
}

const AUDIO_EXTENSIONS = [".mp3", ".ogg", ".wav"];

// Filenames too ambiguous to use as-is — need a category prefix
const GENERIC_FILENAMES = new Set(["sound.mp3", "close.mp3", "open.mp3"]);

function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[()'"]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function escapeMarkdownPipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/** True when the filename overlaps with at least one asset name in the group. */
function filenameMatchesAsset(entries: AudioEntry[]): boolean {
  const filename = path
    .basename(entries[0].filename)
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return entries.some((e) => {
    const asset = e.assetName.toLowerCase().replace(/[^a-z0-9]/g, "");
    return asset === filename || asset.includes(filename) || filename.includes(asset);
  });
}

function classifyCategory(entries: AudioEntry[]): string {
  const tags = new Set(entries.flatMap((e) => e.tags.map((t) => t.toLowerCase())));
  const cats = new Set(entries.map((e) => e.sourceCategory.toLowerCase()));

  if (tags.has("music")) return "Music";
  if (entries.some((e) => e.assetName.startsWith("Ambient Sound")))
    return "Ambient Sounds";
  if (tags.has("game mechanics") || cats.has("health")) return "Game Mechanics";
  if (
    cats.has("buttons") ||
    cats.has("doors") ||
    cats.has("levers") ||
    cats.has("chests") ||
    cats.has("platforms")
  )
    return "Interaction Sounds";
  return "Sound Effects";
}

function buildDisplayName(entries: AudioEntry[]): string {
  const uniqueNames = [...new Set(entries.map((e) => e.assetName))];

  if (uniqueNames.length === 1) {
    return uniqueNames[0]
      .replace(/^Ambient Music - /, "")
      .replace(/^Ambient Sound - /, "");
  }

  if (uniqueNames.length <= 3) {
    return uniqueNames.join(" / ");
  }

  const cats = [...new Set(entries.map((e) => e.sourceCategory))];
  if (cats.length === 1) {
    const cat = cats[0].charAt(0).toUpperCase() + cats[0].slice(1);
    return `${cat} sound (${uniqueNames.length} variants)`;
  }
  return `${uniqueNames[0]} + ${uniqueNames.length - 1} more`;
}

/** Append a numeric suffix (-2, -3, ...) if the name is already taken. */
function ensureUnique(name: string, usedNames: Set<string>): string {
  if (!usedNames.has(name)) return name;
  const ext = path.extname(name);
  const base = name.slice(0, -ext.length);
  let i = 2;
  while (usedNames.has(`${base}-${i}${ext}`)) i++;
  return `${base}-${i}${ext}`;
}

/** Most common source category across entries, singularized (e.g. "buttons" -> "button"). */
function mostCommonCategory(entries: AudioEntry[]): string {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const c = e.sourceCategory.toLowerCase();
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let best = "";
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best.endsWith("s") ? best.slice(0, -1) : best;
}

function collectTags(entries: AudioEntry[], maxTags: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const e of entries) {
    for (const tag of e.tags) {
      const lower = tag.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(lower);
        if (result.length >= maxTags) return result;
      }
    }
  }
  return result;
}

function main() {
  const catalogPath = process.argv[2];
  const outputPath = process.argv[3];

  if (!catalogPath || !outputPath) {
    console.error(
      "Usage: npx tsx scripts/generate-audio-catalog.ts <catalog.json> <output.md>"
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

  // 1. Extract all audio entries
  const allEntries: AudioEntry[] = [];
  for (const pack of catalog.assetPacks) {
    for (const asset of pack.assets) {
      if (asset.category === "deprecated") continue;
      for (const [filename, hash] of Object.entries(asset.contents)) {
        if (
          AUDIO_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext))
        ) {
          allEntries.push({
            assetName: asset.name,
            filename,
            sourceCategory: asset.category,
            tags: asset.tags,
            hash,
          });
        }
      }
    }
  }

  console.log(`Found ${allEntries.length} audio entries`);

  // 2. Group by content hash (deduplicate)
  const byHash = new Map<string, AudioEntry[]>();
  for (const entry of allEntries) {
    const group = byHash.get(entry.hash) || [];
    group.push(entry);
    byHash.set(entry.hash, group);
  }

  console.log(`${byHash.size} unique audio files (by content hash)`);

  // 3. Generate download names
  // Sort so descriptive filenames get first pick at names:
  //   - Non-generic filenames first (matching asset names first, then others)
  //   - Generic filenames last (larger groups first as they're more canonical)
  //   - Ties broken alphabetically by asset name
  const hashGroups = [...byHash.entries()];
  hashGroups.sort(([, a], [, b]) => {
    const aGeneric = GENERIC_FILENAMES.has(path.basename(a[0].filename).toLowerCase());
    const bGeneric = GENERIC_FILENAMES.has(path.basename(b[0].filename).toLowerCase());
    if (aGeneric !== bGeneric) return aGeneric ? 1 : -1;

    if (!aGeneric) {
      const aMatches = filenameMatchesAsset(a);
      const bMatches = filenameMatchesAsset(b);
      if (aMatches !== bMatches) return aMatches ? -1 : 1;
    } else {
      if (a.length !== b.length) return b.length - a.length;
    }

    return a[0].assetName.localeCompare(b[0].assetName);
  });

  const usedNames = new Set<string>();
  const sounds: UniqueSound[] = [];

  for (const [hash, entries] of hashGroups) {
    const rawFilename = path.basename(entries[0].filename);
    const ext = path.extname(rawFilename);
    const baseName = rawFilename.replace(ext, "");
    const isGeneric = GENERIC_FILENAMES.has(rawFilename.toLowerCase());

    let downloadAs: string;

    if (isGeneric) {
      const category = mostCommonCategory(entries);
      downloadAs = toKebabCase(`${category}-${baseName}`) + ext;
      if (usedNames.has(downloadAs)) {
        downloadAs = ensureUnique(
          toKebabCase(entries[0].assetName + "-" + baseName) + ext,
          usedNames
        );
      }
    } else {
      const cleaned = baseName.replace(/[_\s]*\([^)]*\)/g, ""); // strip "(1)" suffixes
      downloadAs = toKebabCase(cleaned) + ext;
      if (usedNames.has(downloadAs)) {
        downloadAs = toKebabCase(entries[0].assetName) + ext;
        if (usedNames.has(downloadAs)) {
          downloadAs = ensureUnique(
            toKebabCase(entries[0].assetName + "-" + cleaned) + ext,
            usedNames
          );
        }
      }
    }

    usedNames.add(downloadAs);

    const category = classifyCategory(entries);
    const name = buildDisplayName(entries);
    const tags = collectTags(entries, 5);

    sounds.push({ hash, name, downloadAs, tags, category });
  }

  // 4. Group by category and sort
  const categoryMap = new Map<string, UniqueSound[]>();
  for (const sound of sounds) {
    const group = categoryMap.get(sound.category) || [];
    group.push(sound);
    categoryMap.set(sound.category, group);
  }

  const categoryOrder = [
    "Music",
    "Ambient Sounds",
    "Interaction Sounds",
    "Sound Effects",
    "Game Mechanics",
  ];
  const sortedCategories = [...categoryMap.entries()].sort(
    (a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0])
  );

  for (const [, audios] of sortedCategories) {
    audios.sort((a, b) => a.downloadAs.localeCompare(b.downloadAs));
  }

  // 5. Build markdown
  const lines: string[] = [];

  lines.push("# Decentraland Audio Catalog");
  lines.push("");
  lines.push(
    "Free audio files from the official Decentraland Creator Hub asset packs. All sounds are free to use in Decentraland scenes."
  );
  lines.push("");
  lines.push(
    `**Total**: ${sounds.length} sounds across ${sortedCategories.length} categories`
  );
  lines.push("");
  lines.push("**How to use**:");
  lines.push("1. Find a sound below that matches your scene");
  lines.push('2. Download it: `curl -o sounds/filename.mp3 "URL"`');
  lines.push(
    "3. Reference it: `AudioSource.create(entity, { audioClipUrl: 'sounds/filename.mp3', playing: true, loop: false })`"
  );
  lines.push("");
  lines.push(
    "> **Important**: `AudioSource` only works with local files. Always download audio into the scene's `sounds/` directory first."
  );

  for (const [category, audios] of sortedCategories) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(`## ${category} (${audios.length} sounds)`);
    lines.push("");
    lines.push("| Name | Download As | Tags | Download |");
    lines.push("|------|-------------|------|----------|");

    for (const audio of audios) {
      const name = escapeMarkdownPipe(audio.name);
      const downloadAs = escapeMarkdownPipe(audio.downloadAs);
      const tags = escapeMarkdownPipe(audio.tags.join(", "));
      const downloadCmd = `\`curl -o sounds/${audio.downloadAs} "${CDN_BASE}/${audio.hash}"\``;

      lines.push(`| ${name} | ${downloadAs} | ${tags} | ${downloadCmd} |`);
    }
  }

  lines.push("");

  const markdown = lines.join("\n");

  const outputDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(resolvedOutput, markdown, "utf-8");

  console.log(`Generated: ${resolvedOutput}`);
  console.log(
    `  ${sounds.length} unique sounds across ${sortedCategories.length} categories`
  );
}

main();
