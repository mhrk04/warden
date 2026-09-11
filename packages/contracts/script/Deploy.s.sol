// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {Guard} from "../src/Guard.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// @title Deploy — deploys TestUSDC + Guard and records addresses.
/// @notice Core deploy logic lives in {_deploy} so it can be exercised deterministically by
///         a Foundry test (no keys, no network) as well as by a live `forge script` run.
///
/// Usage (local dry-run against anvil):
///   anvil &
///   DEPLOYER_PRIVATE_KEY=<anvil account #0 key> forge script script/Deploy.s.sol:Deploy \
///     --rpc-url http://127.0.0.1:8545 --broadcast
///   (anvil prints its well-known funded test keys on startup; use account #0 for a dry-run.)
///
/// Usage (live Sepolia): set DEPLOYER_PRIVATE_KEY (+ SEPOLIA_RPC_URL) in env, then run with
///   forge script ... --rpc-url $SEPOLIA_RPC_URL --broadcast
contract Deploy is Script {
    /// @dev Demo funding minted to the Guard so it can pay out immediately (1,000 tUSDC @ 6 dec).
    uint256 internal constant GUARD_FUNDING = 1_000 * 1e6;

    struct Deployment {
        Guard guard;
        TestUSDC usdc;
        address deployer;
    }

    /// @notice Entry point for `forge script`. Reads the deployer key from env, broadcasts the
    ///         deployment, then writes deployments/sepolia.json.
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        Deployment memory d = _deploy(deployer);
        vm.stopBroadcast();

        _report(d, "sepolia");
    }

    /// @notice Pure deploy logic — no broadcasting, no env — callable from tests.
    /// @param deployer the address that will own the Guard (msg.sender at construction time).
    function _deploy(address deployer) internal returns (Deployment memory d) {
        // TestUSDC has an open faucet mint, so deploying it under the deployer is sufficient.
        TestUSDC usdc = new TestUSDC();

        // Guard's constructor (via Ownable) sets owner = msg.sender. Under broadcast/prank that
        // is the deployer.
        Guard guard = new Guard();

        // Demo funding: mint tUSDC directly to the Guard so a configured agent can pay out.
        usdc.mint(address(guard), GUARD_FUNDING);

        d = Deployment({guard: guard, usdc: usdc, deployer: deployer});
    }

    /// @dev Log the addresses and persist them to deployments/<network>.json.
    function _report(Deployment memory d, string memory network) internal {
        console2.log("network :", network);
        console2.log("deployer:", d.deployer);
        console2.log("guard   :", address(d.guard));
        console2.log("usdc    :", address(d.usdc));
        console2.log("block   :", block.number);

        string memory obj = "deployment";
        vm.serializeString(obj, "network", network);
        vm.serializeAddress(obj, "guard", address(d.guard));
        vm.serializeAddress(obj, "usdc", address(d.usdc));
        vm.serializeAddress(obj, "deployer", d.deployer);
        string memory json = vm.serializeUint(obj, "blockNumber", block.number);

        string memory path = string.concat("deployments/", network, ".json");
        vm.writeJson(json, path);
        console2.log("wrote   :", path);
    }
}
