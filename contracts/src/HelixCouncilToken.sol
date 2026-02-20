// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "openzeppelin-contracts/contracts/token/ERC20/extensions/ERC20Burnable.sol";

contract HelixCouncilToken is ERC20, ERC20Burnable, Ownable {
    uint8 private immutable _tokenDecimals;

    event TreasuryMint(address indexed to, uint256 amount);

    error InvalidDecimals();

    constructor(address owner_, uint256 initialSupply, uint8 decimals_) ERC20("Helix Council Token", "HLX") Ownable(owner_) {
        if (decimals_ < 6 || decimals_ > 18) revert InvalidDecimals();

        _tokenDecimals = decimals_;
        _mint(owner_, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit TreasuryMint(to, amount);
    }
}
