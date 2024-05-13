// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../BaseRouter.sol";

/// @title AngleRouterPolygon
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Polygon
contract AngleRouterPolygon is BaseRouter {
    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270);
    }
}
