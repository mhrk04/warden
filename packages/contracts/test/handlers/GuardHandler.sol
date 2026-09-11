// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guard} from "../../src/Guard.sol";
import {IGuard} from "../../src/IGuard.sol";
import {MockERC20} from "../mocks/MockERC20.sol";

/// @title GuardHandler — bounded actor for Foundry invariant fuzzing.
/// @notice Fuzzes configureAgent + random propose sequences against a single ensNode and
///         records ghost state so the invariant contract can assert Correctness Properties 1-4.
///         The handler always proposes AS the configured agentSigner (itself), so signer-auth
///         rejections don't dominate; a separate stray-caller path exercises non-signer rejects.
contract GuardHandler is Test {
    Guard public guard;
    MockERC20 public token;

    bytes32 public constant ENS_NODE = keccak256("agent.warden.eth");

    // Fixed candidate recipients; a subset is allowlisted at configure time.
    address[] public recipients;
    mapping(address => bool) public isCandidate;

    // ---- ghost state for invariants ----
    uint256 public ghost_totalTransferred; // sum of executed amounts
    uint256 public ghost_maxSingleTransfer; // largest single executed amount
    uint256 public ghost_executedCount;
    bool public ghost_everRevoked;
    bool public ghost_executedAfterRevoke; // must stay false (P3)
    bool public ghost_executedByNonSigner; // must stay false (P4)
    bool public ghost_executedToNonAllowlisted; // must stay false (P1)
    bool public ghost_executedAfterExpiry; // must stay false (P1)
    bool public ghost_executedOverPerTx; // must stay false (P1)
    uint256 public ghost_lastSpent; // for monotonicity (P2)

    // current policy mirror
    uint256 public curPerTxCap;
    uint256 public curCumulativeCap;
    uint64 public curExpiry;
    bool public configured;

    constructor(Guard _guard, MockERC20 _token) {
        guard = _guard;
        token = _token;
        // three deterministic recipients
        recipients.push(address(0x1001));
        recipients.push(address(0x1002));
        recipients.push(address(0x1003));
        for (uint256 i = 0; i < recipients.length; i++) {
            isCandidate[recipients[i]] = true;
        }
    }

    function recipientCount() external view returns (uint256) {
        return recipients.length;
    }

    /// Admin action: (re)configure the policy with bounded caps + expiry, allowlist a subset.
    function configure(uint256 perTx, uint256 cumulative, uint256 expiryDelta, uint256 allowMask) external {
        perTx = bound(perTx, 1, 1_000);
        cumulative = bound(cumulative, perTx, 100_000);
        // expiry always in the future here so execute paths are reachable; expiry rejection
        // is exercised by the warp() action below.
        expiryDelta = bound(expiryDelta, 1, 3650 days);
        uint64 expiry = uint64(block.timestamp + expiryDelta);

        // configureAgent resets spent to 0 and revoked to false.
        vm.prank(guard.owner());
        guard.configureAgent(ENS_NODE, address(this), address(token), perTx, cumulative, expiry);

        // allowlist a subset based on the mask bits (recipients[i] allowed if bit i set).
        for (uint256 i = 0; i < recipients.length; i++) {
            bool allowed = (allowMask >> i) & 1 == 1;
            vm.prank(guard.owner());
            guard.setAllowlist(ENS_NODE, recipients[i], allowed);
        }

        curPerTxCap = perTx;
        curCumulativeCap = cumulative;
        curExpiry = expiry;
        configured = true;
        ghost_everRevoked = false; // fresh policy
        ghost_lastSpent = 0;
    }

    /// Admin action: revoke.
    function revoke() external {
        if (!configured) return;
        vm.prank(guard.owner());
        guard.revoke(ENS_NODE);
        ghost_everRevoked = true;
    }

    /// Time action: advance the clock (can push past expiry).
    function warp(uint256 delta) external {
        delta = bound(delta, 0, 10 days);
        vm.warp(block.timestamp + delta);
    }

    /// Agent action: propose AS the configured signer (this handler). Random recipient + amount.
    function propose(uint256 rIdx, uint256 amount) external {
        if (!configured) return;
        address to = recipients[rIdx % recipients.length];
        amount = bound(amount, 0, 2_000); // may exceed perTxCap to exercise rejects

        uint256 spentBefore = guard.getPolicy(ENS_NODE).spent;

        // The handler IS the agentSigner.
        try guard.propose(ENS_NODE, to, amount) {
            // Executed. Record ghosts and validate the conditions that must have held.
            uint256 spentAfter = guard.getPolicy(ENS_NODE).spent;
            uint256 delta = spentAfter - spentBefore;

            ghost_totalTransferred += delta;
            if (delta > ghost_maxSingleTransfer) ghost_maxSingleTransfer = delta;
            ghost_executedCount++;

            if (guard.getPolicy(ENS_NODE).revoked) ghost_executedAfterRevoke = true;
            if (ghost_everRevoked) ghost_executedAfterRevoke = true;
            if (!guard.isAllowed(ENS_NODE, to)) ghost_executedToNonAllowlisted = true;
            if (block.timestamp >= curExpiry) ghost_executedAfterExpiry = true;
            if (delta > curPerTxCap) ghost_executedOverPerTx = true;

            ghost_lastSpent = spentAfter;
        } catch {
            // Rejected: nothing should have moved. spent must be unchanged.
            assertEq(guard.getPolicy(ENS_NODE).spent, spentBefore, "spent changed on reject");
        }
    }

    /// Stray-caller action: a non-signer attempts propose; must always revert (P4).
    function proposeAsStranger(uint256 rIdx, uint256 amount) external {
        if (!configured) return;
        address to = recipients[rIdx % recipients.length];
        amount = bound(amount, 0, 2_000);
        address stranger = address(0xDEAD);

        uint256 spentBefore = guard.getPolicy(ENS_NODE).spent;
        vm.prank(stranger);
        try guard.propose(ENS_NODE, to, amount) {
            ghost_executedByNonSigner = true; // must never happen
        } catch {
            assertEq(guard.getPolicy(ENS_NODE).spent, spentBefore, "stranger moved spent");
        }
    }
}
