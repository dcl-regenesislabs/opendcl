/**
 * Shared background process registry.
 *
 * Uses globalThis + Symbol.for() to guarantee a single Map instance
 * even when pi-coding-agent loads extensions with moduleCache: false.
 */

export interface BackgroundProcess {
  /** Display name, e.g. "Preview server" */
  name: string;
  /** Optional extra info, e.g. "http://localhost:8000" */
  info?: string;
  /** Callback to stop the process */
  kill: () => void;
}

const REGISTRY_KEY = Symbol.for("opendcl.processes");

const _global = globalThis as Record<symbol, unknown>;
if (!_global[REGISTRY_KEY]) {
  _global[REGISTRY_KEY] = new Map<string, BackgroundProcess>();
}

/** Shared registry of running background processes, keyed by unique id. */
export const processes = _global[REGISTRY_KEY] as Map<string, BackgroundProcess>;
