// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.8.17;

import "../../BaseAngleRouterSidechain.sol";

/// @title AngleRouterOptimism
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Optimism
contract AngleRouterOptimism is BaseAngleRouterSidechain {
    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0x4200000000000000000000000000000000000006);
    }
}
