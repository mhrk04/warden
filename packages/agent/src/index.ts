/** WARDEN agent — public surface (decision rule, graph reader, propose, explain). */
export const AGENT_NAME = "warden-agent" as const;

export { decide } from "./decide";
export type { BalanceData, Decision } from "./decide";

export { fetchAgent, toBalanceData } from "./graph";
export type { AgentData } from "./graph";

export { buildProposalCall, submitProposal } from "./propose";
export type { ProposalCall, ProposingWallet } from "./propose";

export { createLocalSigner, createPrivySigner } from "./signer";
export type { LocalSignerOptions } from "./signer";

export { explain, templateExplanation } from "./explain";
export type { Outcome, ExplainOptions } from "./explain";
