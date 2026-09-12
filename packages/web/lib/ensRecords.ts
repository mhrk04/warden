/**
 * Read an agent subname's ENSv2 resolver records (Best-Use-of-ENSv2 surface).
 *
 * Each WARDEN agent subname owns its data via a real ENSv2 `PermissionedResolver`
 * (see packages/contracts/src/AgentRecordsLib.sol + script/SeedResolver.s.sol).
 * This module reads those records LIVE off Sepolia so the dashboard can display
 * the agent's on-chain profile — never hard-coded values.
 *
 * Resolution strategy for a given node:
 *   1. If the node's label is known (label store) and the registry reports a
 *      resolver for that label, use it (per-subname resolver).
 *   2. Otherwise fall back to the resolver recorded in deployments/sepolia.json
 *      under the `resolver` block (the seeded demo resolver).
 * If no resolver is found, records are simply absent (the panel shows an empty
 * state) — this never throws for an agent that has no resolver yet.
 *
 * The pure core (`readEnsRecordsWith`) is dependency-injected for unit tests; the
 * exported `readEnsRecords` wires the real viem chain + label store + deployments.
 */
import { type Abi, type Hex } from "viem";
import { addresses, publicClient } from "./chain";
import { readLabels } from "./labelStore";
import deployments from "../../contracts/deployments/sepolia.json" with { type: "json" };

/** The standard WARDEN agent text-record keys (mirrors AgentRecordsLib). */
export const WARDEN_TEXT_KEYS = ["warden:status", "warden:guard", "warden:node", "description"] as const;

/** The agent's ENS profile as read from its PermissionedResolver. */
export interface EnsRecords {
  /** The resolver contract serving this node, or null if none is set. */
  resolver: string | null;
  /** The `addr(node)` record — the agent's signer address (or null). */
  addr: string | null;
  /** Text records by key (only non-empty values are included). */
  texts: Record<string, string>;
}

/** Minimal read-only ABI fragments for the registry + PermissionedResolver. */
const registryReadAbi = [
  {
    type: "function",
    name: "getResolver",
    stateMutability: "view",
    inputs: [{ name: "label", type: "string" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const resolverReadAbi = [
  {
    type: "function",
    name: "addr",
    stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "text",
    stateMutability: "view",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

/** Injectable dependencies so the resolution + read logic is unit-testable. */
export interface EnsRecordsDeps {
  /** node -> label map (label store). */
  getLabels: () => Record<string, string>;
  /** The registry-reported resolver for a label (or ZERO/none). */
  getResolverForLabel: (label: string) => Promise<string>;
  /** The seeded fallback resolver from deployments (or null). */
  fallbackResolver: () => string | null;
  /** Read addr(node) off a resolver. */
  readAddr: (resolver: string, node: string) => Promise<string>;
  /** Read text(node,key) off a resolver. */
  readText: (resolver: string, node: string, key: string) => Promise<string>;
}

function isZeroAddr(a: string | null | undefined): boolean {
  return !a || /^0x0+$/i.test(a);
}

/** Dependency-injected core: resolve the resolver for `node`, then read records. */
export async function readEnsRecordsWith(node: string, deps: EnsRecordsDeps): Promise<EnsRecords> {
  const labels = deps.getLabels();
  const label = labels[node] ?? labels[node.toLowerCase()];

  // 1. Per-subname resolver (if the label is known and the registry has one set).
  let resolver: string | null = null;
  if (label) {
    const r = await deps.getResolverForLabel(label);
    if (!isZeroAddr(r)) resolver = r;
  }
  // 2. Fall back to the seeded demo resolver.
  if (!resolver) resolver = deps.fallbackResolver();

  if (isZeroAddr(resolver)) {
    return { resolver: null, addr: null, texts: {} };
  }

  const [addr, textEntries] = await Promise.all([
    deps.readAddr(resolver!, node).catch(() => ZERO),
    Promise.all(
      WARDEN_TEXT_KEYS.map(async (key) => {
        const value = await deps.readText(resolver!, node, key).catch(() => "");
        return [key, value] as const;
      }),
    ),
  ]);

  const texts: Record<string, string> = {};
  for (const [key, value] of textEntries) {
    if (value && value.length > 0) texts[key] = value;
  }

  return {
    resolver: resolver!,
    addr: isZeroAddr(addr) ? null : addr,
    texts,
  };
}

/** The resolver address seeded into deployments/sepolia.json, if present. */
function fallbackResolver(): string | null {
  const d = deployments as { resolver?: { resolver?: string } };
  return d.resolver?.resolver ?? null;
}

async function getResolverForLabel(label: string): Promise<string> {
  const { wardenRegistry } = addresses();
  try {
    const r = (await publicClient().readContract({
      address: wardenRegistry as Hex,
      abi: registryReadAbi as unknown as Abi,
      functionName: "getResolver",
      args: [label],
    })) as string;
    return r;
  } catch {
    return ZERO;
  }
}

async function readAddr(resolver: string, node: string): Promise<string> {
  return (await publicClient().readContract({
    address: resolver as Hex,
    abi: resolverReadAbi as unknown as Abi,
    functionName: "addr",
    args: [node as Hex],
  })) as string;
}

async function readText(resolver: string, node: string, key: string): Promise<string> {
  return (await publicClient().readContract({
    address: resolver as Hex,
    abi: resolverReadAbi as unknown as Abi,
    functionName: "text",
    args: [node as Hex, key],
  })) as string;
}

/** Public: read an agent node's ENSv2 resolver records live off Sepolia. */
export async function readEnsRecords(node: string): Promise<EnsRecords> {
  return readEnsRecordsWith(node, {
    getLabels: readLabels,
    getResolverForLabel,
    fallbackResolver,
    readAddr,
    readText,
  });
}
