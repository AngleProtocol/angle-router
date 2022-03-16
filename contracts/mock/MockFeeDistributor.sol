// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.7;

import "../interfaces/IFeeDistributor.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Mock FeeDistributor contract
contract MockFeeDistributor is IFeeDistributor {
    using SafeERC20 for IERC20;

    constructor() {}

    function burn(address token) external override {
        IERC20(token).safeTransferFrom(msg.sender, address(this), IERC20(token).balanceOf(msg.sender));
    }
}
