// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../BaseRouter.sol";

/// @title AngleRouterXlayer
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Xlayer
contract AngleRouterXlayer is BaseRouter {
    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0xe538905cf8410324e03A5A23C1c177a474D59b2b);
    }
}
