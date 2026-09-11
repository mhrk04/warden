// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IPermissionedRegistry} from "@ensdomains/contracts-v2/registry/interfaces/IPermissionedRegistry.sol";

import {DeployENS} from "../script/DeployENS.s.sol";
import {WardenRegistry} from "../src/WardenRegistry.sol";
import {AgentSubnameRegistrar} from "../src/AgentSubnameRegistrar.sol";
import {Guard} from "../src/Guard.sol";
import {IGuard} from "../src/IGuard.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// @title ENSBinding — Task 19: prove agent identity (real ENSv2 subname) is BOUND to Guard
///        enforcement, with NO hard-coded node.
/// @notice Deploys the real ENSv2 registry + registrar (via DeployENS._deployENS) + Guard + tUSDC,
///         registers an agent subname, keys the Guard policy to THAT subname's ENS node, and shows
///         enforcement holds against that node (one valid execute + one over-cap reject).
contract ENSBindingTest is Test, DeployENS {
    ENSDeployment internal ens;
    Guard internal guard;
    TestUSDC internal usdc;

    address internal agentSigner = makeAddr("agentSigner");
    address internal agentOwner = makeAddr("agentOwner");
    address internal recipient = makeAddr("recipient");

    string internal constant LABEL = "payer";

    function setUp() public {
        // Deploy the real ENSv2 registry + registrar; this test contract is the admin/root.
        ens = _deployENS(address(this));
        guard = new Guard();
        usdc = new TestUSDC();
        usdc.mint(address(guard), 1_000 * 1e6);
    }

    /// @dev The Guard node must equal the ENS node the registrar/registry computes for the label,
    ///      which must equal the EIP-137 namehash of "payer.warden.eth" — not a hard-coded value.
    function test_guardNodeMatchesRegisteredSubnameNode() public {
        // Label is available before registration on the real registry.
        assertTrue(ens.registrar.available(LABEL), "label should be available pre-registration");

        (uint256 tokenId, bytes32 node) =
            ens.registrar.register(LABEL, agentOwner, address(0), 60 days);

        // The registrar registered a REAL subname: it now has a nonzero tokenId and is REGISTERED.
        assertGt(tokenId, 0, "tokenId should be nonzero");
        assertEq(
            uint8(ens.registry.getState(uint256(keccak256(bytes(LABEL)))).status),
            uint8(IPermissionedRegistry.Status.REGISTERED),
            "subname should be REGISTERED on the ENSv2 registry"
        );

        // The node is derived (namehash), matching the documented cast vector for payer.warden.eth.
        assertEq(node, ens.registry.nodeFor(LABEL), "registrar node must match registry.nodeFor");
        assertEq(
            node,
            0xc54c92af84a1c146494912c71879955912e760924a1ecff0fd335cc74a09b869,
            "node must be namehash(payer.warden.eth), not hard-coded"
        );

        // Bind the Guard policy to THAT node.
        guard.configureAgent(node, agentSigner, address(usdc), 100 * 1e6, 500 * 1e6, uint64(block.timestamp + 30 days));
        guard.setAllowlist(node, recipient, true);

        // Requirement 6.1: the stored policy is keyed to the real ENS node.
        IGuard.Policy memory p = guard.getPolicy(node);
        assertEq(p.ensNode, node, "Guard policy must be keyed to the registered ENS node");
        assertEq(p.agentSigner, agentSigner, "agent signer bound");
    }

    /// @dev Enforcement against the bound node: one valid execute succeeds, one over-cap reverts.
    function test_enforcementAgainstBoundNode() public {
        (, bytes32 node) = ens.registrar.register(LABEL, agentOwner, address(0), 60 days);

        guard.configureAgent(node, agentSigner, address(usdc), 100 * 1e6, 500 * 1e6, uint64(block.timestamp + 30 days));
        guard.setAllowlist(node, recipient, true);

        // Valid payout (80 <= 100 per-tx cap) executes and moves funds.
        vm.prank(agentSigner);
        guard.propose(node, recipient, 80 * 1e6);
        assertEq(usdc.balanceOf(recipient), 80 * 1e6, "valid payout should transfer");
        assertEq(guard.getPolicy(node).spent, 80 * 1e6, "spent accrued against bound node");

        // Over per-tx-cap payout (150 > 100) reverts with reason 1 (limit_pertx); no funds move.
        vm.prank(agentSigner);
        vm.expectRevert(abi.encodeWithSelector(IGuard.GuardRejected.selector, uint8(1)));
        guard.propose(node, recipient, 150 * 1e6);
        assertEq(usdc.balanceOf(recipient), 80 * 1e6, "over-cap payout must move no funds");
    }
}
