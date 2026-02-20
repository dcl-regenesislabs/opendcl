/**
 * DCL Tasks Extension
 *
 * Provides the `tasks` tool (LLM-callable) for listing/stopping background tasks,
 * and the `/tasks` command for interactive management via a shared registry.
 * Also maintains a footer status indicator and cleans up on shutdown.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { processes } from "./process-registry.js";

function updateStatus(ctx: { ui: { setStatus(key: string, text: string | undefined): void } }): void {
  const names = Array.from(processes.values()).map((p) => p.name.toLowerCase());
  ctx.ui.setStatus("tasks", names.length > 0 ? `▶ ${names.join(", ")}` : undefined);
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

const extension: ExtensionFactory = (pi) => {
  pi.registerTool({
    name: "tasks",
    label: "Tasks",
    description: "List or stop running background tasks (preview server, etc.).",
    parameters: Type.Object({
      action: StringEnum(["list", "stop"] as const, { description: "Action to perform" }),
      name: Type.Optional(Type.String({ description: "Task name to stop (for stop action)" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      if (params.action === "list") {
        if (processes.size === 0) {
          return textResult("No background tasks running.");
        }
        const lines = Array.from(processes.entries()).map(
          ([id, p]) => `- ${id}: ${p.name}${p.info ? ` (${p.info})` : ""}`
        );
        return textResult(`Running tasks:\n${lines.join("\n")}`);
      }

      if (params.action === "stop") {
        if (!params.name) {
          return textResult("Please specify a task name to stop.");
        }
        const proc = processes.get(params.name);
        if (!proc) {
          const available = Array.from(processes.keys()).join(", ") || "none";
          return textResult(`Task "${params.name}" not found. Running tasks: ${available}`);
        }
        proc.kill();
        processes.delete(params.name);
        updateStatus(ctx);
        return textResult(`${proc.name} stopped.`);
      }

      return textResult(`Unknown action: ${params.action}`);
    },
  });

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

  pi.on("session_shutdown", () => {
    for (const [id, proc] of processes) {
      proc.kill();
      processes.delete(id);
    }
  });
};

export { updateStatus };
export default extension;
