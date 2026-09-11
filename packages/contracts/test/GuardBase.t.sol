// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Guard} from "../src/Guard.sol";
import {IGuard} from "../src/IGuard.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Shared setup for Guard unit tests.
abstract contract GuardBase is Test {
    Guard internal guard;
    MockERC20 internal token;

    address internal admin = address(0xA11CE);
    address internal agentSigner = address(0xBEEF);
    address internal recipient = address(0xCAFE);
    address internal outsider = address(0xD00D);

    bytes32 internal ensNode = keccak256("agent.warden.eth");

    uint256 internal constant PER_TX = 100;
    uint256 internal constant CUMULATIVE = 250;
    uint64 internal expiry;

    function setUp() public virtual {
        vm.prank(admin);
        guard = new Guard();
        token = new MockERC20();
        expiry = uint64(block.timestamp + 1 days);

        // Fund the guard so it can pay out.
        token.mint(address(guard), 1_000_000);
    }

    /// @dev configure a standard valid policy + allowlist the recipient.
    function _configureStandard() internal {
        vm.prank(admin);
        guard.configureAgent(ensNode, agentSigner, address(token), PER_TX, CUMULATIVE, expiry);
        vm.prank(admin);
        guard.setAllowlist(ensNode, recipient, true);
    }
}
