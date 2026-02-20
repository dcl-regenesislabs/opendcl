import { describe, it, expect, afterEach } from "vitest";
import { isDev } from "../../src/utils.js";

describe("isDev", () => {
  afterEach(() => {
    delete process.env.ENV;
  });

  it("returns false when ENV is unset", () => {
    delete process.env.ENV;
    expect(isDev()).toBe(false);
  });

  it("returns false when ENV is not 'dev'", () => {
    process.env.ENV = "prd";
    expect(isDev()).toBe(false);
  });

  it("returns true when ENV is 'dev'", () => {
    process.env.ENV = "dev";
    expect(isDev()).toBe(true);
  });
});
