// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../BaseRouter.sol";

/// @title AngleRouterLinea
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Linea
contract AngleRouterLinea is BaseRouter {
    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f);
    }
}
