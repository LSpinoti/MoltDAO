// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {StakeVault} from "../src/StakeVault.sol";
import {Reputation} from "../src/Reputation.sol";
import {Forum} from "../src/Forum.sol";
import {ActionExecutor} from "../src/ActionExecutor.sol";

contract DeployScript is Script {
    function run() external {
        address deployer = vm.addr(vm.envUint("PRIVATE_KEY"));
        address usdc = vm.envAddress("USDC_ADDRESS");

        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));

        AgentRegistry registry = new AgentRegistry(deployer);
        StakeVault stakeVault = new StakeVault(deployer, usdc, deployer, 5e6, 50e6);
        Reputation reputation = new Reputation(deployer, address(stakeVault));
        ActionExecutor executor = new ActionExecutor(deployer, usdc, address(stakeVault), address(reputation), address(0));
        Forum forum = new Forum(deployer, address(stakeVault), address(reputation), address(executor));

        executor.setForum(address(forum));
        reputation.setWriter(address(forum), true);
        reputation.setWriter(address(executor), true);
        stakeVault.setLocker(address(forum), true);

        vm.stopBroadcast();

        console2.log("AgentRegistry", address(registry));
        console2.log("StakeVault", address(stakeVault));
        console2.log("Reputation", address(reputation));
        console2.log("ActionExecutor", address(executor));
        console2.log("Forum", address(forum));
    }
}
