import { describe, it, expect } from "vitest";
import { ensNodeFor, namehash, labelhash } from "../src/ens";

// Known ENS namehash vectors (EIP-137 reference).
// namehash("") = 0x0000...0000
// namehash("eth") = 0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae
const ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ETH_NODE = "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae";

describe("ENS namehash", () => {
  it("namehash('') is the zero node", () => {
    expect(namehash("")).toBe(ZERO);
  });

  it("namehash('eth') matches the EIP-137 vector", () => {
    expect(namehash("eth")).toBe(ETH_NODE);
  });

  it("namehash('foo.eth') matches the EIP-137 vector", () => {
    // Documented reference vector for foo.eth (EIP-137).
    expect(namehash("foo.eth")).toBe(
      "0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f",
    );
  });

  it("labelhash('eth') = keccak256('eth')", () => {
    expect(labelhash("eth")).toBe(
      "0x4f5b812789fc606be1b3b16908db13fc7a9adf7ca72641f84d75b47069d3d7f0",
    );
  });

  describe("ensNodeFor(label, parentNode)", () => {
    it("ensNodeFor('eth', namehash('')) == namehash('eth')", () => {
      expect(ensNodeFor("eth", namehash(""))).toBe(ETH_NODE);
    });

    it("ensNodeFor('foo', namehash('eth')) == namehash('foo.eth')", () => {
      expect(ensNodeFor("foo", ETH_NODE)).toBe(namehash("foo.eth"));
    });

    // Documented WARDEN subname vector: node of "payer" under parent "warden.eth".
    // parentNode = namehash("warden.eth"); ensNodeFor("payer", parentNode) must equal
    // namehash("payer.warden.eth").
    it("computes the WARDEN agent subname node (payer.warden.eth)", () => {
      const parent = namehash("warden.eth");
      const expected = namehash("payer.warden.eth");
      expect(ensNodeFor("payer", parent)).toBe(expected);
      // Documented value (authoritative, from `cast namehash payer.warden.eth`):
      expect(ensNodeFor("payer", parent)).toBe(
        "0xc54c92af84a1c146494912c71879955912e760924a1ecff0fd335cc74a09b869",
      );
      // and parent warden.eth is the documented cast vector:
      expect(namehash("warden.eth")).toBe(
        "0x6358fec858d0795e69037f8d7cbfb131b209b2d140c78005877273ed6df083b8",
      );
    });
  });
});
