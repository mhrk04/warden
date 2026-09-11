// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title IGuard — WARDEN on-chain enforcement interface (contract-law shapes)
/// @notice The agent + subgraph depend on these exact struct/event/error shapes.
interface IGuard {
    /// @dev Per-agent policy, keyed by ENS node (namehash of the agent's ENSv2 subname).
    struct Policy {
        address token; // test-USDC
        uint256 perTxCap; // max per single payout
        uint256 cumulativeCap; // max total over the agent's life
        uint256 spent; // running total
        uint64 expiry; // unix seconds; proposals at/after this revert
        bool revoked; // instant kill switch
        bytes32 ensNode; // namehash of the agent's ENSv2 subname
        address agentSigner; // the Privy wallet address allowed to propose
    }

    /// @dev reason enum: 0=OK, 1=limit_pertx, 2=limit_cumulative, 3=recipient, 4=expired, 5=revoked, 6=not_agent_signer

    event AgentConfigured(
        bytes32 indexed ensNode,
        address indexed agentSigner,
        address token,
        uint256 perTxCap,
        uint256 cumulativeCap,
        uint64 expiry
    );
    event Executed(bytes32 indexed ensNode, address indexed to, uint256 amount, uint256 newSpent);
    event PolicyChanged(bytes32 indexed ensNode, uint256 perTxCap, uint256 cumulativeCap, uint64 expiry);
    event Revoked(bytes32 indexed ensNode);

    /// @dev Rejections revert with a typed error carrying the reason code, so no state
    ///      change or fund movement occurs (an emitted event before revert would roll back).
    error GuardRejected(uint8 reason);

    function configureAgent(
        bytes32 ensNode,
        address agentSigner,
        address token,
        uint256 perTxCap,
        uint256 cumulativeCap,
        uint64 expiry
    ) external;

    function setAllowlist(bytes32 ensNode, address recipient, bool allowed) external;

    function isAllowed(bytes32 ensNode, address recipient) external view returns (bool);

    function revoke(bytes32 ensNode) external;

    function propose(bytes32 ensNode, address to, uint256 amount) external;
}
