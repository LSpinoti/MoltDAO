// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {HelixCouncilToken} from "../src/HelixCouncilToken.sol";
import {StakeVault} from "../src/StakeVault.sol";
import {Reputation} from "../src/Reputation.sol";
import {Forum} from "../src/Forum.sol";
import {ActionExecutor} from "../src/ActionExecutor.sol";

contract DeployScript is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        HelixCouncilToken daoToken = new HelixCouncilToken(deployer, 1_000_000_000e6, 6);
        AgentRegistry registry = new AgentRegistry(deployer);
        StakeVault stakeVault = new StakeVault(deployer, address(daoToken), deployer, 1e6, 2e6);
        Reputation reputation = new Reputation(deployer, address(stakeVault));
        ActionExecutor executor =
            new ActionExecutor(deployer, address(daoToken), address(stakeVault), address(reputation), address(0));
        Forum forum = new Forum(deployer, address(stakeVault), address(reputation), address(executor));

        executor.setForum(address(forum));
        reputation.setWriter(address(forum), true);
        reputation.setWriter(address(executor), true);
        stakeVault.setLocker(address(forum), true);
        daoToken.mint(address(executor), 250_000e6);

        vm.stopBroadcast();

        console2.log("HelixCouncilToken", address(daoToken));
        console2.log("AgentRegistry", address(registry));
        console2.log("StakeVault", address(stakeVault));
        console2.log("Reputation", address(reputation));
        console2.log("ActionExecutor", address(executor));
        console2.log("Forum", address(forum));
    }
}
