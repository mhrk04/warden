// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";

import {VerifiableFactory} from "@ensdomains/verifiable-factory/VerifiableFactory.sol";
import {EACBaseRolesLib} from "@ensdomains/contracts-v2/access-control/libraries/EACBaseRolesLib.sol";

import {PermissionedResolver} from "@ensdomains/contracts-v2/resolver/PermissionedResolver.sol";

/// @title DeployResolver — deploys a real ENSv2 {PermissionedResolver} for WARDEN agent subnames.
/// @notice The `PermissionedResolver` is UUPS-upgradeable and disables initializers on its
///         implementation, so it MUST be run behind a proxy. We mirror the ENSv2 repo's own test
///         pattern exactly: deploy the implementation once, then deploy a proxy via the ENS
///         `VerifiableFactory` and `initialize(admin, roleBitmap, setters)`.
///
///         This resolver is what lets each agent subname (e.g. `payer.warden.eth`) OWN its data:
///         an `addr` record (the agent's signer address) and text records
///         (`warden:guard`, `warden:node`, `warden:status`, ...). Because it is a
///         `PermissionedResolver`, record writes are governed by Enhanced Access Control: the
///         root admin can delegate the right to edit ONE specific text key to a delegate without
///         handing over the whole name (see {authorizeTextRoles}).
///
/// @dev Kept as pure logic in {_deployResolver} so Foundry tests can exercise it key-free.
abstract contract DeployResolver is Script {
    /// @notice Deploy a PermissionedResolver (impl + proxy) owned by `admin`.
    /// @param admin The account granted all resolver root roles (can write records + delegate).
    /// @return factory The VerifiableFactory used for the proxy deployment.
    /// @return implementation The resolver implementation contract.
    /// @return resolver The initialized resolver proxy (this is the address to set on subnames).
    function _deployResolver(address admin)
        internal
        returns (
            VerifiableFactory factory,
            PermissionedResolver implementation,
            PermissionedResolver resolver
        )
    {
        factory = new VerifiableFactory();
        // The impl's constructor grants ROLE_CAN_NAME to `namer` and rejects the zero account
        // (EACInvalidAccount). WARDEN does not use contract-naming, so we point it at `admin`.
        implementation = new PermissionedResolver(admin);

        bytes memory initData = abi.encodeCall(
            PermissionedResolver.initialize, (admin, EACBaseRolesLib.ALL_ROLES, new bytes[](0))
        );
        resolver = PermissionedResolver(
            factory.deployProxy(address(implementation), uint256(keccak256(initData)), initData)
        );
    }
}
