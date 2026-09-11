/**
 * ENS name hashing (EIP-137), dependency-free.
 *
 * namehash("") = 0x0000...0000
 * namehash(name) = keccak256( namehash(parent) ++ keccak256(label) )
 * where `label` is the leftmost DNS label and `parent` is the rest of the name.
 *
 * These are the exact node ids the WARDEN Guard policy is keyed on (Requirement 6.1):
 * the Guard's `ensNode` for an agent subname MUST equal `ensNodeFor(label, parentNode)`,
 * where `parentNode = namehash(parentName)`. No hard-coded node values.
 */
import { keccak256Bytes } from "./keccak256";

type Hex = `0x${string}`;

const ZERO_NODE: Hex = ("0x" + "00".repeat(32)) as Hex;

function toHex(bytes: Uint8Array): Hex {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s as Hex;
}

function hexToBytes(hex: Hex): Uint8Array {
  const clean = hex.slice(2);
  if (clean.length !== 64) {
    throw new Error(`expected a 32-byte hex node, got length ${clean.length}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const utf8 = new TextEncoder();

/** keccak256 of a UTF-8 label (EIP-137 labelhash). */
export function labelhash(label: string): Hex {
  return toHex(keccak256Bytes(utf8.encode(label)));
}

/**
 * Compute the node for a single `label` under an already-computed `parentNode`.
 * node = keccak256(parentNode ++ keccak256(label)).
 */
export function ensNodeFor(label: string, parentNode: Hex): Hex {
  if (label.length === 0) {
    throw new Error("label must be non-empty");
  }
  const parentBytes = hexToBytes(parentNode);
  const labelHashBytes = keccak256Bytes(utf8.encode(label));
  const buf = new Uint8Array(64);
  buf.set(parentBytes, 0);
  buf.set(labelHashBytes, 32);
  return toHex(keccak256Bytes(buf));
}

/**
 * Full EIP-137 namehash of a dotted ENS name (e.g. "payer.warden.eth").
 * namehash("") == the zero node.
 */
export function namehash(name: string): Hex {
  if (name.length === 0) return ZERO_NODE;
  const labels = name.split(".");
  // Fold from the rightmost label (TLD) inward, so the leftmost label is applied last.
  let node = ZERO_NODE;
  for (let i = labels.length - 1; i >= 0; i--) {
    node = ensNodeFor(labels[i], node);
  }
  return node;
}
