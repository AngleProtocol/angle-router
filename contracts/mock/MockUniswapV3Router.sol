// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../interfaces/external/uniswap/IUniswapRouter.sol";
import "../interfaces/mock/IERC20MINT.sol";

// @notice mock contract to swap token
contract MockUniswapV3Router is IUniswapV3Router {
    uint256 public exchangeRate = 1 ether;
    IERC20Metadata public tokenA;
    IERC20Metadata public tokenB;
    uint256 public decimalsA;
    uint256 public decimalsB;

    constructor(IERC20Metadata _tokenA, IERC20Metadata _tokenB) {
        tokenA = _tokenA;
        tokenB = _tokenB;
        decimalsA = _tokenA.decimals();
        decimalsB = _tokenB.decimals();
        IERC20MINT(address(tokenB)).mint(address(this), type(uint256).max / 1000);
    }

    function exactInput(ExactInputParams calldata params) external payable override returns (uint256 amountOut) {
        tokenA.transferFrom(msg.sender, address(this), params.amountIn);
        amountOut = (((params.amountIn * exchangeRate) / 1 ether) * 10**decimalsB) / 10**decimalsA;
        tokenB.transfer(msg.sender, amountOut);
    }

    function updateExchangeRate(uint256 newExchangeRate) external {
        exchangeRate = newExchangeRate;
    }
}
