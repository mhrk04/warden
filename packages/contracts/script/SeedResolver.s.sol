// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {NameCoder} from "@ens/contracts/utils/NameCoder.sol";
import {PermissionedResolver} from "@ensdomains/contracts-v2/resolver/PermissionedResolver.sol";

import {DeployResolver} from "./DeployResolver.s.sol";
import {AgentRecordsLib} from "../src/AgentRecordsLib.sol";
import {AgentSubnameRegistrar} from "../src/AgentSubnameRegistrar.sol";
import {WardenRegistry} from "../src/WardenRegistry.sol";

/// @title SeedResolver — live: give a WARDEN agent subname a real ENSv2 Permissioned Resolver,
///        write its records, and demonstrate fine-grained Enhanced Access Control on-chain.
/// @notice Runs against the ALREADY-DEPLOYED registry/registrar/guard in deployments/sepolia.json.
///         It is additive — it does not touch the Guard enforcement path the other tracks depend on.
///
///         Steps (all real on-chain writes):
///           1. Deploy a real ENSv2 `PermissionedResolver` (impl + VerifiableFactory proxy),
///              owned by the deployer (who is also the WardenRegistry admin).
///           2. Register (or reuse) the demo subname `RESOLVER_LABEL.warden.eth`, setting the
///              resolver as its resolver at registration (or via setResolver if it already exists).
///           3. Write the WARDEN agent profile onto the resolver: addr = agentSigner, and text
///              records warden:guard / warden:node / warden:status / description.
///           4. Delegate to a demo delegate the right to edit ONLY the `warden:status` text key
///              (fine-grained EAC via authorizeTextRoles) — the "edit only certain text records"
///              capability the ENSv2 bounty highlights.
///
///         Records + addresses are persisted under a "resolver" object in deployments/sepolia.json
///         so the README / app / verify commands can point at them.
///
/// Usage (live Sepolia — coordinator only):
///   DEPLOYER_PRIVATE_KEY=<key> forge script script/SeedResolver.s.sol:SeedResolver \
///     --rpc-url $SEPOLIA_RPC_URL --broadcast
contract SeedResolver is DeployResolver {
    using stdJson for string;
    using AgentRecordsLib for PermissionedResolver;

    /// @dev The demo subname that receives a full ENSv2 resolver profile.
    string internal constant RESOLVER_LABEL = "resolved";

    /// @dev Registration duration — must be >= AgentSubnameRegistrar.MIN_DURATION (30d).
    uint64 internal constant SUBNAME_DURATION = 60 days;

    /// @dev The text key the demo delegate is allowed to edit (and ONLY this one).
    string internal constant DELEGATED_KEY = AgentRecordsLib.KEY_STATUS;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        (WardenRegistry registry, AgentSubnameRegistrar registrar, address guard) =
            _readDeployed("sepolia");

        // A distinct demo delegate address (deterministic, derived from the deployer) so the
        // scoped-EAC grant targets a real, non-deployer account.
        address delegate = address(uint160(uint256(keccak256(abi.encodePacked("warden:delegate", deployer)))));

        vm.startBroadcast(pk);

        // 1. Deploy the resolver (owned by the deployer = registry admin).
        (,, PermissionedResolver resolver) = _deployResolver(deployer);

        // 2. Register or reuse the demo subname, pointing it at the resolver.
        bytes32 node;
        if (registrar.available(RESOLVER_LABEL)) {
            (, node) = registrar.register(RESOLVER_LABEL, deployer, address(resolver), SUBNAME_DURATION);
        } else {
            node = registrar.nodeFor(RESOLVER_LABEL);
            // Ensure the resolver is set even if the name pre-existed. setResolver takes the
            // labelhash as anyId; the deployer (admin) holds the roles to set it.
            registry.setResolver(uint256(keccak256(bytes(RESOLVER_LABEL))), address(resolver));
        }

        // 3. Write the agent profile onto the resolver (deployer is the agent signer for the demo).
        resolver.writeAgentProfile(node, deployer, guard);

        // 4. Fine-grained EAC: delegate may edit ONLY warden:status on this name.
        bytes memory dnsName = NameCoder.encode(string.concat(RESOLVER_LABEL, ".warden.eth"));
        resolver.authorizeTextRoles(dnsName, DELEGATED_KEY, delegate, true);

        vm.stopBroadcast();

        _report(address(resolver), node, delegate, "sepolia");
    }

    function _readDeployed(string memory network)
        internal
        view
        returns (WardenRegistry registry, AgentSubnameRegistrar registrar, address guard)
    {
        string memory path = string.concat("deployments/", network, ".json");
        string memory json = vm.readFile(path);
        registry = WardenRegistry(json.readAddress(".wardenRegistry"));
        registrar = AgentSubnameRegistrar(json.readAddress(".registrar"));
        guard = json.readAddress(".guard");
    }

    function _report(address resolver, bytes32 node, address delegate, string memory network)
        internal
    {
        console2.log("== WARDEN resolver seed ==");
        console2.log("network       :", network);
        console2.log("label         :", string.concat(RESOLVER_LABEL, ".warden.eth"));
        console2.log("resolver       :", resolver);
        console2.logBytes32(node);
        console2.log("delegate       :", delegate);
        console2.log("delegatedKey   :", DELEGATED_KEY);

        string memory path = string.concat("deployments/", network, ".json");
        string memory obj = "resolver";
        vm.serializeString(obj, "label", string.concat(RESOLVER_LABEL, ".warden.eth"));
        vm.serializeAddress(obj, "resolver", resolver);
        vm.serializeBytes32(obj, "node", node);
        vm.serializeAddress(obj, "delegate", delegate);
        string memory json = vm.serializeString(obj, "delegatedKey", DELEGATED_KEY);
        vm.writeJson(json, path, ".resolver");
        console2.log("wrote resolver:", path);
    }
}
