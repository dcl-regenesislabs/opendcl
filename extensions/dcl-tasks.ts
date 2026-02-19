/**
 * DCL Tasks Extension
 *
 * Provides the /tasks command for interactive management of all
 * background tasks (preview server, etc.) via a shared registry.
 * Also maintains a footer status indicator and cleans up on shutdown.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { processes } from "./process-registry.js";

function updateStatus(ctx: { ui: { setStatus(key: string, text: string | undefined): void } }): void {
  const names = Array.from(processes.values()).map((p) => p.name.toLowerCase());
  if (names.length > 0) {
    ctx.ui.setStatus("tasks", `▶ ${names.join(", ")}`);
  } else {
    ctx.ui.setStatus("tasks", undefined);
  }
}

const extension: ExtensionFactory = (pi) => {
  pi.registerCommand("tasks", {
    description: "Manage running background tasks",
    handler: async (_args, ctx) => {
      if (processes.size === 0) {
        ctx.ui.notify("No background tasks running.", "info");
        return;
      }

      const entries = Array.from(processes.entries());
      const options = entries.map(([_id, p]) => (p.info ? `${p.name} — ${p.info}` : p.name));
      options.push("Close menu");

      const selected = await ctx.ui.select("Background tasks", options);

      if (!selected || selected === "Close menu") return;

      // Find which process was selected
      const idx = options.indexOf(selected);
      if (idx < 0 || idx >= entries.length) return;

      const [id, proc] = entries[idx];

      const action = await ctx.ui.select(proc.name, ["Stop it", "Back"]);
      if (action !== "Stop it") return;

      proc.kill();
      processes.delete(id);
      ctx.ui.notify(`${proc.name} stopped.`, "info");
      updateStatus(ctx);
    },
  });

  // Clean up all registered processes on shutdown
  pi.on("session_shutdown", () => {
    for (const [id, proc] of processes) {
      proc.kill();
      processes.delete(id);
    }
  });
};

export { updateStatus };
export default extension;
