// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Deploy} from "../script/Deploy.s.sol";
import {Guard} from "../src/Guard.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// @dev Exposes the internal deploy logic so the test can drive it without keys or a network.
contract DeployHarness is Deploy {
    function deploy(address deployer) external returns (Deployment memory) {
        return _deploy(deployer);
    }
}

/// @dev Deterministic, key-free dry-run of the deploy script's core logic.
contract DeployTest is Test {
    DeployHarness internal harness;

    address internal deployer = address(0xD319);

    function setUp() public {
        harness = new DeployHarness();
    }

    function test_DeployProducesGuardAndUsdc() public {
        // The harness is msg.sender at construction time, so it becomes the Guard owner.
        Deploy.Deployment memory d = harness.deploy(deployer);

        assertTrue(address(d.guard) != address(0), "guard not deployed");
        assertTrue(address(d.usdc) != address(0), "usdc not deployed");
        assertEq(d.deployer, deployer, "deployer recorded");
    }

    function test_GuardOwnerIsDeployerContext() public {
        Deploy.Deployment memory d = harness.deploy(deployer);
        // Guard's Ownable sets owner = msg.sender; msg.sender at `new Guard()` is the harness.
        assertEq(Guard(d.guard).owner(), address(harness), "guard owner is deploying context");
    }

    function test_UsdcMetadataAndDemoFunding() public {
        Deploy.Deployment memory d = harness.deploy(deployer);
        TestUSDC usdc = TestUSDC(address(d.usdc));

        assertEq(usdc.name(), "Test USD Coin");
        assertEq(usdc.symbol(), "tUSDC");
        assertEq(usdc.decimals(), 6);

        // Demo funding minted to the Guard.
        assertEq(usdc.balanceOf(address(d.guard)), 1_000 * 1e6, "guard funded");
        assertEq(usdc.totalSupply(), 1_000 * 1e6, "supply matches funding");
    }
}
