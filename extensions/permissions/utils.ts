/**
 * Pure classification functions for permission gating.
 * No pi dependency — extracted for testability.
 */

import { resolve, relative } from "node:path";

export const OUTSIDE_CWD_REASON = "Accesses path outside working directory";

interface DenylistEntry {
  pattern: RegExp;
  reason: string;
}

const DANGEROUS_BASH_PATTERNS: DenylistEntry[] = [
  { pattern: /\brm\b/, reason: "Deletes files or directories" },
  { pattern: /\brmdir\b/, reason: "Removes directories" },
  { pattern: /\bmv\b/, reason: "Moves or renames files" },
  { pattern: /\bchmod\b/, reason: "Changes file permissions" },
  { pattern: /\bchown\b/, reason: "Changes file ownership" },
  { pattern: /\bdd\b/, reason: "Low-level disk write" },
  { pattern: /\bshred\b/, reason: "Securely deletes files" },
  { pattern: /\bsudo\b/, reason: "Runs with elevated privileges" },
  { pattern: /\bsu\b/, reason: "Switches user" },
  { pattern: /\bkill\b/, reason: "Terminates a process" },
  { pattern: /\bpkill\b/, reason: "Terminates processes by name" },
  { pattern: /\bkillall\b/, reason: "Terminates all matching processes" },
  { pattern: /\bgit\s+push\b/i, reason: "Pushes to a remote repository" },
  { pattern: /\bgit\s+reset\b/i, reason: "Resets git state" },
  { pattern: /\bgit\s+rebase\b/i, reason: "Rebases git history" },
  { pattern: /\bnpm\s+install\b/i, reason: "Installs npm packages (may run postinstall scripts)" },
  { pattern: /\bnpm\s+uninstall\b/i, reason: "Uninstalls npm packages" },
  { pattern: /\bnpm\s+publish\b/i, reason: "Publishes to npm registry" },
  { pattern: /\bcurl\b.*(-X\s*(POST|PUT|DELETE|PATCH)|--data|-d\s|-F\s|--upload)/i, reason: "Sends data via HTTP" },
  { pattern: /\bssh\b/, reason: "Opens remote shell connection" },
  { pattern: /\bscp\b/, reason: "Copies files to/from remote host" },
  { pattern: /\breboot\b/, reason: "Reboots the system" },
  { pattern: /\bshutdown\b/, reason: "Shuts down the system" },
  { pattern: /\btee\b/, reason: "Writes to files via pipe" },
  { pattern: /(^|\s)>(?![>&])\s*\S/, reason: "Redirects output to a file" },
  { pattern: />>/, reason: "Appends output to a file" },
];

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

function findMatchingReason(entries: DenylistEntry[], value: string): string | null {
  for (const { pattern, reason } of entries) {
    if (pattern.test(value)) return reason;
  }
  return null;
}

/**
 * Returns a reason string if the command is dangerous, or null if safe.
 * Callers can use the return value as both a boolean guard and a message.
 */
export function classifyBashCommand(command: string): string | null {
  return findMatchingReason(DANGEROUS_BASH_PATTERNS, command);
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
