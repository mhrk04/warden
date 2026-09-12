import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPrivySigner } from "../src/privy";
import { buildProposalCall } from "../src/propose";

// Regression test for the alignment-validator blocking issue: createPrivySigner
// used to be a throwing stub, so the "Privy embedded low-authority signer" claim
// was unsubstantiated. It is now a REAL pass-through ProposingWallet over Privy's
// server wallet API. These tests use a MOCK Privy client — they NEVER hit the
// real Privy API.

const GUARD = "0xfa12529ED63660dD396733C172267244c351C64a" as const;
const NODE =
  "0xc54c92af84a1c146494912c71879955912e760924a1ecff0fd335cc74a09b869" as const;
const R = "0x1111111111111111111111111111111111111111" as const;

/** A mock that mimics the shape createPrivySigner depends on. */
function mockClient(hash = "0xdeadbeef") {
  const sendTransaction = vi.fn(async () => ({ hash, caip2: "eip155:11155111" }));
  const createWallet = vi.fn(async () => ({
    id: "wallet-created-id",
    address: "0x2222222222222222222222222222222222222222",
    chainType: "ethereum",
  }));
  const getWallet = vi.fn(async ({ id }: { id: string }) => ({
    id,
    address: "0x3333333333333333333333333333333333333333",
    chainType: "ethereum",
  }));
  return {
    client: {
      walletApi: {
        createWallet,
        getWallet,
        ethereum: { sendTransaction },
      },
    },
    sendTransaction,
    createWallet,
    getWallet,
  };
}

describe("createPrivySigner", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;
    delete process.env.PRIVY_WALLET_ID;
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("returns a ProposingWallet whose sendTransaction forwards {to,data} to Privy with the correct caip2 + walletId, and returns the tx hash", async () => {
    const { client, sendTransaction } = mockClient("0xhash1");
    const signer = createPrivySigner({ client, walletId: "wallet-xyz" });

    const call = buildProposalCall(GUARD, NODE, R, 80n);
    const hash = await signer.sendTransaction({ to: call.to, data: call.data });

    expect(hash).toBe("0xhash1");
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        walletId: "wallet-xyz",
        caip2: "eip155:11155111",
        transaction: expect.objectContaining({ to: call.to, data: call.data }),
      }),
    );
  });

  it("is a pure pass-through: it only sends the {to,data} it is handed and never crafts its own call (low authority)", async () => {
    const { client, sendTransaction } = mockClient();
    const signer = createPrivySigner({ client, walletId: "wallet-xyz" });

    const to = GUARD;
    const data = "0xabcdef" as const;
    await signer.sendTransaction({ to, data });

    // Exactly one call, and the transaction it forwarded carries ONLY the given
    // to/data — the signer added no recipient/amount/selector of its own.
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    const arg = sendTransaction.mock.calls[0][0] as {
      transaction: { to: string; data: string };
    };
    expect(arg.transaction.to).toBe(to);
    expect(arg.transaction.data).toBe(data);
    // It cannot originate a value transfer on its own: no value is injected.
    expect((arg.transaction as { value?: unknown }).value).toBeUndefined();
  });

  it("lazily creates a wallet when no PRIVY_WALLET_ID is configured, and reuses it across sends", async () => {
    const { client, createWallet, sendTransaction } = mockClient();
    const signer = createPrivySigner({ client });

    await signer.sendTransaction({ to: GUARD, data: "0x01" });
    await signer.sendTransaction({ to: GUARD, data: "0x02" });

    expect(createWallet).toHaveBeenCalledTimes(1);
    expect(createWallet).toHaveBeenCalledWith(
      expect.objectContaining({ chainType: "ethereum" }),
    );
    // Both sends used the lazily-created wallet id.
    expect(sendTransaction.mock.calls[0][0].walletId).toBe("wallet-created-id");
    expect(sendTransaction.mock.calls[1][0].walletId).toBe("wallet-created-id");
  });

  it("throws a clear 'configure Privy' error when credentials are absent (no silent fallback)", () => {
    expect(() => createPrivySigner()).toThrow(/configure Privy/i);
  });

  it("resolveWalletAddress fetches the configured walletId's address (so callers can simulate as the real signer)", async () => {
    const { client, getWallet } = mockClient();
    const signer = createPrivySigner({ client, walletId: "wallet-xyz" });

    // Not known synchronously for a pre-configured walletId...
    expect(signer.getWalletAddress()).toBeNull();
    // ...but resolvable from Privy's getWallet, and then cached.
    const addr = await signer.resolveWalletAddress();
    expect(addr).toBe("0x3333333333333333333333333333333333333333");
    expect(signer.getWalletAddress()).toBe(addr);
    expect(getWallet).toHaveBeenCalledWith({ id: "wallet-xyz" });
    // Cached: a second resolve does not re-fetch.
    await signer.resolveWalletAddress();
    expect(getWallet).toHaveBeenCalledTimes(1);
  });

  it("resolveWalletAddress lazily creates a wallet when no walletId is configured", async () => {
    const { client, createWallet, getWallet } = mockClient();
    const signer = createPrivySigner({ client });

    const addr = await signer.resolveWalletAddress();
    expect(addr).toBe("0x2222222222222222222222222222222222222222");
    expect(createWallet).toHaveBeenCalledTimes(1);
    expect(getWallet).not.toHaveBeenCalled();
  });
});
