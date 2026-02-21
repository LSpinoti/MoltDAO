// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../../src/AgentRegistry.sol";
import {StakeVault} from "../../src/StakeVault.sol";
import {Reputation} from "../../src/Reputation.sol";
import {Forum} from "../../src/Forum.sol";
import {ActionExecutor} from "../../src/ActionExecutor.sol";
import {MockGovernanceToken} from "../../src/mocks/MockGovernanceToken.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockSwapTarget} from "../../src/mocks/MockSwapTarget.sol";

contract ForumActionExecutorFlowTest is Test {
    AgentRegistry internal registry;
    StakeVault internal stakeVault;
    Reputation internal reputation;
    Forum internal forum;
    ActionExecutor internal executor;

    MockGovernanceToken internal daoToken;
    MockERC20 internal tokenOut;
    MockSwapTarget internal swapTarget;

    address internal owner = makeAddr("owner");
    address internal slashReceiver = makeAddr("slashReceiver");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    function setUp() public {
        daoToken = new MockGovernanceToken();
        tokenOut = new MockERC20("Mock ETH", "mETH");

        registry = new AgentRegistry(owner);
        stakeVault = new StakeVault(owner, address(daoToken), slashReceiver, 5e6, 50e6);
        reputation = new Reputation(owner, address(stakeVault));
        executor = new ActionExecutor(owner, address(daoToken), address(stakeVault), address(reputation), address(0));
        forum = new Forum(owner, address(stakeVault), address(reputation), address(executor));

        vm.startPrank(owner);
        executor.setForum(address(forum));
        reputation.setWriter(address(forum), true);
        reputation.setWriter(address(executor), true);
        swapTarget = new MockSwapTarget(address(daoToken));
        executor.setWhitelistedTarget(address(swapTarget), true);
        executor.setWhitelistedSelector(MockSwapTarget.swapExactTreasuryTokenForToken.selector, true);
        vm.stopPrank();

        _seedAgent(alice, "alice");
        _seedAgent(bob, "bob");
        _seedAgent(carol, "carol");

        daoToken.mint(address(executor), 1_000e6);
        tokenOut.mint(address(swapTarget), 5_000 ether);
    }

    function test_AgentCanPostVoteAndExecuteSwap() public {
        uint256 actionId = _createSwapAction(alice, 50e6, 30 ether, block.timestamp + 1 days);

        bytes memory actionRef = abi.encode(actionId);
        vm.prank(alice);
        uint256 postId = forum.createPost(keccak256("swap proposal"), uint8(1), actionRef);
        assertEq(postId, 1);

        vm.prank(alice);
        forum.voteAction(actionId, true, 1);

        vm.prank(bob);
        forum.voteAction(actionId, true, 1);

        vm.prank(carol);
        forum.voteAction(actionId, true, 1);

        bytes memory routerCall = abi.encodeCall(
            MockSwapTarget.swapExactTreasuryTokenForToken, (address(tokenOut), 50e6, 35 ether, address(executor))
        );
        bytes memory swapCalldata = abi.encode(address(swapTarget), routerCall);

        vm.prank(dave);
        executor.executeSwap(actionId, swapCalldata);

        ActionExecutor.Action memory action = executor.getAction(actionId);
        ActionExecutor.ActionStatus status = action.status;
        assertEq(uint256(status), uint256(ActionExecutor.ActionStatus.EXECUTED));
        assertEq(action.supportStake, 900e6);
        assertEq(tokenOut.balanceOf(address(executor)), 35 ether);
    }

    function test_SwapRejectsWrongCalldataHash() public {
        uint256 actionId = _createSwapAction(alice, 50e6, 30 ether, block.timestamp + 1 days);

        vm.prank(alice);
        forum.voteAction(actionId, true, 1);
        vm.prank(bob);
        forum.voteAction(actionId, true, 1);
        vm.prank(carol);
        forum.voteAction(actionId, true, 1);

        bytes memory badRouterCall = abi.encodeCall(
            MockSwapTarget.swapExactTreasuryTokenForToken, (address(tokenOut), 50e6, 1 ether, address(executor))
        );
        bytes memory badSwapCalldata = abi.encode(address(swapTarget), badRouterCall);

        vm.expectRevert(ActionExecutor.InvalidAction.selector);
        vm.prank(dave);
        executor.executeSwap(actionId, badSwapCalldata);
    }

    function test_PostRequiresStakeBalance() public {
        address noBond = makeAddr("nobond");

        vm.expectRevert(Forum.InsufficientBond.selector);
        vm.prank(noBond);
        forum.createPost(keccak256("hello"), uint8(0), "");
    }

    function test_HolderCanPostWithoutBonding() public {
        address holder = makeAddr("holder");
        daoToken.mint(holder, 10e6);

        vm.prank(holder);
        uint256 postId = forum.createPost(keccak256("holder-post"), uint8(0), "");
        assertEq(postId, 1);
    }

    function test_ApprovedGovernanceConfigActionUpdatesThresholds() public {
        uint256 actionId = _createGovernanceConfigAction(alice, 150e6, 2, 5_500, 12 hours, block.timestamp + 1 days);

        vm.prank(alice);
        forum.createPost(keccak256("governance config proposal"), uint8(1), abi.encode(actionId));

        vm.prank(alice);
        forum.voteAction(actionId, true, 1);
        vm.prank(bob);
        forum.voteAction(actionId, true, 1);
        vm.prank(carol);
        forum.voteAction(actionId, true, 1);

        vm.prank(dave);
        executor.executeGovernanceConfig(actionId);

        assertEq(executor.supportStakeThreshold(), 150e6);
        assertEq(executor.uniqueSupportersThreshold(), 2);
        assertEq(executor.supportBpsThreshold(), 5_500);
        assertEq(executor.votingWindow(), 12 hours);
    }

    function _seedAgent(address agent, string memory handle) internal {
        vm.prank(agent);
        registry.registerAgent(agent, handle, keccak256(bytes(handle)));

        daoToken.mint(agent, 300e6);
    }

    function _createSwapAction(address proposer, uint256 amountIn, uint256 minAmountOut, uint256 deadline)
        internal
        returns (uint256)
    {
        bytes memory routerCall = abi.encodeCall(
            MockSwapTarget.swapExactTreasuryTokenForToken, (address(tokenOut), amountIn, 35 ether, address(executor))
        );
        bytes memory swapCalldata = abi.encode(address(swapTarget), routerCall);

        vm.prank(proposer);
        uint256 actionId = executor.createAction(0, address(tokenOut), amountIn, minAmountOut, deadline, keccak256(swapCalldata));

        return actionId;
    }

    function _createGovernanceConfigAction(
        address proposer,
        uint256 supportStakeThreshold,
        uint256 uniqueSupportersThreshold,
        uint256 supportBpsThreshold,
        uint256 votingWindow,
        uint256 deadline
    ) internal returns (uint256) {
        vm.prank(proposer);
        return executor.createGovernanceConfigAction(
            0,
            supportStakeThreshold,
            uniqueSupportersThreshold,
            supportBpsThreshold,
            votingWindow,
            deadline
        );
    }
}
