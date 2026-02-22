/**
 * DCL Screenshot Extension
 *
 * Registers the `screenshot` tool (LLM-callable) that captures a screenshot
 * of the running Decentraland preview. Uses playwright-core with system Chrome
 * (or Playwright's bundled Chromium as fallback) for headless browser automation.
 *
 * Supports optional input actions (click, key, mouse, wait, and high-level
 * movement/camera helpers) before capture. Keeps a persistent page between
 * calls for fast iteration — only navigates on first call or when the preview
 * URL changes.
 */

import type { ExtensionFactory } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { Type } from "@sinclair/typebox";
import { processes } from "./process-registry.js";

type Browser = import("playwright-core").Browser;
type Page = import("playwright-core").Page;

interface Action {
  type:
    | "click"
    | "clickText"
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
  text?: string;
  key?: string;
  holdMs?: number;
  dx?: number;
  dy?: number;
  ms?: number;
}

/** Default pixels to drag for look actions. */
const LOOK_DRAG_PX = 200;
/** Default duration (ms) to hold movement keys. */
const MOVE_HOLD_MS = 500;

/** Try to find a system Chrome/Chromium executable. */
function findSystemChrome(): string | null {
  if (process.platform === "darwin") {
    const paths = [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
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
    const subPaths = [
      "Google\\Chrome\\Application\\chrome.exe",
      "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
    ];
    for (const base of envPaths) {
      for (const sub of subPaths) {
        const p = `${base}\\${sub}`;
        if (existsSync(p)) return p;
      }
    }
  } else {
    for (const cmd of ["google-chrome", "chromium", "chromium-browser", "brave-browser"]) {
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

/** Get viewport center from page, falling back to 1280x720 default. */
function getViewportCenter(page: Page): { x: number; y: number } {
  const size = page.viewportSize();
  if (size) return { x: Math.round(size.width / 2), y: Math.round(size.height / 2) };
  return { x: 640, y: 360 };
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

      // High-level camera look actions (mouse drags from viewport center)
      case "lookLeft": {
        const c = getViewportCenter(page);
        const px = action.dx ? Math.abs(action.dx) : LOOK_DRAG_PX;
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.mouse.move(c.x - px, c.y, { steps: 10 });
        await page.mouse.up();
        break;
      }
      case "lookRight": {
        const c = getViewportCenter(page);
        const px = action.dx ? Math.abs(action.dx) : LOOK_DRAG_PX;
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.mouse.move(c.x + px, c.y, { steps: 10 });
        await page.mouse.up();
        break;
      }
      case "lookUp": {
        const c = getViewportCenter(page);
        const px = action.dy ? Math.abs(action.dy) : LOOK_DRAG_PX;
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.mouse.move(c.x, c.y - px, { steps: 10 });
        await page.mouse.up();
        break;
      }
      case "lookDown": {
        const c = getViewportCenter(page);
        const px = action.dy ? Math.abs(action.dy) : LOOK_DRAG_PX;
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await page.mouse.move(c.x, c.y + px, { steps: 10 });
        await page.mouse.up();
        break;
      }

      // High-level movement actions (WASD key holds)
      case "moveForward": {
        const ms = action.holdMs ?? MOVE_HOLD_MS;
        await page.keyboard.down("w");
        await page.waitForTimeout(ms);
        await page.keyboard.up("w");
        break;
      }
      case "moveBack": {
        const ms = action.holdMs ?? MOVE_HOLD_MS;
        await page.keyboard.down("s");
        await page.waitForTimeout(ms);
        await page.keyboard.up("s");
        break;
      }
      case "moveLeft": {
        const ms = action.holdMs ?? MOVE_HOLD_MS;
        await page.keyboard.down("a");
        await page.waitForTimeout(ms);
        await page.keyboard.up("a");
        break;
      }
      case "moveRight": {
        const ms = action.holdMs ?? MOVE_HOLD_MS;
        await page.keyboard.down("d");
        await page.waitForTimeout(ms);
        await page.keyboard.up("d");
        break;
      }
    }
  }
}

const extension: ExtensionFactory = (pi) => {
  let browser: Browser | null = null;
  /** Persistent page reused across screenshot calls. */
  let persistentPage: Page | null = null;
  /** The preview URL the persistent page is currently navigated to. */
  let persistentPageUrl: string | null = null;

  /** Build Chrome launch args. On macOS, try GPU-accelerated rendering first. */
  function getChromeArgs(): string[] {
    if (process.platform === "darwin") {
      return ["--headless=new", "--use-angle=metal"];
    }
    return ["--use-gl=swiftshader"];
  }

  /** Fallback Chrome args using SwiftShader (CPU-based). */
  function getSwiftShaderArgs(): string[] {
    return ["--use-gl=swiftshader"];
  }

  async function launchBrowser(): Promise<Browser> {
    if (browser?.isConnected()) return browser;

    const executablePath = await findChrome();
    if (!executablePath) {
      throw new Error(
        "No compatible browser found. Install a Chromium-based browser or run: npx playwright install chromium",
      );
    }

    const pw = await import("playwright-core");

    // Try GPU-accelerated rendering first (macOS Metal)
    const primaryArgs = getChromeArgs();
    try {
      browser = await pw.chromium.launch({
        executablePath,
        headless: true,
        args: primaryArgs,
      });
      return browser;
    } catch {
      // GPU launch failed, fall back to SwiftShader
    }

    browser = await pw.chromium.launch({
      executablePath,
      headless: true,
      args: getSwiftShaderArgs(),
    });

    return browser;
  }

  async function closeBrowser(): Promise<void> {
    persistentPage = null;
    persistentPageUrl = null;
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* already closed */
      }
      browser = null;
    }
  }

  /** Wait for the scene canvas to be present and render at least one frame. */
  async function waitForSceneLoad(page: Page, timeoutMs: number): Promise<boolean> {
    try {
      // Wait for a <canvas> element to appear
      await page.waitForFunction(
        () => !!document.querySelector("canvas"),
        { timeout: timeoutMs },
      );
      // Wait for at least one animation frame after canvas is present
      await page.waitForFunction(
        () =>
          new Promise<boolean>((resolve) => {
            requestAnimationFrame(() => resolve(true));
          }),
        { timeout: 5000 },
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get or create the persistent page for the given preview URL.
   * Returns the page ready for actions + capture.
   * On first call: navigates, dismisses auth, waits for scene load.
   * On subsequent calls with same URL: just waits briefly for hot-reload.
   */
  async function getPage(
    previewUrl: string,
    onUpdate?: (msg: string) => void,
  ): Promise<Page> {
    const instance = await launchBrowser();

    // Reuse existing page if still open and URL matches
    if (persistentPage && persistentPageUrl === previewUrl) {
      try {
        // Quick check that the page is still alive
        await persistentPage.evaluate(() => true);
        return persistentPage;
      } catch {
        // Page crashed or was closed — recreate
        persistentPage = null;
        persistentPageUrl = null;
      }
    }

    // Close stale page if URL changed
    if (persistentPage) {
      try {
        await persistentPage.close();
      } catch {
        /* already closed */
      }
      persistentPage = null;
      persistentPageUrl = null;
    }

    onUpdate?.("Navigating to preview...");
    const page = await instance.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(previewUrl, { waitUntil: "load", timeout: 30000 });

    // Dismiss auth screen if present
    onUpdate?.("Checking for auth screen...");
    const guestBtn = page.getByText("Continue as guest");
    if (await guestBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await guestBtn.click();
      await page.waitForTimeout(2000);
    }

    // Wait for scene to actually render
    onUpdate?.("Waiting for scene to render...");
    const loaded = await waitForSceneLoad(page, 15000);
    if (!loaded) {
      // Fallback: fixed wait if detection fails
      await page.waitForTimeout(3000);
    }

    persistentPage = page;
    persistentPageUrl = previewUrl;
    return page;
  }

  pi.registerTool({
    name: "screenshot",
    label: "Screenshot",
    description: `Capture a screenshot of the running Decentraland preview. Start the preview first with /preview.

The page is kept open between calls — second+ screenshots are much faster (no re-navigation or auth).

## Actions (optional)
Low-level: click, clickText, key, mouse, wait
High-level helpers:
- lookLeft / lookRight / lookUp / lookDown — camera rotation (optional dx/dy for amount in pixels, default 200)
- moveForward / moveBack / moveLeft / moveRight — WASD movement (optional holdMs for duration, default 500ms)`,
    parameters: Type.Object({
      wait: Type.Optional(
        Type.Number({
          description:
            "Extra milliseconds to wait after scene load detection before capturing. Default: 1000. First screenshot auto-waits for scene load; subsequent ones just wait this amount for hot-reload.",
          default: 1000,
        }),
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
              Type.Literal("lookLeft"),
              Type.Literal("lookRight"),
              Type.Literal("lookUp"),
              Type.Literal("lookDown"),
              Type.Literal("moveForward"),
              Type.Literal("moveBack"),
              Type.Literal("moveLeft"),
              Type.Literal("moveRight"),
            ]),
            x: Type.Optional(Type.Number({ description: "X coordinate for click" })),
            y: Type.Optional(Type.Number({ description: "Y coordinate for click" })),
            text: Type.Optional(Type.String({ description: "Text to click (for clickText)" })),
            key: Type.Optional(
              Type.String({ description: "Key to press (for key action)" }),
            ),
            holdMs: Type.Optional(
              Type.Number({
                description:
                  "Hold duration in ms (for key action or move actions, default 500ms for movement)",
              }),
            ),
            dx: Type.Optional(
              Type.Number({
                description:
                  "Relative X movement in pixels (for mouse drag or look actions, default 200 for look)",
              }),
            ),
            dy: Type.Optional(
              Type.Number({
                description:
                  "Relative Y movement in pixels (for mouse drag or look actions, default 200 for look)",
              }),
            ),
            ms: Type.Optional(
              Type.Number({ description: "Wait duration in ms (for wait action)" }),
            ),
          }),
          { description: "Input actions to perform before screenshot" },
        ),
      ),
    }),
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const { wait: waitMs = 1000, actions } = params as {
        wait?: number;
        actions?: Action[];
      };

      const onUpdate = (msg: string) => _onUpdate?.(msg);

      const preview = processes.get("preview");
      if (!preview) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No preview server running. Start one first with /preview.",
            },
          ],
          details: undefined,
        };
      }
      if (!preview.info) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Preview server is still starting up — URL not ready yet. Wait a moment and try again.",
            },
          ],
          details: undefined,
        };
      }

      const previewUrl = preview.info;

      try {
        const page = await getPage(previewUrl, onUpdate);

        if (actions?.length) {
          onUpdate("Performing actions...");
          await executeActions(page, actions);
        }

        // Wait for hot-reload / render settle
        if (waitMs > 0) {
          onUpdate("Waiting for render to settle...");
          await page.waitForTimeout(waitMs);
        }

        onUpdate("Capturing screenshot...");
        const buffer = await page.screenshot({ type: "png" });
        const base64 = buffer.toString("base64");

        const isReused = persistentPageUrl === previewUrl;
        const renderNote =
          process.platform === "darwin"
            ? ""
            : " (software rendering — colors/effects may differ slightly from GPU)";

        return {
          content: [
            {
              type: "text" as const,
              text: `Screenshot captured from ${previewUrl} (1280x720)${renderNote}`,
            },
            { type: "image" as const, data: base64, mimeType: "image/png" },
          ],
          details: { url: previewUrl, viewport: "1280x720", waitMs, reusedPage: isReused },
        };
      } catch (err) {
        // If the persistent page crashed, clear it so next call recreates
        persistentPage = null;
        persistentPageUrl = null;
        return {
          content: [
            {
              type: "text" as const,
              text: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          details: undefined,
        };
      }
    },
  });

  pi.on("session_shutdown", async () => {
    await closeBrowser();
  });
};

export default extension;
