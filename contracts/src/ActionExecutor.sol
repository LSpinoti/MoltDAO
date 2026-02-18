// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStakeVault} from "./interfaces/IStakeVault.sol";
import {IReputation} from "./interfaces/IReputation.sol";
import {IActionExecutor} from "./interfaces/IActionExecutor.sol";

contract ActionExecutor is IActionExecutor, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum ActionType {
        SWAP_USDC_TO_TOKEN,
        TRANSFER_USDC
    }

    enum ActionStatus {
        NONE,
        CREATED,
        EXECUTED,
        FAILED,
        CANCELLED
    }

    struct Action {
        uint256 id;
        uint256 postId;
        address proposer;
        ActionType actionType;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
        bytes32 calldataHash;
        ActionStatus status;
        uint64 createdAt;
        uint64 executedAt;
        uint256 supportStake;
        uint256 opposeStake;
        uint32 uniqueSupporters;
    }

    IERC20 public immutable usdc;
    IStakeVault public immutable stakeVault;
    IReputation public immutable reputation;

    address public forum;
    uint256 public nextActionId = 1;

    uint256 public supportStakeThreshold = 200e6;
    uint256 public uniqueSupportersThreshold = 3;
    uint256 public supportBpsThreshold = 6000;
    uint256 public votingWindow = 6 hours;

    mapping(uint256 => Action) public actions;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(address => bool) public whitelistedTargets;
    mapping(bytes4 => bool) public whitelistedSelectors;

    event ForumUpdated(address indexed forum);
    event ActionCreated(
        uint256 indexed actionId,
        uint256 indexed postId,
        address indexed proposer,
        uint8 actionType,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        bytes32 calldataHash
    );
    event ActionPostAttached(uint256 indexed actionId, uint256 indexed postId);
    event ActionVoted(uint256 indexed actionId, address indexed voter, bool support, uint256 stakeAmount);
    event ActionExecuted(
        uint256 indexed actionId,
        uint8 actionType,
        bool success,
        uint256 amountOut,
        address indexed executor,
        bytes data
    );
    event ActionStatusUpdated(uint256 indexed actionId, ActionStatus status);
    event TargetWhitelistUpdated(address indexed target, bool allowed);
    event SelectorWhitelistUpdated(bytes4 indexed selector, bool allowed);
    event ThresholdsUpdated(uint256 supportStake, uint256 uniqueSupporters, uint256 supportBps);
    event VotingWindowUpdated(uint256 votingWindow);

    error Unauthorized();
    error InvalidAction();
    error InvalidConfig();
    error VotingClosed();
    error AlreadyVoted();
    error NotApproved();
    error ActionExpired();
    error NotSwapAction();
    error NotTransferAction();
    error ActionNotExecutable();
    error UnsafeTarget();
    error UnsafeSelector();

    modifier onlyForum() {
        if (msg.sender != forum) revert Unauthorized();
        _;
    }

    constructor(
        address owner_,
        address usdc_,
        address stakeVault_,
        address reputation_,
        address forum_
    ) Ownable(owner_) {
        if (usdc_ == address(0) || stakeVault_ == address(0) || reputation_ == address(0)) revert InvalidConfig();

        usdc = IERC20(usdc_);
        stakeVault = IStakeVault(stakeVault_);
        reputation = IReputation(reputation_);
        forum = forum_;
    }

    function createAction(
        uint256 postId,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        bytes32 calldataHash
    ) external override whenNotPaused returns (uint256 actionId) {
        if (amountIn == 0 || deadline <= block.timestamp) revert InvalidAction();

        ActionType actionType;
        if (tokenOut == address(0)) {
            actionType = ActionType.TRANSFER_USDC;
            if (minAmountOut != 0 || calldataHash != bytes32(0)) revert InvalidAction();
        } else {
            actionType = ActionType.SWAP_USDC_TO_TOKEN;
            if (calldataHash == bytes32(0)) revert InvalidAction();
        }

        actionId = nextActionId;
        nextActionId += 1;

        actions[actionId] = Action({
            id: actionId,
            postId: postId,
            proposer: msg.sender,
            actionType: actionType,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            deadline: deadline,
            calldataHash: calldataHash,
            status: ActionStatus.CREATED,
            createdAt: uint64(block.timestamp),
            executedAt: 0,
            supportStake: 0,
            opposeStake: 0,
            uniqueSupporters: 0
        });

        emit ActionCreated(
            actionId,
            postId,
            msg.sender,
            uint8(actionType),
            amountIn,
            minAmountOut,
            deadline,
            calldataHash
        );
    }

    function attachPost(uint256 actionId, uint256 postId, address expectedProposer) external override onlyForum {
        Action storage action = actions[actionId];
        if (action.status == ActionStatus.NONE) revert InvalidAction();
        if (action.proposer != expectedProposer) revert InvalidAction();

        if (action.postId == 0) {
            action.postId = postId;
        } else if (action.postId != postId) {
            revert InvalidAction();
        }

        emit ActionPostAttached(actionId, postId);
    }

    function recordVote(uint256 actionId, address voter, bool support, uint256 stakeAmount)
        external
        override
        onlyForum
        whenNotPaused
    {
        Action storage action = actions[actionId];
        if (action.status != ActionStatus.CREATED) revert InvalidAction();
        if (block.timestamp > votingEndsAt(actionId)) revert VotingClosed();
        if (hasVoted[actionId][voter]) revert AlreadyVoted();

        hasVoted[actionId][voter] = true;

        if (support) {
            action.supportStake += stakeAmount;
            action.uniqueSupporters += 1;
        } else {
            action.opposeStake += stakeAmount;
        }

        emit ActionVoted(actionId, voter, support, stakeAmount);
    }

    function executeSwap(uint256 actionId, bytes calldata swapCalldata)
        external
        override
        nonReentrant
        whenNotPaused
    {
        Action storage action = actions[actionId];
        if (action.actionType != ActionType.SWAP_USDC_TO_TOKEN) revert NotSwapAction();

        _preExecutionChecks(action);

        if (keccak256(swapCalldata) != action.calldataHash) revert InvalidAction();

        (address target, bytes memory callData) = abi.decode(swapCalldata, (address, bytes));
        if (!whitelistedTargets[target]) revert UnsafeTarget();

        bytes4 selector = _selector(callData);
        if (!whitelistedSelectors[selector]) revert UnsafeSelector();

        uint256 balanceBefore = IERC20(action.tokenOut).balanceOf(address(this));

        usdc.forceApprove(target, action.amountIn);
        (bool ok, bytes memory result) = target.call(callData);

        if (!ok) {
            _markFailed(actionId, action.proposer);
            emit ActionExecuted(actionId, uint8(action.actionType), false, 0, msg.sender, result);
            return;
        }

        uint256 balanceAfter = IERC20(action.tokenOut).balanceOf(address(this));
        uint256 amountOut = balanceAfter - balanceBefore;

        if (amountOut < action.minAmountOut) {
            _markFailed(actionId, action.proposer);
            emit ActionExecuted(actionId, uint8(action.actionType), false, amountOut, msg.sender, "MIN_AMOUNT_OUT");
            return;
        }

        action.status = ActionStatus.EXECUTED;
        action.executedAt = uint64(block.timestamp);
        reputation.recordAction(action.proposer, true);

        emit ActionStatusUpdated(actionId, ActionStatus.EXECUTED);
        emit ActionExecuted(actionId, uint8(action.actionType), true, amountOut, msg.sender, result);
    }

    function executeTransfer(uint256 actionId, address to, uint256 amount)
        external
        override
        nonReentrant
        whenNotPaused
    {
        Action storage action = actions[actionId];
        if (action.actionType != ActionType.TRANSFER_USDC) revert NotTransferAction();
        if (to == address(0) || amount == 0 || amount > action.amountIn) revert InvalidAction();

        _preExecutionChecks(action);

        usdc.safeTransfer(to, amount);

        action.status = ActionStatus.EXECUTED;
        action.executedAt = uint64(block.timestamp);
        reputation.recordAction(action.proposer, true);

        emit ActionStatusUpdated(actionId, ActionStatus.EXECUTED);
        emit ActionExecuted(actionId, uint8(action.actionType), true, amount, msg.sender, "");
    }

    function markExpired(uint256 actionId) external {
        Action storage action = actions[actionId];
        if (action.status != ActionStatus.CREATED) revert ActionNotExecutable();
        if (action.deadline > block.timestamp) revert ActionNotExecutable();

        _markFailed(actionId, action.proposer);
    }

    function actionExists(uint256 actionId) external view override returns (bool) {
        return actions[actionId].status != ActionStatus.NONE;
    }

    function votingEndsAt(uint256 actionId) public view override returns (uint256) {
        return actions[actionId].createdAt + votingWindow;
    }

    function isFinal(uint256 actionId) external view override returns (bool) {
        ActionStatus status = actions[actionId].status;
        return status == ActionStatus.EXECUTED || status == ActionStatus.FAILED || status == ActionStatus.CANCELLED;
    }

    function getAction(uint256 actionId) external view returns (Action memory) {
        return actions[actionId];
    }

    function isApproved(uint256 actionId) public view returns (bool) {
        Action storage action = actions[actionId];
        if (action.status != ActionStatus.CREATED) return false;

        uint256 totalVotes = action.supportStake + action.opposeStake;
        if (totalVotes == 0) return false;

        if (action.supportStake < supportStakeThreshold) return false;
        if (action.uniqueSupporters < uniqueSupportersThreshold) return false;

        uint256 supportBps = (action.supportStake * 10_000) / totalVotes;
        if (supportBps < supportBpsThreshold) return false;

        return true;
    }

    function setForum(address forum_) external onlyOwner {
        if (forum_ == address(0)) revert InvalidConfig();
        forum = forum_;
        emit ForumUpdated(forum_);
    }

    function setWhitelistedTarget(address target, bool allowed) external onlyOwner {
        whitelistedTargets[target] = allowed;
        emit TargetWhitelistUpdated(target, allowed);
    }

    function setWhitelistedSelector(bytes4 selector, bool allowed) external onlyOwner {
        whitelistedSelectors[selector] = allowed;
        emit SelectorWhitelistUpdated(selector, allowed);
    }

    function setThresholds(uint256 supportStake, uint256 uniqueSupporters, uint256 supportBps) external onlyOwner {
        if (supportBps > 10_000 || supportBps == 0) revert InvalidConfig();
        supportStakeThreshold = supportStake;
        uniqueSupportersThreshold = uniqueSupporters;
        supportBpsThreshold = supportBps;
        emit ThresholdsUpdated(supportStake, uniqueSupporters, supportBps);
    }

    function setVotingWindow(uint256 votingWindow_) external onlyOwner {
        if (votingWindow_ < 1 hours || votingWindow_ > 7 days) revert InvalidConfig();
        votingWindow = votingWindow_;
        emit VotingWindowUpdated(votingWindow_);
    }

    function cancelAction(uint256 actionId) external {
        Action storage action = actions[actionId];
        if (action.status != ActionStatus.CREATED) revert ActionNotExecutable();
        if (msg.sender != owner() && msg.sender != action.proposer) revert Unauthorized();

        action.status = ActionStatus.CANCELLED;
        emit ActionStatusUpdated(actionId, ActionStatus.CANCELLED);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _preExecutionChecks(Action storage action) internal view {
        if (action.status != ActionStatus.CREATED) revert ActionNotExecutable();
        if (action.deadline < block.timestamp) revert ActionExpired();
        if (!isApproved(action.id)) revert NotApproved();
    }

    function _markFailed(uint256 actionId, address proposer) internal {
        Action storage action = actions[actionId];
        action.status = ActionStatus.FAILED;
        action.executedAt = uint64(block.timestamp);
        reputation.recordAction(proposer, false);
        emit ActionStatusUpdated(actionId, ActionStatus.FAILED);
    }

    function _selector(bytes memory callData) internal pure returns (bytes4 selector) {
        if (callData.length < 4) revert InvalidAction();
        assembly ("memory-safe") {
            selector := mload(add(callData, 32))
        }
    }
}
