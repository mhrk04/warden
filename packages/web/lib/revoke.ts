/**
 * Instant human revocation (Requirement 4.1; ACT-001-5).
 *
 * Calls Guard.revoke(node) via the admin wallet (the deployer owns the Guard).
 * After this, the Guard rejects every subsequent proposal for that node. The
 * route gates this behind a verified server session.
 */
import { type Abi, type Hex } from "viem";
import guardAbi from "../../shared/abi/Guard.json" with { type: "json" };
import { addresses, adminAccount, adminWallet, CHAIN, publicClient } from "./chain";

export async function revokeAgent(node: string): Promise<void> {
  const { guard } = addresses();
  const wallet = adminWallet();
  const hash = await wallet.writeContract({
    account: adminAccount(),
    chain: CHAIN,
    address: guard as Hex,
    abi: guardAbi as unknown as Abi,
    functionName: "revoke",
    args: [node as Hex],
  });
  await publicClient().waitForTransactionReceipt({ hash });
}
