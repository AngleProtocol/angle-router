// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../interfaces/ILiquidityGauge.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice MockLiquidityGauge contract
contract MockLiquidityGauge is ILiquidityGauge {
    using SafeERC20 for IERC20;

    uint256 public factor = 10**18;

    IERC20 public token;
    mapping(address => uint256) public counter;
    mapping(address => uint256) public counter2;

    constructor(address _token) {
        token = IERC20(_token);
    }

    // solhint-disable-next-line
    function deposit_reward_token(address _rewardToken, uint256 _amount) external override {
        IERC20(_rewardToken).transferFrom(msg.sender, address(this), _amount);
    }

    function setFactor(uint256 _factor) external {
        factor = _factor;
    }

    // solhint-disable-next-line
    function staking_token() external view override returns (address stakingToken) {
        return address(token);
    }

    function deposit(
        uint256 _value,
        address _addr,
        // solhint-disable-next-line
        bool _claim_rewards
    ) external override {
        _value;
        _addr;
        _claim_rewards;
        counter2[_addr] += 1;
        return;
    }

    // solhint-disable-next-line
    function claim_rewards(address _addr) external override {
        _addr;
        counter[_addr] += 1;
        return;
    }

    // solhint-disable-next-line
    function claim_rewards(address _addr, address _receiver) external pure override {
        _addr;
        _receiver;
        return;
    }
}
