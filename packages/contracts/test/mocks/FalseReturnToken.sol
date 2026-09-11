// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title FalseReturnToken — ERC-20 whose transfer ALWAYS returns false (no revert).
/// @notice A naive Guard that ignores the return value would count a phantom transfer.
///         The Guard must treat `false` as failure and revert.
contract FalseReturnToken {
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function transfer(address, uint256) external pure returns (bool) {
        return false;
    }
}
