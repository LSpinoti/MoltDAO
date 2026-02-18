// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReputation {
    function recordPost(address agent, bool accepted) external;
    function recordAction(address agent, bool succeeded) external;
    function score(address agent) external view returns (uint256);
}
