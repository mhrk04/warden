// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IGuard} from "../../src/IGuard.sol";

/// @title ReentrantToken — ERC-20 that re-enters Guard.propose on transfer.
/// @notice Models a malicious token/recipient attempting a reentrancy double-spend.
///         On the first transfer it calls back into the Guard with the same proposal;
///         a correct Guard's nonReentrant lock must block the re-entry.
contract ReentrantToken {
    mapping(address => uint256) public balanceOf;

    IGuard public guard;
    bytes32 public ensNode;
    address public to;
    uint256 public amount;
    bool public attacked;
    uint256 public transferCount;

    function mint(address account, uint256 value) external {
        balanceOf[account] += value;
    }

    function arm(IGuard _guard, bytes32 _ensNode, address _to, uint256 _amount) external {
        guard = _guard;
        ensNode = _ensNode;
        to = _to;
        amount = _amount;
    }

    function transfer(address dst, uint256 value) external returns (bool) {
        transferCount++;
        balanceOf[dst] += value;

        if (!attacked) {
            attacked = true;
            // Attempt to re-enter the Guard mid-execution.
            guard.propose(ensNode, to, amount);
        }
        return true;
    }
}
