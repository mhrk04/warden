// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GuardBase} from "./GuardBase.t.sol";
import {IGuard} from "../src/IGuard.sol";

/// @dev TC-001-1: configure policy stores all fields + AgentConfigured (Criterion 1.1, 1.2).
contract GuardConfigTest is GuardBase {
    function test_configureAgent_storesAllFields() public {
        vm.prank(admin);
        guard.configureAgent(ensNode, agentSigner, address(token), PER_TX, CUMULATIVE, expiry);

        IGuard.Policy memory p = guard.getPolicy(ensNode);
        assertEq(p.token, address(token), "token");
        assertEq(p.perTxCap, PER_TX, "perTxCap");
        assertEq(p.cumulativeCap, CUMULATIVE, "cumulativeCap");
        assertEq(p.spent, 0, "spent");
        assertEq(p.expiry, expiry, "expiry");
        assertEq(p.revoked, false, "revoked");
        assertEq(p.ensNode, ensNode, "ensNode");
        assertEq(p.agentSigner, agentSigner, "agentSigner");
    }

    function test_configureAgent_emitsAgentConfigured() public {
        vm.expectEmit(true, true, false, true);
        emit IGuard.AgentConfigured(ensNode, agentSigner, address(token), PER_TX, CUMULATIVE, expiry);
        vm.prank(admin);
        guard.configureAgent(ensNode, agentSigner, address(token), PER_TX, CUMULATIVE, expiry);
    }
}
