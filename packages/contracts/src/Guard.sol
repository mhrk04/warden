// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IGuard} from "./IGuard.sol";
import {Ownable} from "./Ownable.sol";
import {ReentrancyGuard} from "./ReentrancyGuard.sol";

/// @title Guard — WARDEN on-chain enforcement core.
/// @notice Funds sit behind this contract. The agent signer can only *propose*; the Guard
///         enforces per-tx cap, cumulative cap, recipient allowlist, expiry, and revocation,
///         then transfers or reverts. Enforcement is entirely on-chain (Failure Mode 1).
///
/// @dev Design choice (per spec): rejections use a typed custom error `GuardRejected(uint8 reason)`
///      rather than an event, because emitting an event and then reverting rolls the event back —
///      a rejected proposal must move no funds and change no state, so it reverts. Successful
///      state changes emit events (`Executed`, `AgentConfigured`, `Revoked`, `PolicyChanged`).
///      reason enum: 0=OK,1=limit_pertx,2=limit_cumulative,3=recipient,4=expired,5=revoked,6=not_agent_signer.
contract Guard is IGuard, Ownable, ReentrancyGuard {
    // ensNode => Policy
    mapping(bytes32 => Policy) private policies;

    // ensNode => recipient address => allowed. Keyed on the raw 20-byte address value,
    // so re-casing at the app layer (checksum) cannot bypass the allowlist (Failure Mode 6).
    mapping(bytes32 => mapping(address => bool)) private allowlist;

    /// @inheritdoc IGuard
    function configureAgent(
        bytes32 ensNode,
        address agentSigner,
        address token,
        uint256 perTxCap,
        uint256 cumulativeCap,
        uint64 expiry
    ) external onlyOwner {
        Policy storage p = policies[ensNode];
        p.token = token;
        p.perTxCap = perTxCap;
        p.cumulativeCap = cumulativeCap;
        p.spent = 0;
        p.expiry = expiry;
        p.revoked = false;
        p.ensNode = ensNode;
        p.agentSigner = agentSigner;

        emit AgentConfigured(ensNode, agentSigner, token, perTxCap, cumulativeCap, expiry);
    }

    /// @inheritdoc IGuard
    function setAllowlist(bytes32 ensNode, address recipient, bool allowed) external onlyOwner {
        allowlist[ensNode][recipient] = allowed;
    }

    /// @inheritdoc IGuard
    function isAllowed(bytes32 ensNode, address recipient) external view returns (bool) {
        return allowlist[ensNode][recipient];
    }

    /// @inheritdoc IGuard
    function revoke(bytes32 ensNode) external onlyOwner {
        policies[ensNode].revoked = true;
        emit Revoked(ensNode);
    }

    /// @notice Read a policy (for tests / off-chain views).
    function getPolicy(bytes32 ensNode) external view returns (Policy memory) {
        return policies[ensNode];
    }

    /// @inheritdoc IGuard
    /// @dev Enforcement order (each failing check reverts with its reason code):
    ///      1 caller != agentSigner -> 6 not_agent_signer
    ///      2 revoked               -> 5 revoked
    ///      3 now >= expiry         -> 4 expired
    ///      4 !allowlisted          -> 3 recipient
    ///      5 amount > perTxCap     -> 1 limit_pertx
    ///      6 spent+amount > cumCap -> 2 limit_cumulative
    ///      else: effects (spent += amount) BEFORE interaction, safe transfer, then Executed.
    function propose(bytes32 ensNode, address to, uint256 amount) external nonReentrant {
        Policy storage p = policies[ensNode];

        if (msg.sender != p.agentSigner) revert GuardRejected(6); // not_agent_signer
        if (p.revoked) revert GuardRejected(5); // revoked
        if (block.timestamp >= p.expiry) revert GuardRejected(4); // expired
        if (!allowlist[ensNode][to]) revert GuardRejected(3); // recipient
        if (amount > p.perTxCap) revert GuardRejected(1); // limit_pertx
        if (p.spent + amount > p.cumulativeCap) revert GuardRejected(2); // limit_cumulative

        // Checks-Effects-Interactions: update spent BEFORE the external transfer.
        uint256 newSpent = p.spent + amount;
        p.spent = newSpent;

        _safeTransfer(p.token, to, amount);

        emit Executed(ensNode, to, amount, newSpent);
    }

    /// @dev SafeERC20-style transfer: reverts if the token reverts OR returns false.
    ///      Handles non-standard tokens that return no data (treated as success).
    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSignature("transfer(address,uint256)", to, amount));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }
}
