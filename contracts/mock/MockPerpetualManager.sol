// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/ISanToken.sol";
import "../interfaces/IPerpetualManager.sol";

contract MockPerpetualManager {
    using SafeERC20 for IERC20;

    IERC20 public rewardToken;
    IERC20 public token;
    uint256 public counter;
    mapping(uint256 => uint256) public perps;
    mapping(uint256 => uint256) public claims;

    function setRewardToken(address _rewardToken) external {
        rewardToken = IERC20(_rewardToken);
    }

    function setToken(address _token) external {
        token = IERC20(_token);
    }

    function getReward(uint256 perpetualID) external {
        claims[perpetualID] += 1;
    }

    function addToPerpetual(uint256 perpetualID, uint256 amount) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        perps[perpetualID] += amount;
    }

    function openPerpetual(
        address,
        uint256 amountBrought,
        uint256,
        uint256,
        uint256
    ) external returns (uint256 perpetualID) {
        token.safeTransferFrom(msg.sender, address(this), amountBrought);
        perpetualID = counter;
        counter += 1;
        perps[perpetualID] = amountBrought;
    }
}
