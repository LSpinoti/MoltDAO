// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IStakeVault} from "./interfaces/IStakeVault.sol";
import {IReputation} from "./interfaces/IReputation.sol";

contract Reputation is IReputation, Ownable {
    struct Stats {
        uint256 postsAccepted;
        uint256 actionsSucceeded;
        uint256 actionsFailed;
    }

    IStakeVault public immutable stakeVault;
    mapping(address => Stats) public stats;
    mapping(address => bool) public writers;

    event WriterUpdated(address indexed writer, bool allowed);
    event PostRecorded(address indexed agent, bool accepted, uint256 postsAccepted);
    event ActionRecorded(address indexed agent, bool succeeded, uint256 actionsSucceeded, uint256 actionsFailed);

    error Unauthorized();

    modifier onlyWriter() {
        if (!writers[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(address owner_, address stakeVault_) Ownable(owner_) {
        require(stakeVault_ != address(0), "stakeVault");
        stakeVault = IStakeVault(stakeVault_);
    }

    function setWriter(address writer, bool allowed) external onlyOwner {
        writers[writer] = allowed;
        emit WriterUpdated(writer, allowed);
    }

    function recordPost(address agent, bool accepted) external override onlyWriter {
        if (accepted) {
            stats[agent].postsAccepted += 1;
        }

        emit PostRecorded(agent, accepted, stats[agent].postsAccepted);
    }

    function recordAction(address agent, bool succeeded) external override onlyWriter {
        if (succeeded) {
            stats[agent].actionsSucceeded += 1;
        } else {
            stats[agent].actionsFailed += 1;
        }

        Stats memory s = stats[agent];
        emit ActionRecorded(agent, succeeded, s.actionsSucceeded, s.actionsFailed);
    }

    function score(address agent) external view override returns (uint256) {
        Stats memory s = stats[agent];

        uint256 positive = s.postsAccepted + (s.actionsSucceeded * 10);
        uint256 negative = s.actionsFailed * 5;
        uint256 stakeBoost = stakeVault.bondedBalance(agent) / 1e6;

        if (positive + stakeBoost <= negative) {
            return 0;
        }

        return positive + stakeBoost - negative;
    }
}
