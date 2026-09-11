// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";
import {IRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IRegistry.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";

import {WardenRegistry} from "./WardenRegistry.sol";

/// @title AgentSubnameRegistrar — registrar in front of a WARDEN ENSv2 registry.
/// @notice Based on the ENSv2 tutorial's `SimpleSubnameRegistrar`: it validates label availability
///         (via `getState`) and registers a subname into a real ENSv2 `PermissionedRegistry`,
///         granting the agent owner a *scoped* role set (ROLE_SET_RESOLVER | ROLE_SET_SUBREGISTRY)
///         — NOT registry ownership (Requirement 6.1: scoped role, not ownership).
///
///         For the hackathon demo the registrar is free (price 0) with a small MIN_DURATION.
///         The registry owner must grant this registrar ROLE_REGISTRAR | ROLE_RENEW on ROOT_RESOURCE
///         before it can register (done in the deploy script / test setup).
///
/// @dev Deviation from the tutorial snippet: the installed `ensdomains/contracts-v2` package uses
///      `register(label, owner, IRegistry subregistry, resolver, roleBitmap, expiry)` returning a
///      tokenId, and `getState(anyId).status` with `Status.AVAILABLE`. We call those exact
///      interfaces. `anyId` for availability is the labelhash (`uint256(keccak256(bytes(label)))`),
///      which the registry accepts as an `anyId`.
contract AgentSubnameRegistrar {
    /// @notice The ENSv2 registry this registrar registers subnames into.
    WardenRegistry public immutable registry;

    /// @notice Minimum registration duration (seconds). Keeps expiry strictly in the future.
    uint64 public constant MIN_DURATION = 30 days;

    /// @notice The scoped role bitmap granted to a newly registered agent owner:
    ///         it may set its own resolver and subregistry, but does NOT get registry root roles.
    uint256 public constant REGISTRATION_ROLE_BITMAP =
        RegistryRolesLib.ROLE_SET_RESOLVER | RegistryRolesLib.ROLE_SET_SUBREGISTRY;

    /// @notice Emitted when an agent subname is registered.
    event AgentSubnameRegistered(
        string label, bytes32 indexed node, uint256 indexed tokenId, address indexed owner, uint64 expiry
    );

    error LabelUnavailable(string label);
    error DurationTooShort(uint64 duration);

    constructor(WardenRegistry registry_) {
        registry = registry_;
    }

    /// @notice Compute the ENS node for `label` under the registry's parent (delegates to registry).
    function nodeFor(string memory label) public view returns (bytes32) {
        return registry.nodeFor(label);
    }

    /// @notice True if `label` is currently available to register.
    function available(string memory label) public view returns (bool) {
        uint256 labelId = uint256(keccak256(bytes(label)));
        return registry.getState(labelId).status == IPermissionedRegistry.Status.AVAILABLE;
    }

    /// @notice Register an agent subname.
    /// @param label The subname label (e.g. "payer").
    /// @param owner The agent owner (granted the scoped role set, not ownership).
    /// @param resolver The resolver for the subname (may be address(0) for the demo).
    /// @param duration Registration duration in seconds (>= MIN_DURATION).
    /// @return tokenId The ERC1155 token id of the registered subname.
    /// @return node The ENS node (namehash) of the subname — the key the Guard policy binds to.
    function register(string calldata label, address owner, address resolver, uint64 duration)
        external
        returns (uint256 tokenId, bytes32 node)
    {
        if (duration < MIN_DURATION) revert DurationTooShort(duration);
        if (!available(label)) revert LabelUnavailable(label);

        uint64 expiry = uint64(block.timestamp) + duration;

        tokenId = registry.register(
            label,
            owner,
            IRegistry(address(0)), // no child subregistry for a leaf agent name
            resolver,
            REGISTRATION_ROLE_BITMAP,
            expiry
        );

        node = registry.nodeFor(label);
        emit AgentSubnameRegistered(label, node, tokenId, owner, expiry);
    }
}
