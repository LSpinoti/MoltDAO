// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IActionExecutor {
    function createAction(
        uint256 postId,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 deadline,
        bytes32 calldataHash
    ) external returns (uint256 actionId);

    function createGovernanceConfigAction(
        uint256 postId,
        uint256 supportStakeThreshold,
        uint256 uniqueSupportersThreshold,
        uint256 supportBpsThreshold,
        uint256 votingWindow,
        uint256 deadline
    ) external returns (uint256 actionId);

    function createRwaFundAction(
        uint256 postId,
        bytes32 fundId,
        uint256 amount,
        bool isAllocation,
        uint256 deadline
    ) external returns (uint256 actionId);

    function createAgentWalletFundAction(
        uint256 postId,
        address agent,
        uint256 amount,
        uint256 deadline
    ) external returns (uint256 actionId);

    function createSwapProviderAction(
        uint256 postId,
        address newProvider,
        bytes32 providerNameHash,
        uint256 deadline
    ) external returns (uint256 actionId);

    function createYieldStrategyAction(
        uint256 postId,
        bytes32 strategyId,
        uint256 allocationAmount,
        uint256 riskTier,
        uint256 deadline
    ) external returns (uint256 actionId);

    function executeSwap(uint256 actionId, bytes calldata swapCalldata) external;
    function executeTransfer(uint256 actionId, address to, uint256 amount) external;
    function executeGovernanceConfig(uint256 actionId) external;
    function executeRwaFundAction(uint256 actionId) external;
    function executeAgentWalletFund(uint256 actionId) external;
    function executeSwapProviderChange(uint256 actionId) external;
    function executeYieldStrategy(uint256 actionId) external;
    function attachPost(uint256 actionId, uint256 postId, address expectedProposer) external;
    function recordVote(uint256 actionId, address voter, bool support, uint256 stakeAmount) external;
    function actionExists(uint256 actionId) external view returns (bool);
    function votingEndsAt(uint256 actionId) external view returns (uint256);
    function isFinal(uint256 actionId) external view returns (bool);
}
