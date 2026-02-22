/**
 * DCL Screenshot Extension
 *
 * Registers the `screenshot` tool (LLM-callable) that captures a screenshot
 * of the running Decentraland preview. Uses playwright-core with system Chrome
 * (or Playwright's bundled Chromium as fallback) for headless browser automation.
 *
 * Supports optional input actions (click, key, mouse, wait) before capture,
 * and automatically handles the "Continue as guest" auth screen.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { Type } from "@sinclair/typebox";
import { processes } from "./process-registry.js";

type Browser = import("playwright-core").Browser;
type Page = import("playwright-core").Page;

interface Action {
  type: "click" | "clickText" | "key" | "mouse" | "wait";
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  holdMs?: number;
  dx?: number;
  dy?: number;
  ms?: number;
}

/** Try to find a system Chrome/Chromium executable. */
function findSystemChrome(): string | null {
  if (process.platform === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
  } else if (process.platform === "win32") {
    const envPaths = [
      process.env.ProgramFiles,
      process.env["ProgramFiles(x86)"],
      process.env.LOCALAPPDATA,
    ].filter(Boolean) as string[];
    for (const base of envPaths) {
      const p = `${base}\\Google\\Chrome\\Application\\chrome.exe`;
      if (existsSync(p)) return p;
    }
  } else {
    for (const cmd of ["google-chrome", "chromium", "chromium-browser"]) {
      try {
        const result = execSync(`which ${cmd}`, { encoding: "utf-8" }).trim();
        if (result) return result;
      } catch {
        // not found, try next
      }
    }
  }
  return null;
}

/** Find Chrome: system install first, then Playwright's bundled Chromium. */
async function findChrome(): Promise<string | null> {
  const system = findSystemChrome();
  if (system) return system;

  try {
    const pw = await import("playwright-core");
    const path = (pw.chromium as any).executablePath?.();
    if (path && existsSync(path)) return path;
  } catch {
    // playwright-core not available or no bundled browser
  }

  return null;
}

async function executeActions(page: Page, actions: Action[]): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case "click":
        await page.mouse.click(action.x ?? 0, action.y ?? 0);
        break;
      case "clickText":
        await page.getByText(action.text ?? "").click({ timeout: 5000 });
        break;
      case "key":
        if (action.holdMs) {
          await page.keyboard.down(action.key ?? "");
          await page.waitForTimeout(action.holdMs);
          await page.keyboard.up(action.key ?? "");
        } else {
          await page.keyboard.press(action.key ?? "");
        }
        break;
      case "mouse": {
        // Relative mouse drag from center of viewport (camera control)
        const center = { x: 640, y: 360 };
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(
          center.x + (action.dx ?? 0),
          center.y + (action.dy ?? 0),
          { steps: 10 }
        );
        await page.mouse.up();
        break;
      }
      case "wait":
        await page.waitForTimeout(action.ms ?? 1000);
        break;
    }
  }
}

const extension: ExtensionFactory = (pi) => {
  let browser: Browser | null = null;

  async function launchBrowser(): Promise<Browser> {
    if (browser?.isConnected()) return browser;

    const executablePath = await findChrome();
    if (!executablePath) {
      throw new Error(
        "Chrome/Chromium not found. Install Google Chrome or run: npx playwright install chromium"
      );
    }

    const pw = await import("playwright-core");
    browser = await pw.chromium.launch({
      executablePath,
      headless: true,
      args: ["--use-gl=swiftshader"],
    });

    return browser;
  }

  async function closeBrowser(): Promise<void> {
    if (browser) {
      try { await browser.close(); } catch { /* already closed */ }
      browser = null;
    }
  }

  pi.registerTool({
    name: "screenshot",
    label: "Screenshot",
    description:
      "Capture a screenshot of the running Decentraland preview. Supports actions (click, key press, mouse move) to interact with the scene before capturing. Start the preview first with /preview.",
    parameters: Type.Object({
      wait: Type.Optional(
        Type.Number({
          description: "Milliseconds to wait for render before capturing. Default: 5000",
          default: 5000,
        })
      ),
      actions: Type.Optional(
        Type.Array(
          Type.Object({
            type: Type.Union([
              Type.Literal("click"),
              Type.Literal("clickText"),
              Type.Literal("key"),
              Type.Literal("mouse"),
              Type.Literal("wait"),
            ]),
            x: Type.Optional(Type.Number({ description: "X coordinate for click" })),
            y: Type.Optional(Type.Number({ description: "Y coordinate for click" })),
            text: Type.Optional(Type.String({ description: "Text to click (for clickText)" })),
            key: Type.Optional(Type.String({ description: "Key to press (for key action)" })),
            holdMs: Type.Optional(Type.Number({ description: "Hold duration in ms (for key action)" })),
            dx: Type.Optional(Type.Number({ description: "Relative X movement (for mouse drag)" })),
            dy: Type.Optional(Type.Number({ description: "Relative Y movement (for mouse drag)" })),
            ms: Type.Optional(Type.Number({ description: "Wait duration in ms (for wait action)" })),
          }),
          { description: "Input actions to perform before screenshot" }
        )
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const { wait: waitMs = 5000, actions } = params as {
        wait?: number;
        actions?: Action[];
      };

      const preview = processes.get("preview");
      if (!preview) {
        return {
          content: [{ type: "text" as const, text: "No preview server running. Start one first with /preview." }],
          details: undefined,
        };
      }
      if (!preview.info) {
        return {
          content: [{ type: "text" as const, text: "Preview server is still starting up — URL not ready yet. Wait a moment and try again." }],
          details: undefined,
        };
      }

      const previewUrl = preview.info;

      let instance: Browser;
      try {
        instance = await launchBrowser();
      } catch (err) {
        return {
          content: [{
            type: "text" as const,
            text: err instanceof Error ? err.message : String(err),
          }],
          details: undefined,
        };
      }

      let page: Page | null = null;
      try {
        page = await instance.newPage({ viewport: { width: 1280, height: 720 } });
        await page.goto(previewUrl, { waitUntil: "load", timeout: 30000 });

        // Dismiss auth screen if present
        const guestBtn = page.getByText("Continue as guest");
        if (await guestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
          await guestBtn.click();
          await page.waitForTimeout(2000);
        }

        if (actions?.length) {
          await executeActions(page, actions);
        }

        await page.waitForTimeout(waitMs);

        const buffer = await page.screenshot({ type: "png" });
        const base64 = buffer.toString("base64");

        return {
          content: [
            { type: "text" as const, text: `Screenshot captured from ${previewUrl} (1280x720)` },
            { type: "image" as const, data: base64, mimeType: "image/png" },
          ],
          details: { url: previewUrl, viewport: "1280x720", waitMs },
        };
      } catch (err) {
        return {
          content: [{
            type: "text" as const,
            text: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
          }],
          details: undefined,
        };
      } finally {
        if (page) {
          try { await page.close(); } catch { /* already closed */ }
        }
      }
    },
  });

  pi.on("session_shutdown", async () => {
    await closeBrowser();
  });
};

export default extension;
