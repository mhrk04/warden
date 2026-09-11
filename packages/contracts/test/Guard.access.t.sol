// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GuardBase} from "./GuardBase.t.sol";
import {Ownable} from "../src/Ownable.sol";

/// @dev TC-001-11: only the admin (owner) may configureAgent / setAllowlist / revoke (Criterion 5.1 on-chain, 1.1).
contract GuardAccessTest is GuardBase {
    function test_nonAdmin_cannotConfigureAgent() public {
        vm.prank(outsider);
        vm.expectRevert(Ownable.NotOwner.selector);
        guard.configureAgent(ensNode, agentSigner, address(token), PER_TX, CUMULATIVE, expiry);
    }

    function test_nonAdmin_cannotSetAllowlist() public {
        vm.prank(outsider);
        vm.expectRevert(Ownable.NotOwner.selector);
        guard.setAllowlist(ensNode, recipient, true);
    }

    function test_nonAdmin_cannotRevoke() public {
        _configureStandard();
        vm.prank(outsider);
        vm.expectRevert(Ownable.NotOwner.selector);
        guard.revoke(ensNode);
    }

    function test_admin_isDeployer() public view {
        assertEq(guard.owner(), admin, "owner is the deployer/admin");
    }
}
