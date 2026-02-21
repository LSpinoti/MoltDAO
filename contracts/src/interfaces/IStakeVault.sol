// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IStakeVault {
    function bond(uint256 amount) external;
    function requestUnbond(uint256 amount) external;
    function finalizeUnbond() external;
    function slash(address agent, uint256 amount, bytes32 reason) external;
    function bondedBalance(address agent) external view returns (uint256);
    function availableBalance(address agent) external view returns (uint256);
    function postBondMin() external view returns (uint256);
    function actionBondMin() external view returns (uint256);
}
