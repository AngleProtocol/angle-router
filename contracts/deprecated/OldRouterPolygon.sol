// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/external/IWETH9.sol";

import "./OldBaseRouterSidechain.sol";

/// @title AngleRouterPolygon
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Polygon
contract OldRouterPolygon is OldBaseRouterSidechain {
    using SafeERC20 for IERC20;

    IWETH9 public constant WMATIC = IWETH9(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);

    function initializeRouter(
        address _core,
        address _uniswapRouter,
        address _oneInch
    ) public {
        _initialize(_core);
        uniswapV3Router = IUniswapV3Router(_uniswapRouter);
        oneInch = _oneInch;
    }

    function _wrap(uint256, uint256) internal pure override returns (uint256) {
        return 0;
    }

    function _unwrap(
        uint256,
        uint256,
        address
    ) internal pure override returns (uint256) {
        return 0;
    }

    function _wrapNative() internal override returns (uint256) {
        WMATIC.deposit{ value: msg.value }();
        return msg.value;
    }

    function _unwrapNative(uint256 minAmountOut, address to) internal override returns (uint256 amount) {
        amount = WMATIC.balanceOf(address(this));
        _slippageCheck(amount, minAmountOut);
        if (amount > 0) {
            WMATIC.withdraw(amount);
            _safeTransferNative(to, amount);
        }
        return amount;
    }
}
