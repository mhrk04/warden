/**
 * Real Privy server-wallet proposing signer (Requirement 7.1).
 *
 * This replaces the former throwing stub and substantiates the Privy track: the
 * agent proposes `Guard.propose` through a Privy-MANAGED server wallet
 * (`@privy-io/server-auth`), not a raw local key.
 *
 * LOW-AUTHORITY BY CONSTRUCTION: the returned `ProposingWallet` can ONLY forward
 * the exact `{ to, data }` it is handed. The agent only ever builds that payload
 * as a `Guard.propose` call via `buildProposalCall` (propose.ts) — this signer
 * never crafts a recipient, amount, value, or any other call itself. Widening it
 * (e.g. letting it originate its own transactions or inject value) would break
 * the security model; the Guard remains the sole on-chain enforcement authority
 * and re-checks every policy rule regardless of who proposed.
 *
 * Secrets (PRIVY_APP_ID / PRIVY_APP_SECRET) are read from env at runtime; nothing
 * is committed. Tests inject `opts.client` so they never touch the real API.
 */
import { PrivyClient } from "@privy-io/server-auth";
import type { ProposingWallet } from "./propose";

type Hex = `0x${string}`;

/** CAIP-2 chain id for Sepolia (the network the Guard is deployed on). */
export const SEPOLIA_CAIP2 = "eip155:11155111" as const;

/**
 * The minimal slice of the Privy server SDK this signer depends on. Declaring it
 * structurally (rather than importing the concrete class type everywhere) is what
 * lets tests pass a lightweight mock and keeps this module pinned to just the two
 * calls it actually makes: create a wallet, and broadcast a pre-built tx.
 */
export interface PrivyWalletClientLike {
  walletApi: {
    createWallet(input: {
      chainType: "ethereum";
    }): Promise<{ id: string; address: string }>;
    /** Fetch an existing wallet by id — used to resolve its address for simulation. */
    getWallet(input: { id: string }): Promise<{ id: string; address: string }>;
    ethereum: {
      sendTransaction(input: {
        walletId: string;
        caip2: typeof SEPOLIA_CAIP2;
        transaction: { to: Hex; data: Hex };
      }): Promise<{ hash: string }>;
    };
  };
}

export interface PrivySignerOptions {
  /** Injectable Privy client (tests pass a mock). Production constructs a real one. */
  client?: PrivyWalletClientLike;
  /** Privy app id; defaults to env PRIVY_APP_ID. */
  appId?: string;
  /** Privy app secret; defaults to env PRIVY_APP_SECRET. */
  appSecret?: string;
  /**
   * Existing Privy server-wallet id to send from; defaults to env PRIVY_WALLET_ID.
   * If absent, a wallet is lazily created on first send and its id+address logged
   * so the operator can allowlist it on the Guard and fund it.
   */
  walletId?: string;
}

/**
 * The proposing signer with a resolved wallet address exposed for operators.
 * `getWalletAddress()` returns the address once known (after the wallet id is
 * configured or lazily created), else null — handy for logging/allowlisting.
 */
export interface PrivyProposingWallet extends ProposingWallet {
  /** The wallet address if already known (sync); null until resolved. */
  getWalletAddress(): string | null;
  /**
   * Resolve the wallet address, fetching it from Privy when a walletId was
   * configured but its address is not yet cached. Needed so callers can simulate
   * `Guard.propose` as the exact account that will broadcast (the Guard enforces
   * `msg.sender == agentSigner`). Returns null only when no wallet can be resolved.
   */
  resolveWalletAddress(): Promise<string | null>;
}

/**
 * Build a low-authority proposing signer backed by a Privy server wallet.
 *
 * Throws a clear "configure Privy" error only when no client is injected AND the
 * credentials are genuinely absent — never a silent fallback to unsigned.
 */
export function createPrivySigner(
  opts: PrivySignerOptions = {},
): PrivyProposingWallet {
  const client = opts.client ?? buildRealClient(opts);

  let walletId = opts.walletId ?? process.env.PRIVY_WALLET_ID ?? null;
  let walletAddress: string | null = null;

  async function ensureWalletId(): Promise<string> {
    if (walletId) return walletId;
    const wallet = await client.walletApi.createWallet({ chainType: "ethereum" });
    walletId = wallet.id;
    walletAddress = wallet.address;
    // Surface the created wallet so the operator can allowlist + fund it.
    // eslint-disable-next-line no-console
    console.log(
      `[privy] created server wallet id=${wallet.id} address=${wallet.address} — allowlist it on the Guard and fund it, or set PRIVY_WALLET_ID to reuse.`,
    );
    return walletId;
  }

  return {
    getWalletAddress: () => walletAddress,
    async resolveWalletAddress(): Promise<string | null> {
      if (walletAddress) return walletAddress;
      // A configured walletId has no address cached yet — fetch it from Privy.
      if (walletId) {
        const w = await client.walletApi.getWallet({ id: walletId });
        walletAddress = w.address;
        return walletAddress;
      }
      // No walletId configured — create one lazily (also caches the address).
      await ensureWalletId();
      return walletAddress;
    },
    async sendTransaction(tx: { to: Hex; data: Hex }): Promise<Hex> {
      const id = await ensureWalletId();
      // Pure pass-through: forward EXACTLY the caller's {to,data}. This signer
      // never adds a recipient, amount, value, or selector of its own.
      const res = await client.walletApi.ethereum.sendTransaction({
        walletId: id,
        caip2: SEPOLIA_CAIP2,
        transaction: { to: tx.to, data: tx.data },
      });
      return res.hash as Hex;
    },
  };
}

/** Construct the real Privy client from creds; throws clearly if they're absent. */
function buildRealClient(opts: PrivySignerOptions): PrivyWalletClientLike {
  const appId = opts.appId ?? process.env.PRIVY_APP_ID;
  const appSecret = opts.appSecret ?? process.env.PRIVY_APP_SECRET;
  if (!appId || !appSecret) {
    throw new Error(
      "createPrivySigner: configure Privy — set PRIVY_APP_ID and PRIVY_APP_SECRET (or pass opts.appId/opts.appSecret, or inject opts.client)",
    );
  }
  return new PrivyClient(appId, appSecret) as unknown as PrivyWalletClientLike;
}
