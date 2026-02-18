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

    function executeSwap(uint256 actionId, bytes calldata swapCalldata) external;
    function executeTransfer(uint256 actionId, address to, uint256 amount) external;
    function attachPost(uint256 actionId, uint256 postId, address expectedProposer) external;
    function recordVote(uint256 actionId, address voter, bool support, uint256 stakeAmount) external;
    function actionExists(uint256 actionId) external view returns (bool);
    function votingEndsAt(uint256 actionId) external view returns (uint256);
    function isFinal(uint256 actionId) external view returns (bool);
}
