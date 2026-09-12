// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {COIN_TYPE_ETH} from "@ens/contracts/utils/ENSIP19.sol";
import {IEnhancedAccessControl} from
    "@ensdomains/contracts-v2/access-control/interfaces/IEnhancedAccessControl.sol";
import {PermissionedResolver} from "@ensdomains/contracts-v2/resolver/PermissionedResolver.sol";
import {PermissionedResolverLib} from
    "@ensdomains/contracts-v2/resolver/libraries/PermissionedResolverLib.sol";

import {DeployENS} from "../script/DeployENS.s.sol";
import {DeployResolver} from "../script/DeployResolver.s.sol";
import {AgentRecordsLib} from "../src/AgentRecordsLib.sol";
import {WardenRegistry} from "../src/WardenRegistry.sol";

/// @title ENSResolver — proves the ENSv2 Permissioned Resolver + Enhanced Access Control integration.
/// @notice Two things the "Best Use of ENSv2" bounty highlights, demonstrated end-to-end and
///         functionally (no hard-coded values):
///
///         1. PERMISSIONED RESOLVER: each WARDEN agent subname owns its data. We deploy a real
///            ENSv2 `PermissionedResolver` (impl + VerifiableFactory proxy, exactly like the ENSv2
///            repo's own tests), set it on the registered subname, and write the agent profile
///            (`addr` + `warden:*` / `description` text records). We then read them back and
///            confirm the resolver's node equals the SAME EIP-137 namehash the registry/Guard use.
///
///         2. ENHANCED ACCESS CONTROL (fine-grained): the resolver root admin delegates the right
///            to edit exactly ONE text key (`warden:status`) to a delegate account, via
///            `authorizeTextRoles`. We prove the delegate CAN edit that key but CANNOT edit any
///            other record (a different text key, or the `addr` record). This is the bounty's
///            "letting an account edit only certain text records on a name" example, verified.
contract ENSResolverTest is Test, DeployENS, DeployResolver {
    using AgentRecordsLib for PermissionedResolver;

    ENSDeployment internal ens;
    PermissionedResolver internal resolver;

    address internal agentOwner = makeAddr("agentOwner");
    address internal agentSigner = makeAddr("agentSigner");
    address internal guardAddr = makeAddr("guard");
    address internal delegate = makeAddr("delegate");
    address internal outsider = makeAddr("outsider");

    string internal constant LABEL = "payer";
    // DNS-encoded full name, used for EAC authorization scoping (resolver keys by namehash).
    bytes internal fullName;
    bytes32 internal node;

    function setUp() public {
        // This test contract is the ENS registry admin AND the resolver root admin.
        ens = _deployENS(address(this));
        (,, resolver) = _deployResolver(address(this));

        fullName = NameCoder.encode("payer.warden.eth");
        node = NameCoder.namehash(fullName, 0);
    }

    /// @dev The resolver, the registry, and the Guard all key off the SAME EIP-137 namehash —
    ///      derived, never hard-coded.
    function test_resolverNodeMatchesRegistryNode() public view {
        assertEq(
            node,
            ens.registry.nodeFor(LABEL),
            "DNS-encoded namehash(payer.warden.eth) must equal registry.nodeFor(payer)"
        );
    }

    /// @dev Register the subname WITH the permissioned resolver set, then write + read the profile.
    function test_subnameOwnsItsDataViaPermissionedResolver() public {
        (, bytes32 registeredNode) =
            ens.registrar.register(LABEL, agentOwner, address(resolver), 60 days);
        assertEq(registeredNode, node, "registered node matches namehash");

        // The registry now reports our permissioned resolver for this label.
        assertEq(
            ens.registry.getResolver(LABEL), address(resolver), "subname resolver is set on-chain"
        );

        // Write the canonical WARDEN agent profile (admin has all resolver roles).
        resolver.writeAgentProfile(node, agentSigner, guardAddr);

        // Read the records back off the resolver — the subname owns real, resolvable data.
        assertEq(resolver.addr(node), agentSigner, "addr record = agent signer");
        assertEq(
            resolver.text(node, AgentRecordsLib.KEY_STATUS), "active", "status text record written"
        );
        assertEq(
            bytes(resolver.text(node, AgentRecordsLib.KEY_NODE)).length,
            66,
            "warden:node text record written (0x + 64 hex)"
        );
        assertGt(
            bytes(resolver.text(node, AgentRecordsLib.KEY_GUARD)).length,
            0,
            "warden:guard text record written"
        );
    }

    /// @dev ENHANCED ACCESS CONTROL: delegate may edit ONLY `warden:status`, nothing else.
    function test_scopedEAC_delegateCanEditOnlyOneTextKey() public {
        ens.registrar.register(LABEL, agentOwner, address(resolver), 60 days);
        resolver.writeAgentProfile(node, agentSigner, guardAddr);

        // Grant the delegate ROLE_SET_TEXT scoped to the single key "warden:status".
        resolver.authorizeTextRoles(fullName, AgentRecordsLib.KEY_STATUS, delegate, true);

        // ALLOWED: delegate edits exactly that key.
        vm.prank(delegate);
        resolver.setText(node, AgentRecordsLib.KEY_STATUS, "paused");
        assertEq(resolver.text(node, AgentRecordsLib.KEY_STATUS), "paused", "delegate edited status");

        // DENIED: delegate cannot edit a DIFFERENT text key (description).
        vm.prank(delegate);
        vm.expectRevert();
        resolver.setText(node, AgentRecordsLib.KEY_DESCRIPTION, "hijacked");

        // DENIED: delegate cannot edit the addr record either.
        vm.prank(delegate);
        vm.expectRevert();
        resolver.setAddr(node, outsider);

        // The addr record is untouched.
        assertEq(resolver.addr(node), agentSigner, "addr record unchanged by scoped delegate");
    }

    /// @dev An account with NO delegated role cannot edit any record.
    function test_scopedEAC_outsiderCannotEditAnything() public {
        ens.registrar.register(LABEL, agentOwner, address(resolver), 60 days);
        resolver.writeAgentProfile(node, agentSigner, guardAddr);

        vm.prank(outsider);
        vm.expectRevert();
        resolver.setText(node, AgentRecordsLib.KEY_STATUS, "x");
    }

    /// @dev Revocation of the delegated key removes the delegate's ability to edit it.
    function test_scopedEAC_delegationIsRevocable() public {
        ens.registrar.register(LABEL, agentOwner, address(resolver), 60 days);
        resolver.authorizeTextRoles(fullName, AgentRecordsLib.KEY_STATUS, delegate, true);

        vm.prank(delegate);
        resolver.setText(node, AgentRecordsLib.KEY_STATUS, "paused");

        // Revoke, then the same edit must fail.
        resolver.authorizeTextRoles(fullName, AgentRecordsLib.KEY_STATUS, delegate, false);
        vm.prank(delegate);
        vm.expectRevert();
        resolver.setText(node, AgentRecordsLib.KEY_STATUS, "active");
    }
}
