// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {LabelStore} from "@ensdomains/contracts-v2/utils/LabelStore.sol";
import {ILabelStore} from "@ensdomains/contracts-v2/utils/interfaces/ILabelStore.sol";
import {IContractNamer} from "@ensdomains/contracts-v2/reverse-registrar/interfaces/IContractNamer.sol";
import {RegistryRolesLib} from "@ensdomains/contracts-v2/registry/libraries/RegistryRolesLib.sol";

import {WardenRegistry} from "../src/WardenRegistry.sol";
import {AgentSubnameRegistrar} from "../src/AgentSubnameRegistrar.sol";

/// @title DeployENS — deploys the WARDEN ENSv2 registry + subname registrar.
/// @notice Deploys a real ENSv2 `PermissionedRegistry` (via {WardenRegistry}) plus a
///         {AgentSubnameRegistrar} in front of it, then grants the registrar
///         ROLE_REGISTRAR | ROLE_RENEW on ROOT_RESOURCE so it can register agent subnames.
///
///         Core logic lives in {_deployENS} so a Foundry test can exercise it key-free, exactly
///         like {Deploy._deploy}. `run()` broadcasts and records addresses into
///         deployments/sepolia.json (preserving existing guard/usdc keys).
///
/// Usage (local dry-run against anvil):
///   anvil &
///   DEPLOYER_PRIVATE_KEY=<anvil account #0 key> forge script script/DeployENS.s.sol:DeployENS \
///     --rpc-url http://127.0.0.1:8545 --broadcast
///
/// Usage (live Sepolia): the coordinator runs this with the user's key (NOT done here).
contract DeployENS is Script {
    using stdJson for string;

    /// @dev The ENS namehash of the parent name WARDEN issues agent subnames under.
    ///      = namehash("warden.eth") (from `cast namehash warden.eth`). Immutable input, not a
    ///      hard-coded policy node — the per-agent Guard node is derived from this + the label.
    bytes32 internal constant PARENT_NODE =
        0x6358fec858d0795e69037f8d7cbfb131b209b2d140c78005877273ed6df083b8;

    struct ENSDeployment {
        LabelStore labelStore;
        WardenRegistry registry;
        AgentSubnameRegistrar registrar;
        address deployer;
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);
        ENSDeployment memory d = _deployENS(deployer);
        vm.stopBroadcast();

        _report(d, "sepolia");
    }

    /// @notice Pure deploy logic — no broadcasting, no env — callable from tests.
    /// @param admin the account granted registry root + admin roles (msg.sender at construction).
    function _deployENS(address admin) internal returns (ENSDeployment memory d) {
        // 1. Shared label database (no contract namer needed for the demo).
        LabelStore labelStore = new LabelStore(IContractNamer(address(0)));

        // 2. Real ENSv2 registry. Grant `admin` the roles it needs to (a) register directly and
        //    (b) grant those same roles to the registrar: the base roles + their _ADMIN variants.
        uint256 adminRoles = RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_REGISTRAR_ADMIN
            | RegistryRolesLib.ROLE_RENEW | RegistryRolesLib.ROLE_RENEW_ADMIN;
        WardenRegistry registry = new WardenRegistry(labelStore, admin, adminRoles, PARENT_NODE);

        // 3. Registrar in front of the registry.
        AgentSubnameRegistrar registrar = new AgentSubnameRegistrar(registry);

        // 4. Grant the registrar ROLE_REGISTRAR | ROLE_RENEW on ROOT_RESOURCE so it can register.
        registry.grantRootRoles(
            RegistryRolesLib.ROLE_REGISTRAR | RegistryRolesLib.ROLE_RENEW, address(registrar)
        );

        d = ENSDeployment({labelStore: labelStore, registry: registry, registrar: registrar, deployer: admin});
    }

    /// @dev Log the addresses and MERGE them into deployments/<network>.json, preserving any
    ///      existing guard/usdc keys already recorded by Deploy.s.sol.
    function _report(ENSDeployment memory d, string memory network) internal {
        console2.log("network      :", network);
        console2.log("labelStore   :", address(d.labelStore));
        console2.log("wardenRegistry:", address(d.registry));
        console2.log("registrar    :", address(d.registrar));

        string memory path = string.concat("deployments/", network, ".json");

        // Read existing keys (if the file exists) so we don't clobber guard/usdc/deployer.
        address existingGuard;
        address existingUsdc;
        address existingDeployer;
        try vm.readFile(path) returns (string memory prev) {
            if (vm.keyExistsJson(prev, ".guard")) existingGuard = prev.readAddress(".guard");
            if (vm.keyExistsJson(prev, ".usdc")) existingUsdc = prev.readAddress(".usdc");
            if (vm.keyExistsJson(prev, ".deployer")) existingDeployer = prev.readAddress(".deployer");
        } catch {}

        string memory obj = "ensdeployment";
        vm.serializeString(obj, "network", network);
        if (existingGuard != address(0)) vm.serializeAddress(obj, "guard", existingGuard);
        if (existingUsdc != address(0)) vm.serializeAddress(obj, "usdc", existingUsdc);
        vm.serializeAddress(obj, "deployer", existingDeployer == address(0) ? d.deployer : existingDeployer);
        vm.serializeAddress(obj, "labelStore", address(d.labelStore));
        vm.serializeAddress(obj, "wardenRegistry", address(d.registry));
        string memory json = vm.serializeAddress(obj, "registrar", address(d.registrar));

        vm.writeJson(json, path);
        console2.log("wrote        :", path);
    }
}
