/**
 * Propose a payout via the Guard (Requirement 2.1 / 7.1, TC-001-14, failure mode 1).
 *
 * SECURITY INVARIANT: the agent can ONLY call `Guard.propose`. There is NO code
 * path in this module (or anywhere in the agent) that encodes or calls an ERC-20
 * `transfer` — moving funds is exclusively the Guard's job, and the Guard
 * re-enforces every policy rule on-chain. This module just ABI-encodes the
 * propose call and submits it through a caller-supplied signer.
 *
 * Amount capping (to perTxCap) already happened in the decision layer
 * (see graph.toBalanceData + decide); propose only submits.
 */
import { encodeFunctionData, type Abi } from "viem";
import guardAbi from "../../shared/abi/Guard.json" with { type: "json" };

type Hex = `0x${string}`;

/** A ready-to-send transaction: only ever targets the Guard's propose function. */
export interface ProposalCall {
  to: Hex;
  data: Hex;
}

/**
 * The minimal signer surface we depend on. In production this is a viem
 * `WalletClient` backed by a Privy embedded wallet (see signer.ts); in tests a
 * mock. It is deliberately low-authority: all it can do here is send the
 * propose call this module built.
 */
export interface ProposingWallet {
  sendTransaction(tx: { to: Hex; data: Hex }): Promise<Hex>;
}

/**
 * ABI-encode `Guard.propose(bytes32 ensNode, address to, uint256 amount)` and
 * point it at the Guard address. This is the ONLY call the agent ever builds.
 */
export function buildProposalCall(
  guardAddress: Hex,
  ensNode: Hex,
  recipient: Hex,
  amount: bigint,
): ProposalCall {
  const data = encodeFunctionData({
    abi: guardAbi as unknown as Abi,
    functionName: "propose",
    args: [ensNode, recipient, amount],
  });
  return { to: guardAddress, data };
}

/**
 * Submit a proposal via the supplied wallet client. Signer-agnostic: the wallet
 * is provided by the caller (Privy in prod, mock in tests). Returns the txHash.
 */
export async function submitProposal(
  wallet: ProposingWallet,
  call: ProposalCall,
): Promise<{ txHash: Hex }> {
  const txHash = await wallet.sendTransaction({ to: call.to, data: call.data });
  return { txHash };
}
