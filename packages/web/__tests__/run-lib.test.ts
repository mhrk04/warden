import { describe, it, expect, vi } from "vitest";
import { runAgentWith, decodeGuardReason, type RunDeps } from "../lib/run";

const NODE = "0x" + "cc".repeat(32);
const RECIPIENT = "0x000000000000000000000000000000000000dEaD";
const SIGNER = "0x70D26bDe8C7a1F2A0B0dA171bcfB4500AfA91E9D";
const TOKEN = "0x758C7d91193454c365aa44C8A40542F5d59983e5";

/** An agent with headroom so decide() proposes a payout. */
const liveAgent = {
  id: NODE,
  spent: 0n,
  revoked: false,
  perTxCap: 100n,
  cumulativeCap: 250n,
  expiry: 1999999999n,
  agentSigner: SIGNER,
  token: TOKEN,
};

function baseDeps(over: Partial<RunDeps>): RunDeps {
  return {
    fetchLiveAgent: async () => liveAgent,
    targetSpent: 0n,
    recipient: RECIPIENT as `0x${string}`,
    sendPropose: async () => ({ txHash: ("0x" + "ab".repeat(32)) as `0x${string}` }),
    explainOutcome: async (o) =>
      o.outcome === "executed"
        ? "Executed explanation"
        : `Rejected explanation reason ${o.reason}`,
    ...over,
  };
}

describe("decodeGuardReason", () => {
  it("extracts the reason code from a GuardRejected custom error", () => {
    // viem surfaces the decoded error name + args on the thrown error.
    const err = {
      walk: (fn: (e: unknown) => boolean) => {
        const inner = { name: "ContractFunctionRevertedError", data: { errorName: "GuardRejected", args: [3] } };
        return fn(inner) ? inner : null;
      },
    };
    expect(decodeGuardReason(err)).toBe(3);
  });

  it("returns undefined for a non-Guard error", () => {
    const err = { walk: () => null };
    expect(decodeGuardReason(err)).toBeUndefined();
  });
});

describe("runAgentWith", () => {
  it("returns { outcome: 'executed', txHash, explanation } on a successful propose", async () => {
    const res = await runAgentWith(baseDeps({}));
    expect(res.outcome).toBe("executed");
    expect(res.txHash).toBeTruthy();
    expect(res.explanation).toBe("Executed explanation");
    expect(res.reason).toBeUndefined();
  });

  it("returns { outcome: 'rejected', reason, explanation } when propose reverts GuardRejected", async () => {
    const guardErr = {
      walk: (fn: (e: unknown) => boolean) => {
        const inner = { data: { errorName: "GuardRejected", args: [1] } };
        return fn(inner) ? inner : null;
      },
    };
    const res = await runAgentWith(
      baseDeps({
        sendPropose: async () => {
          throw guardErr;
        },
      }),
    );
    expect(res.outcome).toBe("rejected");
    expect(res.reason).toBe(1);
    expect(res.explanation).toBe("Rejected explanation reason 1");
    expect(res.txHash).toBeUndefined();
  });

  it("holds (rejected, no txHash) when decide() says do not act (balance at/below target)", async () => {
    const res = await runAgentWith(
      baseDeps({
        // No headroom -> decide returns act:false
        fetchLiveAgent: async () => ({ ...liveAgent, spent: 250n }),
      }),
    );
    expect(res.outcome).toBe("rejected");
    expect(res.explanation).toBeTruthy();
    expect(res.txHash).toBeUndefined();
  });

  it("returns rejected with an error explanation when the agent is not found", async () => {
    const res = await runAgentWith(baseDeps({ fetchLiveAgent: async () => null }));
    expect(res.outcome).toBe("rejected");
    expect(res.explanation).toBeTruthy();
  });
});
