// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StakeVault} from "../src/StakeVault.sol";
import {MockGovernanceToken} from "../src/mocks/MockGovernanceToken.sol";

contract StakeVaultTest is Test {
    MockGovernanceToken internal daoToken;
    StakeVault internal vault;

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal slasher = makeAddr("slasher");
    address internal slashReceiver = makeAddr("slashReceiver");

    function setUp() public {
        daoToken = new MockGovernanceToken();
        vault = new StakeVault(owner, address(daoToken), slashReceiver, 5e6, 50e6);

        vm.startPrank(owner);
        vault.setSlasher(slasher, true);
        vm.stopPrank();

        daoToken.mint(alice, 200e6);
        vm.prank(alice);
        daoToken.approve(address(vault), type(uint256).max);
    }

    function test_BondRequestUnbondFinalize() public {
        vm.prank(alice);
        vault.bond(100e6);

        assertEq(vault.bondedBalance(alice), 100e6);

        vm.prank(alice);
        vault.requestUnbond(40e6);

        vm.prank(alice);
        vm.expectRevert(StakeVault.CooldownNotElapsed.selector);
        vault.finalizeUnbond();

        vm.warp(block.timestamp + 24 hours + 1);

        vm.prank(alice);
        vault.finalizeUnbond();

        assertEq(vault.bondedBalance(alice), 60e6);
    }

    function test_SlashReducesBondedBalance() public {
        vm.prank(alice);
        vault.bond(100e6);

        vm.prank(slasher);
        vault.slash(alice, 20e6, keccak256("spam"));

        assertEq(vault.bondedBalance(alice), 80e6);
        assertEq(daoToken.balanceOf(slashReceiver), 20e6);
    }

    function test_AvailableBalanceIncludesWalletAndBondedHoldings() public {
        vm.prank(alice);
        vault.bond(75e6);

        assertEq(vault.availableBalance(alice), 200e6);
    }

    function test_RequestUnbondCannotExceedBondedBalance() public {
        vm.prank(alice);
        vault.bond(100e6);

        vm.prank(alice);
        vm.expectRevert(StakeVault.InsufficientAvailableBalance.selector);
        vault.requestUnbond(150e6);
    }
}
