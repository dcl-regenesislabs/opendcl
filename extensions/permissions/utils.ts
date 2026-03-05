/**
 * Pure classification functions for permission gating.
 * No pi dependency — extracted for testability.
 *
 * Uses an ALLOWLIST model for bash commands: only known-safe (read-only,
 * informational) commands pass without prompting. Everything else requires
 * user confirmation. This is safer than a denylist — unknown commands are
 * blocked by default instead of slipping through.
 */

import { resolve, relative } from "node:path";

export const OUTSIDE_CWD_REASON = "Accesses path outside working directory";

/**
 * Allowlisted command patterns — read-only, informational commands that
 * cannot modify files, send data, or access sensitive system resources.
 *
 * Each pattern is tested against the FIRST command token (the binary name).
 * Piped/chained commands are split and each segment is checked independently.
 */
const SAFE_COMMANDS: RegExp[] = [
  // Filesystem read-only
  /^ls$/,
  /^cat$/,
  /^head$/,
  /^tail$/,
  /^less$/,
  /^more$/,
  /^find$/,
  /^tree$/,
  /^wc$/,
  /^file$/,
  /^stat$/,
  /^du$/,
  /^df$/,
  /^readlink$/,
  /^realpath$/,
  /^basename$/,
  /^dirname$/,

  // Text processing (read-only)
  /^grep$/,
  /^rg$/,
  /^awk$/,
  /^sed$/, // sed without -i is read-only; -i is caught by flag check
  /^sort$/,
  /^uniq$/,
  /^cut$/,
  /^tr$/,
  /^diff$/,
  /^comm$/,
  /^paste$/,
  /^column$/,
  /^fold$/,
  /^fmt$/,
  /^expand$/,
  /^unexpand$/,
  /^nl$/,
  /^pr$/,
  /^rev$/,
  /^tac$/,
  /^strings$/,
  /^hexdump$/,
  /^xxd$/,
  /^od$/,
  /^jq$/,
  /^yq$/,
  /^xargs$/,

  // Shell builtins / info
  /^echo$/,
  /^printf$/,
  /^pwd$/,
  /^whoami$/,
  /^id$/,
  /^which$/,
  /^type$/,
  /^command$/,
  /^true$/,
  /^false$/,
  /^test$/,
  /^\[$/,
  /^date$/,
  /^cal$/,
  /^uptime$/,
  /^uname$/,
  /^hostname$/,
  /^arch$/,
  /^env$/,
  /^printenv$/,
  /^set$/,
  /^export$/,
  /^sleep$/,
  /^time$/,
  /^seq$/,
  /^yes$/,
  /^expr$/,
  /^bc$/,

  // Process info (read-only)
  /^ps$/,
  /^top$/,
  /^htop$/,
  /^pgrep$/,
  /^lsof$/,

  // Node / npm (read-only operations)
  /^node$/,
  /^npx$/,
  /^npm$/,  // further filtered by subcommand check below
  /^tsc$/,

  // Git (read-only operations)
  /^git$/,  // further filtered by subcommand check below

  // Network read-only
  /^curl$/,  // further filtered below (GET only)
  /^ping$/,
  /^dig$/,
  /^nslookup$/,
  /^host$/,
  /^traceroute$/,
  /^ifconfig$/,
  /^ip$/,

  // Misc read-only
  /^man$/,
  /^help$/,
  /^info$/,
  /^whatis$/,
  /^apropos$/,
  /^md5$/,
  /^md5sum$/,
  /^shasum$/,
  /^sha256sum$/,
  /^base64$/,
];

/**
 * Commands from the allowlist that need subcommand-level filtering.
 * If a command matches here, only the listed subcommands are safe.
 * Unlisted subcommands require confirmation.
 */
const SAFE_SUBCOMMANDS: Record<string, RegExp[]> = {
  git: [
    /^status\b/,
    /^log\b/,
    /^diff\b/,
    /^show\b/,
    /^branch\b/,
    /^tag\b/,
    /^remote\b/,
    /^stash\s+list\b/,
    /^ls-files\b/,
    /^ls-tree\b/,
    /^cat-file\b/,
    /^rev-parse\b/,
    /^describe\b/,
    /^shortlog\b/,
    /^blame\b/,
    /^reflog\b/,
    /^config\s+--get/,
    /^config\s+-l\b/,
    /^config\s+--list\b/,
  ],
  npm: [
    /^test\b/,
    /^t\b/,
    /^run\b/,
    /^ls\b/,
    /^list\b/,
    /^outdated\b/,
    /^view\b/,
    /^info\b/,
    /^explain\b/,
    /^why\b/,
    /^audit\b/,
    /^doctor\b/,
    /^config\s+(list|get)/,
    /^prefix\b/,
    /^root\b/,
    /^bin\b/,
    /^version\b/,
    /^--version\b/,
    /^help\b/,
  ],
};

/**
 * Flags on otherwise-safe commands that make them unsafe.
 * If any of these flags appear, the command requires confirmation.
 */
const UNSAFE_FLAGS: Record<string, RegExp[]> = {
  sed: [/-i\b/],
  curl: [/-X\s*(POST|PUT|DELETE|PATCH)/i, /--data\b/, /-d\s/, /-F\s/, /--upload\b/, /-o\s/, /--output\b/],
};

interface DenylistEntry {
  pattern: RegExp;
  reason: string;
}

const SENSITIVE_FILE_PATTERNS: DenylistEntry[] = [
  { pattern: /\.env($|\.)/, reason: "Environment variables (may contain secrets)" },
  { pattern: /\.pem$/, reason: "Private key file" },
  { pattern: /\.key$/, reason: "Private key file" },
  { pattern: /\.crt$/, reason: "Certificate file" },
  { pattern: /credentials/i, reason: "Credentials file" },
  { pattern: /\.secret/i, reason: "Secret file" },
  { pattern: /(^|\/)package\.json$/, reason: "Package manifest (affects dependencies)" },
  { pattern: /(^|\/)tsconfig\.json$/, reason: "TypeScript configuration" },
  { pattern: /(^|\/)\.git\//, reason: "Git internal file" },
];

/**
 * Extracts individual command segments from a shell command string.
 * Splits on pipes (|), logical operators (&&, ||), and semicolons.
 */
function splitCommands(command: string): string[] {
  return command
    .split(/\s*(?:\|(?!\|)|\|\||&&|;)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Extracts the binary name from a command segment.
 * Strips leading env vars, sudo, and path prefixes.
 */
function extractBinary(segment: string): string {
  // Strip leading env-var assignments (FOO=bar cmd)
  let s = segment.replace(/^(\s*\w+=\S*\s+)+/, "");
  // Take the first token
  const token = s.trim().split(/\s+/)[0] ?? "";
  // Strip path prefix (/usr/bin/ls → ls)
  return token.replace(/^.*\//, "");
}

/**
 * Extracts the subcommand portion (everything after the binary) from a command segment.
 */
function extractSubcommand(segment: string): string {
  let s = segment.replace(/^(\s*\w+=\S*\s+)+/, "");
  const tokens = s.trim().split(/\s+/);
  return tokens.slice(1).join(" ");
}

/** Returns true if the command segment has output redirection (> or >>) */
function hasRedirection(segment: string): boolean {
  // Match > or >> but not >& or >&2
  return /(^|\s)>{1,2}(?![>&])\s*\S/.test(segment);
}

function isSafeSegment(segment: string): boolean {
  if (hasRedirection(segment)) return false;

  const binary = extractBinary(segment);
  if (!binary) return false;

  const isAllowlisted = SAFE_COMMANDS.some((p) => p.test(binary));
  if (!isAllowlisted) return false;

  // Check subcommand restrictions
  const subcommandRules = SAFE_SUBCOMMANDS[binary];
  if (subcommandRules) {
    const sub = extractSubcommand(segment);
    if (!sub) return binary !== "git" && binary !== "npm"; // bare `git`/`npm` without subcommand → unsafe
    const subMatch = subcommandRules.some((p) => p.test(sub));
    if (!subMatch) return false;
  }

  // Check unsafe flags on otherwise-safe commands
  const flagRules = UNSAFE_FLAGS[binary];
  if (flagRules) {
    if (flagRules.some((p) => p.test(segment))) return false;
  }

  return true;
}

/**
 * Returns a reason string if the command requires confirmation, or null if safe.
 * Uses an allowlist model — only known read-only commands pass without prompting.
 */
export function classifyBashCommand(command: string): string | null {
  const segments = splitCommands(command);
  if (segments.length === 0) return null;

  for (const segment of segments) {
    if (!isSafeSegment(segment)) {
      const binary = extractBinary(segment);
      return `Requires confirmation: \`${binary || segment.slice(0, 40)}\``;
    }
  }

  return null;
}

function findMatchingReason(entries: DenylistEntry[], value: string): string | null {
  for (const { pattern, reason } of entries) {
    if (pattern.test(value)) return reason;
  }
  return null;
}

/**
 * Returns a reason string if the file path is sensitive or outside the
 * project root, or null if safe.
 */
export function classifyFilePath(filePath: string, projectRoot: string): string | null {
  const resolved = resolve(projectRoot, filePath);
  const rel = relative(projectRoot, resolved);

  if (rel.startsWith("..")) {
    return OUTSIDE_CWD_REASON;
  }

  return findMatchingReason(SENSITIVE_FILE_PATTERNS, filePath);
}

/**
 * Returns a reason string if the file path resolves outside the given cwd,
 * or null if inside (or empty).
 */
export function isOutsideCwd(filePath: string, cwd: string): string | null {
  if (!filePath) return null;
  const resolved = resolve(cwd, filePath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..")) return OUTSIDE_CWD_REASON;
  return null;
}
