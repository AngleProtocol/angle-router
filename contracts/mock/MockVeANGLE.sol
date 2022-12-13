// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract MockVeANGLE {
    using SafeERC20 for IERC20;
    IERC20 public angle;
    mapping(address => uint256) public counter;

    //solhint-disable-next-line
    function deposit_for(address user, uint256 amount) external {
        angle.safeTransferFrom(msg.sender, address(this), amount);
        counter[user] = amount;
    }

    function setAngle(address _angle) external {
        angle = IERC20(_angle);
    }
}
