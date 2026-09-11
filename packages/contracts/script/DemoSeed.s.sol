// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {Guard} from "../src/Guard.sol";
import {TestUSDC} from "../src/TestUSDC.sol";
import {AgentSubnameRegistrar} from "../src/AgentSubnameRegistrar.sol";

/// @title DemoSeed — Task 33: seed a demo-able agent onto the ALREADY-DEPLOYED Guard.
/// @notice Sets up the end-to-end enforcement demo (Requirement 10.3 / BF-001-2) against the
///         live guard/usdc/registrar recorded in deployments/sepolia.json:
///           1. Funds the Guard with tUSDC (mint is open on the testnet faucet token) so a
///              configured agent can actually pay out.
///           2. Registers (if available) a healthy demo agent subname "demo" and configures a
///              healthy policy: perTxCap 100, cumulativeCap 250, expiry now + 1 day, recipient
///              allowlisted, agentSigner = deployer (so the API/agent can propose in the demo).
///           3. Registers (if available) an "expiring" agent subname and configures the SAME caps
///              but with a SHORT policy expiry (e.g. now + 60s) — so the demo can show a valid run
///              and then, ~1 minute later, an "expired -> rejected" enforcement case WITHOUT
///              waiting a full day.
///
///         Core logic lives in {_seed} (explicit params, no env, no broadcast) so a Foundry test
///         can drive it deterministically — mirroring {Deploy._deploy} / {DeployENS._deployENS}.
///         `run()` reads DEPLOYER_PRIVATE_KEY from env, reads the deployed addresses from
///         deployments/sepolia.json, broadcasts the seed, then writes deployments/demo.json.
///
///         The subname registration duration (>= registrar MIN_DURATION) is intentionally
///         independent of the Guard *policy* expiry: the "expiring" agent owns a long-lived
///         subname, but its Guard policy expires in seconds — that policy expiry is what the
///         Guard enforces (reason 4 = expired), which is exactly what the demo shows.
///
/// Usage (live Sepolia — coordinator only, NOT run here):
///   DEPLOYER_PRIVATE_KEY=<key> forge script script/DemoSeed.s.sol:DemoSeed \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast
contract DemoSeed is Script {
    using stdJson for string;

    /// @dev Demo agent labels (subnames under the registry's parent, e.g. warden.eth).
    string internal constant DEMO_LABEL = "demo";
    string internal constant EXPIRING_LABEL = "expiring";

    /// @dev Subname registration duration — must be >= AgentSubnameRegistrar.MIN_DURATION (30d).
    ///      This is the NAME lease length, not the Guard policy expiry (see contract notes).
    uint64 internal constant SUBNAME_DURATION = 60 days;

    /// @dev Demo defaults (6-decimal tUSDC).
    uint256 internal constant DEFAULT_FUNDING = 1_000 * 1e6; // top the Guard up to at least this
    uint256 internal constant DEFAULT_PER_TX_CAP = 100 * 1e6;
    uint256 internal constant DEFAULT_CUMULATIVE_CAP = 250 * 1e6;
    uint64 internal constant DEFAULT_HEALTHY_TTL = 1 days; // healthy policy expiry offset
    uint64 internal constant DEFAULT_SHORT_TTL = 60; // short policy expiry offset (seconds)

    /// @notice Explicit inputs to {_seed} so a test can drive it deterministically.
    struct SeedParams {
        Guard guard;
        TestUSDC usdc;
        AgentSubnameRegistrar registrar;
        address recipient; // demo payout target — configured & allowlisted on both nodes
        address agentSigner; // the address allowed to propose (deployer in the demo)
        uint256 funding; // ensure the Guard holds at least this much tUSDC
        uint256 perTxCap;
        uint256 cumulativeCap;
        uint64 healthyExpiry; // absolute unix seconds for the healthy demo agent
        uint64 shortExpiry; // absolute unix seconds for the expiring agent (near future)
    }

    /// @notice What the seed configured — logged and persisted so the demo operator/API knows
    ///         which nodes/labels/recipient to call.
    struct SeedResult {
        bytes32 demoNode;
        bytes32 expiringNode;
        address recipient;
        uint64 healthyExpiry;
        uint64 shortExpiry;
    }

    /// @notice Entry point for `forge script`. Reads the deployer key + deployed addresses from
    ///         env / deployments/sepolia.json, broadcasts the seed, then records demo metadata.
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        (Guard guard, TestUSDC usdc, AgentSubnameRegistrar registrar) = _readDeployed("sepolia");

        SeedParams memory params = SeedParams({
            guard: guard,
            usdc: usdc,
            registrar: registrar,
            // The recipient IS the deployer: a known address that we then allowlist, so the demo's
            // payout target is deterministic and clearly authorized.
            recipient: deployer,
            agentSigner: deployer,
            funding: DEFAULT_FUNDING,
            perTxCap: DEFAULT_PER_TX_CAP,
            cumulativeCap: DEFAULT_CUMULATIVE_CAP,
            healthyExpiry: uint64(block.timestamp) + DEFAULT_HEALTHY_TTL,
            shortExpiry: uint64(block.timestamp) + DEFAULT_SHORT_TTL
        });

        vm.startBroadcast(pk);
        SeedResult memory r = _seed(params);
        vm.stopBroadcast();

        _report(r, "sepolia");
    }

    /// @notice Pure seed logic — no broadcasting, no env — callable from tests.
    /// @dev Assumes msg.sender owns the Guard (configureAgent/setAllowlist are onlyOwner) and that
    ///      the registrar already holds ROLE_REGISTRAR | ROLE_RENEW on the registry (wired by the
    ///      DeployENS step). Under broadcast that is the deployer; under a test it is the harness.
    function _seed(SeedParams memory p) internal returns (SeedResult memory r) {
        // 1. Ensure the Guard can pay out: top up to at least `funding` (mint is open on tUSDC).
        uint256 bal = p.usdc.balanceOf(address(p.guard));
        if (bal < p.funding) {
            p.usdc.mint(address(p.guard), p.funding - bal);
        }

        // 2 + 3. Register/reuse the two demo subnames and configure their policies.
        bytes32 demoNode = _ensureSubname(p.registrar, DEMO_LABEL, p.recipient);
        bytes32 expiringNode = _ensureSubname(p.registrar, EXPIRING_LABEL, p.recipient);

        _configure(p.guard, demoNode, p, p.healthyExpiry);
        _configure(p.guard, expiringNode, p, p.shortExpiry);

        r = SeedResult({
            demoNode: demoNode,
            expiringNode: expiringNode,
            recipient: p.recipient,
            healthyExpiry: p.healthyExpiry,
            shortExpiry: p.shortExpiry
        });
    }

    /// @dev Register `label` if available, else reuse the existing subname's node. Either way,
    ///      returns the ENS node the Guard policy binds to.
    function _ensureSubname(AgentSubnameRegistrar registrar, string memory label, address owner)
        internal
        returns (bytes32 node)
    {
        if (registrar.available(label)) {
            (, node) = registrar.register(label, owner, address(0), SUBNAME_DURATION);
        } else {
            // Already registered (e.g. a prior seed run) — just bind the policy to its node.
            node = registrar.nodeFor(label);
        }
    }

    /// @dev Configure a healthy/expiring policy for `node` and allowlist the demo recipient.
    function _configure(Guard guard, bytes32 node, SeedParams memory p, uint64 expiry) internal {
        guard.configureAgent(node, p.agentSigner, address(p.usdc), p.perTxCap, p.cumulativeCap, expiry);
        guard.setAllowlist(node, p.recipient, true);
    }

    /// @dev Read the already-deployed guard/usdc/registrar from deployments/<network>.json.
    function _readDeployed(string memory network)
        internal
        view
        returns (Guard guard, TestUSDC usdc, AgentSubnameRegistrar registrar)
    {
        string memory path = string.concat("deployments/", network, ".json");
        string memory json = vm.readFile(path);
        guard = Guard(json.readAddress(".guard"));
        usdc = TestUSDC(json.readAddress(".usdc"));
        registrar = AgentSubnameRegistrar(json.readAddress(".registrar"));
    }

    /// @dev Log the demo metadata and MERGE it into deployments/<network>.json under a "demo"
    ///      object, preserving existing top-level keys (guard/usdc/registrar/etc.).
    function _report(SeedResult memory r, string memory network) internal {
        console2.log("== WARDEN demo seed ==");
        console2.log("network      :", network);
        console2.log("demoLabel    :", string.concat(DEMO_LABEL, ".warden.eth"));
        console2.logBytes32(r.demoNode);
        console2.log("expiringLabel:", string.concat(EXPIRING_LABEL, ".warden.eth"));
        console2.logBytes32(r.expiringNode);
        console2.log("recipient    :", r.recipient);
        console2.log("healthyExpiry:", r.healthyExpiry);
        console2.log("shortExpiry  :", r.shortExpiry);

        string memory path = string.concat("deployments/", network, ".json");

        // Build the nested "demo" object.
        string memory demoObj = "demo";
        vm.serializeString(demoObj, "demoLabel", string.concat(DEMO_LABEL, ".warden.eth"));
        vm.serializeBytes32(demoObj, "demoNode", r.demoNode);
        vm.serializeString(demoObj, "expiringLabel", string.concat(EXPIRING_LABEL, ".warden.eth"));
        vm.serializeBytes32(demoObj, "expiringNode", r.expiringNode);
        vm.serializeAddress(demoObj, "recipient", r.recipient);
        vm.serializeUint(demoObj, "healthyExpiry", r.healthyExpiry);
        string memory demoJson = vm.serializeUint(demoObj, "shortExpiry", r.shortExpiry);

        // Merge the "demo" object into the existing deployments file without clobbering other keys.
        vm.writeJson(demoJson, path, ".demo");
        console2.log("wrote demo   :", path);
    }
}
