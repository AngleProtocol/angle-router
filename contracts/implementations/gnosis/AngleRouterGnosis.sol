// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../BaseAngleRouterSidechain.sol";

/// @title AngleRouterGnosis
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Gnosis
contract AngleRouterGnosis is BaseAngleRouterSidechain {
    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d);
    }
}
