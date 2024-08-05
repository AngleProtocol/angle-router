// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../../BaseRouter.sol";

/// @title AngleRouterAvalanche
/// @author Angle Core Team
/// @notice Router contract built specifially for Angle use cases on Avalanche
contract AngleRouterAvalanche is BaseRouter {
    /// @inheritdoc BaseRouter
    function _getNativeWrapper() internal pure override returns (IWETH9) {
        return IWETH9(0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7);
    }
}
