/**
 * DCL Screenshot Extension
 *
 * Registers the `screenshot` tool (LLM-callable) that captures a screenshot
 * of the running Decentraland preview. Uses playwright-core with system Chrome
 * for headless browser automation.
 *
 * Features:
 * - Persistent browser window — launch once, reuse forever (no repeated logins)
 * - User consent prompt before first use
 * - Auto-detects preview URL from the process registry (/preview)
 * - Auto-dismisses the "Explore as Guest" welcome screen on first load
 * - Supports input actions (click, key, move, look, drag, wait) before capture
 * - Returns screenshot as base64 image directly in tool result
 *
 * Chrome flags for Bevy-Web renderer (WebGPU via Metal on macOS):
 *   --enable-gpu --use-gl=angle --use-angle=metal --ignore-gpu-blocklist
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { processes } from "./process-registry.js";

// ── Lazy-loaded playwright types ───────────────────────────────────────────

type Browser = import("playwright-core").Browser;
type Page = import("playwright-core").Page;
type ConsoleMessage = import("playwright-core").ConsoleMessage;

// ── Action types ───────────────────────────────────────────────────────────

interface Action {
  type:
    | "click"
    | "key"
    | "mouse"
    | "wait"
    | "lookLeft"
    | "lookRight"
    | "lookUp"
    | "lookDown"
    | "moveForward"
    | "moveBack"
    | "moveLeft"
    | "moveRight";
  x?: number;
  y?: number;
  key?: string;
  holdMs?: number;
  dx?: number;
  dy?: number;
  ms?: number;
}

/** Default duration (ms) to hold movement keys. */
const MOVE_HOLD_MS = 300;
/** Process registry key for the screenshot browser. */
const PROCESS_NAME = "screenshot-browser";
/** Relative position of the "Explore as Guest" button on the Bevy-Web renderer welcome canvas.
 *  Calibrated for the Bevy-Web renderer layout — may need updating if the welcome screen changes. */
const WELCOME_BUTTON_POS = { x: 0.237, y: 0.583 };

// ── Chrome flags for Bevy-Web (WebGPU via Metal) ──────────────────────────

const CHROME_FLAGS = [
  // The local dev server (localhost) serves assets and WASM from different ports/origins.
  // Without these flags, CORS blocks the renderer from loading scene content.
  "--disable-web-security",
  "--allow-insecure-localhost",
  "--disable-features=PrivateNetworkAccessPermissionPrompt",
  "--enable-gpu",
  "--enable-webgl",
  "--ignore-gpu-blocklist",
  "--enable-features=Vulkan",
  "--use-gl=angle",
  "--use-angle=metal",
];

// ── Viewport helpers ──────────────────────────────────────────────────────

function getViewportCenter(page: Page): { x: number; y: number } {
  const size = page.viewportSize();
  if (size) return { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
  return { x: 640, y: 360 };
}

// ── Execute input actions ─────────────────────────────────────────────────

async function executeActions(page: Page, actions: Action[]): Promise<void> {
  for (const action of actions) {
    switch (action.type) {
      case "click":
        await page.mouse.click(action.x ?? 0, action.y ?? 0);
        break;

      case "key":
        if (!action.key) throw new Error('key action requires a "key" parameter');
        if (action.holdMs) {
          await page.keyboard.down(action.key);
          await page.waitForTimeout(action.holdMs);
          await page.keyboard.up(action.key);
        } else {
          await page.keyboard.press(action.key);
        }
        break;

      case "mouse": {
        const center = getViewportCenter(page);
        await page.mouse.move(center.x, center.y);
        await page.mouse.down();
        await page.mouse.move(
          center.x + (action.dx ?? 0),
          center.y + (action.dy ?? 0),
          { steps: 10 },
        );
        await page.mouse.up();
        break;
      }

      case "wait":
        await page.waitForTimeout(action.ms ?? 1000);
        break;

      // Camera look (arrow keys) and WASD movement (key holds)
      case "lookLeft":
      case "lookRight":
      case "lookUp":
      case "lookDown":
      case "moveForward":
      case "moveBack":
      case "moveLeft":
      case "moveRight": {
        const keyMap: Record<string, string> = {
          lookLeft: "ArrowLeft",
          lookRight: "ArrowRight",
          lookUp: "ArrowUp",
          lookDown: "ArrowDown",
          moveForward: "w",
          moveBack: "s",
          moveLeft: "a",
          moveRight: "d",
        };
        const ms = action.holdMs ?? MOVE_HOLD_MS;
        await page.keyboard.down(keyMap[action.type]);
        await page.waitForTimeout(ms);
        await page.keyboard.up(keyMap[action.type]);
        break;
      }
    }
  }
}

// ── Extension ─────────────────────────────────────────────────────────────

const extension: ExtensionFactory = (pi) => {
  let browser: Browser | null = null;
  let persistentPage: Page | null = null;
  let currentPreviewUrl: string | null = null;
  let sceneEntered = false;
  let userConsented: boolean | null = null;

  function resetPageState(): void {
    persistentPage = null;
    currentPreviewUrl = null;
    sceneEntered = false;
  }

  async function launchBrowser(): Promise<Browser> {
    if (browser?.isConnected()) return browser;

    const pw = await import("playwright-core");
    browser = await pw.chromium.launch({
      channel: "chrome",
      headless: true,
      args: CHROME_FLAGS,
    });

    // Register in process registry so /tasks can manage it
    processes.set(PROCESS_NAME, {
      name: "Screenshot browser",
      info: "headless Chrome for preview screenshots",
      kill: () => closeBrowser(),
    });

    return browser;
  }

  async function closeBrowser(): Promise<void> {
    resetPageState();
    if (browser) {
      try { await browser.close(); } catch { /* already closed */ }
      browser = null;
    }
    processes.delete(PROCESS_NAME);
  }

  /**
   * Enter the Decentraland scene — dismiss the "Explore as Guest" welcome screen.
   * Uses fixed coordinate click (24% x, 58% y) which works with Bevy-Web renderer.
   */
  async function enterScene(page: Page): Promise<void> {
    // Set up asset listener before entering
    let assetsReady = false;
    const onConsole = (msg: ConsoleMessage) => {
      if (msg.text().includes("pendingAssets: 0")) assetsReady = true;
    };
    page.on("console", onConsole);

    try {
      // Wait for canvas to appear
      const canvas = page.locator("canvas").first();
      await canvas.waitFor({ timeout: 30_000 });
      await page.waitForTimeout(4_000);

      const box = await canvas.boundingBox();
      if (!box) throw new Error("No canvas found after page load");

      // Click "EXPLORE AS GUEST" button
      for (let attempt = 0; attempt < 3; attempt++) {
        await page.mouse.click(
          box.x + box.width * WELCOME_BUTTON_POS.x,
          box.y + box.height * WELCOME_BUTTON_POS.y,
        );
        await page.waitForTimeout(400);
      }

      // Wait for scene assets to load
      for (let i = 0; i < 20; i++) {
        if (assetsReady) break;
        await page.waitForTimeout(1000);
      }
      if (!assetsReady) {
        console.warn("[screenshot] Asset loading timed out (20s) — capturing anyway");
      }
      await page.waitForTimeout(1_000);

      // Click canvas center for pointer lock / focus
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(300);
    } finally {
      page.removeListener("console", onConsole);
    }
  }

  /**
   * Get the persistent page, navigating + entering scene only when needed.
   * Subsequent calls with the same preview URL skip all setup.
   */
  async function getPage(
    previewUrl: string,
    onUpdate?: (msg: string) => void,
  ): Promise<Page> {
    const instance = await launchBrowser();

    // Reuse existing page if still alive and URL matches
    if (persistentPage && currentPreviewUrl === previewUrl) {
      try {
        await persistentPage.evaluate(() => true);
        return persistentPage;
      } catch {
        // Page crashed — recreate
        resetPageState();
      }
    }

    // Close stale page if URL changed
    if (persistentPage) {
      try { await persistentPage.close(); } catch { /* already closed */ }
      resetPageState();
    }

    onUpdate?.("Launching browser and navigating to preview...");
    const page = await instance.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(previewUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Enter scene (welcome screen + asset loading).
    // Set persistentPage only after success — if enterScene throws, the page
    // won't be cached and the next call will start fresh instead of reusing
    // a page that never entered the scene.
    if (!sceneEntered) {
      onUpdate?.("Entering scene (dismissing welcome screen, loading assets)...");
      try {
        await enterScene(page);
        sceneEntered = true;
      } catch (err) {
        try { await page.close(); } catch { /* ignore */ }
        throw err;
      }
    }

    persistentPage = page;
    currentPreviewUrl = previewUrl;
    return page;
  }

  // ── Register the screenshot tool ──────────────────────────────────────

  pi.registerTool({
    name: "screenshot",
    label: "Screenshot",
    description: `Capture a screenshot of the running Decentraland preview. Start the preview first with /preview.

The browser stays open between calls — only the first screenshot navigates and enters the scene (~15s). Subsequent screenshots are instant.

## Actions (optional, performed before capture)
Low-level: click (x,y coords), key (press/hold), mouse (relative drag), wait
High-level helpers:
- lookLeft / lookRight / lookUp / lookDown — arrow key camera rotation (holdMs duration, default 300ms)
- moveForward / moveBack / moveLeft / moveRight — WASD movement (holdMs duration, default 300ms)

Movement speed is ~6m/s. Each parcel is 16m. Keep movements small (holdMs: 300). Stay within scene boundaries. If you see empty/gray space or no scene content, you've left the scene — stop moving.

IMPORTANT: Use sparingly. Make code changes first, then take 1-2 screenshots to verify. Do not use screenshots to explore the scene.`,
    promptGuidelines: [
      "Use screenshot sparingly — only to verify the final result after making code changes, not to explore or navigate. Take 1-2 screenshots per task, not after every small change.",
      "Each screenshot consumes significant tokens. Make all your code changes first, then take one screenshot to verify.",
      "If the screenshot tool fails (no Chrome, browser crash, user declined), continue working normally without vision. Tell the user what happened and suggest they check the preview manually.",
      "Don't retry screenshot more than once if it fails — fall back to asking the user to verify visually.",
    ],
    parameters: Type.Object({
      wait: Type.Optional(
        Type.Number({
          description:
            "Extra ms to wait before capturing (for hot-reload settle). Default: 1000. First call auto-waits for scene load.",
          default: 1000,
        }),
      ),
      actions: Type.Optional(
        Type.Array(
          Type.Object({
            type: Type.Union([
              Type.Literal("click"),
              Type.Literal("key"),
              Type.Literal("mouse"),
              Type.Literal("wait"),
              Type.Literal("lookLeft"),
              Type.Literal("lookRight"),
              Type.Literal("lookUp"),
              Type.Literal("lookDown"),
              Type.Literal("moveForward"),
              Type.Literal("moveBack"),
              Type.Literal("moveLeft"),
              Type.Literal("moveRight"),
            ]),
            x: Type.Optional(Type.Number({ description: "X pixel coordinate for click" })),
            y: Type.Optional(Type.Number({ description: "Y pixel coordinate for click" })),
            key: Type.Optional(Type.String({ description: "Key to press (for key action)" })),
            holdMs: Type.Optional(
              Type.Number({ description: "Hold duration in ms (key, movement, or look, default 300ms)" }),
            ),
            dx: Type.Optional(
              Type.Number({ description: "Relative X pixels (mouse drag)" }),
            ),
            dy: Type.Optional(
              Type.Number({ description: "Relative Y pixels (mouse drag)" }),
            ),
            ms: Type.Optional(
              Type.Number({ description: "Wait duration in ms (for wait action)" }),
            ),
          }),
          { description: "Input actions to perform before taking the screenshot" },
        ),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const { wait: waitMs = 1000, actions } = params as {
        wait?: number;
        actions?: Action[];
      };

      const onUpdate = (msg: string) => _onUpdate?.({
        content: [{ type: "text" as const, text: msg }],
        details: undefined,
      });

      // Check if preview is running
      const preview = processes.get("preview");
      if (!preview?.info) {
        return {
          content: [{
            type: "text" as const,
            text: preview
              ? "Preview server is still starting — URL not ready yet. Wait a moment and try again."
              : "No preview server running. Start one first with /preview.",
          }],
          details: undefined,
        };
      }

      // Ask user for consent on first use
      if (userConsented === null) {
        const agreed = await ctx.ui.confirm(
          "Enable Screenshot Tool",
          "OpenDCL wants to open a headless browser to capture screenshots of your scene preview. This lets the AI see what your scene looks like and iterate visually.\n\nAllow?",
        );
        userConsented = agreed;
        if (!agreed) {
          return {
            content: [{
              type: "text" as const,
              text: "Screenshot tool declined by user. The AI cannot see the preview.",
            }],
            details: undefined,
          };
        }
      }

      if (!userConsented) {
        return {
          content: [{
            type: "text" as const,
            text: "Screenshot tool was previously declined. Restart the session to re-enable.",
          }],
          details: undefined,
        };
      }

      const previewUrl = preview.info;

      try {
        const page = await getPage(previewUrl, onUpdate);

        // Execute actions before screenshot
        if (actions?.length) {
          onUpdate("Performing actions...");
          await executeActions(page, actions);
        }

        // Wait for hot-reload / render settle
        if (waitMs > 0) {
          await page.waitForTimeout(waitMs);
        }

        onUpdate("Capturing screenshot...");
        const buffer = await page.screenshot({ type: "png", timeout: 30_000 });
        const base64 = buffer.toString("base64");

        return {
          content: [
            {
              type: "text" as const,
              text: `Screenshot captured (1280×720) from ${previewUrl}`,
            },
            { type: "image" as const, data: base64, mimeType: "image/png" },
          ],
          details: undefined,
        };
      } catch (err) {
        // Reset on failure so next call retries fresh
        resetPageState();
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          content: [{
            type: "text" as const,
            text: `Screenshot failed: ${errorMsg}\n\nContinue working without visual feedback. Ask the user to check the preview in their browser and describe what they see.`,
          }],
          details: undefined,
        };
      }
    },
  });

  // ── Cleanup on shutdown ──────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    await closeBrowser();
  });
};

export default extension;
