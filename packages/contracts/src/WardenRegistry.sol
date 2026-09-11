// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionedRegistry} from "@ensdomains/contracts-v2/registry/PermissionedRegistry.sol";
import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";

/// @title WardenRegistry — a REAL ENSv2 PermissionedRegistry for WARDEN agent subnames.
/// @notice Thin subclass of the ENSv2 `PermissionedRegistry` (from `ensdomains/contracts-v2`).
///         It is a genuine ENSv2 registry instance (ERC1155 + EnhancedAccessControl) — NOT a
///         reimplementation. We add only:
///           - a stored `parentNode` (the ENS namehash of the parent name, e.g. namehash("warden.eth")),
///           - `nodeFor(label)`, computing the EIP-137 ENS node for a child label under `parentNode`.
///
///         The registry keys its own tokens/resources by labelhash-derived ids (see `LibLabel`),
///         while the WARDEN Guard policy is keyed by the ENS *namehash* (`node`). Both are derived
///         from the same label — `nodeFor(label)` is the bridge, so the Guard policy is bound to a
///         real, on-chain-registered subname's node with no hard-coded value (Requirement 6.1).
///
/// @dev Constructor mirrors the base: `(labelStore, rootAccount, roleBitmap)`. The deployer/root
///      account is granted `roleBitmap` on ROOT_RESOURCE; it then grants the registrar
///      ROLE_REGISTRAR|ROLE_RENEW so the registrar can register subnames.
contract WardenRegistry is PermissionedRegistry {
    /// @notice The ENS namehash of the parent name this registry issues subnames under
    ///         (e.g. namehash("warden.eth")). Used to derive child ENS nodes.
    bytes32 public immutable parentNode;

    constructor(ILabelStore labelStore, address rootAccount, uint256 roleBitmap, bytes32 parentNode_)
        PermissionedRegistry(labelStore, rootAccount, roleBitmap)
    {
        parentNode = parentNode_;
    }

    /// @notice Compute the EIP-137 ENS node for `label` under this registry's `parentNode`.
    ///         node = keccak256(parentNode ++ keccak256(bytes(label))).
    /// @dev Matches the agent-side `ensNodeFor(label, parentNode)` (packages/agent/src/ens.ts),
    ///      so the on-chain identity and the off-chain Guard key agree exactly.
    function nodeFor(string memory label) public view returns (bytes32) {
        return keccak256(abi.encodePacked(parentNode, keccak256(bytes(label))));
    }
}
