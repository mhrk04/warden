// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {DemoSeed} from "../script/DemoSeed.s.sol";
import {DeployENS} from "../script/DeployENS.s.sol";
import {WardenRegistry} from "../src/WardenRegistry.sol";
import {AgentSubnameRegistrar} from "../src/AgentSubnameRegistrar.sol";
import {Guard} from "../src/Guard.sol";
import {IGuard} from "../src/IGuard.sol";
import {TestUSDC} from "../src/TestUSDC.sol";

/// @title DemoSeed — Task 33: key-free dry-run of the demo-seed script's core logic.
/// @notice Deploys a fresh ENSv2 registry + registrar (via DeployENS._deployENS) + Guard + tUSDC
///         locally, calls DemoSeed._seed deterministically, then asserts the demo-able state:
///         a healthy demo agent (perTx 100 / cumulative 250, future expiry, allowlisted recipient)
///         and a short-expiry "expiring" agent whose expiry is ~ now+short. Also proves the
///         enforcement demo works: a valid propose executes, an over-cap propose reverts reason 1.
/// @dev `is Test, DemoSeed` mirrors ENSBinding.t.sol so the internal `_seed` is callable key-free.
contract DemoSeedTest is Test, DemoSeed {
    DeployENSHarness internal ensHarness;

    Guard internal guard;
    TestUSDC internal usdc;
    WardenRegistry internal registry;
    AgentSubnameRegistrar internal registrar;

    // The recipient is the demo payout target — must be known & allowlisted by the seed.
    address internal recipient = makeAddr("demoRecipient");

    uint256 internal constant PER_TX = 100 * 1e6;
    uint256 internal constant CUMULATIVE = 250 * 1e6;
    uint256 internal constant FUNDING = 1_000 * 1e6;
    uint64 internal constant SHORT = 60;

    function setUp() public {
        // Deploy the real ENSv2 registry + registrar via a harness. The harness deploys with
        // ITSELF as admin/root, so the `grantRootRoles(registrar)` inside _deployENS is issued by
        // the account that actually holds the admin roles (avoids EACCannotGrantRoles). Once the
        // registrar has ROLE_REGISTRAR|ROLE_RENEW, `registrar.register` works for any caller
        // (the registrar, not msg.sender, must hold the role). The Guard + tUSDC are owned by
        // THIS test contract, which is also the demo agent signer.
        ensHarness = new DeployENSHarness();
        DeployENS.ENSDeployment memory ens = ensHarness.deployENSAsSelf();
        registry = ens.registry;
        registrar = ens.registrar;

        guard = new Guard();
        usdc = new TestUSDC();
    }

    function _seedFixture() internal returns (DemoSeed.SeedResult memory) {
        return _seed(
            SeedParams({
                guard: guard,
                usdc: usdc,
                registrar: registrar,
                recipient: recipient,
                agentSigner: address(this),
                funding: FUNDING,
                perTxCap: PER_TX,
                cumulativeCap: CUMULATIVE,
                healthyExpiry: uint64(block.timestamp + 1 days),
                shortExpiry: uint64(block.timestamp) + SHORT
            })
        );
    }

    function test_guardFundedToAtLeastFunding() public {
        _seedFixture();
        assertGe(usdc.balanceOf(address(guard)), FUNDING, "guard should hold >= funding tUSDC");
    }

    function test_demoNodePolicyConfigured() public {
        DemoSeed.SeedResult memory r = _seedFixture();

        IGuard.Policy memory p = guard.getPolicy(r.demoNode);
        assertEq(p.perTxCap, PER_TX, "demo perTxCap");
        assertEq(p.cumulativeCap, CUMULATIVE, "demo cumulativeCap");
        assertGt(p.expiry, block.timestamp, "demo expiry in the future");
        assertEq(p.agentSigner, address(this), "demo agentSigner set");
        assertEq(p.token, address(usdc), "demo token is tUSDC");
        assertTrue(guard.isAllowed(r.demoNode, recipient), "recipient allowlisted on demo node");
    }

    function test_shortExpiryNodeConfigured() public {
        DemoSeed.SeedResult memory r = _seedFixture();

        IGuard.Policy memory p = guard.getPolicy(r.expiringNode);
        assertEq(p.perTxCap, PER_TX, "expiring perTxCap");
        assertEq(p.cumulativeCap, CUMULATIVE, "expiring cumulativeCap");
        // Expiry is ~ now + SHORT (allow the seed to compute from block.timestamp).
        assertEq(p.expiry, uint64(block.timestamp) + SHORT, "expiring expiry ~ now+short");
        assertTrue(guard.isAllowed(r.expiringNode, recipient), "recipient allowlisted on expiring node");
    }

    function test_validProposeExecutesAndOverCapReverts() public {
        DemoSeed.SeedResult memory r = _seedFixture();

        // Valid payout (80 <= 100 per-tx cap) executes as the agent signer.
        vm.prank(address(this));
        guard.propose(r.demoNode, recipient, 80 * 1e6);
        assertEq(usdc.balanceOf(recipient), 80 * 1e6, "valid demo payout transfers");
        assertEq(guard.getPolicy(r.demoNode).spent, 80 * 1e6, "spent accrued");

        // Over per-tx-cap payout (150 > 100) reverts reason 1 (limit_pertx); no funds move.
        vm.prank(address(this));
        vm.expectRevert(abi.encodeWithSelector(IGuard.GuardRejected.selector, uint8(1)));
        guard.propose(r.demoNode, recipient, 150 * 1e6);
        assertEq(usdc.balanceOf(recipient), 80 * 1e6, "over-cap payout moves no funds");
    }
}

/// @dev Exposes DeployENS._deployENS key-free, deploying with the harness itself as the registry
///      admin so the internal `grantRootRoles(registrar)` is issued by the role holder.
contract DeployENSHarness is DeployENS {
    function deployENSAsSelf() external returns (ENSDeployment memory) {
        return _deployENS(address(this));
    }
}
