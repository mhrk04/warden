// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/Hello.sol";

contract HelloTest is Test {
    Hello internal hello;

    function setUp() public {
        hello = new Hello();
    }

    function test_Ping_ReturnsOne() public view {
        assertEq(hello.ping(), 1);
    }
}
