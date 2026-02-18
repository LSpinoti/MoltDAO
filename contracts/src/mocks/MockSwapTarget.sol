// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockSwapTarget {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    constructor(address usdc_) {
        usdc = IERC20(usdc_);
    }

    function swapExactUSDCForToken(address tokenOut, uint256 amountIn, uint256 amountOut, address recipient)
        external
        returns (uint256)
    {
        usdc.safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);
        return amountOut;
    }
}
