// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/external/IWETH9.sol";

import "../../BaseAngleRouterSidechain.sol";

/// @title AngleRouterArbitrum
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Arbitrum
contract AngleRouterArbitrum is BaseAngleRouterSidechain {
    using SafeERC20 for IERC20;

    IWETH9 public constant WETH9 = IWETH9(0x82aF49447D8a07e3bd95BD0d56f35241523fBab1);

    function initializeRouter(
        address _core,
        address _uniswapRouter,
        address _oneInch
    ) public {
        _initialize(_core);
        uniswapV3Router = IUniswapV3Router(_uniswapRouter);
        oneInch = _oneInch;
    }

    /// @inheritdoc BaseAngleRouterSidechain
    function _wrap(uint256, uint256) internal pure override returns (uint256) {
        return 0;
    }

    /// @inheritdoc BaseAngleRouterSidechain
    function _unwrap(
        uint256,
        uint256,
        address
    ) internal pure override returns (uint256) {
        return 0;
    }

    /// @inheritdoc BaseAngleRouterSidechain
    function _wrapNative() internal override returns (uint256) {
        WETH9.deposit{ value: msg.value }();
        return msg.value;
    }

    /// @inheritdoc BaseAngleRouterSidechain
    function _unwrapNative(uint256 minAmountOut, address to) internal override returns (uint256 amount) {
        amount = WETH9.balanceOf(address(this));
        _slippageCheck(amount, minAmountOut);
        if (amount > 0) {
            WETH9.withdraw(amount);
            _safeTransferNative(to, amount);
        }
        return amount;
    }
}
