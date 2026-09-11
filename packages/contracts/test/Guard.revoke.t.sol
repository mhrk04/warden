// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GuardBase} from "./GuardBase.t.sol";
import {IGuard} from "../src/IGuard.sol";

/// @dev TC-001-8: revoke -> Revoked emitted, otherwise-valid propose rejected reason 5 (Criterion 4.1).
///      EC-001-5: proposal after revoke is rejected (no cached policy executes).
contract GuardRevokeTest is GuardBase {
    function setUp() public override {
        super.setUp();
        _configureStandard();
    }

    function test_revoke_emitsRevoked_andSetsFlag() public {
        vm.expectEmit(true, false, false, false);
        emit IGuard.Revoked(ensNode);
        vm.prank(admin);
        guard.revoke(ensNode);

        assertTrue(guard.getPolicy(ensNode).revoked, "revoked flag set");
    }

    /// An otherwise fully-valid proposal is rejected with reason 5 after revoke.
    function test_revoke_blocksOtherwiseValidPropose_reason5() public {
        vm.prank(admin);
        guard.revoke(ensNode);

        vm.prank(agentSigner);
        vm.expectRevert(abi.encodeWithSelector(IGuard.GuardRejected.selector, uint8(5)));
        guard.propose(ensNode, recipient, 10);

        assertEq(token.balanceOf(recipient), 0, "no transfer after revoke");
        assertEq(guard.getPolicy(ensNode).spent, 0, "spent unchanged after revoke");
    }

    /// Revocation is effective immediately even after prior valid spend (EC-001-5).
    function test_revoke_afterPriorSpend_blocksFurther() public {
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 50);
        assertEq(guard.getPolicy(ensNode).spent, 50, "prior spend ok");

        vm.prank(admin);
        guard.revoke(ensNode);

        vm.prank(agentSigner);
        vm.expectRevert(abi.encodeWithSelector(IGuard.GuardRejected.selector, uint8(5)));
        guard.propose(ensNode, recipient, 10);

        assertEq(guard.getPolicy(ensNode).spent, 50, "spent frozen at last valid");
    }
}
