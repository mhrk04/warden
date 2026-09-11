/**
 * Server-side chain access (viem) for the WARDEN API routes.
 *
 * - `publicClient()` reads Sepolia (getPolicy fallback, simulate, receipts).
 * - `adminWallet()` is a wallet client backed by DEPLOYER_PRIVATE_KEY — the
 *   deployer owns the Guard + registry, so it performs admin writes
 *   (configureAgent / setAllowlist / revoke) and, for the demo, also acts as the
 *   agent signer that calls propose.
 *
 * Contract addresses are loaded from packages/contracts/deployments/sepolia.json
 * (env GUARD_ADDRESS/USDC_ADDRESS may override but default to the deployments
 * file). Secrets are read from process.env only — never hardcoded/committed.
 *
 * These builders are only invoked on real requests; the unit test suite injects
 * mocked chain functions into lib/agents + the run/revoke routes, so no live RPC
 * is touched under test.
 */
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import deployments from "../../contracts/deployments/sepolia.json" with { type: "json" };

export interface Deployments {
  deployer: string;
  guard: string;
  usdc: string;
  registrar: string;
  wardenRegistry: string;
}

/** Resolve deployed addresses (env override, else the deployments json). */
export function addresses(): Deployments {
  const d = deployments as Deployments;
  return {
    deployer: d.deployer,
    guard: (process.env.GUARD_ADDRESS || d.guard) as string,
    usdc: (process.env.USDC_ADDRESS || d.usdc) as string,
    registrar: d.registrar,
    wardenRegistry: d.wardenRegistry,
  };
}

function rpcUrl(): string {
  const url = process.env.SEPOLIA_RPC_URL;
  if (!url) throw new Error("SEPOLIA_RPC_URL is not set");
  return url;
}

/** Ensure a private key has the 0x prefix viem requires. */
export function normalizePrivateKey(raw: string): Hex {
  const k = raw.trim();
  return (k.startsWith("0x") ? k : `0x${k}`) as Hex;
}

export function publicClient() {
  return createPublicClient({ chain: sepolia, transport: http(rpcUrl()) });
}

export function adminWallet() {
  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(normalizePrivateKey(raw));
  return createWalletClient({ account, chain: sepolia, transport: http(rpcUrl()) });
}

/** The address that acts as both admin and (for the demo) the agent signer. */
export function adminAddress(): Hex {
  const raw = process.env.DEPLOYER_PRIVATE_KEY;
  if (!raw) throw new Error("DEPLOYER_PRIVATE_KEY is not set");
  return privateKeyToAccount(normalizePrivateKey(raw)).address;
}
