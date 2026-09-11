import {
  assert,
  describe,
  test,
  clearStore,
  beforeEach,
  afterAll,
  newMockEvent,
} from "matchstick-as/assembly/index";
import {
  Address,
  BigInt,
  Bytes,
  ethereum,
} from "@graphprotocol/graph-ts";
import {
  AgentConfigured,
  Executed,
  Revoked,
} from "../generated/Guard/Guard";
import {
  handleAgentConfigured,
  handleExecuted,
  handleRevoked,
} from "../src/mapping";

// A representative ENS node (namehash-shaped 32 bytes) and addresses used across tests.
const ENS_NODE = "0x1111111111111111111111111111111111111111111111111111111111111111";
const AGENT_SIGNER = "0x00000000000000000000000000000000000000a1";
const TOKEN = "0x00000000000000000000000000000000000000b2";
const RECIPIENT = "0x00000000000000000000000000000000000000c3";

function nodeBytes(): Bytes {
  return Bytes.fromHexString(ENS_NODE);
}

function createAgentConfiguredEvent(
  ensNode: string,
  agentSigner: string,
  token: string,
  perTxCap: i32,
  cumulativeCap: i32,
  expiry: i32
): AgentConfigured {
  let event = changetype<AgentConfigured>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "ensNode",
      ethereum.Value.fromFixedBytes(Bytes.fromHexString(ensNode))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "agentSigner",
      ethereum.Value.fromAddress(Address.fromString(agentSigner))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "token",
      ethereum.Value.fromAddress(Address.fromString(token))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "perTxCap",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(perTxCap))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "cumulativeCap",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(cumulativeCap))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "expiry",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(expiry))
    )
  );
  return event;
}

function createExecutedEvent(
  ensNode: string,
  to: string,
  amount: i32,
  newSpent: i32
): Executed {
  let event = changetype<Executed>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "ensNode",
      ethereum.Value.fromFixedBytes(Bytes.fromHexString(ensNode))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "to",
      ethereum.Value.fromAddress(Address.fromString(to))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "amount",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(amount))
    )
  );
  event.parameters.push(
    new ethereum.EventParam(
      "newSpent",
      ethereum.Value.fromUnsignedBigInt(BigInt.fromI32(newSpent))
    )
  );
  return event;
}

function createRevokedEvent(ensNode: string): Revoked {
  let event = changetype<Revoked>(newMockEvent());
  event.parameters = new Array();
  event.parameters.push(
    new ethereum.EventParam(
      "ensNode",
      ethereum.Value.fromFixedBytes(Bytes.fromHexString(ensNode))
    )
  );
  return event;
}

// The AuditEvent id is deterministic: tx hash concat log index. newMockEvent gives
// a fixed default tx hash + logIndex 1, so recompute it the same way for assertions.
function auditId(event: ethereum.Event): string {
  return event.transaction.hash.concatI32(event.logIndex.toI32()).toHexString();
}

describe("Guard subgraph mappings", () => {
  beforeEach(() => {
    clearStore();
  });

  afterAll(() => {
    clearStore();
  });

  test("handleAgentConfigured creates an Agent with caps and an AuditEvent", () => {
    let event = createAgentConfiguredEvent(
      ENS_NODE,
      AGENT_SIGNER,
      TOKEN,
      100,
      250,
      2000000000
    );
    handleAgentConfigured(event);

    let id = nodeBytes().toHexString();
    assert.entityCount("Agent", 1);
    assert.fieldEquals("Agent", id, "perTxCap", "100");
    assert.fieldEquals("Agent", id, "cumulativeCap", "250");
    assert.fieldEquals("Agent", id, "spent", "0");
    assert.fieldEquals("Agent", id, "revoked", "false");
    assert.fieldEquals(
      "Agent",
      id,
      "agentSigner",
      Address.fromString(AGENT_SIGNER).toHexString()
    );

    assert.entityCount("AuditEvent", 1);
    assert.fieldEquals("AuditEvent", auditId(event), "kind", "AgentConfigured");
    assert.fieldEquals("AuditEvent", auditId(event), "ensNode", id);
  });

  test("handleExecuted updates Agent.spent to newSpent and records an Executed AuditEvent", () => {
    // Agent exists first (configured), then executes.
    handleAgentConfigured(
      createAgentConfiguredEvent(ENS_NODE, AGENT_SIGNER, TOKEN, 100, 250, 2000000000)
    );

    let event = createExecutedEvent(ENS_NODE, RECIPIENT, 80, 80);
    handleExecuted(event);

    let id = nodeBytes().toHexString();
    assert.fieldEquals("Agent", id, "spent", "80");

    assert.fieldEquals("AuditEvent", auditId(event), "kind", "Executed");
    assert.fieldEquals("AuditEvent", auditId(event), "amount", "80");
    assert.fieldEquals("AuditEvent", auditId(event), "newSpent", "80");
    assert.fieldEquals(
      "AuditEvent",
      auditId(event),
      "to",
      Address.fromString(RECIPIENT).toHexString()
    );
  });

  test("handleExecuted load-or-creates the Agent even without a prior AgentConfigured", () => {
    let event = createExecutedEvent(ENS_NODE, RECIPIENT, 42, 42);
    handleExecuted(event);

    let id = nodeBytes().toHexString();
    assert.entityCount("Agent", 1);
    assert.fieldEquals("Agent", id, "spent", "42");
    assert.fieldEquals("Agent", id, "revoked", "false");
  });

  test("handleRevoked sets Agent.revoked = true and records a Revoked AuditEvent", () => {
    handleAgentConfigured(
      createAgentConfiguredEvent(ENS_NODE, AGENT_SIGNER, TOKEN, 100, 250, 2000000000)
    );

    let event = createRevokedEvent(ENS_NODE);
    handleRevoked(event);

    let id = nodeBytes().toHexString();
    assert.fieldEquals("Agent", id, "revoked", "true");
    assert.fieldEquals("AuditEvent", auditId(event), "kind", "Revoked");
  });
});
