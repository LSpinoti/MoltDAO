// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Pausable} from "openzeppelin-contracts/contracts/utils/Pausable.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {IStakeVault} from "./interfaces/IStakeVault.sol";

contract StakeVault is IStakeVault, Ownable, Pausable {
    using SafeERC20 for IERC20;

    struct UnbondRequest {
        uint256 amount;
        uint64 unlockTime;
    }

    IERC20 public immutable usdc;
    address public slashReceiver;
    uint256 public unbondCooldown = 24 hours;

    uint256 public postBondMin;
    uint256 public actionBondMin;

    mapping(address => uint256) private _bonded;
    mapping(address => uint256) private _locked;
    mapping(address => UnbondRequest) public unbondRequests;

    mapping(address => bool) public slashers;
    mapping(address => bool) public lockers;

    event Bonded(address indexed agent, uint256 amount, uint256 totalBonded);
    event UnbondRequested(address indexed agent, uint256 amount, uint256 unlockTime);
    event UnbondFinalized(address indexed agent, uint256 amount, uint256 totalBonded);
    event Slashed(address indexed agent, uint256 amount, bytes32 reason, address indexed receiver);
    event StakeLocked(address indexed agent, uint256 amount, uint256 totalLocked);
    event StakeUnlocked(address indexed agent, uint256 amount, uint256 totalLocked);
    event SlasherUpdated(address indexed account, bool allowed);
    event LockerUpdated(address indexed account, bool allowed);
    event SlashReceiverUpdated(address indexed receiver);
    event BondMinimumsUpdated(uint256 postBondMin, uint256 actionBondMin);
    event CooldownUpdated(uint256 cooldown);

    error AmountZero();
    error InsufficientAvailableBalance();
    error CooldownNotElapsed();
    error NothingToFinalize();
    error Unauthorized();

    modifier onlySlasher() {
        if (!slashers[msg.sender]) revert Unauthorized();
        _;
    }

    modifier onlyLocker() {
        if (!lockers[msg.sender]) revert Unauthorized();
        _;
    }

    constructor(
        address owner_,
        address usdc_,
        address slashReceiver_,
        uint256 postBondMin_,
        uint256 actionBondMin_
    ) Ownable(owner_) {
        require(usdc_ != address(0), "usdc");
        require(slashReceiver_ != address(0), "receiver");
        require(actionBondMin_ >= postBondMin_, "min");

        usdc = IERC20(usdc_);
        slashReceiver = slashReceiver_;
        postBondMin = postBondMin_;
        actionBondMin = actionBondMin_;
    }

    function bond(uint256 amount) external override whenNotPaused {
        if (amount == 0) revert AmountZero();

        _bonded[msg.sender] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Bonded(msg.sender, amount, _bonded[msg.sender]);
    }

    function requestUnbond(uint256 amount) external override whenNotPaused {
        if (amount == 0) revert AmountZero();
        if (availableBalance(msg.sender) < amount) revert InsufficientAvailableBalance();

        UnbondRequest storage request = unbondRequests[msg.sender];
        request.amount += amount;
        request.unlockTime = uint64(block.timestamp + unbondCooldown);

        emit UnbondRequested(msg.sender, request.amount, request.unlockTime);
    }

    function finalizeUnbond() external override whenNotPaused {
        UnbondRequest memory request = unbondRequests[msg.sender];
        if (request.amount == 0) revert NothingToFinalize();
        if (request.unlockTime > block.timestamp) revert CooldownNotElapsed();

        delete unbondRequests[msg.sender];
        _bonded[msg.sender] -= request.amount;

        usdc.safeTransfer(msg.sender, request.amount);

        emit UnbondFinalized(msg.sender, request.amount, _bonded[msg.sender]);
    }

    function slash(address agent, uint256 amount, bytes32 reason) external override onlySlasher whenNotPaused {
        if (amount == 0) revert AmountZero();

        uint256 bonded = _bonded[agent];
        uint256 slashed = amount > bonded ? bonded : amount;
        if (slashed == 0) revert InsufficientAvailableBalance();

        _bonded[agent] = bonded - slashed;

        if (_locked[agent] > _bonded[agent]) {
            _locked[agent] = _bonded[agent];
        }

        UnbondRequest storage request = unbondRequests[agent];
        uint256 maxRequest = _bonded[agent] - _locked[agent];
        if (request.amount > maxRequest) {
            request.amount = maxRequest;
        }

        usdc.safeTransfer(slashReceiver, slashed);

        emit Slashed(agent, slashed, reason, slashReceiver);
    }

    function lockStake(address agent, uint256 amount) external override onlyLocker whenNotPaused {
        if (amount == 0) revert AmountZero();
        if (availableBalance(agent) < amount) revert InsufficientAvailableBalance();

        _locked[agent] += amount;
        emit StakeLocked(agent, amount, _locked[agent]);
    }

    function unlockStake(address agent, uint256 amount) external override onlyLocker whenNotPaused {
        if (amount == 0) revert AmountZero();
        if (_locked[agent] < amount) revert InsufficientAvailableBalance();

        _locked[agent] -= amount;
        emit StakeUnlocked(agent, amount, _locked[agent]);
    }

    function bondedBalance(address agent) external view override returns (uint256) {
        return _bonded[agent];
    }

    function lockedBalance(address agent) external view returns (uint256) {
        return _locked[agent];
    }

    function availableBalance(address agent) public view override returns (uint256) {
        uint256 bonded = _bonded[agent];
        uint256 locked = _locked[agent];
        uint256 requested = unbondRequests[agent].amount;

        if (bonded <= locked + requested) return 0;
        return bonded - locked - requested;
    }

    function setSlasher(address account, bool allowed) external onlyOwner {
        slashers[account] = allowed;
        emit SlasherUpdated(account, allowed);
    }

    function setLocker(address account, bool allowed) external onlyOwner {
        lockers[account] = allowed;
        emit LockerUpdated(account, allowed);
    }

    function setSlashReceiver(address receiver) external onlyOwner {
        require(receiver != address(0), "receiver");
        slashReceiver = receiver;
        emit SlashReceiverUpdated(receiver);
    }

    function setBondMinimums(uint256 postMin, uint256 actionMin) external onlyOwner {
        require(actionMin >= postMin, "min");
        postBondMin = postMin;
        actionBondMin = actionMin;
        emit BondMinimumsUpdated(postMin, actionMin);
    }

    function setUnbondCooldown(uint256 cooldown) external onlyOwner {
        require(cooldown <= 30 days, "cooldown");
        unbondCooldown = cooldown;
        emit CooldownUpdated(cooldown);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
