import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { explain } from "../src/explain";
import type { Outcome } from "../src/explain";

// TC-001-15 / TC-001-16 / EC-001-7 (Criterion 9.1-9.3, failure mode 10):
// plain-language explanation via LLM when a key is present, deterministic
// template fallback otherwise/on error. NEVER on the money path. Network injected.

const R = "0x1111111111111111111111111111111111111111";
const TXH = "0xdeadbeef";

function geminiOk(text: string) {
  return vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  })) as unknown as typeof fetch;
}
function gemini429() {
  return vi.fn(async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: "rate limited" } }),
  })) as unknown as typeof fetch;
}

describe("explain — template fallback (no key)", () => {
  // Force the no-key path with an explicit empty apiKey so the test is hermetic
  // regardless of any ambient LLM_API_KEY in the environment. `noNetwork` throws
  // if the network is ever touched, proving the template path made no request.
  const noNetwork = vi.fn(async () => {
    throw new Error("network must not be called on the template path");
  }) as unknown as typeof fetch;
  const tmpl = { apiKey: "", fetchImpl: noNetwork };

  it("TC-001-15: rejected reason=3 -> template mentions allowlist, no throw", async () => {
    const o: Outcome = { outcome: "rejected", reason: 3, recipient: R };
    const s = await explain(o, tmpl);
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
    expect(s.toLowerCase()).toContain("allowlist");
    expect(noNetwork).not.toHaveBeenCalled();
  });

  it("template covers every reason code 1..6", async () => {
    const expected: Record<number, RegExp> = {
      1: /per-?transaction/i,
      2: /cumulative/i,
      3: /allowlist/i,
      4: /expired|expir/i,
      5: /revoked/i,
      6: /agent signer|authorized agent/i,
    };
    for (const code of [1, 2, 3, 4, 5, 6]) {
      const s = await explain({ outcome: "rejected", reason: code }, tmpl);
      expect(s, `reason ${code}`).toMatch(expected[code]);
    }
  });

  it("executed outcome template mentions amount + txHash", async () => {
    const o: Outcome = { outcome: "executed", amount: 80n, recipient: R, txHash: TXH };
    const s = await explain(o, tmpl);
    expect(s).toContain("80");
    expect(s).toContain(TXH);
  });
});

describe("explain — LLM path (injected fetch)", () => {
  it("uses the model text when a Gemini-shaped success is returned", async () => {
    const f = geminiOk("The agent paid out 80 test-USDC successfully.");
    const s = await explain(
      { outcome: "executed", amount: 80n, recipient: R, txHash: TXH },
      { apiKey: "test-key", fetchImpl: f },
    );
    expect(s).toBe("The agent paid out 80 test-USDC successfully.");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("EC-001-7: 429 falls back to the template (no throw)", async () => {
    const f = gemini429();
    const s = await explain(
      { outcome: "rejected", reason: 2 },
      { apiKey: "test-key", fetchImpl: f },
    );
    expect(typeof s).toBe("string");
    expect(s).toMatch(/cumulative/i);
  });

  it("network throw falls back to the template (no throw)", async () => {
    const f = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const s = await explain(
      { outcome: "rejected", reason: 4 },
      { apiKey: "test-key", fetchImpl: f },
    );
    expect(s).toMatch(/expir/i);
  });
});

describe("explain — never on the money path (TC-001-16, failure mode 10)", () => {
  it("always returns a string", async () => {
    const results = await Promise.all([
      explain({ outcome: "executed", amount: 1n, txHash: TXH }, { apiKey: "" }),
      explain({ outcome: "rejected", reason: 1 }, { apiKey: "" }),
    ]);
    for (const r of results) expect(typeof r).toBe("string");
  });

  it("explain.ts imports neither propose nor signer (no fund-movement code)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../src/explain.ts"), "utf8");
    expect(src).not.toMatch(/from\s+["']\.\/propose["']/);
    expect(src).not.toMatch(/from\s+["']\.\/signer["']/);
    expect(src).not.toMatch(/sendTransaction|submitProposal|buildProposalCall|encodeFunctionData/);
  });
});
