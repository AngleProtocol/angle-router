// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import "../interfaces/mock/IERC20MINT.sol";

struct SwapDescription {
    IERC20 srcToken;
    IERC20 dstToken;
    address payable srcReceiver;
    address payable dstReceiver;
    uint256 amount;
    uint256 minReturnAmount;
    uint256 flags;
    bytes permit;
}

// File contracts/interfaces/IAggregationExecutor.sol
/// @title Interface for making arbitrary calls during swap
interface IAggregationExecutor {
    /// @notice Make calls on `msgSender` with specified data
    function callBytes(address msgSender, bytes calldata data) external payable; // 0x2636f7f8
}

// @notice mock contract to swap token
contract Mock1Inch {
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

    function swap(
        IAggregationExecutor caller,
        SwapDescription calldata desc,
        bytes calldata data
    )
        external
        payable
        returns (
            uint256 returnAmount,
            uint256 spentAmount,
            uint256 gasLeft
        )
    {
        caller;
        data;
        spentAmount;
        gasLeft;
        tokenA.transferFrom(msg.sender, address(this), desc.amount);
        returnAmount = (((desc.amount * exchangeRate) / 1 ether) * 10**decimalsB) / 10**decimalsA;
        tokenB.transfer(msg.sender, returnAmount);
    }

    function unsupportedSwap() external payable returns (address returnAmount) {
        return address(this);
    }

    function revertingSwap() external payable {
        revert("wrong swap");
    }

    function updateExchangeRate(uint256 newExchangeRate) external {
        exchangeRate = newExchangeRate;
    }
}
