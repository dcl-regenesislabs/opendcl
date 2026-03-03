/**
 * Unit tests for permissions/utils.ts — pure classification functions.
 */

import { describe, it, expect } from "vitest";
import { classifyBashCommand, classifyFilePath, isOutsideCwd } from "../../../extensions/permissions/utils.js";

describe("permissions utils", () => {
  describe("classifyBashCommand", () => {
    const dangerous = [
      "rm -rf /tmp/test",
      "rm file.txt",
      "sudo apt-get update",
      "git push origin main",
      "git reset --hard HEAD~1",
      "git rebase main",
      "npm install express",
      "npm uninstall lodash",
      "npm publish",
      'curl -X POST http://example.com -d "data"',
      "curl --data @file http://example.com",
      "ssh user@host",
      "scp file.txt user@host:/path",
      "kill -9 1234",
      "killall node",
      "pkill -f node",
      "mv file1 file2",
      "chmod 777 file",
      "chown root file",
      "dd if=/dev/zero of=file bs=1M count=10",
      "shred -u secret.txt",
      "echo foo > output.txt",
      "echo foo >> log.txt",
      "ls | tee output.txt",
      "reboot",
      "shutdown -h now",
      "su root",
      "rmdir /tmp/empty",
    ];

    it.each(dangerous.map((cmd) => [cmd]))("%s → returns reason", (command) => {
      expect(classifyBashCommand(command)).toBeTypeOf("string");
    });

    const safe = [
      "ls -la",
      "cat file.txt",
      "head -n 10 file.txt",
      "tail -f log.txt",
      "git status",
      "git log --oneline",
      "git diff",
      "git add .",
      "git commit -m 'test'",
      "npm test",
      "npm run build",
      "npm ls",
      "npx vitest run",
      "curl https://example.com",
      "echo hello",
      "pwd",
      "node --version",
      "grep -r pattern .",
      "find . -name '*.ts'",
      "ps aux",
      "whoami",
      "tree src/",
      "wc -l file.txt",
      "diff file1.txt file2.txt",
    ];

    it.each(safe.map((cmd) => [cmd]))("%s → returns null", (command) => {
      expect(classifyBashCommand(command)).toBeNull();
    });

    it("reason for rm mentions deleting", () => {
      expect(classifyBashCommand("rm -rf /tmp/test")).toContain("Delete");
    });

    it("reason for git push mentions push", () => {
      expect(classifyBashCommand("git push origin main")!.toLowerCase()).toContain("push");
    });

    it("reason for npm install mentions install", () => {
      expect(classifyBashCommand("npm install express")!.toLowerCase()).toContain("install");
    });

    it("reason for curl POST mentions HTTP", () => {
      expect(classifyBashCommand("curl -X POST http://example.com")!.toLowerCase()).toContain("http");
    });
  });

  describe("classifyFilePath", () => {
    const projectRoot = "/home/user/project";

    const sensitive: [string, string][] = [
      [".env", "environment variables"],
      [".env.local", "environment variables"],
      [".env.production", "environment variables"],
      ["server.pem", "private key"],
      ["ssl/cert.key", "private key"],
      ["ca.crt", "certificate"],
      ["credentials.json", "credentials"],
      ["package.json", "package manifest"],
      ["tsconfig.json", "TypeScript config"],
      [".git/config", "git internal"],
      ["../../etc/passwd", "outside working directory"],
      ["/etc/passwd", "outside working directory"],
    ];

    it.each(sensitive)("%s → returns reason", (filePath) => {
      expect(classifyFilePath(filePath, projectRoot)).toBeTypeOf("string");
    });

    const safe = [
      "src/index.ts",
      "src/components/Player.tsx",
      "README.md",
      "models/scene.glb",
      "styles/main.css",
      "public/index.html",
    ];

    it.each(safe.map((p) => [p]))("%s → returns null", (filePath) => {
      expect(classifyFilePath(filePath, projectRoot)).toBeNull();
    });

    it("reason for .env mentions secrets", () => {
      expect(classifyFilePath(".env", projectRoot)!.toLowerCase()).toContain("secret");
    });

    it("reason for outside-root mentions outside", () => {
      expect(classifyFilePath("../../etc/passwd", projectRoot)!.toLowerCase()).toContain("outside");
    });

    it("reason for package.json mentions package", () => {
      expect(classifyFilePath("package.json", projectRoot)!.toLowerCase()).toContain("package");
    });

    it("reason for .pem mentions key", () => {
      expect(classifyFilePath("server.pem", projectRoot)!.toLowerCase()).toContain("key");
    });

    it("reason for .git/ mentions git", () => {
      expect(classifyFilePath(".git/config", projectRoot)!.toLowerCase()).toContain("git");
    });
  });

  describe("isOutsideCwd", () => {
    const cwd = "/home/user/project";

    const outside: [string, string][] = [
      ["../../etc/passwd", "relative traversal"],
      ["/etc/passwd", "absolute outside path"],
      ["/tmp/file.txt", "absolute outside path"],
      ["../sibling/file.ts", "relative sibling"],
    ];

    it.each(outside)("%s → returns reason (%s)", (filePath) => {
      const reason = isOutsideCwd(filePath, cwd);
      expect(reason).toBeTypeOf("string");
      expect(reason!.toLowerCase()).toContain("outside");
    });

    const inside = [
      "src/index.ts",
      "./src/index.ts",
      "README.md",
      "a/b/c/d/e/f/deeply-nested.ts",
    ];

    it.each(inside.map((p) => [p]))("%s → returns null", (filePath) => {
      expect(isOutsideCwd(filePath, cwd)).toBeNull();
    });

    it("empty string → returns null", () => {
      expect(isOutsideCwd("", cwd)).toBeNull();
    });
  });
});
