import { describe, it, expect } from "vitest";
import { formatUsdc, shortAddr } from "../lib/format";

describe("formatUsdc", () => {
  it("formats whole amounts", () => {
    expect(formatUsdc(1_000_000n)).toBe("1");
  });
  it("formats fractional amounts trimming trailing zeros", () => {
    expect(formatUsdc(1_500_000n)).toBe("1.5");
  });
});

describe("shortAddr", () => {
  it("shortens long addresses", () => {
    expect(shortAddr("0x1234567890abcdef1234")).toBe("0x1234…1234");
  });
});
