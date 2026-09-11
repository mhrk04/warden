// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GuardBase} from "./GuardBase.t.sol";
import {IGuard} from "../src/IGuard.sol";

/// @dev Reject-reason coverage: per-tx(1), cumulative(2), recipient(3), expired(4),
///      not_agent_signer(6). Each asserts revert with the exact reason AND no fund movement.
///      TC-001-3/4/5/6/7, EC-001-3 (expiry boundary).
contract GuardRejectTest is GuardBase {
    function setUp() public override {
        super.setUp();
        _configureStandard();
    }

    function _expectReject(uint8 reason) internal {
        vm.expectRevert(abi.encodeWithSelector(IGuard.GuardRejected.selector, reason));
    }

    /// TC-001-3: per-tx cap exceeded -> reason 1, no transfer.
    function test_perTxCapExceeded_reason1() public {
        vm.prank(agentSigner);
        _expectReject(1);
        guard.propose(ensNode, recipient, PER_TX + 1); // 101

        assertEq(token.balanceOf(recipient), 0, "no transfer");
        assertEq(guard.getPolicy(ensNode).spent, 0, "spent unchanged");
    }

    /// TC-001-4: cumulative cap exceeded -> reason 2, spent unchanged.
    function test_cumulativeCapExceeded_reason2() public {
        // spend 200 first (100 + 100), then 80 would be 280 > 250.
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 100);
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 100);

        vm.prank(agentSigner);
        _expectReject(2);
        guard.propose(ensNode, recipient, 80);

        assertEq(guard.getPolicy(ensNode).spent, 200, "spent stays 200");
        assertEq(token.balanceOf(recipient), 200, "no extra transfer");
    }

    /// TC-001-5: non-allowlisted recipient -> reason 3, no transfer.
    function test_nonAllowlistedRecipient_reason3() public {
        vm.prank(agentSigner);
        _expectReject(3);
        guard.propose(ensNode, outsider, 10);

        assertEq(token.balanceOf(outsider), 0, "no transfer to outsider");
    }

    /// TC-001-6: post-expiry -> reason 4.
    function test_postExpiry_reason4() public {
        vm.warp(uint256(expiry) + 1);
        vm.prank(agentSigner);
        _expectReject(4);
        guard.propose(ensNode, recipient, 10);
    }

    /// EC-001-3: now == expiry-1 allowed; now == expiry rejected (>= expiry is expired).
    function test_expiryBoundary() public {
        vm.warp(uint256(expiry) - 1);
        vm.prank(agentSigner);
        guard.propose(ensNode, recipient, 10); // allowed
        assertEq(guard.getPolicy(ensNode).spent, 10, "expiry-1 allowed");

        vm.warp(uint256(expiry));
        vm.prank(agentSigner);
        _expectReject(4);
        guard.propose(ensNode, recipient, 10); // now == expiry -> expired
    }

    /// TC-001-7: caller != agentSigner -> reason 6, no transfer.
    function test_nonAgentSignerCaller_reason6() public {
        vm.prank(outsider);
        _expectReject(6);
        guard.propose(ensNode, recipient, 10);

        assertEq(token.balanceOf(recipient), 0, "no transfer by non-signer");
        assertEq(guard.getPolicy(ensNode).spent, 0, "spent unchanged");
    }

    /// Even the admin cannot propose (only the agentSigner may) -> reason 6.
    function test_adminCannotPropose_reason6() public {
        vm.prank(admin);
        _expectReject(6);
        guard.propose(ensNode, recipient, 10);
    }
}
