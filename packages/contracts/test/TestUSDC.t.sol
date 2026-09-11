// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// @dev Unit tests for the testnet faucet token TestUSDC.
contract TestUSDCTest is Test {
    TestUSDC internal usdc;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        usdc = new TestUSDC();
    }

    function test_Metadata() public view {
        assertEq(usdc.name(), "Test USD Coin");
        assertEq(usdc.symbol(), "tUSDC");
        assertEq(usdc.decimals(), 6);
    }

    function test_MintIncreasesBalanceAndSupply() public {
        assertEq(usdc.balanceOf(alice), 0);
        usdc.mint(alice, 1_000_000);
        assertEq(usdc.balanceOf(alice), 1_000_000);
        assertEq(usdc.totalSupply(), 1_000_000);
    }

    function test_TransferMovesBalanceAndReturnsTrue() public {
        usdc.mint(alice, 500);

        vm.prank(alice);
        bool ok = usdc.transfer(bob, 200);

        assertTrue(ok);
        assertEq(usdc.balanceOf(alice), 300);
        assertEq(usdc.balanceOf(bob), 200);
    }

    function test_TransferRevertsOnInsufficientBalance() public {
        usdc.mint(alice, 100);
        vm.prank(alice);
        vm.expectRevert(bytes("balance"));
        usdc.transfer(bob, 101);
    }

    function test_TransferFromRespectsAllowanceAndReturnsTrue() public {
        usdc.mint(alice, 500);

        vm.prank(alice);
        usdc.approve(bob, 300);

        vm.prank(bob);
        bool ok = usdc.transferFrom(alice, bob, 250);

        assertTrue(ok);
        assertEq(usdc.balanceOf(bob), 250);
        assertEq(usdc.allowance(alice, bob), 50);
    }
}
