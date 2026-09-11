import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { toFunctionSelector, decodeFunctionData } from "viem";
import { buildProposalCall, submitProposal } from "../src/propose";
import guardAbi from "../../shared/abi/Guard.json" with { type: "json" };

// TC-001-14 / failure mode 1 (Criterion 2.1, 7.1): the agent may only call
// Guard.propose — NEVER a direct ERC-20 transfer. Amount capping happened in the
// decision layer; propose just submits.

const GUARD = "0xfa12529ED63660dD396733C172267244c351C64a" as const;
const NODE = "0xc54c92af84a1c146494912c71879955912e760924a1ecff0fd335cc74a09b869" as const;
const R = "0x1111111111111111111111111111111111111111" as const;

const PROPOSE_SELECTOR = toFunctionSelector("propose(bytes32,address,uint256)");
const TRANSFER_SELECTOR = toFunctionSelector("transfer(address,uint256)");

describe("buildProposalCall", () => {
  it("encodes a call to the Guard address with the propose selector + args", () => {
    const call = buildProposalCall(GUARD, NODE, R, 80n);
    expect(call.to).toBe(GUARD);
    expect(call.data.slice(0, 10)).toBe(PROPOSE_SELECTOR);

    // decode against the real Guard ABI to prove args round-trip
    const decoded = decodeFunctionData({ abi: guardAbi as any, data: call.data });
    expect(decoded.functionName).toBe("propose");
    expect(decoded.args).toEqual([NODE, R, 80n]);
  });

  it("NEVER produces an ERC-20 transfer(address,uint256) selector (failure mode 1)", () => {
    const call = buildProposalCall(GUARD, NODE, R, 80n);
    expect(call.data.slice(0, 10)).not.toBe(TRANSFER_SELECTOR);
  });
});

describe("submitProposal", () => {
  it("sends the call via the wallet client and returns the txHash", async () => {
    const txHash = "0xabc123";
    const walletClient = { sendTransaction: vi.fn(async () => txHash) };
    const call = buildProposalCall(GUARD, NODE, R, 80n);

    const res = await submitProposal(walletClient as any, call);

    expect(res.txHash).toBe(txHash);
    expect(walletClient.sendTransaction).toHaveBeenCalledTimes(1);
    expect(walletClient.sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ to: GUARD, data: call.data }),
    );
  });
});

describe("no direct-transfer code path (static assertion, TC-001-14)", () => {
  it("propose.ts source never references ERC-20 transfer", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, "../src/propose.ts"), "utf8");
    // No ERC-20 transfer signature encoding anywhere in the propose path.
    expect(src).not.toMatch(/transfer\s*\(\s*address\s*,\s*uint256\s*\)/i);
    // Every encodeFunctionData in this module targets "propose" — never transfer/transferFrom.
    const fnNames = [...src.matchAll(/functionName:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(fnNames.length).toBeGreaterThan(0);
    for (const name of fnNames) {
      expect(name).toBe("propose");
    }
    expect(fnNames).not.toContain("transfer");
    expect(fnNames).not.toContain("transferFrom");
  });

  it("no agent source file encodes an ERC-20 transfer function (whole-module guard)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const srcDir = resolve(here, "../src");
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = readFileSync(resolve(srcDir, f), "utf8");
      // No encodeFunctionData({... functionName: "transfer" / "transferFrom" ...})
      const fnNames = [...src.matchAll(/functionName:\s*"([^"]+)"/g)].map((m) => m[1]);
      expect(fnNames, `${f} must not encode a token transfer`).not.toContain("transfer");
      expect(fnNames, `${f} must not encode a token transferFrom`).not.toContain("transferFrom");
      // No raw ERC-20 transfer signature strings either.
      expect(src, `${f} must not contain a transfer(address,uint256) signature`).not.toMatch(
        /transfer\s*\(\s*address\s*,\s*uint256\s*\)/i,
      );
    }
  });
});
