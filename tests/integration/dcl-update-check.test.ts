/**
 * Tests for the dcl-update-check extension.
 * Covers the exported pure functions and registration behavior.
 */

import { describe, it, expect } from "vitest";
import { createMockPi } from "../helpers/mock-pi.js";
import {
  isNewerVersion,
  getInstalledVersion,
} from "../../extensions/dcl-update-check.js";
import extension from "../../extensions/dcl-update-check.js";

describe("dcl-update-check", () => {
  describe("isNewerVersion", () => {
    it("returns true when patch is newer", () => {
      expect(isNewerVersion("1.0.0", "1.0.1")).toBe(true);
    });

    it("returns true when minor is newer", () => {
      expect(isNewerVersion("1.0.0", "1.1.0")).toBe(true);
    });

    it("returns true when major is newer", () => {
      expect(isNewerVersion("1.0.0", "2.0.0")).toBe(true);
    });

    it("returns false when versions are equal", () => {
      expect(isNewerVersion("1.2.3", "1.2.3")).toBe(false);
    });

    it("returns false when current is newer", () => {
      expect(isNewerVersion("2.0.0", "1.9.9")).toBe(false);
    });

    it("handles different segment counts", () => {
      expect(isNewerVersion("1.0", "1.0.1")).toBe(true);
      expect(isNewerVersion("1.0.1", "1.0")).toBe(false);
    });

    it("handles minor bump with lower patch", () => {
      expect(isNewerVersion("1.0.9", "1.1.0")).toBe(true);
    });
  });

  describe("getInstalledVersion", () => {
    it("returns a valid semver string", () => {
      expect(getInstalledVersion()).toMatch(/^\d+\.\d+\.\d+/);
    });

    it("does not return 0.0.0", () => {
      expect(getInstalledVersion()).not.toBe("0.0.0");
    });
  });

  describe("registration", () => {
    it("subscribes to session_start", () => {
      const { pi, records } = createMockPi();
      extension(pi);
      expect(records.events.some((e) => e.event === "session_start")).toBe(true);
    });

    it("registers no commands", () => {
      const { pi, records } = createMockPi();
      extension(pi);
      expect(records.commands).toHaveLength(0);
    });
  });
});
