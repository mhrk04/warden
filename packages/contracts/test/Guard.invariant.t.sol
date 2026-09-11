// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guard} from "../src/Guard.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {GuardHandler} from "./handlers/GuardHandler.sol";

/// @dev TC-001-P1..P4 — Correctness Properties 1-4, fuzzed via GuardHandler.
///      P1 no out-of-scope movement; P2 spent monotonic & bounded; P3 revocation finality;
///      P4 signer authority. The handler fuzzes configure + propose sequences and records
///      ghost flags that must remain false; the invariants assert them each run.
contract GuardInvariantTest is Test {
    Guard internal guard;
    MockERC20 internal token;
    GuardHandler internal handler;

    address internal admin = address(0xA11CE);

    function setUp() public {
        vm.prank(admin);
        guard = new Guard();
        token = new MockERC20();
        handler = new GuardHandler(guard, token);

        // Fund the guard generously so transfers never fail for lack of balance.
        token.mint(address(guard), type(uint128).max);

        targetContract(address(handler));

        // Only fuzz the handler's action functions.
        bytes4[] memory selectors = new bytes4[](5);
        selectors[0] = handler.configure.selector;
        selectors[1] = handler.revoke.selector;
        selectors[2] = handler.warp.selector;
        selectors[3] = handler.propose.selector;
        selectors[4] = handler.proposeAsStranger.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    /// P1: every executed transfer respected perTxCap, allowlist, expiry, and never post-revoke.
    function invariant_P1_noOutOfScopeMovement() public view {
        assertFalse(handler.ghost_executedOverPerTx(), "P1: executed above perTxCap");
        assertFalse(handler.ghost_executedToNonAllowlisted(), "P1: executed to non-allowlisted");
        assertFalse(handler.ghost_executedAfterExpiry(), "P1: executed after expiry");
        assertFalse(handler.ghost_executedAfterRevoke(), "P1: executed after revoke");
        // sum(transfers) <= cumulativeCap is guaranteed per-policy; since configure resets spent,
        // the live spent must never exceed the current cumulativeCap (checked in P2).
    }

    /// P2: spent never exceeds the current cumulativeCap, and per executed proposal only grows.
    function invariant_P2_spentBounded() public view {
        if (handler.configured()) {
            uint256 spent = guard.getPolicy(handler.ENS_NODE()).spent;
            assertLe(spent, handler.curCumulativeCap(), "P2: spent exceeded cumulativeCap");
        }
    }

    /// P3: no Executed after revoke for the node.
    function invariant_P3_revocationFinality() public view {
        assertFalse(handler.ghost_executedAfterRevoke(), "P3: executed after revoke");
    }

    /// P4: no execution was ever caused by a non-signer.
    function invariant_P4_signerAuthority() public view {
        assertFalse(handler.ghost_executedByNonSigner(), "P4: non-signer caused execution");
    }
}
