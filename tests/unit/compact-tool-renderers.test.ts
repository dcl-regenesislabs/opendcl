import { describe, it, expect } from "vitest";
import { getCompactToolDefinition } from "../../src/compact-tool-renderers.js";
import { Theme } from "@mariozechner/pi-coding-agent";
import { homedir } from "node:os";

// Minimal theme for testing — all colors are neutral so we can inspect text content
const fgColors = Object.fromEntries(
  [
    "accent", "border", "borderAccent", "borderMuted", "success", "error",
    "warning", "muted", "dim", "text", "thinkingText", "userMessageText",
    "customMessageText", "customMessageLabel", "toolTitle", "toolOutput",
    "mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdCodeBlock",
    "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr", "mdListBullet",
    "toolDiffAdded", "toolDiffRemoved", "toolDiffContext", "syntaxComment",
    "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString",
    "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation",
    "thinkingOff", "thinkingMinimal", "thinkingLow", "thinkingMedium",
    "thinkingHigh", "thinkingXhigh", "bashMode",
  ].map((k) => [k, 0xffffff]),
);
const bgColors = Object.fromEntries(
  [
    "selectedBg", "userMessageBg", "customMessageBg",
    "toolPendingBg", "toolSuccessBg", "toolErrorBg",
  ].map((k) => [k, 0x000000]),
);

const theme = new Theme(
  fgColors as any,
  bgColors as any,
  "truecolor",
);

describe("getCompactToolDefinition", () => {
  it("returns a definition for 'write'", () => {
    const def = getCompactToolDefinition("write");
    expect(def).toBeDefined();
    expect(def!.renderCall).toBeTypeOf("function");
    expect(def!.renderResult).toBeUndefined();
  });

  it("returns a definition for 'read'", () => {
    const def = getCompactToolDefinition("read");
    expect(def).toBeDefined();
    expect(def!.renderCall).toBeTypeOf("function");
    expect(def!.renderResult).toBeTypeOf("function");
  });

  it("returns undefined for 'edit' (no override)", () => {
    expect(getCompactToolDefinition("edit")).toBeUndefined();
  });

  it("returns undefined for 'bash' (no override)", () => {
    expect(getCompactToolDefinition("bash")).toBeUndefined();
  });

  it("returns undefined for unknown tools", () => {
    expect(getCompactToolDefinition("nonexistent")).toBeUndefined();
  });
});

describe("write renderCall", () => {
  const def = getCompactToolDefinition("write")!;

  it("renders path and char count", () => {
    const component = def.renderCall!(
      { path: "/tmp/test.ts", content: "hello world" },
      theme,
    );
    const lines = component.render(120);
    const output = lines.join("\n");
    expect(output).toContain("write");
    expect(output).toContain("test.ts");
    expect(output).toContain("11 chars");
    expect(output).toContain("1 lines");
  });

  it("shows line count for multiline content", () => {
    const content = "line1\nline2\nline3\nline4\nline5";
    const component = def.renderCall!(
      { path: "/tmp/file.ts", content },
      theme,
    );
    const output = component.render(120).join("\n");
    expect(output).toContain("5 lines");
  });

  it("handles missing path gracefully", () => {
    const component = def.renderCall!({ content: "x" }, theme);
    const output = component.render(120).join("\n");
    expect(output).toContain("write");
    // Missing path (not a string) → shows invalid arg indicator
    expect(output).toContain("[invalid arg]");
  });

  it("shows streaming placeholder for empty path", () => {
    const component = def.renderCall!({ path: "", content: "" }, theme);
    const output = component.render(120).join("\n");
    expect(output).toContain("write");
    expect(output).toContain("...");
  });

  it("shortens home directory paths", () => {
    const home = homedir();
    const component = def.renderCall!(
      { path: `${home}/project/file.ts`, content: "x" },
      theme,
    );
    const output = component.render(120).join("\n");
    expect(output).toContain("~/project/file.ts");
    expect(output).not.toContain(home);
  });
});

describe("read renderCall", () => {
  const def = getCompactToolDefinition("read")!;

  it("renders path", () => {
    const component = def.renderCall!(
      { path: "/tmp/file.ts" },
      theme,
    );
    const output = component.render(120).join("\n");
    expect(output).toContain("read");
    expect(output).toContain("file.ts");
  });

  it("renders offset and limit", () => {
    const component = def.renderCall!(
      { path: "/tmp/file.ts", offset: 10, limit: 20 },
      theme,
    );
    const output = component.render(120).join("\n");
    expect(output).toContain(":10-29");
  });
});

describe("read renderResult", () => {
  const def = getCompactToolDefinition("read")!;

  it("shows 5 preview lines when collapsed", () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
    const result = {
      content: [{ type: "text", text: lines.join("\n") }],
    };
    const component = def.renderResult!(result, { expanded: false, isPartial: false }, theme);
    const rendered = component.render(120).join("\n");

    // Should contain first 5 lines
    expect(rendered).toContain("line 1");
    expect(rendered).toContain("line 5");
    // Should NOT contain line 6+
    expect(rendered).not.toContain("line 6");
    // Should show remaining count
    expect(rendered).toContain("15 more lines");
  });

  it("shows all lines when expanded", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const result = {
      content: [{ type: "text", text: lines.join("\n") }],
    };
    const component = def.renderResult!(result, { expanded: true, isPartial: false }, theme);
    const rendered = component.render(120).join("\n");

    expect(rendered).toContain("line 1");
    expect(rendered).toContain("line 10");
    expect(rendered).not.toContain("more lines");
  });

  it("shows truncation warning", () => {
    const result = {
      content: [{ type: "text", text: "line 1\nline 2" }],
      details: {
        truncation: {
          truncated: true,
          truncatedBy: "lines",
          outputLines: 200,
          totalLines: 500,
        },
      },
    };
    const component = def.renderResult!(result, { expanded: false, isPartial: false }, theme);
    const rendered = component.render(120).join("\n");
    expect(rendered).toContain("Truncated");
    expect(rendered).toContain("200");
    expect(rendered).toContain("500");
  });

  it("handles empty result", () => {
    const result = { content: [{ type: "text", text: "" }] };
    const component = def.renderResult!(result, { expanded: false, isPartial: false }, theme);
    const rendered = component.render(120).join("\n");
    expect(rendered).toBe("");
  });
});
