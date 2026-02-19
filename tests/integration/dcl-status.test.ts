/**
 * DCL Status extension tests — verifies event registration
 * and the exported formatting helpers.
 */

import { describe, it, expect } from "vitest";
import { createMockPi } from "../helpers/mock-pi.js";
import { formatElapsed, formatTokens } from "../../extensions/dcl-status.js";

describe("dcl-status", () => {
  describe("extension registration", () => {
    it("subscribes to turn_start, message_update, turn_end, agent_end", async () => {
      const { pi, records } = createMockPi();
      const mod = await import("../../extensions/dcl-status.js");
      mod.default(pi);

      const eventNames = records.events.map((e) => e.event);
      expect(eventNames).toContain("turn_start");
      expect(eventNames).toContain("message_update");
      expect(eventNames).toContain("turn_end");
      expect(eventNames).toContain("agent_end");
    });

    it("registers no commands", async () => {
      const { pi, records } = createMockPi();
      const mod = await import("../../extensions/dcl-status.js");
      mod.default(pi);
      expect(records.commands).toHaveLength(0);
    });
  });

  describe("formatElapsed", () => {
    it("formats sub-second as 0s", () => {
      expect(formatElapsed(500)).toBe("0s");
    });

    it("formats seconds", () => {
      expect(formatElapsed(5000)).toBe("5s");
    });

    it("formats minutes and seconds", () => {
      expect(formatElapsed(65000)).toBe("1m 5s");
    });

    it("formats exact minute boundary", () => {
      expect(formatElapsed(60000)).toBe("1m 0s");
    });

    it("formats large values", () => {
      expect(formatElapsed(125000)).toBe("2m 5s");
    });
  });

  describe("formatTokens", () => {
    it("formats small counts as plain numbers", () => {
      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(500)).toBe("500");
      expect(formatTokens(999)).toBe("999");
    });

    it("formats thousands with k suffix", () => {
      expect(formatTokens(1000)).toBe("1.0k");
      expect(formatTokens(1500)).toBe("1.5k");
      expect(formatTokens(10000)).toBe("10.0k");
    });

    it("formats large counts", () => {
      expect(formatTokens(150000)).toBe("150.0k");
    });
  });
});
