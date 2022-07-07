// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/draft-IERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../interfaces/external/IWETH9.sol";

import "../BaseAngleRouterSidechain.sol";

/// @title MockRouterSidechain
/// @author Angle Core Team
/// @notice Mock contract but built for tests as if to be deployed on Ethereum
contract MockRouterSidechain is BaseAngleRouterSidechain {
    using SafeERC20 for IERC20;

    IWETH9 public constant WETH = IWETH9(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);

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
    function _wrapNative() internal pure override returns (uint256) {
        return 0;
    }

    /// @inheritdoc BaseAngleRouterSidechain
    function _unwrapNative(uint256, address) internal pure override returns (uint256 amount) {
        return 0;
    }
}
