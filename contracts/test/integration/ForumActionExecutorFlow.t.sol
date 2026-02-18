// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../../src/AgentRegistry.sol";
import {StakeVault} from "../../src/StakeVault.sol";
import {Reputation} from "../../src/Reputation.sol";
import {Forum} from "../../src/Forum.sol";
import {ActionExecutor} from "../../src/ActionExecutor.sol";
import {MockUSDC} from "../../src/mocks/MockUSDC.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {MockSwapTarget} from "../../src/mocks/MockSwapTarget.sol";

contract ForumActionExecutorFlowTest is Test {
    AgentRegistry internal registry;
    StakeVault internal stakeVault;
    Reputation internal reputation;
    Forum internal forum;
    ActionExecutor internal executor;

    MockUSDC internal usdc;
    MockERC20 internal tokenOut;
    MockSwapTarget internal swapTarget;

    address internal owner = makeAddr("owner");
    address internal slashReceiver = makeAddr("slashReceiver");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal dave = makeAddr("dave");

    function setUp() public {
        usdc = new MockUSDC();
        tokenOut = new MockERC20("Mock ETH", "mETH");

        registry = new AgentRegistry(owner);
        stakeVault = new StakeVault(owner, address(usdc), slashReceiver, 5e6, 50e6);
        reputation = new Reputation(owner, address(stakeVault));
        executor = new ActionExecutor(owner, address(usdc), address(stakeVault), address(reputation), address(0));
        forum = new Forum(owner, address(stakeVault), address(reputation), address(executor));

        vm.startPrank(owner);
        executor.setForum(address(forum));
        reputation.setWriter(address(forum), true);
        reputation.setWriter(address(executor), true);
        stakeVault.setLocker(address(forum), true);
        swapTarget = new MockSwapTarget(address(usdc));
        executor.setWhitelistedTarget(address(swapTarget), true);
        executor.setWhitelistedSelector(MockSwapTarget.swapExactUSDCForToken.selector, true);
        vm.stopPrank();

        _seedAgent(alice, "alice");
        _seedAgent(bob, "bob");
        _seedAgent(carol, "carol");

        usdc.mint(address(executor), 1_000e6);
        tokenOut.mint(address(swapTarget), 5_000 ether);
    }

    function test_AgentCanPostVoteAndExecuteSwap() public {
        uint256 actionId = _createSwapAction(alice, 50e6, 30 ether, block.timestamp + 1 days);

        bytes memory actionRef = abi.encode(actionId);
        vm.prank(alice);
        uint256 postId = forum.createPost(keccak256("swap proposal"), uint8(1), actionRef);
        assertEq(postId, 1);

        vm.prank(alice);
        forum.voteAction(actionId, true, 70e6);

        vm.prank(bob);
        forum.voteAction(actionId, true, 70e6);

        vm.prank(carol);
        forum.voteAction(actionId, true, 70e6);

        bytes memory routerCall = abi.encodeCall(
            MockSwapTarget.swapExactUSDCForToken, (address(tokenOut), 50e6, 35 ether, address(executor))
        );
        bytes memory swapCalldata = abi.encode(address(swapTarget), routerCall);

        vm.prank(dave);
        executor.executeSwap(actionId, swapCalldata);

        ActionExecutor.Action memory action = executor.getAction(actionId);
        ActionExecutor.ActionStatus status = action.status;
        assertEq(uint256(status), uint256(ActionExecutor.ActionStatus.EXECUTED));
        assertEq(tokenOut.balanceOf(address(executor)), 35 ether);
    }

    function test_SwapRejectsWrongCalldataHash() public {
        uint256 actionId = _createSwapAction(alice, 50e6, 30 ether, block.timestamp + 1 days);

        vm.prank(alice);
        forum.voteAction(actionId, true, 70e6);
        vm.prank(bob);
        forum.voteAction(actionId, true, 70e6);
        vm.prank(carol);
        forum.voteAction(actionId, true, 70e6);

        bytes memory badRouterCall = abi.encodeCall(
            MockSwapTarget.swapExactUSDCForToken, (address(tokenOut), 50e6, 1 ether, address(executor))
        );
        bytes memory badSwapCalldata = abi.encode(address(swapTarget), badRouterCall);

        vm.expectRevert(ActionExecutor.InvalidAction.selector);
        vm.prank(dave);
        executor.executeSwap(actionId, badSwapCalldata);
    }

    function test_PostRequiresBond() public {
        address noBond = makeAddr("nobond");

        vm.expectRevert(Forum.InsufficientBond.selector);
        vm.prank(noBond);
        forum.createPost(keccak256("hello"), uint8(0), "");
    }

    function _seedAgent(address agent, string memory handle) internal {
        vm.prank(agent);
        registry.registerAgent(agent, handle, keccak256(bytes(handle)));

        usdc.mint(agent, 300e6);
        vm.startPrank(agent);
        usdc.approve(address(stakeVault), type(uint256).max);
        stakeVault.bond(200e6);
        vm.stopPrank();
    }

    function _createSwapAction(address proposer, uint256 amountIn, uint256 minAmountOut, uint256 deadline)
        internal
        returns (uint256)
    {
        bytes memory routerCall = abi.encodeCall(
            MockSwapTarget.swapExactUSDCForToken, (address(tokenOut), amountIn, 35 ether, address(executor))
        );
        bytes memory swapCalldata = abi.encode(address(swapTarget), routerCall);

        vm.prank(proposer);
        uint256 actionId = executor.createAction(0, address(tokenOut), amountIn, minAmountOut, deadline, keccak256(swapCalldata));

        return actionId;
    }
}
