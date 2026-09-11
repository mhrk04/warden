import { Bytes, BigInt, ethereum } from "@graphprotocol/graph-ts";
import {
  AgentConfigured,
  Executed,
  PolicyChanged,
  Revoked,
} from "../generated/Guard/Guard";
import { Agent, AuditEvent } from "../generated/schema";

// Load an existing Agent by its ENS node, or create a fresh one with safe defaults.
// spent and revoked are non-nullable in the schema, so they must be seeded.
function loadOrCreateAgent(ensNode: Bytes): Agent {
  let agent = Agent.load(ensNode);
  if (agent == null) {
    agent = new Agent(ensNode);
    agent.spent = BigInt.zero();
    agent.revoked = false;
  }
  return agent as Agent;
}

// Deterministic AuditEvent id: transaction hash bytes concatenated with the log index.
// Two events in the same tx get distinct ids via the differing logIndex.
function auditEventId(event: ethereum.Event): Bytes {
  return event.transaction.hash.concatI32(event.logIndex.toI32());
}

// Create an AuditEvent with the fields common to every Guard event.
function newAuditEvent(
  event: ethereum.Event,
  ensNode: Bytes,
  kind: string
): AuditEvent {
  let entity = new AuditEvent(auditEventId(event));
  entity.agent = ensNode;
  entity.ensNode = ensNode;
  entity.kind = kind;
  entity.txHash = event.transaction.hash;
  entity.blockNumber = event.block.number;
  entity.blockTimestamp = event.block.timestamp;
  return entity;
}

export function handleAgentConfigured(event: AgentConfigured): void {
  let ensNode = event.params.ensNode;
  let agent = loadOrCreateAgent(ensNode);

  agent.agentSigner = event.params.agentSigner;
  agent.token = event.params.token;
  agent.perTxCap = event.params.perTxCap;
  agent.cumulativeCap = event.params.cumulativeCap;
  agent.expiry = event.params.expiry;
  // (Re)configuration resets running state; a fresh mandate starts clean.
  agent.spent = BigInt.zero();
  agent.revoked = false;
  if (agent.createdAt === null) {
    agent.createdAt = event.block.timestamp;
  }
  agent.save();

  let audit = newAuditEvent(event, ensNode, "AgentConfigured");
  audit.perTxCap = event.params.perTxCap;
  audit.cumulativeCap = event.params.cumulativeCap;
  audit.expiry = event.params.expiry;
  audit.save();
}

export function handleExecuted(event: Executed): void {
  let ensNode = event.params.ensNode;
  let agent = loadOrCreateAgent(ensNode);

  // newSpent is the authoritative cumulative total emitted by the Guard.
  agent.spent = event.params.newSpent;
  agent.save();

  let audit = newAuditEvent(event, ensNode, "Executed");
  audit.to = event.params.to;
  audit.amount = event.params.amount;
  audit.newSpent = event.params.newSpent;
  audit.save();
}

export function handlePolicyChanged(event: PolicyChanged): void {
  let ensNode = event.params.ensNode;
  let agent = loadOrCreateAgent(ensNode);

  agent.perTxCap = event.params.perTxCap;
  agent.cumulativeCap = event.params.cumulativeCap;
  agent.expiry = event.params.expiry;
  agent.save();

  let audit = newAuditEvent(event, ensNode, "PolicyChanged");
  audit.perTxCap = event.params.perTxCap;
  audit.cumulativeCap = event.params.cumulativeCap;
  audit.expiry = event.params.expiry;
  audit.save();
}

export function handleRevoked(event: Revoked): void {
  let ensNode = event.params.ensNode;
  let agent = loadOrCreateAgent(ensNode);

  agent.revoked = true;
  agent.save();

  let audit = newAuditEvent(event, ensNode, "Revoked");
  audit.save();
}
