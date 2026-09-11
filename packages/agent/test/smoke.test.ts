import { describe, it, expect } from "vitest";
import { AGENT_NAME } from "../src/index";

describe("agent skeleton", () => {
  it("exposes its name", () => {
    expect(AGENT_NAME).toBe("warden-agent");
  });
});
