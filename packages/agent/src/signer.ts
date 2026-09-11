/**
 * Signer construction for the proposing wallet (Requirement 7.1).
 *
 * `propose` is signer-agnostic (it takes any `ProposingWallet`). This module
 * provides two ways to obtain one, both LOW-AUTHORITY — the resulting wallet can
 * only submit the propose call; the Guard still enforces every policy rule:
 *
 *   (a) `createLocalSigner` — a viem WalletClient from a raw private key
 *       (env AGENT_PRIVATE_KEY), for local/demo runs.
 *   (b) `createPrivySigner` — an integration seam for the real Privy embedded
 *       wallet, wired by the web/API layer in Milestone 7. It throws until Privy
 *       is configured, so nothing silently runs unsigned.
 *
 * Secrets are read from env at runtime; nothing is committed.
 */
import {
  createWalletClient,
  http,
  type Chain,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

type Hex = `0x${string}`;

export interface LocalSignerOptions {
  /** Raw private key; defaults to env AGENT_PRIVATE_KEY. Never hard-code. */
  privateKey?: string;
  /** RPC URL; defaults to env SEPOLIA_RPC_URL. */
  rpcUrl?: string;
  /** Chain; defaults to Sepolia. */
  chain?: Chain;
}

/**
 * Build a viem WalletClient from a raw private key (local/demo path).
 * Throws with a clear message if no key is available so we never run unsigned.
 */
export function createLocalSigner(opts: LocalSignerOptions = {}): WalletClient {
  const pk = opts.privateKey ?? process.env.AGENT_PRIVATE_KEY;
  if (!pk) {
    throw new Error(
      "createLocalSigner: no private key (set AGENT_PRIVATE_KEY or pass opts.privateKey)",
    );
  }
  const rpcUrl = opts.rpcUrl ?? process.env.SEPOLIA_RPC_URL;
  const account = privateKeyToAccount(pk as Hex);
  return createWalletClient({
    account,
    chain: opts.chain ?? sepolia,
    transport: http(rpcUrl),
  });
}

/**
 * Integration seam for the Privy embedded wallet. The web/API layer (Milestone 7)
 * wires the real Privy-backed viem wallet client here. Until then this throws so
 * the money path is never silently unsigned.
 */
export function createPrivySigner(): WalletClient {
  throw new Error(
    "createPrivySigner: configure Privy — the web/API layer wires the Privy embedded wallet in Milestone 7",
  );
}
