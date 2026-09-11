// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title Ownable — minimal single-admin access control (vendored, no external deps).
/// @notice The deployer is the owner/admin. Only the owner may configure/allowlist/revoke.
abstract contract Ownable {
    address public owner;

    error NotOwner();

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
