// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guard} from "../src/Guard.sol";
import {IGuard} from "../src/IGuard.sol";
import {ReentrantToken} from "./mocks/ReentrantToken.sol";
import {FalseReturnToken} from "./mocks/FalseReturnToken.sol";

/// @dev TC-001-9 reentrancy cannot double-spend; TC-001-10 false-returning transfer reverts.
contract GuardSafetyTest is Test {
    Guard internal guard;
    address internal admin = address(0xA11CE);
    address internal recipient = address(0xCAFE);
    bytes32 internal ensNode = keccak256("agent.warden.eth");

    function setUp() public {
        vm.prank(admin);
        guard = new Guard();
    }

    /// TC-001-9: a token that re-enters propose on transfer cannot cause a second execution.
    /// The reentrant call reverts (nonReentrant), which bubbles up and reverts the whole tx,
    /// so at most one transfer happens and spent stays consistent with a single execution.
    function test_reentrancy_cannotDoubleSpend() public {
        ReentrantToken evil = new ReentrantToken();

        // The token contract is BOTH the ERC-20 and the agentSigner, so its re-entrant
        // propose() passes the signer check and actually hits the reentrancy lock.
        vm.prank(admin);
        guard.configureAgent(ensNode, address(evil), address(evil), 100, 250, uint64(block.timestamp + 1 days));
        vm.prank(admin);
        guard.setAllowlist(ensNode, recipient, true);

        evil.arm(guard, ensNode, recipient, 10);

        // The outer propose triggers transfer -> re-entrant propose -> Reentrancy() revert,
        // which propagates and reverts the entire outer call.
        vm.prank(address(evil));
        vm.expectRevert(); // reentrancy lock (bubbled up)
        guard.propose(ensNode, recipient, 10);

        // Nothing committed: spent stays 0, transfer rolled back.
        assertEq(guard.getPolicy(ensNode).spent, 0, "no spend committed under reentrancy");
    }

    /// TC-001-10: transfer returns false -> Guard reverts, spent NOT incremented, no phantom Executed.
    function test_falseReturningTransfer_revertsAndNoSpend() public {
        FalseReturnToken bad = new FalseReturnToken();
        address signer = address(0xBEEF);

        vm.prank(admin);
        guard.configureAgent(ensNode, signer, address(bad), 100, 250, uint64(block.timestamp + 1 days));
        vm.prank(admin);
        guard.setAllowlist(ensNode, recipient, true);

        vm.prank(signer);
        vm.expectRevert(bytes("transfer failed"));
        guard.propose(ensNode, recipient, 10);

        assertEq(guard.getPolicy(ensNode).spent, 0, "spent not incremented on failed transfer");
    }
}
