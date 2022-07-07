// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/external/IWETH9.sol";

import "../../BaseAngleRouterSidechain.sol";

/// @title AngleRouterAvalanche
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Avalanche
contract AngleRouterAvalanche is BaseAngleRouterSidechain {
    using SafeERC20 for IERC20;

    IWETH9 public constant WAVAX = IWETH9(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);

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
        WAVAX.deposit{ value: msg.value }();
        return msg.value;
    }

    /// @inheritdoc BaseAngleRouterSidechain
    function _unwrapNative(uint256 minAmountOut, address to) internal override returns (uint256 amount) {
        amount = WAVAX.balanceOf(address(this));
        _slippageCheck(amount, minAmountOut);
        if (amount > 0) {
            WAVAX.withdraw(amount);
            _safeTransferNative(to, amount);
        }
        return amount;
    }
}
