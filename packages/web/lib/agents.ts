/**
 * Agent listing + creation (Requirement 1, 6.1/6.2, 8.1; ACT-001-1/2).
 *
 * listAgents reads the LIVE subgraph (failure mode 8 — never static mock data),
 * mapping results to the Agent view model. For a freshly-created agent that the
 * subgraph has not indexed yet, it falls back to reading Guard.getPolicy on
 * Sepolia so the new agent still lists (avoids the "created but not shown" bug).
 *
 * createAgent (1) registers the ENS subname via the registrar, (2) configures
 * the policy on the Guard, (3) sets the recipient allowlist, (4) persists the
 * node->label mapping so ensName can be derived. For the demo the deployer is
 * both the subname owner and the agent signer.
 *
 * The pure mapping (`mapAgent`) and the dependency-injected core
 * (`listAgentsWith`) are unit-tested with fakes; the exported `listAgents` /
 * `createAgent` wire the real subgraph + viem chain layer.
 */
import { type Abi, type Hex } from "viem";
import guardAbi from "../../shared/abi/Guard.json" with { type: "json" };
import registrarAbi from "../../shared/abi/AgentSubnameRegistrar.json" with { type: "json" };
import { fetchAgent } from "@warden/agent";
import { addresses, adminAddress, adminWallet, publicClient } from "./chain";
import { readLabels, saveLabel } from "./labelStore";

/** ENS parent for all WARDEN agent subnames. */
const ENS_PARENT = "warden.eth";
/** Registration duration for the demo subname (1 year, seconds). */
const REGISTER_DURATION = 365n * 24n * 60n * 60n;

/** The off-chain Agent view model (plain strings so JSON is lossless). */
export interface Agent {
  ensName: string;
  ensNode: string;
  agentSigner: string;
  perTxCap: string;
  cumulativeCap: string;
  spent: string;
  expiry: string;
  revoked: boolean;
}

/** An agent's on-chain state as returned by the subgraph or the getPolicy fallback. */
export interface SubgraphAgent {
  id: string; // ENS node
  perTxCap: string;
  cumulativeCap: string;
  spent: string;
  expiry: string;
  revoked: boolean;
  agentSigner: string;
  token: string;
}

export interface CreateAgentInput {
  label: string;
  perTxCap: string | bigint;
  cumulativeCap: string | bigint;
  expiry: string | bigint;
  allowlist: string[];
}

/** Map raw on-chain state + a (maybe-known) label into the Agent view model. */
export function mapAgent(a: SubgraphAgent, label: string | undefined): Agent {
  return {
    ensName: label ? `${label}.${ENS_PARENT}` : a.id,
    ensNode: a.id,
    agentSigner: a.agentSigner,
    perTxCap: a.perTxCap,
    cumulativeCap: a.cumulativeCap,
    spent: a.spent,
    expiry: a.expiry,
    revoked: a.revoked,
  };
}

/** Injectable dependencies for listAgents (real impls wired in listAgents). */
export interface ListDeps {
  /** Read all indexed agents from the live subgraph. */
  fetchAgents: () => Promise<SubgraphAgent[]>;
  /** Read a single agent's policy on-chain (fallback for un-indexed agents). */
  readPolicy: (node: string) => Promise<SubgraphAgent | null>;
  /** node -> label map (from the local label store). */
  getLabels: () => Record<string, string>;
}

/**
 * Dependency-injected listing core. Prefers the live subgraph; for any labelled
 * node the subgraph did not return, falls back to Guard.getPolicy so freshly
 * created agents still appear.
 */
export async function listAgentsWith(deps: ListDeps): Promise<Agent[]> {
  const labels = deps.getLabels();
  const indexed = await deps.fetchAgents();
  const seen = new Set<string>();
  const out: Agent[] = [];

  for (const a of indexed) {
    seen.add(a.id.toLowerCase());
    out.push(mapAgent(a, labels[a.id]));
  }

  // Fallback: any labelled node not yet indexed -> read its policy on-chain.
  for (const [node, label] of Object.entries(labels)) {
    if (seen.has(node.toLowerCase())) continue;
    const policy = await deps.readPolicy(node);
    if (policy) out.push(mapAgent(policy, label));
  }

  return out;
}

const ALL_AGENTS_QUERY = `query { agents(first: 100) {
  id perTxCap cumulativeCap spent expiry revoked agentSigner token
} }`;

/** Fetch all indexed agents from the live subgraph. */
async function fetchAllAgents(): Promise<SubgraphAgent[]> {
  const url = process.env.SUBGRAPH_URL;
  if (!url) return [];
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: ALL_AGENTS_QUERY }),
  });
  if (!res.ok) throw new Error(`subgraph request failed: HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { agents?: SubgraphAgent[] } };
  return body?.data?.agents ?? [];
}

/** Read one agent's policy from the Guard via viem (fallback for un-indexed). */
async function readPolicyOnChain(node: string): Promise<SubgraphAgent | null> {
  const { guard } = addresses();
  const policy = (await publicClient().readContract({
    address: guard as Hex,
    abi: guardAbi as unknown as Abi,
    functionName: "getPolicy",
    args: [node as Hex],
  })) as {
    token: string;
    perTxCap: bigint;
    cumulativeCap: bigint;
    spent: bigint;
    expiry: bigint;
    revoked: boolean;
    ensNode: string;
    agentSigner: string;
  };
  // Un-configured policies return the zero agentSigner — treat as not present.
  if (!policy || /^0x0+$/.test(policy.agentSigner)) return null;
  return {
    id: node,
    perTxCap: policy.perTxCap.toString(),
    cumulativeCap: policy.cumulativeCap.toString(),
    spent: policy.spent.toString(),
    expiry: policy.expiry.toString(),
    revoked: policy.revoked,
    agentSigner: policy.agentSigner,
    token: policy.token,
  };
}

/** Public: list agents from the live subgraph with an on-chain fallback. */
export async function listAgents(): Promise<Agent[]> {
  return listAgentsWith({
    fetchAgents: fetchAllAgents,
    readPolicy: readPolicyOnChain,
    getLabels: readLabels,
  });
}

/** Public: register the subname + configure the policy + set the allowlist. */
export async function createAgent(input: CreateAgentInput): Promise<Agent> {
  const { guard, usdc, registrar } = addresses();
  const wallet = adminWallet();
  const owner = adminAddress();
  const perTxCap = BigInt(input.perTxCap);
  const cumulativeCap = BigInt(input.cumulativeCap);
  const expiry = BigInt(input.expiry);

  // (1) Register the ENS subname (owner = deployer for the demo).
  const node = (await publicClient().readContract({
    address: registrar as Hex,
    abi: registrarAbi as unknown as Abi,
    functionName: "nodeFor",
    args: [input.label],
  })) as Hex;

  const regHash = await wallet.writeContract({
    address: registrar as Hex,
    abi: registrarAbi as unknown as Abi,
    functionName: "register",
    args: [input.label, owner, "0x0000000000000000000000000000000000000000", REGISTER_DURATION],
  });
  await publicClient().waitForTransactionReceipt({ hash: regHash });

  // (2) Configure the policy on the Guard (agentSigner = deployer for the demo).
  const cfgHash = await wallet.writeContract({
    address: guard as Hex,
    abi: guardAbi as unknown as Abi,
    functionName: "configureAgent",
    args: [node, owner, usdc as Hex, perTxCap, cumulativeCap, expiry],
  });
  await publicClient().waitForTransactionReceipt({ hash: cfgHash });

  // (3) Set the recipient allowlist.
  for (const recipient of input.allowlist ?? []) {
    const alHash = await wallet.writeContract({
      address: guard as Hex,
      abi: guardAbi as unknown as Abi,
      functionName: "setAllowlist",
      args: [node, recipient as Hex, true],
    });
    await publicClient().waitForTransactionReceipt({ hash: alHash });
  }

  // (4) Persist node -> label so ensName is derivable.
  saveLabel(node, input.label);

  return {
    ensName: `${input.label}.${ENS_PARENT}`,
    ensNode: node,
    agentSigner: owner,
    perTxCap: perTxCap.toString(),
    cumulativeCap: cumulativeCap.toString(),
    spent: "0",
    expiry: expiry.toString(),
    revoked: false,
  };
}

// fetchAgent is imported to keep the single-agent live read available to callers
// (run route) and to assert the subgraph is the source of truth.
export { fetchAgent };
