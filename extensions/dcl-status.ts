/**
 * DCL Status Extension
 *
 * Shows elapsed time and output token count in the working message spinner
 * during LLM inference, replacing the default "Working..." text with something
 * like "Thinking... (23s · ↓ 1.2k tokens)".
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

export function formatTokens(count: number): string {
  if (count < 1000) return `${count}`;
  return `${(count / 1000).toFixed(1)}k`;
}

type Phase = "Thinking" | "Generating" | "Tool call";

const extension: ExtensionFactory = (pi) => {
  let startTime = 0;
  let outputTokens = 0;
  let phase: Phase = "Thinking";
  let timer: ReturnType<typeof setInterval> | null = null;

  function update(ctx: { ui: { setWorkingMessage(msg?: string): void } }) {
    const elapsed = formatElapsed(Date.now() - startTime);
    const tokens = formatTokens(outputTokens);
    ctx.ui.setWorkingMessage(`${phase}... (${elapsed} · ↓ ${tokens} tokens)`);
  }

  function cleanup(ctx: { ui: { setWorkingMessage(msg?: string): void } }) {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    ctx.ui.setWorkingMessage();
  }

  pi.on("turn_start", async (event, ctx) => {
    startTime = (event as { timestamp?: number }).timestamp ?? Date.now();
    outputTokens = 0;
    phase = "Thinking";
    cleanup(ctx);
    update(ctx);
    timer = setInterval(() => update(ctx), 1000);
  });

  pi.on("message_update", async (event, ctx) => {
    const e = event as {
      message?: { usage?: { output?: number } };
      assistantMessageEvent?: { type?: string };
    };

    if (e.message?.usage?.output != null) {
      outputTokens = e.message.usage.output;
    }

    const ameType = e.assistantMessageEvent?.type;
    if (ameType) {
      if (ameType.startsWith("thinking")) {
        phase = "Thinking";
      } else if (ameType === "text_delta") {
        phase = "Generating";
      } else if (ameType.startsWith("tool")) {
        phase = "Tool call";
      }
    }

    update(ctx);
  });

  pi.on("turn_end", async (_event, ctx) => {
    cleanup(ctx);
  });

  pi.on("agent_end", async (_event, ctx) => {
    cleanup(ctx);
  });
};

export default extension;
