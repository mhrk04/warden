// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GuardBase} from "./GuardBase.t.sol";
import {IGuard} from "../src/IGuard.sol";

/// @dev TC-001-2: valid payout executes, spent accrues, Executed emitted (Criteria 2.1, 2.2).
///      EC-001-2 exact-boundary amounts. EC-001-6 many sub-cap payouts accumulate.
contract GuardExecuteTest is GuardBase {
    function setUp() public override {
        super.setUp();
        _configureStandard();
    }

    function test_validPropose_transfersAndAccruesSpent() public {
        uint256 before = token.balanceOf(recipient);

        vm.expectEmit(true, true, false, true);
        emit IGuard.Executed(ensNode, recipient, 80, 80);

        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 80);

        assertEq(token.balanceOf(recipient), before + 80, "recipient received");
        assertEq(guard.getPolicy(ensNode).spent, 80, "spent accrued");
    }

    function test_spentAccumulatesAcrossProposals() public {
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 50);
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 60);

        assertEq(guard.getPolicy(ensNode).spent, 110, "spent accumulates");
        assertEq(token.balanceOf(recipient), 110, "recipient total");
    }

    /// EC-001-2: amount == perTxCap is allowed.
    function test_amountEqualPerTxCap_allowed() public {
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, PER_TX); // 100
        assertEq(guard.getPolicy(ensNode).spent, PER_TX, "exactly perTxCap ok");
    }

    /// EC-001-2: spent + amount == cumulativeCap is allowed.
    function test_spentPlusAmountEqualCumulativeCap_allowed() public {
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 100);
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 100);
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 50); // 250 == cumulativeCap
        assertEq(guard.getPolicy(ensNode).spent, CUMULATIVE, "exactly cumulativeCap ok");
    }

    /// EC-001-6: N sub-cap payouts; the crossing one is rejected, spent stops at the last valid.
    function test_manySubCapPayouts_crossingOneRejected() public {
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 90); // 90
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 90); // 180
        // next 90 would be 270 > 250 -> rejected reason 2
        vm.prank(agentSigner);
        vm.expectRevert(abi.encodeWithSelector(IGuard.GuardRejected.selector, uint8(2)));
        guard.propose(ensNode, recipient, 90);

        assertEq(guard.getPolicy(ensNode).spent, 180, "spent unchanged by rejected crossing payout");
    }
}
