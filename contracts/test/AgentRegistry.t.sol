// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry internal registry;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    function setUp() public {
        registry = new AgentRegistry(owner);
    }

    function test_RegisterAndUpdateProfile() public {
        vm.prank(alice);
        registry.registerAgent(alice, "Alice.Agent", keccak256("meta-a"));

        (address profileOwner, string memory handle, bytes32 handleHash, bytes32 metadataHash, bool verified, bool exists) =
            registry.profiles(alice);

        assertEq(profileOwner, alice);
        assertEq(handle, "Alice.Agent");
        assertEq(handleHash, keccak256(bytes("alice.agent")));
        assertEq(metadataHash, keccak256("meta-a"));
        assertFalse(verified);
        assertTrue(exists);

        vm.prank(alice);
        registry.updateMetadata(keccak256("meta-b"));

        (, , , bytes32 updatedMetadata, , ) = registry.profiles(alice);
        assertEq(updatedMetadata, keccak256("meta-b"));

        vm.prank(alice);
        registry.setHandle("alice.v2");

        (, string memory updatedHandle, bytes32 updatedHandleHash, , , ) = registry.profiles(alice);
        assertEq(updatedHandle, "alice.v2");
        assertEq(updatedHandleHash, keccak256(bytes("alice.v2")));
    }

    function test_HandleUniquenessIsCaseInsensitive() public {
        vm.prank(alice);
        registry.registerAgent(alice, "Agent.One", keccak256("a"));

        vm.prank(bob);
        vm.expectRevert(AgentRegistry.HandleTaken.selector);
        registry.registerAgent(bob, "agent.one", keccak256("b"));
    }

    function test_SetVerifiedOnlyOwner() public {
        vm.prank(alice);
        registry.registerAgent(alice, "agent-a", keccak256("a"));

        vm.prank(bob);
        vm.expectRevert();
        registry.setVerified(alice, true);

        vm.prank(owner);
        registry.setVerified(alice, true);

        (, , , , bool verified, ) = registry.profiles(alice);
        assertTrue(verified);
    }
}
