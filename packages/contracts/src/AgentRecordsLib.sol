// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {PermissionedResolver} from "@ensdomains/contracts-v2/resolver/PermissionedResolver.sol";

/// @title AgentRecordsLib — the canonical WARDEN agent profile, written onto an ENSv2 resolver.
/// @notice A WARDEN agent's ENSv2 subname is not a display string: it OWNS its data via a
///         {PermissionedResolver}. This library writes the standard WARDEN agent profile so the
///         subname becomes a self-describing on-chain identity that any ENS-aware client can read:
///
///           - `addr(node)`             = the agent's low-authority signer (the Privy wallet).
///           - text `warden:guard`      = the Guard (enforcement) contract address.
///           - text `warden:node`       = the ENS node the Guard policy is keyed to (hex).
///           - text `warden:status`     = human-readable lifecycle marker (e.g. "active").
///           - text `description`       = a standard ENS profile text describing the agent.
///
/// @dev The caller (the resolver root admin) must have record-write roles. All writes go through
///      the resolver's permissioned setters, so this same profile can later be edited by a
///      delegate that was granted ONLY a specific text key via `authorizeTextRoles` — the
///      Enhanced Access Control demo (see test/ENSResolver.t.sol).
library AgentRecordsLib {
    /// @notice Standard WARDEN text-record keys (stable identifiers for the agent profile).
    string internal constant KEY_GUARD = "warden:guard";
    string internal constant KEY_NODE = "warden:node";
    string internal constant KEY_STATUS = "warden:status";
    string internal constant KEY_DESCRIPTION = "description";

    /// @notice Write the baseline WARDEN agent profile for `node` onto `resolver`.
    /// @param resolver The ENSv2 PermissionedResolver bound to the subname.
    /// @param node The ENS node (namehash) of the agent subname.
    /// @param agentSigner The agent's low-authority signer address (stored as the `addr` record).
    /// @param guard The Guard (enforcement) contract the agent proposes to.
    function writeAgentProfile(
        PermissionedResolver resolver,
        bytes32 node,
        address agentSigner,
        address guard
    ) internal {
        resolver.setAddr(node, agentSigner);
        resolver.setText(node, KEY_GUARD, _toHexAddress(guard));
        resolver.setText(node, KEY_NODE, _toHexBytes32(node));
        resolver.setText(node, KEY_STATUS, "active");
        resolver.setText(
            node, KEY_DESCRIPTION, "WARDEN agent: on-chain-enforced, human-authorized spend scope."
        );
    }

    /// @dev Lowercase hex string of a 20-byte address, `0x`-prefixed.
    function _toHexAddress(address a) private pure returns (string memory) {
        return _toHex(abi.encodePacked(a));
    }

    /// @dev Lowercase hex string of a bytes32, `0x`-prefixed.
    function _toHexBytes32(bytes32 b) private pure returns (string memory) {
        return _toHex(abi.encodePacked(b));
    }

    /// @dev Lowercase `0x`-prefixed hex of arbitrary bytes.
    function _toHex(bytes memory data) private pure returns (string memory) {
        bytes16 alphabet = "0123456789abcdef";
        bytes memory out = new bytes(2 + data.length * 2);
        out[0] = "0";
        out[1] = "x";
        for (uint256 i = 0; i < data.length; i++) {
            out[2 + i * 2] = alphabet[uint8(data[i]) >> 4];
            out[3 + i * 2] = alphabet[uint8(data[i]) & 0x0f];
        }
        return string(out);
    }
}
