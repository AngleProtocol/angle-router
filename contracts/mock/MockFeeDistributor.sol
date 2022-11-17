// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockFeeDistributor {
    using SafeERC20 for IERC20;

    address public token;

    constructor() {}

    function claim(address user) external returns (uint256 amount) {
        amount = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(user, amount);
    }

    function setToken(address _token) external {
        token = _token;
    }
}
